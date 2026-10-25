import type { Metadata } from "next";
import { CustomerRegisterForm } from "@/features/customer-account/AccountForms";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };

// Customer pages: static shell, the session lives in the browser (D6).
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-12">
      <h1 className="sf-heading mb-6 text-2xl font-semibold">Crear cuenta</h1>
      <CustomerRegisterForm />
    </div>
  );
}
