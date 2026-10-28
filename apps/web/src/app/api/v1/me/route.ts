import type { StoreRole } from "@kshop/core";
import type { AdminBootstrap, MeResponse } from "@kshop/data";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/server/auth";
import { apiHandler, uuidParam } from "@/server/http";
import { getUserClient } from "@/server/supabase";

// GET /api/v1/me[?storeId=]  The signed-in user and their stores. With storeId (the admin shell) it also returns
// admin_bootstrap for that store in the same call: role, modules, limits, subscription, status, add-on prices and the
// orders to confirm, read through PostgREST instead of pg_graphql (R11: the boot no longer pays the GraphQL schema
// rebuild of a cold connection).
export const GET = apiHandler(async (request: Request) => {
  const user = await getUserFromBearer(request);
  const storeIdParam = new URL(request.url).searchParams.get("storeId");
  const storeId = storeIdParam === null ? null : uuidParam.parse(storeIdParam);

  // Read as the user: RLS returns only their own memberships and what they may see of the store.
  const client = getUserClient(user.accessToken);
  const [{ data, error }, bootstrap] = await Promise.all([
    client
      .from("store_members")
      .select("role, stores (id, slug, name)")
      .eq("user_id", user.id)
      .returns<{ role: StoreRole; stores: { id: string; slug: string; name: string } | null }[]>(),
    storeId ? client.rpc("admin_bootstrap", { p_store_id: storeId }) : null,
  ]);
  if (error) throw error;
  if (bootstrap?.error) throw bootstrap.error;

  const body: MeResponse = {
    user: { id: user.id, email: user.email },
    isSuperadmin: user.isSuperadmin,
    stores: data.flatMap((m) => (m.stores ? [{ ...m.stores, role: m.role }] : [])),
    ...(bootstrap && { admin: bootstrap.data as AdminBootstrap }),
  };
  return NextResponse.json(body);
});
