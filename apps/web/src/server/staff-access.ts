import "server-only";
import { storeOrigin, type StaffPasswordResetInput, type StoreRole } from "@kshop/core";
import type { OwnerAccessResponse } from "@kshop/data";
import { platformProtocol, publicEnv } from "@/env";
import { clientIp, rateLimit } from "./customers/accounts";
import { accessLinkEmail, emailEnabled, sendEmail } from "./email";
import { HttpError, notFound } from "./http";
import { getServiceClient } from "./supabase";

// Staff access to the store admin: «¿Olvidaste tu contraseña?» (email) and the superadmin's «Enviar acceso» (email
// and/or WhatsApp). Both send a one-time magic link to /admin/set-password of the store, like an invitation.

type Member = { user_id: string; email: string | null; role: StoreRole };

async function storeWithTeam(storeId: string) {
  const service = getServiceClient();
  const [store, team] = await Promise.all([
    service
      .from("stores")
      .select("id, name, slug")
      .eq("id", storeId)
      .maybeSingle<{ id: string; name: string; slug: string }>(),
    service.rpc("store_team", { p_store_id: storeId }),
  ]);
  if (store.error) throw store.error;
  if (team.error) throw team.error;
  if (!store.data) throw notFound("La tienda");
  return { store: store.data, members: (team.data ?? []) as Member[] };
}

async function magicLink(email: string, slug: string): Promise<string> {
  const redirectTo = `${storeOrigin(slug, publicEnv.platformDomain, platformProtocol)}/admin/set-password`;
  const { data, error } = await getServiceClient().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error) throw error;
  return data.properties.action_link;
}

/**
 * Sends the access link to a staff member of the store. Same answer whether the email belongs to the store or not
 * (no account enumeration); customers never get one (their email is synthetic and would bounce).
 */
export async function requestStaffPasswordReset(
  storeId: string,
  input: StaffPasswordResetInput,
  request: Request,
): Promise<void> {
  if (!emailEnabled()) {
    throw new HttpError(
      503,
      "email_disabled",
      "La recuperación por correo no está disponible. Escribe a soporte de Kshop.",
    );
  }
  await rateLimit(`staff-reset-ip:${clientIp(request)}`, 3600, 10);
  await rateLimit(`staff-reset:${storeId}:${input.email}`, 3600, 3);

  const { store, members } = await storeWithTeam(storeId);
  const member = members.find((m) => m.email?.toLowerCase() === input.email);
  if (!member?.email) return;
  const link = await magicLink(member.email, store.slug);
  await sendEmail(accessLinkEmail({ to: member.email, storeName: store.name, link, reason: "reset" }));
}

/** Superadmin › Tienda › «Enviar acceso»: link for the owner, emailed when Resend is set, and returned for WhatsApp. */
export async function sendOwnerAccess(storeId: string): Promise<OwnerAccessResponse> {
  const { store, members } = await storeWithTeam(storeId);
  const owner = members.find((m) => m.role === "owner");
  if (!owner?.email) throw notFound("El dueño");
  const link = await magicLink(owner.email, store.slug);
  let emailed = false;
  if (emailEnabled()) {
    try {
      await sendEmail(accessLinkEmail({ to: owner.email, storeName: store.name, link, reason: "access" }));
      emailed = true;
    } catch (error) {
      // The link still works over WhatsApp.
      console.error("[email] owner access", error);
    }
  }
  return { email: owner.email, link, emailed };
}
