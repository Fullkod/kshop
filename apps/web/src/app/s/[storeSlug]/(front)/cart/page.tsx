import type { Metadata } from "next";
import { CartView } from "@/features/cart/CartView";

export const metadata: Metadata = { title: "Carrito", robots: { index: false } };

// Static shell; the cart lives on the server and is read from the browser (D8).
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="sf-heading mb-6 text-2xl font-semibold">Carrito</h1>
      <CartView />
    </div>
  );
}
