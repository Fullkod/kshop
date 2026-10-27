"use client";

import { ApiError, type Cart } from "@kshop/data";
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

/** Header link to the cart with the number of units. */
export function CartLink() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      className="relative flex h-10 w-10 items-center justify-center rounded-sf-btn hover:bg-surface"
      aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito"}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
        <circle cx="10" cy="20" r="1.3" />
        <circle cx="17" cy="20" r="1.3" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
