import type { StorefrontShell } from "@kshop/data";
import {
  CartProvider,
  CurrencyProvider,
  CustomerSessionProvider,
  headerLinks,
  NavigationProvider,
  StoreFooter,
  StoreHeader,
  StoreProvider,
  themeStyle,
  type LinkProps,
  type PublicStore,
} from "@kshop/storefront";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { BrowserRouter, Link as RouterLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { useCached } from "./cache";
import { appConfig, storeWebUrl } from "./config";
import { apkUrl, loadAppInfo, loadShell, loadStore, type AppInfo } from "./data";
import { isNative, paintStatusBar, preferencesStorage, useBackButton, useOnline } from "./native";
import {
  AccountPage,
  CartPage,
  CheckoutPage,
  HomePage,
  ListingRoute,
  LoginPage,
  MyOrderPage,
  NotFound,
  OrderPage,
  ProductPage,
  RecoverPage,
  RegisterPage,
  StaticPage,
} from "./pages";

const ShellContext = createContext<StorefrontShell | null>(null);
export const useShell = () => useContext(ShellContext)!;

const EXTERNAL = /^(https?:|mailto:|tel:)/;

/** react-router behind the storefront's Link; external links (WhatsApp) leave the app. */
function Link({ href, prefetch: _prefetch, scroll, replace, ...props }: LinkProps) {
  if (EXTERNAL.test(href)) return <a href={href} target="_blank" rel="noreferrer" {...props} />;
  return <RouterLink to={href} replace={replace} preventScrollReset={scroll === false} {...props} />;
}

function RouterNavigation({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const value = useMemo(
    () => ({
      Link,
      push: (href: string) => void navigate(href),
      replace: (href: string) => void navigate(href, { replace: true }),
    }),
    [navigate],
  );
  return <NavigationProvider value={value}>{children}</NavigationProvider>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

/** Suspended store or no mobile_app (PRP-7 D15): the app says so instead of selling. */
function Unavailable({ store, info }: { store: PublicStore | undefined; info: AppInfo }) {
  return (
    <Notice>
      <h1 className="text-3xl font-semibold">{store?.name ?? appConfig.name}</h1>
      {info.store_status === "suspended" ? (
        <>
          <p className="text-lg">Tienda temporalmente no disponible.</p>
          <p className="text-muted-foreground">Vuelve a intentarlo más tarde.</p>
        </>
      ) : (
        <>
          <p className="text-lg">La app de esta tienda no está disponible.</p>
          <a href={storeWebUrl} className="text-primary underline" data-testid="web-link">
            Comprar en la web
          </a>
        </>
      )}
    </Notice>
  );
}

function Banners({ stale, info }: { stale: boolean; info: AppInfo | undefined }) {
  const online = useOnline();
  const latest = info?.latest;
  return (
    <>
      {(!online || stale) && (
        <p role="status" data-testid="offline" className="bg-surface px-4 py-2 text-center text-sm">
          Sin conexión: ves lo último que cargaste.
        </p>
      )}
      {latest && latest.version_code > appConfig.versionCode && (
        <p role="status" data-testid="update" className="bg-accent-soft px-4 py-2 text-center text-sm">
          Hay una versión nueva de la app ({latest.version_name}).{" "}
          <a href={apkUrl(latest.apk_path)} className="font-medium underline">
            Actualizar
          </a>
        </p>
      )}
    </>
  );
}

function StoreApp() {
  useBackButton();
  const store = useCached("store", loadStore);
  const info = useCached("app-info", loadAppInfo);
  const shell = useCached("shell", loadShell);

  useEffect(() => {
    if (store.data) {
      document.title = store.data.name;
      void paintStatusBar(store.data.theme.colors.background);
    }
  }, [store.data]);

  if (info.data && !info.data.available) return <Unavailable store={store.data} info={info.data} />;
  if (!store.data || !shell.data) {
    return (
      <Notice>
        {store.loading || shell.loading ? (
          <p className="text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{appConfig.name}</h1>
            <p>No hay conexión y todavía no hay nada guardado en el teléfono.</p>
            <button className="text-primary underline" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </>
        )}
      </Notice>
    );
  }

  const s = store.data;
  const config = {
    supabase: { url: appConfig.supabaseUrl, key: appConfig.supabaseKey },
    apiBaseUrl: appConfig.apiBaseUrl,
    channel: "app" as const,
    authStorage: isNative ? preferencesStorage : undefined,
  };
  return (
    <StoreProvider store={s} config={config}>
      <RouterNavigation>
        <ShellContext.Provider value={shell.data}>
          <div className="sf-root app-root flex min-h-dvh flex-col" style={themeStyle(s.theme)}>
            <CurrencyProvider storeId={s.id} currencies={shell.data.currencies}>
              <CustomerSessionProvider>
                <CartProvider>
                  <StoreHeader store={s} links={headerLinks(shell.data)} />
                  <Banners stale={store.stale || shell.stale} info={info.data} />
                  <ScrollToTop />
                  <main id="content" className="flex-1">
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/products" element={<ListingRoute kind="all" />} />
                      <Route path="/search" element={<ListingRoute kind="search" />} />
                      <Route path="/category/:slug" element={<ListingRoute kind="category" />} />
                      <Route path="/collection/:slug" element={<ListingRoute kind="collection" />} />
                      <Route path="/brand/:slug" element={<ListingRoute kind="brand" />} />
                      <Route path="/product/:slug" element={<ProductPage />} />
                      <Route path="/page/:slug" element={<StaticPage />} />
                      <Route path="/cart" element={<CartPage />} />
                      <Route path="/checkout" element={<CheckoutPage />} />
                      <Route path="/order/:token" element={<OrderPage />} />
                      <Route path="/account" element={<AccountPage />} />
                      <Route path="/account/login" element={<LoginPage />} />
                      <Route path="/account/register" element={<RegisterPage />} />
                      <Route path="/account/recover" element={<RecoverPage />} />
                      <Route path="/account/orders/:orderId" element={<MyOrderPage />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                  <StoreFooter store={s} links={shell.data.footer} />
                </CartProvider>
              </CustomerSessionProvider>
            </CurrencyProvider>
          </div>
        </ShellContext.Provider>
      </RouterNavigation>
    </StoreProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <StoreApp />
    </BrowserRouter>
  );
}
