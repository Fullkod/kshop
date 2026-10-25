import { NextResponse } from "next/server";
import { requireCustomer } from "@/server/customers/accounts";
import { apiHandler, notFound, uuidParam } from "@/server/http";
import { getUserClient } from "@/server/supabase";

// GET /api/v1/stores/{storeId}/customer/orders/{orderId}  -> { publicToken }
// Link of the WhatsApp notices for customers with an account (decision 24): the order is read as the customer, so
// RLS only finds its own; the page then shows it like the public order page.
export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/customer/orders/[orderId]">) => {
    const params = await ctx.params;
    const storeId = uuidParam.parse(params.storeId);
    const orderId = uuidParam.parse(params.orderId);
    const { user } = await requireCustomer(request, storeId);
    const { data, error } = await getUserClient(user.accessToken)
      .from("orders")
      .select("public_token")
      .eq("store_id", storeId)
      .eq("id", orderId)
      .maybeSingle<{ public_token: string }>();
    if (error) throw error;
    if (!data) throw notFound("Pedido");
    return NextResponse.json({ publicToken: data.public_token });
  },
);
