import "server-only";
import { MAX_LINE_QUANTITY, type CartUpdateInput, type CurrencyCode, type VoucherScope } from "@kshop/core";
import type { Cart, CartLine } from "@kshop/data";
import { mapDbError } from "../db-errors";
import { hasModule } from "../auth";
import { mergeGuestCart } from "../customers/accounts";
import { getServiceClient } from "../supabase";

// Server-side cart (D8): guest token or customer, availability computed here and prices by the SQL pricing
// engine (public.price_lines: promotions and the voucher, PRP-4 D1), the same one the checkout uses.

type CartRow = {
  id: string;
  token: string;
  customer_id: string | null;
  currency: CurrencyCode | null;
  voucher_code: string | null;
};

const CART_COLUMNS = "id, token, customer_id, currency, voucher_code";

export type CartOwner = { customerId: string | null; token: string | undefined };

type StoreCurrencyRow = {
  currency: CurrencyCode;
  is_base: boolean;
  rate_to_base: number;
  rounding: number | null;
};

/** Sale currencies the store can sell in now (other than the base needs multi_currency). */
export async function saleCurrencies(storeId: string): Promise<StoreCurrencyRow[]> {
  const { data, error } = await getServiceClient()
    .from("store_currencies")
    .select("currency, is_base, rate_to_base, rounding")
    .eq("store_id", storeId)
    .eq("sells", true)
    .returns<StoreCurrencyRow[]>();
  if (error) throw error;
  if (data.length > 1 && !(await hasModule(storeId, "multi_currency"))) return data.filter((c) => c.is_base);
  return data;
}

/** The requested currency when the store sells in it, otherwise the base currency. */
export function pickCurrency(currencies: StoreCurrencyRow[], requested?: string | null): StoreCurrencyRow {
  return (
    currencies.find((c) => c.currency === requested) ?? currencies.find((c) => c.is_base) ?? currencies[0]!
  );
}

async function findCart(storeId: string, owner: CartOwner): Promise<CartRow | null> {
  const service = getServiceClient();
  if (owner.customerId) {
    await mergeGuestCart(storeId, owner.token, owner.customerId);
    const { data, error } = await service
      .from("carts")
      .select(CART_COLUMNS)
      .eq("store_id", storeId)
      .eq("customer_id", owner.customerId)
      .eq("status", "active")
      .maybeSingle<CartRow>();
    if (error) throw error;
    return data;
  }
  if (!owner.token) return null;
  const { data, error } = await service
    .from("carts")
    .select(CART_COLUMNS)
    .eq("store_id", storeId)
    .eq("token", owner.token)
    .eq("status", "active")
    .is("customer_id", null)
    .maybeSingle<CartRow>();
  if (error) throw error;
  return data;
}

type LineRow = {
  variant_id: string;
  quantity: number;
  product_variants: {
    sku: string;
    name: string;
    stock_available: number;
    track_inventory: boolean;
    product_id: string;
    products: { name: string; slug: string; status: string; primary_media_url: string | null } | null;
  } | null;
};

type PricedLine = {
  variant_id: string;
  list_price: number;
  compare_at_price: number | null;
  unit_price: number;
  line_total: number;
  promotion: { name: string } | null;
};
export type PricedLines = {
  currency: CurrencyCode;
  lines: PricedLine[];
  list_subtotal: number;
  subtotal: number;
  promotion_savings: number;
  voucher: {
    code: string;
    name: string | null;
    scope: VoucherScope | null;
    amount: number | null;
    error: string | null;
  } | null;
  discount_total: number;
  vouchers_enabled: boolean;
};

/** Prices of lines in a currency with promotions and an optional voucher (public.price_lines). */
export async function priceLines(
  storeId: string,
  input: {
    currency: string;
    lines: { variant_id: string; quantity: number }[];
    voucherCode?: string | null;
    customerId?: string | null;
    phone?: string | null;
  },
): Promise<PricedLines> {
  const { data, error } = await getServiceClient().rpc("price_lines", {
    p_store_id: storeId,
    p_input: {
      currency: input.currency,
      lines: input.lines,
      voucher_code: input.voucherCode ?? null,
      customer_id: input.customerId ?? null,
      phone: input.phone ?? null,
    },
  });
  if (error) mapDbError(error);
  return data as PricedLines;
}

