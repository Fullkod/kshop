import { checkoutSchema } from "@kshop/core";
import type { CheckoutResponse, CustomerAuthResponse } from "@kshop/data";
import { NextResponse } from "next/server";
import {
  clientIp,
  optionalCustomer,
  rateLimit,
  registerCustomer,
  requireOpenStore,
} from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { cartLinesForCheckout } from "@/server/orders/cart";
import { checkoutOptions, placeOrder } from "@/server/orders/checkout";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/checkout">;

// GET /api/v1/stores/{storeId}/checkout  -> active zones, shipping methods and payment methods
export const GET = apiHandler(async (_request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  await requireOpenStore(storeId);
  return NextResponse.json(await checkoutOptions(storeId));
});

// POST /api/v1/stores/{storeId}/checkout  { idempotencyKey, cartToken?, currency?, customer, shipping, paymentMethodId?,
//   note?, createAccountPassword? }
// The lines come from the server-side cart, never from the request. A retry with the same key returns the same order.
export const POST = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  await requireOpenStore(storeId);
  const ip = clientIp(request);
  await rateLimit(`checkout-ip:${storeId}:${ip}`, 600, 30);
  const input = checkoutSchema.parse(await readJson(request));
  const signedIn = await optionalCustomer(request, storeId);

  // Optional account in the same step (D2): created first, then the guest cart joins it.
  let account: CustomerAuthResponse | undefined;
  if (!signedIn && input.createAccountPassword) {
    account = await registerCustomer(
      storeId,
      {
        firstName: input.customer.name,
        phone: input.customer.phone,
        password: input.createAccountPassword,
        acceptsMarketing: false,
      },
      ip,
    );
  }
  const customerId = signedIn?.customer.id ?? account?.customer.id ?? null;

  const cart = await cartLinesForCheckout(storeId, { customerId, token: input.cartToken });
  const result: CheckoutResponse = await placeOrder(storeId, {
    channel: "web",
    customerId,
    cartId: cart?.cartId ?? null,
    lines: cart?.lines ?? [],
    input,
  });
  return NextResponse.json({ ...result, account }, { status: result.created ? 201 : 200 });
});
