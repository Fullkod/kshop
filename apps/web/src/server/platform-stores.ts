import "server-only";
import { DEFAULT_HOME_SECTIONS, storeOrigin, type CreateStoreInput, type StoreStatus } from "@kshop/core";
import type { CreateStoreResponse, PlatformStore } from "@kshop/data";
import { publicEnv, platformProtocol } from "@/env";
import { serverEnv } from "./env";
import { HttpError, notFound } from "./http";
import { getServiceClient } from "./supabase";

/**
 * Every store with its owner, plan, billing and activity in one statement (R12: platform_stores_overview, service_role
 * only). It replaced a stores select plus auth.admin.listUsers(perPage 1000) on every load.
 */
export async function listPlatformStores(): Promise<PlatformStore[]> {
  const { data, error } = await getServiceClient().rpc("platform_stores_overview");
  if (error) throw error;
  return (data ?? []) as PlatformStore[];
}

export async function getPlatformStore(storeId: string): Promise<PlatformStore> {
  // Few stores at this stage: the overview of all of them costs one indexed statement.
  const store = (await listPlatformStores()).find((s) => s.id === storeId);
  if (!store) throw notFound("Tienda");
  return store;
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
export async function prepareOwner(email: string, redirectTo: string) {
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

  // Founding partner (frozen price for life) or courtesy (never billed), chosen at sign-up.
  if (input.founderPrice != null) {
    const grant = await getServiceClient().rpc("subscription_add_grant", {
      p_store_id: data.id,
      p_type: "price_lock",
      p_value: input.founderPrice,
      p_reason: "Socio fundador",
      p_ends_at: null,
      p_actor: createdBy,
    });
    if (grant.error) throw grant.error;
  }
  // Home of a new store (PRP-R D11): the default sections, hidden until the owner fills them in.
  const sections = await getServiceClient()
    .from("home_sections")
    .insert(
      DEFAULT_HOME_SECTIONS.map((s, index) => ({
        store_id: data.id,
        type: s.type,
        title: s.title,
        settings: s.settings,
        sort_order: index,
        is_visible: false,
      })),
    );
  if (sections.error) throw sections.error;

  if (input.founderPrice != null || input.comped) {
    const update = await getServiceClient().rpc("subscription_update", {
      p_store_id: data.id,
      p_patch: {
        ...(input.founderPrice != null ? { founder: true } : {}),
        ...(input.comped ? { comped: true } : {}),
      },
      p_actor: createdBy,
    });
    if (update.error) throw update.error;
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
  // A manual suspension (reason manual) is not lifted by a payment, unlike one by billing (PRP-5 D15).
  const { error } = await getServiceClient().rpc("store_set_status", {
    p_store_id: storeId,
    p_status: status,
  });
  if (error) {
    if (error.hint === "not_found") throw notFound("Tienda");
    throw error;
  }
  return getPlatformStore(storeId);
}
