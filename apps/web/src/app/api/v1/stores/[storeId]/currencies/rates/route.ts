import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { getCurrencyRates } from "@/server/currency-rates";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/currencies/rates  (admin, multi_currency)
//   -> { baseCurrency, currencies: [{ currency, rateToBase, history, fixedPrices, suggested }], reference }
// Rates are changed with PUT /catalog/currencies (history kept by set_store_currency).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/currencies/rates">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "multi_currency");
    return NextResponse.json(await getCurrencyRates(storeId));
  },
);
