import type { Metadata } from "next";
import { AccountView, MyOrders } from "@kshop/storefront";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false } };

// Customer pages: static shell, the session lives in the browser (D6).
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <h1 className="sf-heading mb-6 text-2xl font-semibold">Mi cuenta</h1>
      <AccountView orders={<MyOrders />} />
    </div>
  );
}
