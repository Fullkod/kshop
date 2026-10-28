import "server-only";
import { storeOrigin, type StoreRole, type TeamInviteInput } from "@kshop/core";
import type { TeamInviteResponse, TeamMember, TeamResponse } from "@kshop/data";
import { publicEnv, platformProtocol } from "@/env";
import type { ApiUser } from "./auth";
import { mapDbError } from "./db-errors";
import { notFound } from "./http";
import { prepareOwner } from "./platform-stores";
import { getServiceClient } from "./supabase";

// Admin › Equipo (PRP-5 D20). The SQL functions check the roles (the owner manages admins and staff, admins manage
// staff, nobody touches the owner) and max_staff with the subscription locked. Invitations are a one-time access
// link the owner sends by WhatsApp (no email provider), like the owner's own sign-up.

type MemberRow = { user_id: string; email: string | null; role: StoreRole; created_at: string };

const toMember = (row: MemberRow, meId: string): TeamMember => ({
  userId: row.user_id,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
  isMe: row.user_id === meId,
});

/** Who acts in the SQL checks: the user, or the owner when the superadmin manages a store it does not belong to. */
async function actorId(storeId: string, user: ApiUser): Promise<string> {
  if (!user.isSuperadmin) return user.id;
  const { data } = await getServiceClient()
    .from("store_members")
    .select("user_id, role")
    .eq("store_id", storeId);
  return (
    data?.find((m) => m.user_id === user.id)?.user_id ??
    data?.find((m) => m.role === "owner")?.user_id ??
    user.id
  );
}

export async function listTeam(storeId: string, user: ApiUser): Promise<TeamResponse> {
  const service = getServiceClient();
  // The members with their e-mail in one query (R11: it listed every account of the platform from Auth).
  const [members, usage] = await Promise.all([
    service.rpc("store_team", { p_store_id: storeId }),
    service.rpc("store_usage", { p_store_id: storeId }),
  ]);
  if (members.error) throw members.error;
  if (usage.error) throw usage.error;
  const order: Record<StoreRole, number> = { owner: 0, admin: 1, staff: 2 };
  return {
    members: ((members.data ?? []) as MemberRow[])
      .sort((a, b) => order[a.role] - order[b.role] || a.created_at.localeCompare(b.created_at))
      .map((m) => toMember(m, user.id)),
    usage: { limit: usage.data.max_staff.limit, used: Number(usage.data.max_staff.used) },
  };
}

export async function inviteMember(
  storeId: string,
  input: TeamInviteInput,
  user: ApiUser,
): Promise<TeamInviteResponse> {
  const service = getServiceClient();
  const { data: store } = await service.from("stores").select("slug").eq("id", storeId).single();
  const redirectTo = `${storeOrigin(store!.slug, publicEnv.platformDomain, platformProtocol)}/admin/set-password`;
  const account = await prepareOwner(input.email, redirectTo);
  const { error } = await service.rpc("store_member_add", {
    p_store_id: storeId,
    p_user_id: account.userId,
    p_role: input.role,
    p_actor_id: await actorId(storeId, user),
  });
  if (error) {
    // Auth is outside the SQL transaction: undo an account created only for this invitation.
    if (account.created) await service.auth.admin.deleteUser(account.userId);
    mapDbError(error, "La persona");
  }
  const member = (await listTeam(storeId, user)).members.find((m) => m.userId === account.userId)!;
  return { member, accessLink: account.link, accountWasCreated: account.created };
}

export async function updateMemberRole(storeId: string, userId: string, role: StoreRole, user: ApiUser) {
  const { error } = await getServiceClient().rpc("store_member_update", {
    p_store_id: storeId,
    p_user_id: userId,
    p_role: role,
    p_actor_id: await actorId(storeId, user),
  });
  if (error) mapDbError(error, "La persona");
  const member = (await listTeam(storeId, user)).members.find((m) => m.userId === userId);
  if (!member) throw notFound("La persona");
  return { member };
}

export async function removeMember(storeId: string, userId: string, user: ApiUser): Promise<void> {
  const { error } = await getServiceClient().rpc("store_member_remove", {
    p_store_id: storeId,
    p_user_id: userId,
    p_actor_id: await actorId(storeId, user),
  });
  if (error) mapDbError(error, "La persona");
}
