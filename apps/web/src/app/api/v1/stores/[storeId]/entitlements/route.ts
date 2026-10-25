import { isModuleCode } from "@kshop/core";
import type { EntitlementsResponse } from "@kshop/data";
import { NextResponse } from "next/server";
import { getUserFromBearer, requireStoreRole } from "@/server/auth";
import { apiHandler, uuidParam } from "@/server/http";
import { getUserClient } from "@/server/supabase";

type EntitlementRow = {
  module_code: string;
  source: "plan" | "addon" | "grant";
  limits: Record<string, number>;
};

export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/entitlements">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const user = await getUserFromBearer(request);
    const role = await requireStoreRole(user, storeId, "staff");

    // Read as the user so RLS also applies.
    const client = getUserClient(user.accessToken);
    const [modules, limits] = await Promise.all([
      client.rpc("store_entitlements", { p_store_id: storeId }),
      client.rpc("store_limits", { p_store_id: storeId }),
    ]);
    if (modules.error) throw modules.error;
    if (limits.error) throw limits.error;

    const body: EntitlementsResponse = {
      storeId,
      role,
      modules: ((modules.data ?? []) as EntitlementRow[]).flatMap((m) =>
        isModuleCode(m.module_code) ? [{ code: m.module_code, source: m.source, limits: m.limits }] : [],
      ),
      limits: (limits.data ?? {}) as Record<string, number>,
    };
    return NextResponse.json(body);
  },
);
