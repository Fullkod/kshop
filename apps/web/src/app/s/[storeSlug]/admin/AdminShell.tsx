"use client";

import { formatUsd, MANAGED_SECTION_MESSAGE, ROLE_LABELS, storeOrigin } from "@kshop/core";
import {
  Alert,
  Bell,
  Button,
  buttonVariants,
  ChevronsUpDown,
  cn,
  ExternalLink,
  House,
  Lock,
  LogOut,
  type LucideIcon,
  Menu,
  Plus,
  UserRound,
  X,
  CreditCard,
  Users,
  ConfirmProvider,
  useConfirm,
} from "@kshop/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ADMIN_CONTENT_CLASS, SIDEBAR_NAV_CLASS } from "@/components/admin-content";
import { platformProtocol, publicEnv } from "@/env";
import { ADMIN_MODULES } from "@/features/registry";
import { FullkodCredit } from "@/components/FullkodCredit";
import { ADMIN_GROUPS, type AdminGroup } from "@/features/types";
import { useStorePathname } from "@/lib/navigation";
import { useSession } from "@/lib/session";
import { ORDER_TABLES, usePosStorage, useStoreVersion } from "@kshop/admin";
import { useStore } from "@kshop/storefront";
import {
  AdminContext,
  clearCachedAdminStates,
  loadAdminState,
  menuSection,
  readCachedAdminState,
  saveCachedAdminState,
  type AdminState,
} from "./admin-context";
import { AccountBanner } from "./AccountBanner";
import { AdminSearch } from "./AdminSearch";

// Pages that work without a store session.
const PUBLIC_PATHS = ["/admin/login", "/admin/set-password", "/admin/forgot-password"];

type LoadState =
  { kind: "loading" } | { kind: "forbidden" } | { kind: "error" } | { kind: "ready"; admin: AdminState };

type NavItem = {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  testId: string;
  /** Locked module: links to the plan, with its price in the title. */
  locked?: string;
  count?: number;
  /** R12: «Admin» for a managed section; the superadmin also sees «Oculta» on the hidden ones. */
  badge?: string;
};

// R12: the admin boots again when the superadmin changes the visibility of a section.
const SECTION_TABLES = ["store_section_settings"] as const;

/** Contextual main button of the topbar. */
function primaryAction(pathname: string): { href: string; label: string } | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/orders"))
    return { href: "/admin/orders/new", label: "Nuevo pedido" };
  if (pathname.startsWith("/admin/catalog"))
    return { href: "/admin/catalog/products/new", label: "Nuevo producto" };
  return null;
}

