import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { PublicHelp } from "./PublicHelp";

export const metadata: Metadata = {
  title: "Ayuda",
  description: "Guías paso a paso de Kshop, preguntas frecuentes y los manuales de cada plan en PDF.",
};

/**
 * kshop.fullkod.com/help: the store help (the same guides as Admin › Ayuda and Kshop Admin) and the manuals of every
 * plan, without signing in, for whoever is choosing a plan or starting with Kshop. Linked from the landing.
 */
export default function PlatformHelpPage() {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" aria-label="Kshop, volver al inicio">
            <Brand className="h-7" />
          </Link>
          <Link href="/" className="text-sm text-muted-foreground underline hover:text-foreground">
            Volver a Kshop
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <PublicHelp />
      </div>
    </main>
  );
}
