import "server-only";
import type { DiscountTarget, PromotionInput, VoucherInput } from "@kshop/core";
import { invalidateCatalog } from "../catalog/access";
import { mapDbError } from "../db-errors";
import { HttpError, notFound } from "../http";
import { getServiceClient } from "../supabase";

// Promotions and vouchers edited from the admin (module discounts, admin+). A promotion changes storefront
// prices: after every write its materialized prices are refreshed (public.refresh_promotions) and the
// catalog cache of the store is expired, so the storefront shows it at once (D4).

const TARGET_TABLES: Record<DiscountTarget, string> = {
  product: "products",
  variant: "product_variants",
  category: "categories",
  collection: "collections",
  brand: "brands",
};

/** Every target must exist in this store (target ids are not foreign keys). */
async function checkTargets(storeId: string, targets: { type: DiscountTarget; id: string }[]): Promise<void> {
  const service = getServiceClient();
  for (const type of Object.keys(TARGET_TABLES) as DiscountTarget[]) {
    const ids = [...new Set(targets.filter((t) => t.type === type).map((t) => t.id))];
    if (!ids.length) continue;
    const { count, error } = await service
      .from(TARGET_TABLES[type])
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .in("id", ids);
    if (error) throw error;
    if (count !== ids.length) {
      throw new HttpError(422, "validation_failed", "Algún producto o categoría elegido no existe en la tienda.", {
        targets: ["Algún producto o categoría elegido no existe en la tienda."],
      });
    }
  }
}

async function replaceTargets(
  table: "promotion_targets" | "voucher_targets",
  column: "promotion_id" | "voucher_id",
  storeId: string,
  ownerId: string,
  targets: { type: DiscountTarget; id: string }[],
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service.from(table).delete().eq(column, ownerId);
  if (error) throw error;
  const unique = [...new Map(targets.map((t) => [`${t.type}:${t.id}`, t])).values()];
  if (!unique.length) return;
  const { error: insertError } = await service
    .from(table)
    .insert(unique.map((t) => ({ store_id: storeId, [column]: ownerId, target_type: t.type, target_id: t.id })));
  if (insertError) throw insertError;
}

async function refreshPromotions(storeId: string): Promise<void> {
  const { error } = await getServiceClient().rpc("refresh_promotions", { p_store_id: storeId });
  if (error) throw error;
  invalidateCatalog(storeId);
}

export async function savePromotion(storeId: string, id: string | null, input: PromotionInput): Promise<string> {
  await checkTargets(storeId, input.targets);
  const row = {
    name: input.name,
    description: input.description,
    reward: input.reward,
    value: input.value,
    ...(input.startsAt && { starts_at: input.startsAt }),
    ends_at: input.endsAt,
    is_active: input.isActive,
    priority: input.priority,
  };
  const service = getServiceClient();
  const query = id
    ? service.from("promotions").update(row).eq("store_id", storeId).eq("id", id)
    : service.from("promotions").insert({ ...row, store_id: storeId });
  const { data, error } = await query.select("id").maybeSingle<{ id: string }>();
  if (error) mapDbError(error, "La promoción");
  if (!data) throw notFound("Promoción");
  await replaceTargets("promotion_targets", "promotion_id", storeId, data.id, input.targets);
  await refreshPromotions(storeId);
  return data.id;
}

export async function deletePromotion(storeId: string, id: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("promotions")
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, "La promoción");
  if (!data?.length) throw notFound("Promoción");
  await refreshPromotions(storeId);
}

export async function saveVoucher(storeId: string, id: string | null, input: VoucherInput): Promise<string> {
  const targets = input.scope === "specific" ? input.targets : [];
  await checkTargets(storeId, targets);
  const row = {
    code: input.code,
    name: input.name,
    scope: input.scope,
    reward: input.reward,
    value: input.value,
    min_subtotal: input.minSubtotal,
    min_quantity: input.minQuantity,
    usage_limit: input.usageLimit,
    usage_per_customer: input.usagePerCustomer,
    ...(input.startsAt && { starts_at: input.startsAt }),
    ends_at: input.endsAt,
    is_active: input.isActive,
  };
  const service = getServiceClient();
  const query = id
    ? service.from("vouchers").update(row).eq("store_id", storeId).eq("id", id)
    : service.from("vouchers").insert({ ...row, store_id: storeId });
  const { data, error } = await query.select("id").maybeSingle<{ id: string }>();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new HttpError(409, "conflict", "Ya existe un cupón con ese código.", {
        code: ["Ya existe un cupón con ese código."],
      });
    }
    mapDbError(error, "El cupón");
  }
  if (!data) throw notFound("Cupón");
  await replaceTargets("voucher_targets", "voucher_id", storeId, data.id, targets);
  return data.id;
}

/** A voucher already used in orders is kept (its usages are history): it is deactivated instead. */
export async function deleteVoucher(storeId: string, id: string): Promise<void> {
  const service = getServiceClient();
  const { count, error: countError } = await service
    .from("voucher_usages")
    .select("id", { count: "exact", head: true })
    .eq("voucher_id", id);
  if (countError) throw countError;
  const query = count
    ? service.from("vouchers").update({ is_active: false }).eq("store_id", storeId).eq("id", id)
    : service.from("vouchers").delete().eq("store_id", storeId).eq("id", id);
  const { data, error } = await query.select("id");
  if (error) mapDbError(error, "El cupón");
  if (!data?.length) throw notFound("Cupón");
}