/**
 * Store admin (redesign R6, always the Kshop brand): night sidebar with the modules by group (locked ones with PRO),
 * store switcher and user card; a topbar with «Ver tienda», the bell (orders to confirm) and the main action.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const { session, ready, api, supabase } = useSession();
  const pathname = useStorePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [loaded, setState] = useState<LoadState>({ kind: "loading" });
  const [liveToConfirm, setLiveToConfirm] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const live = useStoreVersion(isPublic ? null : store.id, ORDER_TABLES);
  const sectionsLive = useStoreVersion(isPublic ? null : store.id, SECTION_TABLES);
  const userId = session?.user.id;
  // The last boot draws the admin at once while /me runs (R11); /me then replaces it. A failed /me keeps it on screen
  // (each page shows its own read errors).
  const cached = useMemo(
    () => (userId && !isPublic ? readCachedAdminState(userId, store.id) : null),
    [userId, isPublic, store.id],
  );
  const state: LoadState =
    cached && (loaded.kind === "loading" || loaded.kind === "error")
      ? { kind: "ready", admin: cached }
      : loaded;

  useEffect(() => {
    if (ready && !session && !isPublic) router.replace("/admin/login");
  }, [ready, session, isPublic, router]);

  useEffect(() => {
    if (!userId || isPublic) return;
    let cancelled = false;
    (async () => {
      // Each read is already retried once by @kshop/data (R11); one more round here before showing «Reintentar».
      for (let i = 0; i < 2 && !cancelled; i++) {
        try {
          const admin = await loadAdminState(api, store.id);
          saveCachedAdminState(userId, store.id, admin);
          if (!cancelled) setState(admin ? { kind: "ready", admin } : { kind: "forbidden" });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        }
      }
      if (!cancelled) setState({ kind: "error" });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isPublic, api, store.id, attempt, sectionsLive]);

  // Orders waiting for confirmation: the bell's dot and the counter of «Pedidos». It starts from the boot and is read
  // again only on an order change (Realtime) with a one-line count (R11: it ran the whole admin_home_summary on every
  // page change).
  const ordersOn = state.kind === "ready" && state.admin.enabledModules.has("orders");
  useEffect(() => {
    if (!ordersOn || live === 0) return;
    let cancelled = false;
    void supabase.rpc("admin_to_confirm", { p_store_id: store.id }).then(({ data, error }) => {
      if (!cancelled && !error && typeof data === "number") setLiveToConfirm(data);
    });
    return () => {
      cancelled = true;
    };
  }, [ordersOn, supabase, store.id, live]);
  const toConfirm = liveToConfirm ?? (state.kind === "ready" ? state.admin.toConfirm : 0);

  if (isPublic) return <>{children}</>;
  if (!ready || !session || state.kind === "loading") {
    return <p className="p-8 text-muted-foreground">Cargando…</p>;
  }

  const signOut = async () => {
    clearCachedAdminStates();
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  if (state.kind === "forbidden" || state.kind === "error") {
    return (
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">{store.name}</h1>
        <Alert variant="destructive" data-testid="admin-forbidden">
          {state.kind === "forbidden"
            ? "No tienes acceso a la administración de esta tienda."
            : "No se pudo cargar el panel. Inténtalo de nuevo."}
        </Alert>
        <p className="text-sm text-muted-foreground">Sesión iniciada como {session.user.email}.</p>
        <div className="flex gap-2">
          {state.kind === "error" && (
            <Button
              onClick={() => {
                setState({ kind: "loading" });
                setAttempt((a) => a + 1);
              }}
            >
              Reintentar
            </Button>
          )}
          <Button variant="outline" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
        <FullkodCredit pinned />
      </main>
    );
  }

  const { admin } = state;
  const canManageAccount = admin.role === "owner" || admin.role === "admin" || admin.isSuperadmin;
  const groups: Record<AdminGroup, NavItem[]> = { sales: [], catalog: [], store: [], business: [] };
  for (const mod of ADMIN_MODULES) {
    const { visibility, setting } = menuSection(admin, mod.code);
    // Hidden sections disappear for the staff, also as a PRO upsell (R12 D2).
    if (visibility === "hidden") continue;
    // «Apariencia» outside the plan opens its page, which says the platform sets it up (D6).
    const open = admin.enabledModules.has(mod.code) || (mod.code === "themes" && visibility === "managed");
    const price = admin.addonPrices[mod.code];
    groups[mod.group].push({
      key: mod.code,
      href: open ? mod.adminPath : "/admin/billing",
      label: mod.label,
      icon: mod.icon,
      testId: open ? `nav-${mod.code}` : `nav-locked-${mod.code}`,
      locked: open
        ? undefined
        : price != null
          ? `Incluido en Pro, o ${formatUsd(price)}/mes suelto`
          : "Incluido en el plan Pro",
      count: mod.code === "orders" && toConfirm > 0 ? toConfirm : undefined,
      badge:
        visibility === "managed" || setting === "managed"
          ? "Admin"
          : setting === "hidden"
            ? "Oculta"
            : undefined,
    });
    // Customers live inside Pedidos.
    if (mod.code === "orders" && open) {
      groups.sales.push({
        key: "customers",
        href: "/admin/orders/customers",
        label: "Clientes",
        icon: UserRound,
        testId: "nav-customers",
      });
    }
  }
  if (canManageAccount) {
    groups.business.push(
      {
        key: "billing",
        href: "/admin/billing",
        label: "Plan y facturación",
        icon: CreditCard,
        testId: "nav-billing",
      },
      { key: "team", href: "/admin/team", label: "Equipo", icon: Users, testId: "nav-team" },
    );
  }
  // The most specific path wins (Cupones lives under /admin/discounts, Clientes under /admin/orders).
  const activeHref = [
    ...Object.values(groups)
      .flat()
      .filter((i) => !i.locked),
    { href: "/admin" },
  ]
    .map((i) => i.href)
    .filter((href) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const action = primaryAction(pathname);
  const current = ADMIN_MODULES.filter(
    (m) => pathname === m.adminPath || pathname.startsWith(`${m.adminPath}/`),
  ).sort((a, b) => b.adminPath.length - a.adminPath.length)[0];
  const currentSection = current ? menuSection(admin, current.code) : null;
  const email = session.user.email ?? "";
  const otherStores = admin.stores.filter((s) => s.id !== store.id);

  const sidebar = (
    <>
      <StoreSwitcher
        name={store.name}
        role={admin.role ? ROLE_LABELS[admin.role] : "Superadmin"}
        others={otherStores}
      />
      <nav className={SIDEBAR_NAV_CLASS} aria-label="Módulos">
        <NavLink
          item={{ key: "home", href: "/admin", label: "Inicio", icon: House, testId: "nav-home" }}
          active={activeHref === "/admin"}
        />
        {ADMIN_GROUPS.map((g) =>
          groups[g.key].length ? (
            <div key={g.key} className="flex flex-col gap-0.5">
              <p className="px-2.5 pt-3 pb-1 text-[10.5px] font-bold tracking-[.1em] text-[#9C93B8] uppercase">
                {g.label}
              </p>
              {groups[g.key].map((item) => (
                <NavLink key={item.key} item={item} active={!item.locked && activeHref === item.href} />
              ))}
            </div>
          ) : null,
        )}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-xl bg-white/6 px-2.5 py-3">
        <span className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-[#5B21B6] text-sm font-bold">
          {(email[0] ?? "?").toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">
            {admin.role ? ROLE_LABELS[admin.role] : "Superadmin"}
          </span>
          <span className="truncate text-xs text-[#C8C0DA]">{email}</span>
        </span>
        <SidebarSignOut signOut={signOut} counter={admin.enabledModules.has("pos")} />
      </div>
    </>
  );

  return (
    <AdminContext.Provider value={admin}>
      <ConfirmProvider>
        <div className="flex min-h-dvh bg-surface">
          <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1.5 overflow-hidden bg-night px-3 py-4 text-white md:flex dark:bg-ink">
            {sidebar}
          </aside>
          {menuOpen && (
            <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-label="Menú">
              <button
                type="button"
                aria-label="Cerrar menú"
                className="absolute inset-0 bg-[color-mix(in_srgb,var(--night)_55%,transparent)]"
                onClick={() => setMenuOpen(false)}
              />
              <aside
                onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOpen(false)}
                className="relative flex h-full w-[280px] flex-col gap-1.5 overflow-hidden bg-night px-3 py-4 text-white"
              >
                {sidebar}
              </aside>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background px-4 md:px-7">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                className="flex size-10 items-center justify-center rounded-lg border md:hidden"
              >
                {menuOpen ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
              </button>
              <Link
                href="/admin"
                className="font-display truncate font-bold md:hidden"
                data-testid="admin-store-name-mobile"
              >
                {store.name}
              </Link>
              <AdminSearch
                sections={[
                  { href: "/admin", label: "Inicio", icon: House },
                  ...Object.values(groups)
                    .flat()
                    .filter((i) => !i.locked),
                ]}
                orders={ordersOn}
                catalog={admin.enabledModules.has("catalog")}
              />
              <div className="ml-auto flex items-center gap-2">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "hidden h-10 sm:inline-flex",
                  )}
                >
                  Ver tienda
                  <ExternalLink size={15} aria-hidden />
                </a>
                {ordersOn && (
                  <Link
                    href="/admin/orders"
                    aria-label={toConfirm ? `${toConfirm} pedidos por confirmar` : "Pedidos"}
                    title={toConfirm ? `${toConfirm} por confirmar` : "Sin pedidos por confirmar"}
                    className="relative flex size-10 items-center justify-center rounded-[10px] border hover:bg-surface"
                    data-testid="admin-bell"
                  >
                    <Bell size={18} aria-hidden />
                    {toConfirm > 0 && (
                      <span className="absolute top-2 right-2 size-2 rounded-full bg-destructive ring-2 ring-background" />
                    )}
                  </Link>
                )}
                {action && (
                  <Link href={action.href} className={cn(buttonVariants({ size: "sm" }), "h-10")}>
                    <Plus size={16} aria-hidden />
                    <span className="hidden sm:inline">{action.label}</span>
                  </Link>
                )}
              </div>
            </header>
            <main className={cn("min-w-0 flex-1 px-4 py-6 md:px-7", ADMIN_CONTENT_CLASS)}>
              {/* One centered column on wide screens, as in the superadmin; narrower pages are centered in it. */}
              <div className="mx-auto w-full max-w-6xl [&>[class*=max-w-]]:mx-auto">
                <AccountBanner admin={admin} />
                {currentSection?.visibility === "hidden" ? (
                  <Alert className="max-w-4xl" data-testid="section-hidden">
                    Esta sección no está disponible para tu tienda.
                  </Alert>
                ) : (
                  <>
                    {currentSection && current && (
                      <SectionNotice
                        section={currentSection}
                        // «Apariencia» outside the plan already explains it on its page.
                        silent={current.code === "themes" && !admin.enabledModules.has("themes")}
                      />
                    )}
                    {children}
                  </>
                )}
                <FullkodCredit />
              </div>
            </main>
          </div>
        </div>
      </ConfirmProvider>
    </AdminContext.Provider>
  );
}

