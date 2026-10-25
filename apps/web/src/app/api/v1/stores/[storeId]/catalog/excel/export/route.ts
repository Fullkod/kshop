import { requireCatalogAccess } from "@/server/catalog/access";
import { buildExport } from "@/server/catalog/excel";
import { productTypeParam, xlsxResponse } from "@/server/catalog/excel-routes";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/catalog/excel/export?productTypeId=... (same layout as the template)
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/excel/export">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "admin",
      "excel_import",
    );
    const productTypeId = productTypeParam(request);
    return xlsxResponse(storeId, productTypeId, "productos", await buildExport(storeId, productTypeId));
  },
);
