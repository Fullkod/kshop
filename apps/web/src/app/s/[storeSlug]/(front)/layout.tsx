import {
  BottomTabBar,
  CartProvider,
  CartUiProvider,
  CurrencyProvider,
  CustomerSessionProvider,
  FavoritesProvider,
  headerChips,
  headerLinks,
  StoreFooter,
  StoreAnnouncement,
  StoreHeader,
  themeStyle,
  whatsappUrl,
} from "@kshop/storefront";
import { Suspense } from "react";
import { AndroidAppBanner } from "@/features/mobile-app/components/AndroidAppBanner";
import { getPublicStoreApp } from "@/server/app-builds";
import { hasModule } from "@/server/auth";
import { getStorefrontShell } from "@/server/storefront/data";
import { getStoreBySlug } from "@/server/stores";

/**
 * Public storefront: store theme, header, footer. A suspended store shows a notice (its admin stays reachable); a store
 * without the online store (plan «Caja», KSH0004) shows its card: it sells at its counter.
 */
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

  if (!(await hasModule(store.id, "storefront"))) {
    const wa = store.whatsappPhone ? whatsappUrl(store.whatsappPhone, `Hola, ${store.name}.`) : null;
    return (
      <div className="sf-root" style={themeStyle(store.theme)}>
        <main
          className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center"
          data-testid="local-store-card"
        >
          {store.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- the store's own logo, any size
            <img src={store.logoUrl} alt="" className="max-h-24 max-w-48 object-contain" />
          )}
          <h1 className="text-3xl font-semibold">{store.name}</h1>
          <p className="text-lg">Este negocio vende en su local.</p>
          {store.description && <p className="text-muted-foreground">{store.description}</p>}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 items-center rounded-xl bg-whatsapp px-6 font-semibold text-white"
            >
              Escribir por WhatsApp
            </a>
          )}
        </main>
      </div>
    );
  }

  const [shell, app] = await Promise.all([
    getStorefrontShell(store.id),
    getPublicStoreApp(store.id, store.slug),
  ]);
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
          <FavoritesProvider>
            <CartProvider>
              <CartUiProvider freeShipping={shell.freeShipping}>
                {app && <AndroidAppBanner storeName={store.name} />}
                <StoreAnnouncement announcement={shell.announcement} />
                <StoreHeader store={store} links={header} chips={headerChips(shell)} />
                <main id="content" className="flex-1">
                  {children}
                </main>
                <StoreFooter store={store} links={shell.footer} currencies={shell.currencies} />
                <Suspense fallback={null}>
                  <BottomTabBar />
                </Suspense>
              </CartUiProvider>
            </CartProvider>
          </FavoritesProvider>
        </CustomerSessionProvider>
      </CurrencyProvider>
    </div>
  );
}
