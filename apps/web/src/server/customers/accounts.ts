import "server-only";
import {
  RECOVERY_CODE_LENGTH,
  type CustomerLoginInput,
  type CustomerRegisterInput,
  type CustomerResetInput,
} from "@kshop/core";
import type { CustomerAuthResponse, CustomerProfile, CustomerSession } from "@kshop/data";
import { createServiceClient } from "@kshop/data";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomInt } from "node:crypto";
import { supabaseConfig } from "@/env";
import { getUserFromBearer, type ApiUser } from "../auth";
import { serverEnv } from "../env";
import { HttpError, notFound, unauthorized } from "../http";
import { getServiceClient } from "../supabase";

// One account per store (D1, D3): the phone of the store maps to a synthetic email in Supabase Auth, so the
// same phone in two stores means two users with independent passwords. The phone is not verified (decision 23).

const CUSTOMER_EMAIL_DOMAIN = "customers.kshop.fullkod.com";
const RECOVERY_CODE_TTL_MINUTES = 60;

export function syntheticEmail(storeId: string, phone: string): string {
  const hash = createHash("sha256").update(`${storeId}:${phone}`).digest("hex").slice(0, 24);
  return `c_${hash}@${CUSTOMER_EMAIL_DOMAIN}`;
}

type CustomerRow = {
  id: string;
  store_id: string;
  user_id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string | null;
  is_blocked: boolean;
  accepts_marketing: boolean;
};

export const toCustomerProfile = (row: CustomerRow): CustomerProfile => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  phone: row.phone,
  email: row.email,
  acceptsMarketing: row.accepts_marketing,
});

// ---------------------------------------------------------------------------
// Rate limiting (no Redis: counters in private.auth_attempts)
// ---------------------------------------------------------------------------

/** Client IP behind Vercel's proxy (first x-forwarded-for hop). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export async function rateLimit(key: string, windowSeconds: number, max: number): Promise<void> {
  const { data, error } = await getServiceClient().rpc("auth_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) throw error;
  if (data !== true) {
    throw new HttpError(
      429,
      "too_many_attempts",
      "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    );
  }
}

// ---------------------------------------------------------------------------
// Store and sessions
// ---------------------------------------------------------------------------

/** The storefront of the store must be open (active) for its customers. */
export async function requireOpenStore(storeId: string): Promise<{ id: string; name: string }> {
  const { data, error } = await getServiceClient()
    .from("stores")
    .select("id, name, status")
    .eq("id", storeId)
    .maybeSingle<{ id: string; name: string; status: string }>();
  if (error) throw error;
  if (!data || data.status !== "active") throw notFound("Tienda");
  return data;
}

// Password sign-in with the publishable key (a fresh client per call: no session is kept on the server).
function anonAuthClient(): SupabaseClient {
  return createServiceClient(supabaseConfig);
}

const toCustomerSession = (session: Session): CustomerSession => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresAt: session.expires_at ?? null,
});

async function signIn(email: string, password: string): Promise<CustomerSession | null> {
  const { data, error } = await anonAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return toCustomerSession(data.session);
}

async function findCustomer(storeId: string, phone: string): Promise<CustomerRow | null> {
  const { data, error } = await getServiceClient()
    .from("customers")
    .select("*")
    .eq("store_id", storeId)
    .eq("phone", phone)
    .maybeSingle<CustomerRow>();
  if (error) throw error;
  return data;
}

/** Joins the guest cart to the customer's cart; a broken token never blocks the sign-in. */
export async function mergeGuestCart(storeId: string, token: string | undefined, customerId: string) {
  if (!token) return;
  const { error } = await getServiceClient().rpc("cart_merge", {
    p_store_id: storeId,
    p_guest_token: token,
    p_customer_id: customerId,
  });
  if (error) console.error("[customers] cart merge failed", error);
}

// ---------------------------------------------------------------------------
// Register, login, password reset
// ---------------------------------------------------------------------------

export async function registerCustomer(
  storeId: string,
  input: Omit<CustomerRegisterInput, "cartToken">,
  ip: string,
): Promise<CustomerAuthResponse> {
  await requireOpenStore(storeId);
  await rateLimit(`register-ip:${storeId}:${ip}`, 3600, 10);

  if (await findCustomer(storeId, input.phone)) {
    throw new HttpError(
      409,
      "phone_taken",
      "Ya hay una cuenta con ese teléfono en esta tienda. Inicia sesión.",
      {
        phone: ["Ya hay una cuenta con ese teléfono."],
      },
    );
  }

  const service = getServiceClient();
  const email = syntheticEmail(storeId, input.phone);
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    app_metadata: { kind: "customer", store_id: storeId },
  });
  if (createError || !created.user) {
    if (createError?.code === "email_exists") {
      throw new HttpError(
        409,
        "phone_taken",
        "Ya hay una cuenta con ese teléfono en esta tienda. Inicia sesión.",
      );
    }
    if (createError?.code === "weak_password") {
      throw new HttpError(400, "weak_password", "La contraseña es demasiado débil.", {
        password: ["La contraseña es demasiado débil."],
      });
    }
    throw createError ?? new Error("createUser returned no user");
  }

  const { data: row, error: insertError } = await service
    .from("customers")
    .insert({
      store_id: storeId,
      user_id: created.user.id,
      phone: input.phone,
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      accepts_marketing: input.acceptsMarketing,
    })
    .select("*")
    .single<CustomerRow>();
  if (insertError) {
    await service.auth.admin.deleteUser(created.user.id);
    if (insertError.code === "23505") {
      throw new HttpError(
        409,
        "phone_taken",
        "Ya hay una cuenta con ese teléfono en esta tienda. Inicia sesión.",
      );
    }
    throw insertError;
  }

  const session = await signIn(email, input.password);
  if (!session) throw new Error("sign-in after register failed");
  return { session, customer: toCustomerProfile(row) };
}

