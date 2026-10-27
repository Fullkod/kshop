import {
  AdminContext,
  loadAdminState,
  OrderDetail,
  OrderList,
  ProductEditor,
  ProductList,
  SalesTodayCard,
  SessionProvider,
  StaffLoginForm,
  useAdmin,
  useSession,
  type AdminConfig,
  type AdminState,
} from "@kshop/admin";
import { resolveTheme, ROLE_LABELS, type CurrencyCode, type StoreStatus } from "@kshop/core";
import { CheckoutSettingsQuery, type MeResponse } from "@kshop/data";
import {
  NavigationProvider,
  StoreProvider,
  useStore,
  type LinkProps,
  type PublicStore,
} from "@kshop/storefront";
import { Alert, Button, Card, cn } from "@kshop/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Link as RouterLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { appConfig, webAdminUrl } from "./config";
import {
  isNative,
  paintStatusBar,
  preferencesStorage,
  takePhoto,
  useBackButton,
  useHideSplash,
} from "./native";

// Kshop Admin (PRP-7 D2): the essentials of the store admin on the phone — today's sales, orders and products —
// with the same screens as the web (@kshop/admin) and «Abrir el panel completo» for everything else.

const sessionConfig: AdminConfig = {
  supabase: { url: appConfig.supabaseUrl, key: appConfig.supabaseKey },
  apiBaseUrl: appConfig.apiBaseUrl,
  platformDomain: appConfig.platformDomain,
  protocol: appConfig.protocol,
  authStorage: isNative ? preferencesStorage : undefined,
  takePhoto: isNative ? takePhoto : undefined,
};

/** Orders are refreshed every minute while the list is open (D9: no push notifications in v1). */
const ORDERS_REFRESH_MS = 60_000;
const SELECTED_STORE_KEY = "kshop-admin-store";

function readSelectedStore(): string | null {
  try {
    return localStorage.getItem(SELECTED_STORE_KEY);
  } catch {
    return null;
  }
}

function saveSelectedStore(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_STORE_KEY, id);
    else localStorage.removeItem(SELECTED_STORE_KEY);
  } catch {
    // Without storage the picker shows again on the next start.
  }
}

const EXTERNAL = /^(https?:|mailto:|tel:)/;

/** react-router behind the shared screens' Link; external links (WhatsApp, the web panel) leave the app. */
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">{children}</main>
  );
}

const Loading = () => (
  <Notice>
    <p className="text-center text-muted-foreground">Cargando…</p>
  </Notice>
);

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/icon.svg" alt="" width={40} height={40} />
      <span className="font-display text-2xl font-semibold">Kshop Admin</span>
    </div>
  );
}

function LoginScreen() {
  useHideSplash();
  const navigate = useNavigate();
  return (
    <Notice>
      <Brand />
      <p className="text-muted-foreground">Entra con el email y la contraseña de tu tienda.</p>
      <StaffLoginForm onSignedIn={() => void navigate("/admin", { replace: true })} />
    </Notice>
  );
}

function useSignOut() {
  const { supabase } = useSession();
  return async () => {
    saveSelectedStore(null);
    await supabase.auth.signOut();
  };
}

type MyStore = MeResponse["stores"][number];

