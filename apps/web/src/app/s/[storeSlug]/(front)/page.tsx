import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/server/stores";

// Minimal home: sections, catalog and theme arrive in Phases 1–2.
export default async function StoreHomePage({ params }: PageProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store) notFound();

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-display text-xl font-semibold" data-testid="store-name">
            {store.name}
          </span>
          {store.whatsappPhone && (
            <a
              href={`https://wa.me/${store.whatsappPhone.replace(/^\+/, "")}`}
              className="text-sm text-primary hover:underline"
            >
              WhatsApp
            </a>
          )}
        </div>
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start justify-center gap-3 px-6">
        <h1 className="text-4xl font-semibold">Bienvenido a {store.name}</h1>
        <p className="text-muted-foreground">Muy pronto verás aquí nuestro catálogo.</p>
      </section>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Tienda creada con Kshop
      </footer>
    </main>
  );
}