export async function loginCustomer(
  storeId: string,
  input: Omit<CustomerLoginInput, "cartToken">,
  ip: string,
): Promise<CustomerAuthResponse> {
  await requireOpenStore(storeId);
  const phoneKey = `login:${storeId}:${input.phone}`;
  await rateLimit(`login-ip:${storeId}:${ip}`, 900, 30);
  await rateLimit(phoneKey, 900, 10);

  const invalid = new HttpError(401, "invalid_credentials", "Teléfono o contraseña incorrectos.");
  const customer = await findCustomer(storeId, input.phone);
  if (!customer) throw invalid;
  const session = await signIn(syntheticEmail(storeId, input.phone), input.password);
  if (!session) throw invalid;
  if (customer.is_blocked) {
    throw new HttpError(403, "customer_blocked", "Tu cuenta está bloqueada. Escribe a la tienda.");
  }

  await getServiceClient().rpc("auth_rate_limit_reset", { p_key: phoneKey });
  return { session, customer: toCustomerProfile(customer) };
}

const recoveryHash = (storeId: string, phone: string, code: string) =>
  createHmac("sha256", serverEnv.supabaseSecretKey).update(`${storeId}:${phone}:${code}`).digest("hex");

/** Staff side (D5 without OpenWA): a one-time code the staff sends by WhatsApp. Shown only once. */
export async function createRecoveryCode(
  storeId: string,
  customerId: string,
  staffUserId: string,
): Promise<{ code: string; expiresAt: string; phone: string; sentByWhatsapp: boolean }> {
  const { data: customer, error } = await getServiceClient()
    .from("customers")
    .select("id, phone")
    .eq("store_id", storeId)
    .eq("id", customerId)
    .maybeSingle<{ id: string; phone: string }>();
  if (error) throw error;
  if (!customer) throw notFound("Cliente");

  const code = String(randomInt(0, 10 ** RECOVERY_CODE_LENGTH)).padStart(RECOVERY_CODE_LENGTH, "0");
  const { data: expiresAt, error: createError } = await getServiceClient().rpc(
    "customer_recovery_code_create",
    {
      p_store_id: storeId,
      p_customer_id: customerId,
      p_code_hash: recoveryHash(storeId, customer.phone, code),
      p_ttl_minutes: RECOVERY_CODE_TTL_MINUTES,
      p_created_by: staffUserId,
    },
  );
  if (createError) throw createError;
  // With the platform WhatsApp live the code reaches the customer by itself (decision 24); otherwise the staff
  // sends it by wa.me as before.
  const { data: sent, error: notifyError } = await getServiceClient().rpc("notification_recovery_code", {
    p_store_id: storeId,
    p_phone: customer.phone,
    p_code: code,
  });
  if (notifyError) throw notifyError;
  return { code, expiresAt: String(expiresAt), phone: customer.phone, sentByWhatsapp: sent === true };
}

export async function resetCustomerPassword(
  storeId: string,
  input: CustomerResetInput,
  ip: string,
): Promise<CustomerAuthResponse> {
  await requireOpenStore(storeId);
  await rateLimit(`reset-ip:${storeId}:${ip}`, 3600, 20);
  await rateLimit(`reset:${storeId}:${input.phone}`, 3600, 10);

  const { data, error } = await getServiceClient()
    .rpc("customer_recovery_code_consume", {
      p_store_id: storeId,
      p_phone: input.phone,
      p_code_hash: recoveryHash(storeId, input.phone, input.code),
    })
    .single<{ status: "ok" | "invalid" | "locked"; user_id: string | null }>();
  if (error) throw error;
  if (data.status === "locked") {
    throw new HttpError(
      429,
      "code_locked",
      "Demasiados intentos con ese código. Pide uno nuevo a la tienda.",
    );
  }
  if (data.status !== "ok" || !data.user_id) {
    throw new HttpError(400, "invalid_code", "El código no es válido o ya caducó.", {
      code: ["El código no es válido o ya caducó."],
    });
  }

  const { error: updateError } = await getServiceClient().auth.admin.updateUserById(data.user_id, {
    password: input.password,
  });
  if (updateError) {
    if (updateError.code === "weak_password" || updateError.code === "same_password") {
      throw new HttpError(400, "weak_password", "Elige otra contraseña.", {
        password: ["Elige otra contraseña."],
      });
    }
    throw updateError;
  }
  return loginCustomer(storeId, { phone: input.phone, password: input.password }, ip);
}

// ---------------------------------------------------------------------------
// Customer requests
// ---------------------------------------------------------------------------

export type CustomerContext = { user: ApiUser; customer: CustomerRow };

/**
 * The Bearer token must be a customer token of THIS store (D7 gotcha: the store in the path is not enough;
 * a token copied from store A is rejected in store B, and a staff token is not a customer).
 */
export async function requireCustomer(request: Request, storeId: string): Promise<CustomerContext> {
  const user = await getUserFromBearer(request);
  if (user.appMetadata.kind !== "customer" || user.appMetadata.store_id !== storeId) throw unauthorized();

  const { data, error } = await getServiceClient()
    .from("customers")
    .select("*")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle<CustomerRow>();
  if (error) throw error;
  if (!data) throw unauthorized();
  if (data.is_blocked)
    throw new HttpError(403, "customer_blocked", "Tu cuenta está bloqueada. Escribe a la tienda.");
  return { user, customer: data };
}

/** Optional customer: a valid customer token of this store, or null for guests (cart, checkout). */
export async function optionalCustomer(request: Request, storeId: string): Promise<CustomerContext | null> {
  if (!request.headers.get("authorization")) return null;
  return requireCustomer(request, storeId);
}
