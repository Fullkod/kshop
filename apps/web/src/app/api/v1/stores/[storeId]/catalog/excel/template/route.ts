import { requireCatalogAccess } from "@/server/catalog/access";
import { buildTemplate } from "@/server/catalog/excel";
import { productTypeParam, xlsxResponse } from "@/server/catalog/excel-routes";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/catalog/excel/template?productTypeId=...
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/excel/template">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "admin",
      "excel_import",
    );
    const productTypeId = productTypeParam(request);
    return xlsxResponse(storeId, productTypeId, "plantilla", await buildTemplate(storeId, productTypeId));
  },
);
