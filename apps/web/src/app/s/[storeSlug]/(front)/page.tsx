import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/server/stores";

// Placeholder home until the sections of phase 2.4.
export default async function StoreHomePage({ params }: PageProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store) notFound();

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-20 sm:px-6">
      <h1 className="text-4xl font-semibold" data-testid="store-name">
        Bienvenido a {store.name}
      </h1>
      <Link
        href="/products"
        className="rounded-[var(--sf-radius)] bg-primary px-5 py-3 font-medium text-primary-foreground hover:bg-primary/90"
      >
        Ver productos
      </Link>
    </section>
  );
}