/** The sales of the counter stay in this browser, but only someone of this store signed in here can upload them. */
function SidebarSignOut({ signOut, counter }: { signOut: () => Promise<void>; counter: boolean }) {
  const store = useStore();
  const storage = usePosStorage();
  const { confirm } = useConfirm();

  async function ask() {
    const sales = counter ? await storage.listSales(store.id).catch(() => []) : [];
    const pending = sales.filter((s) => !s.uploaded).length;
    if (
      pending > 0 &&
      !(await confirm({
        title: `Hay ${pending === 1 ? "1 venta" : `${pending} ventas`} sin subir`,
        description:
          "Se quedan guardadas en este navegador, pero no se subirán hasta que alguien de la tienda vuelva a entrar aquí.",
        confirmLabel: "Cerrar sesión igualmente",
        tone: "destructive",
      }))
    ) {
      return;
    }
    await signOut();
  }

  return (
    <button
      type="button"
      onClick={() => void ask()}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      className="flex size-9 items-center justify-center rounded-lg text-[#D9D3EA] hover:bg-white/8 hover:text-white"
    >
      <LogOut size={16} aria-hidden />
    </button>
  );
}

/** Notice on top of a managed section (staff) or of a configured one (superadmin). */
function SectionNotice({ section, silent }: { section: ReturnType<typeof menuSection>; silent: boolean }) {
  if (silent) return null;
  const text =
    section.visibility === "managed"
      ? MANAGED_SECTION_MESSAGE
      : section.setting === "managed"
        ? "Gestionado por admin: el personal de la tienda solo puede consultar esta sección."
        : section.setting === "hidden"
          ? "Sección oculta al personal de la tienda: solo la ves tú."
          : null;
  if (!text) return null;
  return (
    // max-w-4xl: the width of most module pages (the column centers it, like them).
    <Alert className="mb-4 max-w-4xl" data-testid="section-notice">
      {text}
    </Alert>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-testid={item.testId}
      title={item.locked}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] whitespace-nowrap transition-colors",
        active ? "bg-[#5B21B6] font-semibold text-white" : "text-[#D9D3EA] hover:bg-white/8 hover:text-white",
        item.locked && "text-[#9C93B8]",
      )}
    >
      <Icon size={17} aria-hidden className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.count != null && (
        <span className="rounded-full bg-gold px-1.5 py-0.5 text-[11px] leading-none font-bold text-night">
          {item.count}
        </span>
      )}
      {item.badge && (
        <span className="rounded-md bg-white/12 px-1.5 py-0.5 text-[10px] font-bold text-[#D9D3EA]">
          {item.badge}
        </span>
      )}
      {item.locked && (
        <span className="flex items-center gap-1 rounded-md bg-gold/16 px-1.5 py-0.5 text-[10px] font-bold text-gold">
          <Lock size={10} aria-hidden />
          PRO
        </span>
      )}
    </Link>
  );
}

/** Store initial, name and role; the user's other stores open from it (each admin lives on its store's host). */
function StoreSwitcher({
  name,
  role,
  others,
}: {
  name: string;
  role: string;
  others: { id: string; slug: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const head = (
    <>
      <span className="font-display flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gold text-[17px] font-extrabold text-night">
        {name[0]?.toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[15px] font-bold" data-testid="admin-store-name">
          {name}
        </span>
        <span className="text-[11.5px] text-[#C8C0DA]">{role}</span>
      </span>
    </>
  );
  if (!others.length) return <div className="mb-2 flex items-center gap-2.5 px-1.5 py-1">{head}</div>;
  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1 hover:bg-white/8"
      >
        {head}
        <ChevronsUpDown size={16} aria-hidden className="text-[#9C93B8]" />
      </button>
      {open && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-[10px] bg-background p-1 text-foreground shadow-lg">
          {others.map((s) => (
            <li key={s.id}>
              <a
                href={`${storeOrigin(s.slug, publicEnv.platformDomain, platformProtocol)}/admin`}
                className="block rounded-md px-3 py-2 text-sm hover:bg-surface"
              >
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
