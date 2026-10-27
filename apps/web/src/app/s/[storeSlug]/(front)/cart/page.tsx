import type { Metadata } from "next";
import { CartView } from "@kshop/storefront";
import { getStorefrontShell } from "@/server/storefront/data";
import { requireStore } from "@/server/storefront/page-helpers";

export const metadata: Metadata = { title: "Carrito", robots: { index: false } };

// The cart lives on the server and is read from the browser (D8); the page only brings the free-shipping threshold.
export default async function Page({ params }: PageProps<"/s/[storeSlug]/cart">) {
  const store = await requireStore(params);
  const { freeShipping } = await getStorefrontShell(store.id);
  return (
    <div className="flex w-full flex-col gap-6 px-[clamp(16px,4.4cqw,56px)] py-8">
      <h1 className="sf-heading text-[clamp(24px,2.6cqw,34px)] leading-tight font-bold">Carrito</h1>
      <CartView freeShipping={freeShipping} />
    </div>
  );
}