function StorePicker({ stores, onPick }: { stores: MyStore[]; onPick: (id: string) => void }) {
  useHideSplash();
  const signOut = useSignOut();
  return (
    <Notice>
      <Brand />
      <h1 className="text-xl font-semibold">Elige la tienda</h1>
      <ul className="flex flex-col gap-2" data-testid="store-picker">
        {stores.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className="flex w-full items-center justify-between rounded-lg border bg-background px-4 py-3 text-left hover:bg-surface"
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-sm text-muted-foreground">{ROLE_LABELS[s.role]}</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="self-start" onClick={signOut}>
        Cerrar sesión
      </Button>
    </Notice>
  );
}

/** The signed-in staff member's stores; one store opens directly, several ask which one. */
function StoreGate() {
  const { api, session } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [stores, setStores] = useState<MyStore[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(readSelectedStore);

  useEffect(() => {
    let cancelled = false;
    api.me().then(
      (me) => !cancelled && setStores(me.stores),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (failed) {
    return (
      <Notice>
        <Alert variant="destructive">No se pudo conectar. Revisa la conexión e inténtalo de nuevo.</Alert>
        <Button onClick={() => window.location.reload()}>Reintentar</Button>
      </Notice>
    );
  }
  if (!stores) return <Loading />;
  if (!stores.length) {
    return (
      <Notice>
        <Brand />
        <Alert variant="destructive" data-testid="no-stores">
          La cuenta {session?.user.email} no administra ninguna tienda.
        </Alert>
        <Button variant="outline" className="self-start" onClick={signOut}>
          Cerrar sesión
        </Button>
      </Notice>
    );
  }
  const current = stores.find((s) => s.id === selected) ?? (stores.length === 1 ? stores[0] : undefined);
  if (!current) {
    return (
      <StorePicker
        stores={stores}
        onPick={(id) => {
          saveSelectedStore(id);
          setSelected(id);
          void navigate("/admin", { replace: true });
        }}
      />
    );
  }
  return (
    <StoreAdmin
      key={current.id}
      myStore={current}
      onSwitch={
        stores.length > 1
          ? () => {
              saveSelectedStore(null);
              setSelected(null);
            }
          : undefined
      }
    />
  );
}

/**
 * The store for the shared screens. The public card (theme, custom domain) when the store is live; a suspended
 * store is not public, so its admin falls back to what the staff can read.
 */
async function loadStore(
  myStore: MyStore,
  status: string,
  graphql: ReturnType<typeof useSession>["graphql"],
): Promise<PublicStore> {
  try {
    const res = await fetch(`${appConfig.apiBaseUrl}/api/v1/stores/${myStore.id}/storefront?view=store`);
    if (res.ok) return (await res.json()) as PublicStore;
  } catch {
    // Read below.
  }
  const result = await graphql.query(CheckoutSettingsQuery, { storeId: myStore.id }).toPromise();
  const row = result.data?.storesCollection?.edges[0]?.node;
  if (!row) throw new Error("store not readable");
  return {
    id: myStore.id,
    slug: myStore.slug,
    name: myStore.name,
    status: status as StoreStatus,
    baseCurrency: row.baseCurrency as CurrencyCode,
    whatsappPhone: row.whatsappPhone ?? null,
    logoUrl: null,
    theme: resolveTheme(null),
    customDomain: null,
  };
}

type Loaded =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; admin: AdminState; store: PublicStore };

function StoreAdmin({ myStore, onSwitch }: { myStore: MyStore; onSwitch?: () => void }) {
  const { api, graphql } = useSession();
  const signOut = useSignOut();
  const [state, setState] = useState<Loaded>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const admin = await loadAdminState(api, graphql, myStore.id);
        if (!admin) {
          if (!cancelled) setState({ kind: "forbidden" });
          return;
        }
        const store = await loadStore(myStore, admin.storeStatus, graphql);
        if (!cancelled) setState({ kind: "ready", admin, store });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, graphql, myStore]);

  if (state.kind === "loading") return <Loading />;
  if (state.kind !== "ready") {
    return (
      <Notice>
        <h1 className="text-2xl font-semibold">{myStore.name}</h1>
        <Alert variant="destructive" data-testid="admin-forbidden">
          {state.kind === "forbidden"
            ? "No tienes acceso a la administración de esta tienda."
            : "No se pudo cargar la tienda. Revisa la conexión e inténtalo de nuevo."}
        </Alert>
        <div className="flex gap-2">
          {state.kind === "error" && <Button onClick={() => window.location.reload()}>Reintentar</Button>}
          {onSwitch && (
            <Button variant="outline" onClick={onSwitch}>
              Cambiar de tienda
            </Button>
          )}
          <Button variant="ghost" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </Notice>
    );
  }

  const config = {
    supabase: sessionConfig.supabase,
    apiBaseUrl: appConfig.apiBaseUrl,
    channel: "app" as const,
  };
  return (
    <StoreProvider store={state.store} config={config}>
      <AdminContext.Provider value={state.admin}>
        <Shell onSwitch={onSwitch} />
      </AdminContext.Provider>
    </StoreProvider>
  );
}

function Shell({ onSwitch }: { onSwitch?: () => void }) {
  useHideSplash();
  const store = useStore();
  const admin = useAdmin();
  const { pathname } = useLocation();
  const has = (code: Parameters<typeof admin.enabledModules.has>[0]) => admin.enabledModules.has(code);
  const tabs = [
    { href: "/admin", label: "Inicio", show: true },
    { href: "/admin/orders", label: "Pedidos", show: has("orders") },
    { href: "/admin/catalog", label: "Productos", show: has("catalog") },
  ].filter((t) => t.show);
  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="app-root flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 bg-[#24104F] px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold" data-testid="admin-store-name">
            {store.name}
          </div>
          <div className="text-xs opacity-80">{admin.role ? ROLE_LABELS[admin.role] : "Superadmin"}</div>
        </div>
        {onSwitch && (
          <button type="button" onClick={onSwitch} className="text-sm underline" data-testid="switch-store">
            Cambiar
          </button>
        )}
      </header>
      {store.status !== "active" && (
        <Alert variant="destructive" className="rounded-none">
          La tienda está suspendida: los clientes no pueden comprar.
        </Alert>
      )}
      <ScrollToTop />
      <main className="min-w-0 flex-1 px-4 pt-5 pb-24">
        <Routes>
          <Route path="/admin" element={<HomeScreen onSwitch={onSwitch} />} />
          {has("orders") && (
            <>
              <Route path="/admin/orders" element={<OrderList refreshEvery={ORDERS_REFRESH_MS} />} />
              <Route path="/admin/orders/:orderId" element={<OrderRoute />} />
            </>
          )}
          {has("catalog") && (
            <>
              <Route path="/admin/catalog" element={<ProductList />} />
              <Route path="/admin/catalog/products/new" element={<ProductEditor />} />
              <Route path="/admin/catalog/products/:productId" element={<ProductRoute />} />
            </>
          )}
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<WebOnly />} />
        </Routes>
      </main>
      <nav
        aria-label="Secciones"
        className="app-tabs fixed inset-x-0 bottom-0 z-10 flex border-t bg-background"
      >
        {tabs.map((t) => (
          <RouterLink
            key={t.href}
            to={t.href}
            className={cn(
              "flex-1 py-3 text-center text-sm",
              active(t.href) ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {t.label}
          </RouterLink>
        ))}
        <a
          href={webAdminUrl(store.slug)}
          target="_blank"
          rel="noreferrer"
          className="flex-1 py-3 text-center text-sm text-muted-foreground"
          data-testid="tab-panel"
        >
          Panel
        </a>
      </nav>
    </div>
  );
}

function OrderRoute() {
  const { orderId = "" } = useParams();
  return <OrderDetail key={orderId} orderId={orderId} />;
}

function ProductRoute() {
  const { productId = "" } = useParams();
  return <ProductEditor key={productId} productId={productId} />;
}

function PanelLink({ path = "/admin", children }: { path?: string; children: ReactNode }) {
  const store = useStore();
  return (
    <a
      href={webAdminUrl(store.slug, path)}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline"
      data-testid="open-panel"
    >
      {children}
    </a>
  );
}

/** A screen the app does not have (customers, settings, a module…): it lives in the web panel. */
function WebOnly() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h1 className="text-xl font-semibold">Esto está en el panel completo</h1>
      <p className="text-muted-foreground">
        La app tiene lo del día a día: ventas de hoy, pedidos y productos.
      </p>
      <PanelLink path={pathname.startsWith("/admin") ? pathname : "/admin"}>
        Abrir el panel completo
      </PanelLink>
    </div>
  );
}

