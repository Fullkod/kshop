import "server-only";
import type { ProductCardData } from "@kshop/data";
import { mapDbError } from "../db-errors";
import { notFound } from "../http";
import { getProductCards } from "../storefront/catalog";
import { getServiceClient } from "../supabase";

// Favorites of a customer account (PRP-R D3): rows in customer_favorites, written only here (service_role) after
// requireCustomer; the cards come from the public, cached product reads, so unpublished products drop out.

const MAX_FAVORITES = 100;

export async function listFavorites(
  storeId: string,
  customerId: string,
): Promise<{ productIds: string[]; products: ProductCardData[] }> {
  const { data, error } = await getServiceClient()
    .from("customer_favorites")
    .select("product_id")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(MAX_FAVORITES)
    .returns<{ product_id: string }[]>();
  if (error) throw error;
  const products = await getProductCards(
    storeId,
    data.map((r) => r.product_id),
  );
  return { productIds: products.map((p) => p.id), products };
}

export async function addFavorite(storeId: string, customerId: string, productId: string): Promise<void> {
  const supabase = getServiceClient();
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("id", productId)
    .eq("status", "published")
    .maybeSingle();
  if (readError) throw readError;
  if (!product) throw notFound("Producto");
  const { error } = await supabase
    .from("customer_favorites")
    .upsert(
      { store_id: storeId, customer_id: customerId, product_id: productId },
      { onConflict: "store_id,customer_id,product_id", ignoreDuplicates: true },
    );
  if (error) throw mapDbError(error);
}

export async function removeFavorite(storeId: string, customerId: string, productId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("customer_favorites")
    .delete()
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .eq("product_id", productId);
  if (error) throw error;
}
