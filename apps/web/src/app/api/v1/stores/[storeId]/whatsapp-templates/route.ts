import { NOTIFICATION_AUDIENCES, whatsappTemplateSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, readJson } from "@/server/http";
import { restoreTemplate, saveTemplate } from "@/server/notifications/admin";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/whatsapp-templates">;

// PUT /api/v1/stores/{storeId}/whatsapp-templates  (admin+)  { event, audience, body, isActive }
// The store's own text for a notice; variables from a closed list ({{numero}}, {{total}}…).
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "whatsapp_notifications");
  const input = whatsappTemplateSchema.parse(await readJson(request));
  await saveTemplate(storeId, input);
  return NextResponse.json({ event: input.event, audience: input.audience });
});

// DELETE /api/v1/stores/{storeId}/whatsapp-templates?event=paid&audience=customer  -> back to the platform text
export const DELETE = apiHandler(async (request: Request, ctx: Ctx) => {
  const { storeId } = await requireCatalogAccess(request, (await ctx.params).storeId, "admin", "whatsapp_notifications");
  const params = new URL(request.url).searchParams;
  const event = z.string().regex(/^[a-z_]{3,40}$/).parse(params.get("event"));
  const audience = z.enum(NOTIFICATION_AUDIENCES).parse(params.get("audience"));
  await restoreTemplate(storeId, event, audience);
  return new NextResponse(null, { status: 204 });
});
