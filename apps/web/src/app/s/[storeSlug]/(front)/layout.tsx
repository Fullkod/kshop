import {
  CartProvider,
  CurrencyProvider,
  CustomerSessionProvider,
  headerLinks,
  StoreFooter,
  StoreHeader,
  themeStyle,
} from "@kshop/storefront";
import { getStorefrontShell } from "@/server/storefront/data";
import { getStoreBySlug } from "@/server/stores";

/** Public storefront: store theme, header, footer. A suspended store shows a notice (its admin stays reachable). */
export default async function StorefrontLayout({ children, params }: LayoutProps<"/s/[storeSlug]">) {
  const store = await getStoreBySlug((await params).storeSlug);
  if (!store) return children;

  if (store.status === "suspended") {
    return (
      <div className="sf-root" style={themeStyle(store.theme)}>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-3xl font-semibold">{store.name}</h1>
          <p className="text-lg">Tienda temporalmente no disponible.</p>
          <p className="text-muted-foreground">Vuelve a intentarlo más tarde.</p>
        </main>
      </div>
    );
  }

  const shell = await getStorefrontShell(store.id);
  const header = headerLinks(shell);

  return (
    <div className="sf-root flex min-h-dvh flex-col" style={themeStyle(store.theme)}>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-background focus:p-2"
      >
        Saltar al contenido
      </a>
      <CurrencyProvider storeId={store.id} currencies={shell.currencies}>
        <CustomerSessionProvider>
          <CartProvider>
            <StoreHeader store={store} links={header} />
            <main id="content" className="flex-1">
              {children}
            </main>
            <StoreFooter store={store} links={shell.footer} />
          </CartProvider>
        </CustomerSessionProvider>
      </CurrencyProvider>
    </div>
  );
}
