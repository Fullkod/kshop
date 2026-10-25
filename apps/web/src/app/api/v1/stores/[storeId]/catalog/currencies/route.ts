import { currencyInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

// PUT /api/v1/stores/{storeId}/catalog/currencies  { currency, rateToBase, sells, rounding? }
// Cost-only currencies are always allowed; extra sale currencies need multi_currency (403 otherwise).
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/currencies">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin");
    const input = currencyInputSchema.parse(await readJson(request));

    const { data, error } = await getServiceClient().rpc("set_store_currency", {
      p_store_id: storeId,
      p_currency: input.currency,
      p_rate_to_base: input.rateToBase,
      p_sells: input.sells,
      p_rounding: input.rounding ?? null,
      p_user_id: user.id,
    });
    if (error) mapDbError(error, "La moneda");

    invalidateCatalog(storeId);
    const row = data as {
      currency: string;
      is_base: boolean;
      sells: boolean;
      rate_to_base: number;
      rounding: number | null;
    };
    return NextResponse.json({
      currency: row.currency,
      isBase: row.is_base,
      sells: row.sells,
      rateToBase: Number(row.rate_to_base),
      rounding: row.rounding,
    });
  },
);
