import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { createImportJob } from "@/server/catalog/excel";
import { apiHandler, readJson } from "@/server/http";

const bodySchema = z.object({
  /** Path in the private bucket store-imports: stores/{storeId}/imports/... (uploaded by the client). */
  fileKey: z.string().min(1).max(300),
  fileName: z.string().trim().max(200).default("importacion.xlsx"),
  productTypeId: z.uuid(),
  mode: z.enum(["create_only", "upsert"]).default("create_only"),
  createMissing: z.boolean().default(true),
});

// POST /api/v1/stores/{storeId}/catalog/imports -> parses and validates the file; returns the preview.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/catalog/imports">) => {
    const { storeId, user } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "admin",
      "excel_import",
    );
    const input = bodySchema.parse(await readJson(request));
    const preview = await createImportJob({ storeId, userId: user.id, ...input });
    return NextResponse.json(preview, { status: 201 });
  },
);
