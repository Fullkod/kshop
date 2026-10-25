import { reorderInputSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateContent, REORDERABLE_CONTENT, requireContentAccess } from "@/server/content/resources";
import { mapDbError } from "@/server/db-errors";
import { apiHandler, readJson } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

const bodySchema = reorderInputSchema.extend({ table: z.enum(["banners", "sections"]) });

// POST /api/v1/stores/{storeId}/content/reorder  { table: banners|sections, ids } -> sort_order = position
export const POST = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/content/reorder">) => {
    const { storeId } = await requireContentAccess(request, (await ctx.params).storeId);
    const input = bodySchema.parse(await readJson(request));
    const db = getServiceClient();
    // A few rows per store: one update each, always scoped to the store.
    for (const [index, id] of input.ids.entries()) {
      const { error } = await db
        .from(REORDERABLE_CONTENT[input.table])
        .update({ sort_order: index })
        .eq("store_id", storeId)
        .eq("id", id);
      if (error) mapDbError(error);
    }
    invalidateContent(storeId);
    return new NextResponse(null, { status: 204 });
  },
);
