import "server-only";
import type { PosSaleInput } from "@kshop/core";
import type { PosSaleResult } from "@kshop/data";
import { refreshCatalog } from "./catalog/access";
import { getServiceClient } from "./supabase";

type Recorded = {
  order_id: string;
  number: number;
  created: boolean;
  flags: unknown[] | null;
  flipped_product_ids: string[];
};

/**
 * One transaction per sale, in series: one bad sale does not stop the others. A sale the database refuses comes back
 * as rejected, and the phone keeps it; anything else (a timeout) fails the request and the phone simply retries,
 * which is safe because repeating a sale returns the same order.
 */
export async function recordPosSales(
  storeId: string,
  userId: string,
  sales: PosSaleInput[],
): Promise<PosSaleResult[]> {
  const db = getServiceClient();
  const results: PosSaleResult[] = [];
  let flipped = false;
  for (const sale of sales) {
    const { data, error } = await db.rpc("pos_record_sale", {
      p_store_id: storeId,
      p_user_id: userId,
      p_sale: {
        id: sale.id,
        device_id: sale.deviceId,
        local_number: sale.localNumber,
        sold_at: sale.soldAt,
        voided: sale.voided ?? false,
        note: sale.note ?? null,
        lines: sale.lines.map((l) => ({
          variant_id: l.variantId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          product_name: l.productName,
          variant_name: l.variantName ?? null,
          sku: l.sku ?? null,
        })),
        payments: sale.payments.map((p) => ({
          amount: p.amount,
          currency: p.currency ?? null,
          rate: p.rate ?? null,
          change_amount: p.changeAmount ?? null,
          change_currency: p.changeCurrency ?? null,
          payment_method_id: p.paymentMethodId ?? null,
          reference: p.reference ?? null,
        })),
      },
    });
    if (error) {
      if (error.code !== "P0001") throw error;
      results.push({
        id: sale.id,
        status: "rejected",
        code: error.hint ?? "invalid_input",
        message: error.message,
      });
      continue;
    }
    const row = data as Recorded;
    flipped ||= row.flipped_product_ids.length > 0;
    results.push({
      id: sale.id,
      status: "recorded",
      orderId: row.order_id,
      number: row.number,
      created: row.created,
      flags: row.flags ?? [],
    });
  }
  // Once per batch: a long queue must not refresh the storefront once per sale.
  if (flipped) refreshCatalog(storeId);
  return results;
}
