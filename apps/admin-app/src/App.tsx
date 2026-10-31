import {
  AdminContext,
  clearCachedAdminStates,
  loadAdminState,
  menuSection,
  readCachedAdminState,
  saveCachedAdminState,
  OrderDetail,
  OrderList,
  PosScreen,
  ProductEditor,
  ProductList,
  dayChange,
  SalesTodayCard,
  SessionProvider,
  StaffLoginForm,
  useAdmin,
  useAdminHome,
  useSession,
  useStoreVersion,
  type AdminConfig,
  type AdminHome,
  type AdminState,
} from "@kshop/admin";
import {
  formatMoney,
  resolveTheme,
  ROLE_LABELS,
  type CurrencyCode,
  type ModuleCode,
  type StoreStatus,
} from "@kshop/core";
import { ApiError, type MeResponse } from "@kshop/data";
import {
  NavigationProvider,
  StoreProvider,
  useStore,
  type LinkProps,
  type PublicStore,
} from "@kshop/storefront";
import {
  Alert,
  Bell,
  Button,
  Card,
  ChevronRight,
  ClipboardList,
  cn,
  Coins,
  CreditCard,
  ExternalLink,
  Globe,
  House,
  LayoutGrid,
  Lock,
  LogOut,
  type LucideIcon,
  MessageCircle,
  Package,
  Palette,
  Plus,
  Share2,
  ShoppingBag,
  Smartphone,
  Store,
  Tag,
  Ticket,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  ConfirmProvider,
} from "@kshop/ui";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  createNativePosStorage,
  isNative,
  paintStatusBar,
  preferencesStorage,
  takePhoto,
  useBackButton,
  useHideSplash,
  useOnline,
} from "./native";
import {
  clearOfflineBoot,
  confirmOnlineStores,
  loadOfflineBoot,
  offlineAccessExpired,
  offlineBoot,
  readOfflineStore,
  saveOfflineStore,
} from "./offline";

// Kshop Admin (PRP-7 D2): the essentials of the store admin on the phone — today's sales, orders and products —
// with the same screens as the web (@kshop/admin) and «Abrir el panel completo» for everything else.

const sessionConfig: AdminConfig = {
  supabase: { url: appConfig.supabaseUrl, key: appConfig.supabaseKey },
  apiBaseUrl: appConfig.apiBaseUrl,
  platformDomain: appConfig.platformDomain,
  protocol: appConfig.protocol,
  authStorage: isNative ? preferencesStorage : undefined,
  takePhoto: isNative ? takePhoto : undefined,
  posStorage: isNative ? createNativePosStorage() : undefined,
};

/** The server did not answer this boot: the app runs on what the phone saved (PRP pos-offline, phase 3). */
const BootedOffline = createContext(false);
const RETRY_ONLINE_MS = 30_000;

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

const useRouterPathname = () => useLocation().pathname;

