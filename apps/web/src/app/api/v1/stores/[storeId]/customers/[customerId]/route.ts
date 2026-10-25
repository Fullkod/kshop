import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCatalogAccess } from "@/server/catalog/access";
import { apiHandler, notFound, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

const customerUpdateSchema = z.object({ isBlocked: z.boolean() });

// PATCH /api/v1/stores/{storeId}/customers/{customerId}  { isBlocked }  (admin+)
// A blocked customer cannot sign in nor buy with its account; its orders and data stay.
export const PATCH = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customers/[customerId]">) => {
    const params = await ctx.params;
    const { storeId } = await requireCatalogAccess(request, params.storeId, "admin", "orders");
    const { isBlocked } = customerUpdateSchema.parse(await readJson(request));
    const { data, error } = await getServiceClient()
      .from("customers")
      .update({ is_blocked: isBlocked })
      .eq("store_id", storeId)
      .eq("id", uuidParam.parse(params.customerId))
      .select("id");
    if (error) throw error;
    if (!data.length) throw notFound("Cliente");
    return NextResponse.json({ id: data[0]!.id, isBlocked });
  },
);
