import { MENU_LOCATIONS, menuInputSchema, type Link } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateContent, requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

const linkColumns = (link: Link) =>
  link.type === "url"
    ? { link_type: "url", link_target_id: null, link_url: link.url }
    : { link_type: link.type, link_target_id: link.targetId, link_url: null };

// PUT /api/v1/stores/{storeId}/content/menus/{header|footer}  { items: [{ label, link, children[] }] }
// The whole menu is replaced (two levels).
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/menus/[location]">) => {
    const params = await ctx.params;
    const location = z.enum(MENU_LOCATIONS).parse(params.location);
    const { storeId } = await requireContentAccess(request, params.storeId);
    const input = menuInputSchema.parse(await readJson(request));
    const db = getServiceClient();

    const { data: menu, error } = await db
      .from("menus")
      .upsert({ store_id: storeId, location }, { onConflict: "store_id,location" })
      .select("id")
      .single<{ id: string }>();
    if (error) mapDbError(error, "El menú");

    const removed = await db.from("menu_items").delete().eq("store_id", storeId).eq("menu_id", menu.id);
    if (removed.error) mapDbError(removed.error, "El menú");

    for (const [index, item] of input.items.entries()) {
      const { data: parent, error: parentError } = await db
        .from("menu_items")
        .insert({
          store_id: storeId,
          menu_id: menu.id,
          label: item.label,
          sort_order: index,
          ...linkColumns(item.link),
        })
        .select("id")
        .single<{ id: string }>();
      if (parentError) mapDbError(parentError, "El enlace");
      if (item.children.length) {
        const { error: childError } = await db.from("menu_items").insert(
          item.children.map((child, childIndex) => ({
            store_id: storeId,
            menu_id: menu.id,
            parent_id: parent.id,
            label: child.label,
            sort_order: childIndex,
            ...linkColumns(child.link),
          })),
        );
        if (childError) mapDbError(childError, "El enlace");
      }
    }

    invalidateContent(storeId);
    return new NextResponse(null, { status: 204 });
  },
);
