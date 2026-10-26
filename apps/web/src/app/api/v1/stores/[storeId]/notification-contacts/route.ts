import { notificationContactSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { saveContact } from "@/server/notifications/admin";

// POST /api/v1/stores/{storeId}/notification-contacts  (admin+, module whatsapp_notifications)
// { name, phone, notifyNewOrder, notifyPaymentRecorded, showToCustomer, isActive }
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/notification-contacts">) => {
    const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "whatsapp_notifications");
    const input = notificationContactSchema.parse(await readJson(request));
    return NextResponse.json({ id: await saveContact(storeId, null, input) }, { status: 201 });
  },
);
