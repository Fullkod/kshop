import type { Metadata } from "next";
import { CustomerRecoverForm } from "@kshop/storefront";

export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false } };

// Customer pages: static shell, the session lives in the browser (D6).
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-8 sm:py-12">
      <h1 className="sf-heading mb-6 text-2xl font-semibold">Recuperar contraseña</h1>
      <CustomerRecoverForm />
    </div>
  );
}
