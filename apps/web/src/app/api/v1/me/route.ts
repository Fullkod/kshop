import type { StoreRole } from "@kshop/core";
import type { MeResponse } from "@kshop/data";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/server/auth";
import { apiHandler } from "@/server/http";
import { getUserClient } from "@/server/supabase";

export const GET = apiHandler(async (request: Request) => {
  const user = await getUserFromBearer(request);

  // Read as the user: RLS returns only their own memberships.
  const { data, error } = await getUserClient(user.accessToken)
    .from("store_members")
    .select("role, stores (id, slug, name)")
    .eq("user_id", user.id)
    .returns<{ role: StoreRole; stores: { id: string; slug: string; name: string } | null }[]>();
  if (error) throw error;

  const body: MeResponse = {
    user: { id: user.id, email: user.email },
    isSuperadmin: user.isSuperadmin,
    stores: data.flatMap((m) => (m.stores ? [{ ...m.stores, role: m.role }] : [])),
  };
  return NextResponse.json(body);
});
