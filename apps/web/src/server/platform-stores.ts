import "server-only";
import { storeOrigin, type CreateStoreInput, type PlanCode, type StoreStatus } from "@kshop/core";
import type { CreateStoreResponse, PlatformStore } from "@kshop/data";
import { publicEnv, platformProtocol } from "@/env";
import { serverEnv } from "./env";
import { HttpError, notFound } from "./http";
import { getServiceClient } from "./supabase";

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  base_currency: PlatformStore["baseCurrency"];
  created_at: string;
  store_domains: { domain: string; is_primary: boolean }[];
  subscriptions: {
    status: string;
    trial_ends_at: string | null;
    plans: { code: PlanCode; name: string } | null;
  } | null;
  store_members: { user_id: string; role: string }[];
};

const STORE_SELECT = `
  id, slug, name, status, base_currency, created_at,
  store_domains (domain, is_primary),
  subscriptions (status, trial_ends_at, plans (code, name)),
  store_members (user_id, role)
`;

async function ownerEmails(): Promise<Map<string, string | null>> {
  // Few staff accounts at this stage; paginate when the platform grows.
  const { data, error } = await getServiceClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return new Map(data.users.map((u) => [u.id, u.email ?? null]));
}

function toPlatformStore(row: StoreRow, emails: Map<string, string | null>): PlatformStore {
  const owner = row.store_members.find((m) => m.role === "owner");
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    baseCurrency: row.base_currency,
    primaryDomain: row.store_domains.find((d) => d.is_primary)?.domain ?? null,
    plan: row.subscriptions?.plans ?? null,
    subscriptionStatus: row.subscriptions?.status ?? null,
    trialEndsAt: row.subscriptions?.trial_ends_at ?? null,
    owner: owner ? { id: owner.user_id, email: emails.get(owner.user_id) ?? null } : null,
    createdAt: row.created_at,
  };
}

export async function listPlatformStores(): Promise<PlatformStore[]> {
  const { data, error } = await getServiceClient()
    .from("stores")
    .select(STORE_SELECT)
    .order("created_at", { ascending: false })
    .returns<StoreRow[]>();
  if (error) throw error;
  const emails = await ownerEmails();
  return data.map((row) => toPlatformStore(row, emails));
}

async function getPlatformStore(storeId: string): Promise<PlatformStore> {
  const { data, error } = await getServiceClient()
    .from("stores")
    .select(STORE_SELECT)
    .eq("id", storeId)
    .maybeSingle<StoreRow>();
  if (error) throw error;
  if (!data) throw notFound("Tienda");
  return toPlatformStore(data, await ownerEmails());
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const { count, error } = await getServiceClient()
    .from("stores")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Gets the owner's account and a one-time access link (decision D4: sent by the superadmin over WhatsApp,
 * no email provider needed). New owners get an invite link; existing owners (several stores) a magic link.
 */
async function prepareOwner(email: string, redirectTo: string) {
  const auth = getServiceClient().auth.admin;

  const invite = await auth.generateLink({ type: "invite", email, options: { redirectTo } });
  if (!invite.error) {
    return { userId: invite.data.user.id, link: invite.data.properties.action_link, created: true };
  }
  if (invite.error.code !== "email_exists") throw invite.error;

  const magic = await auth.generateLink({ type: "magiclink", email, options: { redirectTo } });
  if (magic.error) throw magic.error;
  return { userId: magic.data.user.id, link: magic.data.properties.action_link, created: false };
}

export async function createPlatformStore(
  input: CreateStoreInput,
  createdBy: string,
): Promise<CreateStoreResponse> {
  if (await isSlugTaken(input.slug)) {
    throw new HttpError(409, "slug_taken", "Ese subdominio ya está en uso.", {
      slug: ["Ese subdominio ya está en uso."],
    });
  }

  const redirectTo = `${storeOrigin(input.slug, publicEnv.platformDomain, platformProtocol)}/admin/set-password`;
  const owner = await prepareOwner(input.ownerEmail, redirectTo);

  const { data, error } = await getServiceClient()
    .rpc("create_store", {
      p_name: input.name,
      p_slug: input.slug,
      p_owner_id: owner.userId,
      p_base_currency: input.baseCurrency,
      p_order_prefix: input.orderPrefix,
      p_whatsapp_phone: input.whatsappPhone ?? null,
      p_plan_code: input.planCode,
      p_trial_days: input.trialDays,
      p_platform_domain: serverEnv.canonicalPlatformDomain,
      p_created_by: createdBy,
    })
    .single<{ id: string }>();

  if (error || !data) {
    // Auth is outside the SQL transaction: undo the account we just created so no orphan is left.
    if (owner.created) await getServiceClient().auth.admin.deleteUser(owner.userId);
    if (error?.code === "23505") {
      throw new HttpError(409, "slug_taken", "Ese subdominio ya está en uso.", {
        slug: ["Ese subdominio ya está en uso."],
      });
    }
    throw error ?? new Error("create_store returned no row");
  }

  return {
    store: await getPlatformStore(data.id),
    ownerAccessLink: owner.link,
    ownerWasCreated: owner.created,
  };
}

export async function updatePlatformStoreStatus(
  storeId: string,
  status: StoreStatus,
): Promise<PlatformStore> {
  const { data, error } = await getServiceClient()
    .from("stores")
    .update({ status })
    .eq("id", storeId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("Tienda");
  return getPlatformStore(storeId);
}
