import { productInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { saveProduct } from "@/server/catalog/products";
import { apiHandler, readJson } from "@/server/http";

// POST /api/v1/stores/{storeId}/catalog/products -> creates the product with its variants (one transaction)
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/products">) => {
    const { storeId, user } = await requireCatalogAccess(request, (await ctx.params).storeId, "staff");
    const input = productInputSchema.parse(await readJson(request));
    const id = await saveProduct(storeId, user.id, input);
    invalidateCatalog(storeId);
    return NextResponse.json({ id }, { status: 201 });
  },
);
