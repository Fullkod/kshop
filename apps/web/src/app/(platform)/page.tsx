import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function PlatformHome() {
  return (
    <main className="flex min-h-dvh flex-col bg-night text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Brand reversed />
        <Link href="/superadmin" className="text-sm text-white/70 hover:text-white">
          Acceso Fullkod
        </Link>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-6 pb-24">
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
          Tu tienda online, con tu dirección y tus pedidos por <span className="text-gold">WhatsApp</span>.
        </h1>
        <p className="max-w-xl text-lg text-white/75">
          Catálogo con variantes, precios en CUP, USD o EUR y un panel para gestionar tu negocio desde el
          móvil.
        </p>
      </section>
    </main>
  );
}
