import { cartUpdateSchema, currencyCodeSchema } from "@kshop/core";
import { NextResponse } from "next/server";
import { optionalCustomer, requireOpenStore } from "@/server/customers/accounts";
import { apiHandler, readJson, uuidParam } from "@/server/http";
import { getCart, updateCart } from "@/server/orders/cart";

type Ctx = RouteContext<"/api/v1/stores/[storeId]/cart">;

// Cart of a guest (?token=) or of the signed-in customer (customer token of this store; the guest cart is merged).

// GET /api/v1/stores/{storeId}/cart?token=&currency=
export const GET = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  await requireOpenStore(storeId);
  const customer = await optionalCustomer(request, storeId);
  const params = new URL(request.url).searchParams;
  const token = uuidParam
    .optional()
    .catch(undefined)
    .parse(params.get("token") ?? undefined);
  const currency = currencyCodeSchema
    .optional()
    .catch(undefined)
    .parse(params.get("currency") ?? undefined);
  return NextResponse.json(
    await getCart(storeId, { customerId: customer?.customer.id ?? null, token }, currency),
  );
});

// PUT /api/v1/stores/{storeId}/cart  { token?, currency?, lines: [{ variantId, quantity }], mode: "set" | "add" }
export const PUT = apiHandler(async (request: Request, ctx: Ctx) => {
  const storeId = uuidParam.parse((await ctx.params).storeId);
  await requireOpenStore(storeId);
  const customer = await optionalCustomer(request, storeId);
  const input = cartUpdateSchema.parse(await readJson(request));
  const cart = await updateCart(
    storeId,
    { customerId: customer?.customer.id ?? null, token: input.token },
    input,
  );
  return NextResponse.json(cart);
});
