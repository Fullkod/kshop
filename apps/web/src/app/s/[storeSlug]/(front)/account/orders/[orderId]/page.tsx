import type { Metadata } from "next";
import { Suspense } from "react";
import { MyOrder } from "@/features/customer-account/MyOrder";

export const metadata: Metadata = { title: "Mi pedido", robots: { index: false } };

// Static shell: the customer session and the order are read in the browser.
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <Suspense fallback={<p className="py-12 text-center text-muted-foreground">Cargando…</p>}>
        <MyOrder />
      </Suspense>
    </div>
  );
}
