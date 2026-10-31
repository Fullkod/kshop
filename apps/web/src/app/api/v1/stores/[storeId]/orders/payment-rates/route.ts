import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getPaymentRates } from "@/server/currency-rates";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/orders/payment-rates  (staff+, module orders). KSH0002: the suggestion when a payment
// comes in another currency; the rate that counts is the one typed in each payment.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/orders/payment-rates">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "orders");
    return NextResponse.json(await getPaymentRates(storeId), { headers: { "Cache-Control": "no-store" } });
  },
);
