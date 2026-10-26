import {
  orderCancelSchema,
  orderNoteSchema,
  orderPaymentSchema,
  orderShippingSchema,
  orderTransitionSchema,
} from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, notFound, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// POST /api/v1/stores/{storeId}/orders/{orderId}/{action}  (staff+, module orders)
//   transition { to }                       -> order_transition (409 invalid_transition / shipping_required)
//   shipping   { amount }                   -> order_set_shipping ("to agree" orders)
//   payments   { amount, paymentMethodId?, reference?, evidencePath? } -> order_record_payment
//   cancel     { reason? }                  -> order_cancel (releases or restocks, refunds what was paid)
//   notes      { text }                     -> internal note (never shown to the customer)
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/orders/[orderId]/[action]">) => {
    const params = await ctx.params;
    const { storeId, user } = await requireCatalogAccess(request, params.storeId, "staff", "orders");
    const orderId = uuidParam.parse(params.orderId);
    const body = await readJson(request);
    const db = getServiceClient();

    switch (params.action) {
      case "transition": {
        const { to } = orderTransitionSchema.parse(body);
        const { error } = await db.rpc("order_transition", {
          p_store_id: storeId,
          p_order_id: orderId,
          p_to: to,
          p_user_id: user.id,
        });
        if (error) mapDbError(error, "El pedido");
        break;
      }
      case "shipping": {
        const { amount } = orderShippingSchema.parse(body);
        const { error } = await db.rpc("order_set_shipping", {
          p_store_id: storeId,
          p_order_id: orderId,
          p_amount: amount,
          p_user_id: user.id,
        });
        if (error) mapDbError(error, "El pedido");
        break;
      }
      case "payments": {
        const input = orderPaymentSchema.parse(body);
        if (input.evidencePath && !input.evidencePath.startsWith(`stores/${storeId}/payments/`)) {
          throw notFound("Comprobante");
        }
        const { error } = await db.rpc("order_record_payment", {
          p_store_id: storeId,
          p_order_id: orderId,
          p_input: {
            amount: input.amount,
            payment_method_id: input.paymentMethodId ?? null,
            reference: input.reference ?? null,
            evidence_path: input.evidencePath ?? null,
          },
          p_user_id: user.id,
        });
        if (error) mapDbError(error, "El pedido");
        break;
      }
      case "cancel": {
        const { reason } = orderCancelSchema.parse(body);
        const { data, error } = await db.rpc("order_cancel", {
          p_store_id: storeId,
          p_order_id: orderId,
          p_reason: reason ?? null,
          p_user_id: user.id,
        });
        if (error) mapDbError(error, "El pedido");
        if ((data as { flipped_product_ids: string[] }).flipped_product_ids.length)
          invalidateCatalog(storeId);
        break;
      }
      case "notes": {
        const { text } = orderNoteSchema.parse(body);
        const { data, error } = await db
          .from("order_events")
          .insert({
            store_id: storeId,
            order_id: orderId,
            type: "note",
            is_internal: true,
            payload: { text },
            user_id: user.id,
          })
          .select("id");
        // 23503: the order is not in this store (composite FK).
        if (error?.code === "23503") throw notFound("Pedido");
        if (error) throw error;
        if (!data.length) throw notFound("Pedido");
        break;
      }
      default:
        throw notFound("Acción");
    }
    return NextResponse.json({ id: orderId });
  },
);