function HomeScreen({ onSwitch }: { onSwitch?: () => void }) {
  const store = useStore();
  const admin = useAdmin();
  const { session } = useSession();
  const signOut = useSignOut();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Hola, {store.name}</h1>
      {admin.enabledModules.has("sales_today") && <SalesTodayCard />}
      <div className="grid grid-cols-2 gap-3">
        {admin.enabledModules.has("orders") && (
          <RouterLink to="/admin/orders" className="rounded-lg border bg-background p-4 font-medium">
            Pedidos
            <span className="block text-sm font-normal text-muted-foreground">Estados, pagos y avisos</span>
          </RouterLink>
        )}
        {admin.enabledModules.has("catalog") && (
          <RouterLink to="/admin/catalog" className="rounded-lg border bg-background p-4 font-medium">
            Productos
            <span className="block text-sm font-normal text-muted-foreground">Stock, precio y fotos</span>
          </RouterLink>
        )}
      </div>
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Clientes, descuentos, envíos, apariencia, equipo y el resto de la tienda:
        </p>
        <PanelLink>Abrir el panel completo</PanelLink>
      </Card>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>Sesión: {session?.user.email}</span>
        <span>
          {appConfig.name} {appConfig.versionName}
        </span>
      </div>
      <div className="flex gap-2">
        {onSwitch && (
          <Button variant="outline" onClick={onSwitch}>
            Cambiar de tienda
          </Button>
        )}
        <Button variant="ghost" onClick={signOut} data-testid="sign-out">
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}

function AdminApp() {
  useBackButton();
  const { session, ready } = useSession();
  useEffect(() => {
    void paintStatusBar();
  }, []);
  if (!ready) return <Loading />;
  if (!session) return <LoginScreen />;
  return <StoreGate key={session.user.id} />;
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider config={sessionConfig}>
        <RouterNavigation>
          <AdminApp />
        </RouterNavigation>
      </SessionProvider>
    </BrowserRouter>
  );
}
