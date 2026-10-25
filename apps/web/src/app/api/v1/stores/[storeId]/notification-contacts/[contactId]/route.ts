import { notificationContactSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { deleteContact, saveContact } from "@/server/notifications/admin";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/notification-contacts/[contactId]">;

async function resolve(request: Request, ctx: Ctx) {
  const params = await ctx.params;
  const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "whatsapp_notifications");
  return { storeId, id: uuidParam.parse(params.contactId) };
}

// PATCH /api/v1/stores/{storeId}/notification-contacts/{contactId}  (same body as POST)
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  const input = notificationContactSchema.parse(await readJson(request));
  return NextResponse.json({ id: await saveContact(storeId, id, input) });
});

// DELETE /api/v1/stores/{storeId}/notification-contacts/{contactId}
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId, id } = await resolve(request, ctx);
  await deleteContact(storeId, id);
  return new NextResponse(null, { status: 204 });
});
