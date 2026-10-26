import { financePeriodSchema } from "@kshop/core";
import { requireCatalogAccess } from "@/server/catalog/access";
import { buildFinanceExport } from "@/server/finance";
import { apiHandler } from "@/server/http";

// GET /api/v1/stores/{storeId}/finance/export?from&to&currency  (owner/admin, finance)
// Excel with one sheet per view (Resumen, Cierre diario, Margen, Desglose, Inventario, Gastos).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/finance/export">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "finance");
    const period = financePeriodSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const body = await buildFinanceExport(storeId, period);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="finanzas-${period.from}-${period.to}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
