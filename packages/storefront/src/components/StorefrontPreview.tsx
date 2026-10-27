"use client";

import type { ApiClient, StoreCurrency } from "@kshop/data";
import type { ReactNode } from "react";
import { PreviewCustomerSessionProvider } from "../account/CustomerSession";
import { PreviewFavoritesProvider } from "../account/Favorites";
import { PreviewCartUiProvider } from "../cart/CartDrawer";
import { PreviewCartProvider } from "../cart/CartProvider";
import { CurrencyProvider } from "./Currency";

/**
 * The storefront's providers with inert values, so the real components (header, cards, footer) can be drawn outside
 * the store — the theme preview of the admin — without reading or touching the shopper's cart, session or
 * favorites.
 */
export function StorefrontPreviewProviders({
  storeId,
  currencies,
  api,
  children,
}: {
  storeId: string;
  currencies: StoreCurrency[];
  api: ApiClient;
  children: ReactNode;
}) {
  return (
    <CurrencyProvider storeId={storeId} currencies={currencies}>
      <PreviewCustomerSessionProvider api={api}>
        <PreviewFavoritesProvider>
          <PreviewCartProvider>
            <PreviewCartUiProvider>{children}</PreviewCartUiProvider>
          </PreviewCartProvider>
        </PreviewFavoritesProvider>
      </PreviewCustomerSessionProvider>
    </CurrencyProvider>
  );
}
