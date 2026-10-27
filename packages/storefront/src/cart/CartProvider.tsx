"use client";

import { ApiError, type Cart } from "@kshop/data";
import { ShoppingBag } from "@kshop/ui";
import { Link } from "../navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "../store-context";
import { useCustomerSession } from "../account/CustomerSession";
import { useSelectedCurrency } from "../components/Currency";
import { clearCartToken, getCartToken, setCartToken } from "./cart-token";

// Server-side cart (D8) seen from the storefront: guests keep a token in localStorage, signed-in customers
// use their own cart (the guest cart is merged by the server on the first read after signing in).

type CartValue = {
  cart: Cart | null;
  /** Units in the cart (header badge). */
  count: number;
  pending: boolean;
  add: (variantId: string, quantity: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  /** Saves (or removes with null) the voucher code; the cart comes back priced with it. */
  setVoucher: (code: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  /** After a checkout: the server converted the cart. */
  reset: () => void;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { ready, session, api } = useCustomerSession();
  const currency = useSelectedCurrency()?.currency;
  const [cart, setCart] = useState<Cart | null>(null);
  const [pending, setPending] = useState(false);
  const signedIn = !!session;

  const apply = useCallback(
    (next: Cart) => {
      if (next.token) setCartToken(store.id, next.token);
      else if (signedIn) clearCartToken(store.id);
      setCart(next);
    },
    [store.id, signedIn],
  );

  const refresh = useCallback(async () => {
    try {
      apply(await api.cart(store.id).get(getCartToken(store.id), currency));
    } catch (error) {
      // A guest token of a converted cart is simply forgotten.
      if (!(error instanceof ApiError)) throw error;
      setCart(null);
    }
  }, [api, store.id, currency, apply]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    api
      .cart(store.id)
      .get(getCartToken(store.id), currency)
      .then((next) => !cancelled && apply(next))
      .catch(() => !cancelled && setCart(null));
    return () => {
      cancelled = true;
    };
  }, [ready, api, store.id, currency, apply, signedIn]);

  const update = useCallback(
    async (variantId: string, quantity: number, mode: "add" | "set") => {
      setPending(true);
      try {
        apply(
          await api.cart(store.id).update({
            token: getCartToken(store.id),
            currency,
            lines: [{ variantId, quantity }],
            mode,
          }),
        );
      } finally {
        setPending(false);
      }
    },
    [api, store.id, currency, apply],
  );

  const setVoucher = useCallback(
    async (code: string | null) => {
      setPending(true);
      try {
        apply(await api.cart(store.id).setVoucher({ token: getCartToken(store.id), code }));
      } finally {
        setPending(false);
      }
    },
    [api, store.id, apply],
  );

  const value = useMemo<CartValue>(
    () => ({
      cart,
      count: cart?.itemCount ?? 0,
      pending,
      add: (variantId, quantity) => update(variantId, quantity, "add"),
      setQuantity: (variantId, quantity) => update(variantId, quantity, "set"),
      setVoucher,
      refresh,
      reset: () => {
        clearCartToken(store.id);
        setCart((c) =>
          c
            ? {
                ...c,
                token: null,
                lines: [],
                subtotal: 0,
                promotionSavings: 0,
                voucher: null,
                discountTotal: 0,
                itemCount: 0,
                hasIssues: false,
              }
            : c,
        );
      },
    }),
    [cart, pending, update, setVoucher, refresh, store.id],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}

/** Header link to the cart (filled, with the number of units). */
export function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="ml-1 flex h-11 min-w-11 items-center justify-center gap-2 rounded-sf-btn bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito"}
    >
      <ShoppingBag size={19} aria-hidden />
      {count > 0 && <CountBadge count={count} />}
    </Link>
  );
}

/** Units in the cart: header button and bottom tab bar. */
export function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span
      className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] leading-none font-bold text-secondary-foreground ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
