import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderView } from "@/features/cart/OrderView";

export const metadata: Metadata = { title: "Pedido", robots: { index: false } };

// Any token renders the same static shell; the order is read in the browser by its token.
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Cargando…</p>}>
        <OrderView />
      </Suspense>
    </div>
  );
}
