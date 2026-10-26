import { NextResponse } from "next/server";
import { getUserFromBearer, requireStoreRole } from "@/server/auth";
import { getOwnerBilling } from "@/server/billing";
import { apiHandler, uuidParam } from "@/server/http";

// GET /api/v1/stores/{id}/billing  (owner/admin)  -> plan, state, next invoice, usage, modules with their price,
// invoices, how to pay. Works while the store is suspended (the owner must be able to pay).
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/billing">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    await requireStoreRole(await getUserFromBearer(request), storeId, "admin");
    return NextResponse.json(await getOwnerBilling(storeId));
  },
);
