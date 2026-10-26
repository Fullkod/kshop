import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, uuidParam } from "@/server/http";
import { retryNotification } from "@/server/notifications/admin";

// POST /api/v1/stores/{storeId}/notifications/{logId}/retry  (staff+)  a failed notice goes back to the queue
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/notifications/[logId]/retry">) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(
      request,
      params.storeId,
      "staff",
      "whatsapp_notifications",
    );
    await retryNotification(storeId, uuidParam.parse(params.logId));
    return NextResponse.json({ id: params.logId });
  },
);
