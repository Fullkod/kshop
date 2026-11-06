import { posClosingSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { closeDay } from "@/server/pos-closings";

// POST /api/v1/stores/{storeId}/pos/closings  (staff+, module pos). Closes the day of the signed-in cashier: the
// count, the float of the day if it differs, a note; the store contacts get the reckoning by WhatsApp (KSH0012).
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/pos/closings">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff", "pos");
    const input = posClosingSchema.parse(await readJson(request));
    return NextResponse.json(await closeDay(storeId, user.id, input), { status: 201 });
  },
);
