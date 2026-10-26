import { templatePreviewSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { previewTemplate } from "@/server/notifications/admin";

// POST /api/v1/stores/{storeId}/whatsapp-templates/preview  (staff+)  { body, audience, orderId? } -> { text }
// The message exactly as it would be sent (same SQL render), with a real order or sample data.
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/whatsapp-templates/preview">) => {
    const { storeId } = await requireCatalogAccess(
      request,
      (await ctx.params).storeId,
      "staff",
      "whatsapp_notifications",
    );
    const input = templatePreviewSchema.parse(await readJson(request));
    return NextResponse.json({
      text: await previewTemplate(storeId, input.body, input.audience, input.orderId),
    });
  },
);
