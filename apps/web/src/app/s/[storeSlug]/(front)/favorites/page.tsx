import type { Metadata } from "next";
import { FavoritesView } from "@kshop/storefront";

export const metadata: Metadata = { title: "Favoritos", robots: { index: false } };

// Static shell; the favorites belong to the customer account and are read from the browser.
export default function Page() {
  return <FavoritesView />;
}
