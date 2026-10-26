import { cartVoucherSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { clientIp, optionalCustomer, rateLimit, requireOpenStore } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { setCartVoucher } from "@/server/orders/cart";

// PUT /api/v1/stores/{storeId}/cart/voucher  { token?, code: "BIENVENIDA10" | null }
// Saves the voucher in the cart and returns the cart priced with it (cart.voucher.error says why it does not
// apply). Codes are a store secret: tries are rate limited per IP so they cannot be guessed.
export const PUT = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/cart/voucher">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    await requireOpenStore(storeId);
    const input = cartVoucherSchema.parse(await readJson(request));
    if (input.code) await rateLimit(`voucher-ip:${storeId}:${clientIp(request)}`, 600, 20);
    const customer = await optionalCustomer(request, storeId);
    const cart = await setCartVoucher(
      storeId,
      { customerId: customer?.customer.id ?? null, token: input.token },
      input.code,
    );
    return NextResponse.json(cart);
  },
);
