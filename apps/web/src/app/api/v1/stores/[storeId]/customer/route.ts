import { customerProfileSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { requireCustomer, toCustomerProfile } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { getServiceClient } from "@/server/supabase";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/customer">;

// GET /api/v1/stores/{storeId}/customer  -> profile of the signed-in customer (customer token of this store)
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const { customer } = await requireCustomer(request, uuidParam.parse((await ctx.params).storeId));
  return NextResponse.json({ customer: toCustomerProfile(customer) });
});

// PATCH /api/v1/stores/{storeId}/customer  { firstName, lastName?, email?, acceptsMarketing }
// The phone is the login identifier and is not changed here.
export const PATCH = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  const { customer } = await requireCustomer(request, storeId);
  const input = customerProfileSchema.parse(await readJson(request));

  const { data, error } = await getServiceClient()
    .from("customers")
    .update({
      first_name: input.firstName,
      last_name: input.lastName ?? null,
      email: input.email ?? null,
      accepts_marketing: input.acceptsMarketing,
    })
    .eq("id", customer.id)
    .eq("store_id", storeId)
    .select("*")
    .single();
  if (error) throw error;
  return NextResponse.json({ customer: toCustomerProfile(data) });
});