function RouterNavigation({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const value = useMemo(
    () => ({
      Link,
      usePathname: useRouterPathname,
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
    clearCachedAdminStates();
    clearOfflineBoot();
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
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState(readSelectedStore);
  const userId = session?.user.id;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const openSaved = () => {
      const saved = offlineBoot();
      if (!saved || (userId && saved.userId !== userId)) return setFailed(true);
      setStores(saved.stores);
      setOffline(true);
      setFailed(false);
      // Without a session there is nothing to ask with: it comes back through the session itself.
      if (userId) timer = setTimeout(ask, RETRY_ONLINE_MS);
    };
    const ask = () => {
      api.me().then(
        (me) => {
          if (cancelled) return;
          confirmOnlineStores(me.user?.id ?? userId ?? "", session?.user.email ?? null, me.stores);
          setStores(me.stores);
          setOffline(false);
          setFailed(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          // A refusal is an answer: only silence or a broken server mean «no connection».
          if (error instanceof ApiError && error.status < 500) setFailed(true);
          else openSaved();
        },
      );
    };
    if (userId) ask();
    else void Promise.resolve().then(openSaved);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, userId, session?.user.email]);

  if (offline && offlineAccessExpired()) {
    return (
      <Notice>
        <Brand />
        <Alert variant="destructive" data-testid="offline-expired">
          Hace más de 7 días que este teléfono no se conecta. Conéctalo a internet para seguir usando la app.
          Las ventas guardadas siguen en el teléfono.
        </Alert>
        <Button onClick={() => window.location.reload()}>Reintentar</Button>
      </Notice>
    );
  }
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
    <BootedOffline.Provider value={offline}>
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
    </BootedOffline.Provider>
  );
}

/**
 * The store for the shared screens. The public card (theme, custom domain) when the store is live; a suspended
 * store is not public, so its admin falls back to what the staff can read.
 */
async function loadStore(
  myStore: MyStore,
  status: Promise<string>,
  reads: ReturnType<typeof useSession>["reads"],
): Promise<PublicStore> {
  try {
    const res = await fetch(`${appConfig.apiBaseUrl}/api/v1/stores/${myStore.id}/storefront?view=store`);
    if (res.ok) return (await res.json()) as PublicStore;
  } catch {
    // Read below.
  }
  const settings = await reads.checkoutSettings(myStore.id);
  const row = settings.storesCollection?.edges[0]?.node;
  if (!row) throw new Error("store not readable");
  return {
    id: myStore.id,
    slug: myStore.slug,
    name: myStore.name,
    status: (await status) as StoreStatus,
    baseCurrency: row.baseCurrency as CurrencyCode,
    whatsappPhone: row.whatsappPhone ?? null,
    logoUrl: null,
    description: null,
    theme: resolveTheme(null),
    customDomain: null,
  };
}

// The store card of the last boot, next to the cached admin state (same prefix: sign out clears both; R11).
const storeCacheKey = (storeId: string) => `kshop.admin.store.${storeId}`;
function readCachedStore(storeId: string): PublicStore | null {
  try {
    const raw = window.localStorage.getItem(storeCacheKey(storeId));
    return raw ? (JSON.parse(raw) as PublicStore) : null;
  } catch {
    return null;
  }
}
function saveCachedStore(store: PublicStore) {
  try {
    window.localStorage.setItem(storeCacheKey(store.id), JSON.stringify(store));
  } catch {
    // The app boots from the network as before.
  }
}

type Loaded =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; admin: AdminState; store: PublicStore };

function StoreAdmin({ myStore, onSwitch }: { myStore: MyStore; onSwitch?: () => void }) {
  const { api, reads, session } = useSession();
  const signOut = useSignOut();
  const offline = useContext(BootedOffline);
  const [loaded, setState] = useState<Loaded>({ kind: "loading" });
  const userId = session?.user.id ?? offlineBoot()?.userId;
  // R12: boot again when the superadmin changes the visibility of a section.
  const sectionsLive = useStoreVersion(myStore.id, ["store_section_settings"]);
  // The last boot draws the admin at once while the network catches up; a failed refresh keeps it (R11).
  const cached = useMemo(() => {
    const admin = userId ? readCachedAdminState(userId, myStore.id) : null;
    const store = admin ? readCachedStore(myStore.id) : null;
    // The browser's copy ages out and can be cleared; the one in native storage is what opens the app offline.
    return admin && store ? { admin, store } : readOfflineStore(myStore.id);
  }, [userId, myStore.id]);
  const known: Loaded = offline && loaded.kind === "loading" ? { kind: "error" } : loaded;
  const state: Loaded =
    cached && (known.kind === "loading" || known.kind === "error") ? { kind: "ready", ...cached } : known;

  useEffect(() => {
    // Asking without a connection would read as «no access» and clear what the phone has saved.
    if (offline) return;
    let cancelled = false;
    (async () => {
      try {
        // The store card is read at the same time as the admin state (R11: one after the other before).
        const adminState = loadAdminState(api, myStore.id);
        const storeCard = loadStore(
          myStore,
          adminState.then((a) => a?.storeStatus ?? "active"),
          reads,
        );
        storeCard.catch(() => {}); // awaited below only when the admin state allows it
        const admin = await adminState;
        if (userId) saveCachedAdminState(userId, myStore.id, admin);
        if (!admin) {
          if (!cancelled) setState({ kind: "forbidden" });
          return;
        }
        const store = await storeCard;
        saveCachedStore(store);
        saveOfflineStore(myStore.id, admin, store);
        if (!cancelled) setState({ kind: "ready", admin, store });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, reads, myStore, userId, sectionsLive, offline]);

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

type Tab = { href: string; label: string; icon: LucideIcon; show: boolean; badge?: number };

/** Kshop Admin (redesign R6, D9): bottom tabs in the brand colors — Inicio · Caja · Pedidos · Productos · Más (Roberto, P7). */
function Shell({ onSwitch }: { onSwitch?: () => void }) {
  useHideSplash();
  const store = useStore();
  const admin = useAdmin();
  const { pathname } = useLocation();
  const has = (code: Parameters<typeof admin.enabledModules.has>[0]) => admin.enabledModules.has(code);
  const home = useAdminHome({ salesToday: has("sales_today"), recent: 0 });
  const toConfirm = home.summary?.todo.toConfirm ?? 0;
  const networkUp = useOnline();
  const offline = useContext(BootedOffline) || !networkUp;
  const pos = has("pos") && menuSection(admin, "pos").visibility !== "hidden";
  const tabs: Tab[] = [
    { href: "/admin", label: "Inicio", icon: House, show: true },
    { href: "/admin/pos", label: "Caja", icon: Store, show: pos },
    { href: "/admin/orders", label: "Pedidos", icon: ShoppingBag, show: has("orders"), badge: toConfirm },
    { href: "/admin/catalog", label: "Productos", icon: Package, show: has("catalog") },
    {
      href: "/admin/sales",
      label: "Ventas",
      icon: TrendingUp,
      // Five tabs fit: with the counter, Ventas opens from Más.
      show: !pos && has("sales_today") && menuSection(admin, "sales_today").visibility !== "hidden",
    },
    { href: "/admin/more", label: "Más", icon: LayoutGrid, show: true },
  ].filter((t) => t.show);
  const active = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="app-root flex min-h-dvh flex-col bg-surface">
      {store.status !== "active" && (
        <Alert variant="destructive" className="rounded-none">
          La tienda está suspendida: los clientes no pueden comprar.
        </Alert>
      )}
      <ScrollToTop />
      <main className="min-w-0 flex-1 pb-28">
        <Routes>
          <Route path="/admin" element={<HomeScreen home={home} />} />
          {has("orders") && (
            <>
              <Route
                path="/admin/orders"
                element={
                  <Screen title="Pedidos">
                    <OrderList />
                    <a
                      href={webAdminUrl(store.slug, "/admin/orders/new")}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Nuevo pedido (en el panel)"
                      className="fixed right-[18px] bottom-[92px] z-20 flex size-[58px] items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-lg"
                    >
                      <Plus size={24} aria-hidden />
                    </a>
                  </Screen>
                }
              />
              <Route
                path="/admin/orders/:orderId"
                element={
                  <Screen>
                    <OrderRoute />
                  </Screen>
                }
              />
            </>
          )}
          {has("catalog") && (
            <>
              <Route
                path="/admin/catalog"
                element={
                  <Screen title="Productos">
                    <ProductList />
                  </Screen>
                }
              />
              <Route
                path="/admin/catalog/products/new"
                element={
                  <Screen>
                    <ProductEditor />
                  </Screen>
                }
              />
              <Route
                path="/admin/catalog/products/:productId"
                element={
                  <Screen>
                    <ProductRoute />
                  </Screen>
                }
              />
            </>
          )}
          {has("sales_today") && <Route path="/admin/sales" element={<SalesScreen home={home} />} />}
          {pos && (
            <Route
              path="/admin/pos"
              element={
                <Screen>
                  <PosScreen storeId={store.id} online={!offline} />
                </Screen>
              }
            />
          )}
          <Route path="/admin/more" element={<MoreScreen onSwitch={onSwitch} />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route
            path="*"
            element={
              <Screen>
                <WebOnly />
              </Screen>
            }
          />
        </Routes>
      </main>
      <nav
        aria-label="Secciones"
        className="app-tabs fixed inset-x-0 bottom-0 z-10 flex gap-1 border-t bg-background px-2 pt-1.5"
      >
        {tabs.map((t) => {
          const on = active(t.href);
          return (
            <RouterLink
              key={t.href}
              to={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-1 text-[11px]",
                on ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-14 items-center justify-center rounded-full",
                  on && "bg-accent-soft",
                )}
              >
                <t.icon size={20} aria-hidden />
                {!!t.badge && (
                  <span className="absolute -top-1 right-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-bold text-white">
                    {t.badge}
                  </span>
                )}
              </span>
              {t.label}
            </RouterLink>
          );
        })}
      </nav>
    </div>
  );
}

/** White header with the screen title, over the content of the list screens. */
function Screen({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {title && (
        <header className="bg-background px-4 pt-5 pb-3">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
        </header>
      )}
      <div className="px-4 pt-4">{children}</div>
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

function HomeScreen({ home }: { home: AdminHome }) {
  const store = useStore();
  const admin = useAdmin();
  const [now] = useState(() => new Date());
  const { summary, today } = home;
  const base = store.baseCurrency as CurrencyCode;
  const day = summary?.week?.[summary.week.length - 1];
  const change = dayChange(summary?.week ?? null, (d) => d.amount);
  const sales = admin.enabledModules.has("sales_today");

  const share = async () => {
    const url = store.customDomain ? `https://${store.customDomain}` : webAdminUrl(store.slug, "/");
    if (navigator.share) await navigator.share({ title: store.name, url }).catch(() => {});
    else await navigator.clipboard?.writeText(url);
  };

  return (
    <div className="flex flex-col">
      <header className="bg-night px-[18px] pt-[18px] pb-16 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold" data-testid="admin-store-name">
              {store.name}
            </p>
            <p className="text-xs text-[#C8C0DA] first-letter:uppercase">
              {now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <RouterLink
            to="/admin/orders"
            aria-label="Pedidos por confirmar"
            className="relative flex size-11 items-center justify-center rounded-xl bg-white/8"
          >
            <Bell size={20} aria-hidden />
            {!!summary?.todo.toConfirm && (
              <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-destructive ring-2 ring-night" />
            )}
          </RouterLink>
        </div>
        {sales && (
          <div className="mt-5 flex flex-col gap-1">
            <span className="text-sm text-[#C8C0DA]">Vendido hoy</span>
            <span className="font-display text-[34px] leading-none font-extrabold">
              {day ? formatMoney(day.amount, base) : "…"}
            </span>
            {change != null && (
              <span className="text-[13px] font-semibold text-[#6FD39C]">
                {change >= 0 ? "+" : ""}
                {change}% vs ayer · {day?.orders ?? 0} pedidos
              </span>
            )}
          </div>
        )}
      </header>
      <div className="-mt-12 flex flex-col gap-5 px-4">
        {sales && (
          <div className="grid grid-cols-2 gap-3" data-testid="sales-today">
            <MiniCard
              label="Cobrado"
              value={
                !today
                  ? "…"
                  : today.received.length
                    ? today.received.map((r) => formatMoney(r.amount, r.currency as CurrencyCode)).join(" · ")
                    : formatMoney(0, base)
              }
            />
            <MiniCard
              label="Por cobrar"
              value={summary?.toCollect != null ? formatMoney(summary.toCollect, base) : "…"}
              tone="text-warning"
            />
          </div>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold">Por hacer</h2>
          {!summary ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <TodoRow
                to="/admin/orders"
                icon={ClipboardList}
                tone="bg-warning-soft text-warning"
                count={summary.todo.toConfirm}
                label={["pedido por confirmar", "pedidos por confirmar"]}
              />
              <TodoRow
                to="/admin/orders"
                icon={Truck}
                tone="bg-accent-soft text-primary"
                count={summary.todo.toDeliver}
                label={["pedido por entregar", "pedidos por entregar"]}
              />
              <TodoRow
                to="/admin/catalog"
                icon={Package}
                tone="bg-destructive-soft text-destructive"
                count={summary.todo.lowStock}
                label={["producto con poco stock", "productos con poco stock"]}
              />
              {summary.todo.toConfirm + summary.todo.toDeliver + summary.todo.lowStock === 0 && (
                <p className="text-sm text-muted-foreground">Todo al día.</p>
              )}
            </>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold">Accesos rápidos</h2>
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
            <QuickLink
              href={webAdminUrl(store.slug, "/admin/orders/new")}
              icon={ShoppingBag}
              label="Pedido"
              external
            />
            <QuickLink href="/admin/catalog/products/new" icon={Package} label="Producto" />
            <QuickLink
              href={webAdminUrl(store.slug, "/admin/discounts/vouchers")}
              icon={Ticket}
              label="Cupón"
              external
            />
            <button
              type="button"
              onClick={share}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border bg-background py-3"
            >
              <Share2 size={20} aria-hidden className="text-primary" />
              Compartir tienda
            </button>
          </div>
        </section>
        <p className="text-sm text-muted-foreground">
          Clientes, descuentos, envíos, apariencia y el resto: <PanelLink>Abrir el panel completo</PanelLink>
        </p>
      </div>
    </div>
  );
}

function MiniCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-background p-4 shadow-lg">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-display text-lg leading-tight font-extrabold", tone)}>{value}</span>
    </div>
  );
}

function TodoRow({
  to,
  icon: Icon,
  tone,
  count,
  label,
}: {
  to: string;
  icon: LucideIcon;
  tone: string;
  count: number;
  label: [string, string];
}) {
  if (!count) return null;
  return (
    <RouterLink to={to} className={cn("flex h-14 items-center gap-3 rounded-xl px-3", tone)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-background">
        <Icon size={18} aria-hidden />
      </span>
      <span className="flex-1 text-sm font-semibold">
        {count} {count === 1 ? label[0] : label[1]}
      </span>
      <ChevronRight size={16} aria-hidden />
    </RouterLink>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  external = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  external?: boolean;
}) {
  const className = "flex flex-col items-center gap-1.5 rounded-[14px] border bg-background py-3";
  const content = (
    <>
      <Icon size={20} aria-hidden className="text-primary" />
      {label}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  ) : (
    <RouterLink to={href} className={className}>
      {content}
    </RouterLink>
  );
}

/** Ventas: today and the week (Finanzas, Ofertas, Cupones and Monedas open in the panel). */
function SalesScreen({ home }: { home: AdminHome }) {
  const store = useStore();
  const base = store.baseCurrency as CurrencyCode;
  const week = home.summary?.week ?? null;
  const max = Math.max(...(week ?? []).map((d) => d.amount), 1);
  return (
    <Screen title="Ventas">
      <div className="flex flex-col gap-4">
        <SalesTodayCard />
        {week && (
          <Card className="flex flex-col gap-3 rounded-[14px]">
            <h2 className="font-display font-bold">Últimos 7 días</h2>
            <ol className="flex h-36 items-end gap-2" aria-label="Ventas de los últimos 7 días">
              {week.map((d, i) => (
                <li key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span
                    className={cn(
                      "w-full rounded-[6px_6px_3px_3px]",
                      i === week.length - 1 ? "bg-primary" : "bg-accent-soft",
                    )}
                    style={{ height: `${Math.max(4, (d.amount / max) * 110)}px` }}
                    title={formatMoney(d.amount, base)}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {i === week.length - 1
                      ? "Hoy"
                      : new Date(d.day).toLocaleDateString("es", { weekday: "short" }).replace(".", "")}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
        <MoreList
          items={[
            { code: "finance", label: "Finanzas", icon: Wallet, path: "/admin/finance" },
            { code: "discounts", label: "Ofertas", icon: Tag, path: "/admin/discounts" },
            { code: "vouchers", label: "Cupones", icon: Ticket, path: "/admin/discounts/vouchers" },
            { code: "multi_currency", label: "Monedas", icon: Coins, path: "/admin/multi-currency" },
          ]}
        />
      </div>
    </Screen>
  );
}

type MoreItem = { code: ModuleCode | null; label: string; icon: LucideIcon; path: string };

/** Modules of the web panel with their icon; locked ones show PRO. They open in the browser. */
function MoreList({ items }: { items: MoreItem[] }) {
  const store = useStore();
  const admin = useAdmin();
  return (
    <ul className="divide-y overflow-hidden rounded-[14px] border bg-background">
      {items.map((item) => {
        // R12: hidden sections disappear (also as PRO); managed ones open read-only, marked «Admin».
        const section = item.code === null ? null : menuSection(admin, item.code);
        if (section?.visibility === "hidden") return null;
        const managed = section?.visibility === "managed" || section?.setting === "managed";
        const locked =
          item.code !== null &&
          !admin.enabledModules.has(item.code) &&
          !(item.code === "themes" && section?.visibility === "managed");
        return (
          <li key={item.path}>
            <a
              href={webAdminUrl(store.slug, locked ? "/admin/billing" : item.path)}
              target="_blank"
              rel="noreferrer"
              className="flex h-14 items-center gap-3 px-4"
            >
              <item.icon
                size={19}
                aria-hidden
                className={locked ? "text-muted-foreground" : "text-primary"}
              />
              <span className={cn("flex-1 text-sm font-medium", locked && "text-muted-foreground")}>
                {item.label}
              </span>
              {managed && !locked && (
                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  Admin
                </span>
              )}
              {section?.setting === "hidden" && (
                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  Oculta
                </span>
              )}
              {locked ? (
                <span className="flex items-center gap-1 rounded-md bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold text-[#8A5A00]">
                  <Lock size={10} aria-hidden />
                  PRO
                </span>
              ) : (
                <ExternalLink size={15} aria-hidden className="text-muted-foreground" />
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function MoreScreen({ onSwitch }: { onSwitch?: () => void }) {
  const admin = useAdmin();
  const { session } = useSession();
  const signOut = useSignOut();
  const manager = admin.role === "owner" || admin.role === "admin" || admin.isSuperadmin;
  return (
    <Screen title="Más">
      <div className="flex flex-col gap-4">
        {admin.enabledModules.has("sales_today") && (
          <RouterLink
            to="/admin/sales"
            className="rounded-xl border bg-background p-4 font-medium"
            data-testid="more-sales"
          >
            Ventas de hoy y de la semana
          </RouterLink>
        )}
        <MoreList
          items={[
            { code: "themes", label: "Apariencia", icon: Palette, path: "/admin/themes" },
            {
              code: "whatsapp_notifications",
              label: "Avisos WhatsApp",
              icon: MessageCircle,
              path: "/admin/whatsapp-notifications",
            },
            { code: "mobile_app", label: "App móvil", icon: Smartphone, path: "/admin/mobile-app" },
            { code: "custom_domain", label: "Dominio propio", icon: Globe, path: "/admin/custom-domain" },
            { code: "shipping", label: "Entregas", icon: Truck, path: "/admin/shipping" },
            { code: "orders", label: "Clientes", icon: UserRound, path: "/admin/orders/customers" },
            ...(manager
              ? [
                  { code: null, label: "Equipo", icon: Users, path: "/admin/team" },
                  { code: null, label: "Plan y facturación", icon: CreditCard, path: "/admin/billing" },
                ]
              : []),
          ]}
        />
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>Sesión: {session?.user.email}</span>
          <span>
            {appConfig.name} {appConfig.versionName}
          </span>
        </div>
        <div className="flex gap-2">
          {onSwitch && (
            <Button variant="outline" onClick={onSwitch} data-testid="switch-store">
              Cambiar de tienda
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} data-testid="sign-out">
            <LogOut size={16} aria-hidden />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </Screen>
  );
}

function AdminApp() {
  useBackButton();
  const { session, ready, authUnreachable } = useSession();
  const [bootRead, setBootRead] = useState(false);
  useEffect(() => {
    void paintStatusBar();
    void loadOfflineBoot().then(() => setBootRead(true));
  }, []);
  if (!ready || !bootRead) return <Loading />;
  // No connection to renew an expired session is not a sign out: the counter must keep selling.
  if (!session && authUnreachable && offlineBoot()) return <StoreGate key={offlineBoot()?.userId} />;
  if (!session) return <LoginScreen />;
  return <StoreGate key={session.user.id} />;
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider config={sessionConfig}>
        <RouterNavigation>
          <ConfirmProvider>
            <AdminApp />
          </ConfirmProvider>
        </RouterNavigation>
      </SessionProvider>
    </BrowserRouter>
  );
}
