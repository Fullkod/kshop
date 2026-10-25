import { getStoreBySlug } from "@/server/stores";

/** Public storefront. A suspended store shows a notice instead of its pages (its admin stays reachable). */
export default async function StorefrontLayout({ children, params }: LayoutProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);

  if (store?.status === "suspended") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold">{store.name}</h1>
        <p className="text-lg">Tienda temporalmente no disponible.</p>
        <p className="text-muted-foreground">Vuelve a intentarlo más tarde.</p>
      </main>
    );
  }

  return <>{children}</>;
}