/** Lines with prices in the cart currency (promotions and voucher included) and stock problems flagged. */
export async function cartView(
  storeId: string,
  cart: CartRow | null,
  requestedCurrency?: string,
): Promise<Cart> {
  const currencies = await saleCurrencies(storeId);
  const currency = pickCurrency(currencies, requestedCurrency ?? cart?.currency);
  const empty: Cart = {
    token: null,
    currency: currency.currency,
    lines: [],
    subtotal: 0,
    promotionSavings: 0,
    voucher: null,
    discountTotal: 0,
    vouchersEnabled: false,
    itemCount: 0,
    hasIssues: false,
  };
  if (!cart) return empty;

  const { data, error } = await getServiceClient()
    .from("cart_lines")
    .select(
      `variant_id, quantity,
       product_variants (sku, name, stock_available, track_inventory, product_id,
         products (name, slug, status, primary_media_url))`,
    )
    .eq("store_id", storeId)
    .eq("cart_id", cart.id)
    .order("added_at")
    .returns<LineRow[]>();
  if (error) throw error;
  const rows = data.filter((row) => row.product_variants?.products);
  if (!rows.length) return { ...empty, token: cart.customer_id ? null : cart.token };

  const priced = await priceLines(storeId, {
    currency: currency.currency,
    lines: rows.map((row) => ({ variant_id: row.variant_id, quantity: row.quantity })),
    voucherCode: cart.voucher_code,
    customerId: cart.customer_id,
  });
  const prices = new Map(priced.lines.map((l) => [l.variant_id, l]));

  const lines: CartLine[] = rows.flatMap((row) => {
    const v = row.product_variants!;
    const p = prices.get(row.variant_id);
    if (!p) return [];
    const published = v.products!.status === "published";
    const available = !published ? 0 : v.track_inventory ? Math.max(0, v.stock_available) : MAX_LINE_QUANTITY;
    return [
      {
        variantId: row.variant_id,
        productId: v.product_id,
        productSlug: v.products!.slug,
        productName: v.products!.name,
        variantName: v.name,
        sku: v.sku,
        imageUrl: v.products!.primary_media_url,
        quantity: row.quantity,
        listPrice: Number(p.list_price),
        unitPrice: Number(p.unit_price),
        compareAtPrice: p.compare_at_price == null ? null : Number(p.compare_at_price),
        promotionName: p.promotion?.name ?? null,
        lineTotal: Number(p.line_total),
        available,
        issue: available === 0 ? "unavailable" : available < row.quantity ? "insufficient" : null,
      },
    ];
  });

  return {
    token: cart.customer_id ? null : cart.token,
    currency: currency.currency,
    lines,
    subtotal: Number(priced.subtotal),
    promotionSavings: Number(priced.promotion_savings),
    voucher: priced.voucher && {
      code: priced.voucher.code,
      name: priced.voucher.name,
      scope: priced.voucher.scope,
      amount: priced.voucher.amount == null ? null : Number(priced.voucher.amount),
      error: priced.voucher.error,
    },
    discountTotal: Number(priced.discount_total),
    vouchersEnabled: priced.vouchers_enabled,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    hasIssues: lines.some((l) => l.issue !== null),
  };
}

export async function getCart(storeId: string, owner: CartOwner, currency?: string): Promise<Cart> {
  return cartView(storeId, await findCart(storeId, owner), currency);
}

/** Adds or sets lines (quantity 0 removes); creates the cart on the first line. */
export async function updateCart(storeId: string, owner: CartOwner, input: CartUpdateInput): Promise<Cart> {
  const service = getServiceClient();
  let cart = await findCart(storeId, { ...owner, token: owner.token ?? input.token });
  if (!cart) {
    const { data, error } = await service
      .from("carts")
      .insert({ store_id: storeId, customer_id: owner.customerId, currency: input.currency ?? null })
      .select(CART_COLUMNS)
      .single<CartRow>();
    if (error) throw error;
    cart = data;
  } else if (input.currency && input.currency !== cart.currency) {
    await service.from("carts").update({ currency: input.currency }).eq("id", cart.id);
    cart = { ...cart, currency: input.currency };
  }

  // Only variants of this store (the composite FK rejects others, this gives a clean 404-free result).
  const ids = input.lines.map((l) => l.variantId);
  const { data: existing, error: readError } = await service
    .from("cart_lines")
    .select("variant_id, quantity")
    .eq("cart_id", cart.id)
    .in("variant_id", ids)
    .returns<{ variant_id: string; quantity: number }[]>();
  if (readError) throw readError;
  const current = new Map(existing.map((l) => [l.variant_id, l.quantity]));

  const upserts: { store_id: string; cart_id: string; variant_id: string; quantity: number }[] = [];
  const removals: string[] = [];
  for (const line of input.lines) {
    const quantity = Math.min(
      MAX_LINE_QUANTITY,
      input.mode === "add" ? (current.get(line.variantId) ?? 0) + line.quantity : line.quantity,
    );
    if (quantity <= 0) removals.push(line.variantId);
    else upserts.push({ store_id: storeId, cart_id: cart.id, variant_id: line.variantId, quantity });
  }
  if (removals.length) {
    const { error } = await service
      .from("cart_lines")
      .delete()
      .eq("cart_id", cart.id)
      .in("variant_id", removals);
    if (error) throw error;
  }
  if (upserts.length) {
    const { error } = await service.from("cart_lines").upsert(upserts, { onConflict: "cart_id,variant_id" });
    if (error) {
      // 23503: the variant does not belong to this store (composite FK).
      if (error.code === "23503") return cartView(storeId, cart, input.currency);
      throw error;
    }
  }
  await service.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cart.id);
  return cartView(storeId, cart, input.currency);
}

/** Sets or removes the voucher of the cart (validated when the cart is priced, again at checkout). */
export async function setCartVoucher(storeId: string, owner: CartOwner, code: string | null): Promise<Cart> {
  const cart = await findCart(storeId, owner);
  if (!cart) return cartView(storeId, null);
  const { error } = await getServiceClient().from("carts").update({ voucher_code: code }).eq("id", cart.id);
  if (error) throw error;
  return cartView(storeId, { ...cart, voucher_code: code });
}

/** Lines of the cart for the checkout function (server-side quantities, never the client's). */
export async function cartLinesForCheckout(
  storeId: string,
  owner: CartOwner,
): Promise<{
  cartId: string;
  voucherCode: string | null;
  lines: { variant_id: string; quantity: number }[];
} | null> {
  const cart = await findCart(storeId, owner);
  if (!cart) return null;
  const { data, error } = await getServiceClient()
    .from("cart_lines")
    .select("variant_id, quantity")
    .eq("cart_id", cart.id)
    .returns<{ variant_id: string; quantity: number }[]>();
  if (error) throw error;
  return data.length ? { cartId: cart.id, voucherCode: cart.voucher_code, lines: data } : null;
}
