import { NextResponse } from "next/server";
import { invalidateCatalog, requireCatalogAccess } from "@/server/catalog/access";
import { runImportBatch } from "@/server/catalog/excel";
import { apiHandler, uuidParam } from "@/server/http";

export const runtime = "nodejs";

// POST /api/v1/stores/{storeId}/catalog/imports/{jobId}/run -> applies the next batch; call until done.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/imports/[jobId]/run">) => {
    const params = await ctx.params;
    const { storeId, user } = await requireCatalogAccess(request, params.storeId, "admin", "excel_import");
    const progress = await runImportBatch(storeId, uuidParam.parse(params.jobId), user.id);
    invalidateCatalog(storeId);
    return NextResponse.json(progress);
  },
);
