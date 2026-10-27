"use client";

import type { ProductCardData } from "@kshop/data";
import { buttonVariants, Heart } from "@kshop/ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useRouter } from "../navigation";
import { useStore } from "../store-context";
import { ProductGrid } from "../components/ProductCard";
import { useCustomerSession } from "./CustomerSession";

// Favorites live in the store (customer_favorites, PRP-R D3): they need a customer account and follow it across
// devices. Guests are sent to sign in and come back where they were.

type FavoritesValue = {
  /** null while loading (or for guests until the session is read). */
  products: ProductCardData[] | null;
  isFavorite: (productId: string) => boolean;
  /** Adds or removes; guests go to the login page first. */
  toggle: (productId: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const router = useRouter();
  const { ready, session, api } = useCustomerSession();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<{
    userId: string | null;
    ids: Set<string>;
    products: ProductCardData[] | null;
  }>({ userId: null, ids: new Set(), products: null });

  useEffect(() => {
    if (!ready || !userId) return;
    let cancelled = false;
    api
      .customer(store.id)
      .favorites()
      .then((r) => {
        if (!cancelled) setState({ userId, ids: new Set(r.productIds), products: r.products });
      })
      .catch(() => {
        if (!cancelled) setState({ userId, ids: new Set(), products: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [api, store.id, ready, userId]);

  // A previous user's favorites are never shown.
  const current = useMemo(
    () => (state.userId === userId ? state : { userId, ids: new Set<string>(), products: null }),
    [state, userId],
  );

  const toggle = useCallback(
    async (productId: string) => {
      if (!userId) {
        router.push(`/account/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const adding = !current.ids.has(productId);
      const next = new Set(current.ids);
      if (adding) next.add(productId);
      else next.delete(productId);
      setState({
        userId,
        ids: next,
        products: adding ? current.products : (current.products?.filter((p) => p.id !== productId) ?? null),
      });
      const client = api.customer(store.id);
      try {
        await (adding ? client.addFavorite(productId) : client.removeFavorite(productId));
        // The card of a new favorite comes with the next read (the list page reloads it).
        if (adding) {
          const r = await client.favorites();
          setState({ userId, ids: new Set(r.productIds), products: r.products });
        }
      } catch {
        setState({ userId, ids: current.ids, products: current.products });
      }
    },
    [api, store.id, router, userId, current],
  );

  const value = useMemo<FavoritesValue>(
    () => ({
      products: ready && !userId ? [] : current.products,
      isFavorite: (id) => current.ids.has(id),
      toggle,
    }),
    [ready, userId, current, toggle],
  );
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside <FavoritesProvider>");
  return value;
}

/** /favorites: the signed-in customer's favorites, or an invitation to sign in. */
export function FavoritesView() {
  const { ready, session } = useCustomerSession();
  const { products } = useFavorites();
  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,4.4cqw,56px)] py-8">
      <h1 className="sf-heading text-[clamp(24px,2.6cqw,34px)] leading-tight font-bold">Favoritos</h1>
      {ready && !session ? (
        <Empty
          text="Entra en tu cuenta para guardar productos y verlos en cualquier dispositivo."
          action={{ href: "/account/login?next=/favorites", label: "Entrar" }}
        />
      ) : products === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4" aria-busy>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-sf bg-surface" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Empty
          text="Todavía no tienes favoritos. Pulsa el corazón de un producto para guardarlo aquí."
          action={{ href: "/products", label: "Ver productos" }}
        />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  );
}

function Empty({ text, action }: { text: string; action: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-sf border border-dashed border-border px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-primary">
        <Heart size={24} aria-hidden />
      </span>
      <p className="max-w-sm text-muted-foreground">{text}</p>
      <Link href={action.href} className={buttonVariants()}>
        {action.label}
      </Link>
    </div>
  );
}

/** No favorites and no requests, for previews outside the store. */
export function PreviewFavoritesProvider({ children }: { children: ReactNode }) {
  return (
    <FavoritesContext.Provider value={{ products: [], isFavorite: () => false, toggle: async () => {} }}>
      {children}
    </FavoritesContext.Provider>
  );
}
