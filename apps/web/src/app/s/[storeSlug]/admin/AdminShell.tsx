"use client";

import { formatUsd, ROLE_LABELS, storeOrigin } from "@kshop/core";
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
} from "@kshop/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { platformProtocol, publicEnv } from "@/env";
import { ADMIN_MODULES } from "@/features/registry";
import { ADMIN_GROUPS, type AdminGroup } from "@/features/types";
import { useSession } from "@/lib/session";
import { useStoreVersion } from "@kshop/admin";
import { useStore } from "@kshop/storefront";
import { AdminContext, loadAdminState, type AdminState } from "./admin-context";
import { AccountBanner } from "./AccountBanner";

// Pages that work without a store session.
const PUBLIC_PATHS = ["/admin/login", "/admin/set-password"];

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
};

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
  const { session, ready, api, graphql, supabase } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [toConfirm, setToConfirm] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const live = useStoreVersion(isPublic ? null : store.id);
  const userId = session?.user.id;

  useEffect(() => {
    if (ready && !session && !isPublic) router.replace("/admin/login");
  }, [ready, session, isPublic, router]);

  useEffect(() => {
    if (!userId || isPublic) return;
    let cancelled = false;
    (async () => {
      try {
        const admin = await loadAdminState(api, graphql, store.id);
        if (!cancelled) setState(admin ? { kind: "ready", admin } : { kind: "forbidden" });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isPublic, api, graphql, store.id]);

  // Orders waiting for confirmation: the bell's dot and the counter of «Pedidos», refreshed on every page change and
  // on every order change (Realtime).
  const ordersOn = state.kind === "ready" && state.admin.enabledModules.has("orders");
  useEffect(() => {
    if (!ordersOn) return;
    let cancelled = false;
    api
      .orders(store.id)
      .summary()
      .then(
        (s) => !cancelled && setToConfirm(s.todo.toConfirm),
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [ordersOn, api, store.id, pathname, live]);

  if (isPublic) return <>{children}</>;
  if (!ready || !session || state.kind === "loading") {
    return <p className="p-8 text-muted-foreground">Cargando…</p>;
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  if (state.kind === "forbidden" || state.kind === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">{store.name}</h1>
        <Alert variant="destructive" data-testid="admin-forbidden">
          {state.kind === "forbidden"
            ? "No tienes acceso a la administración de esta tienda."
            : "No se pudo cargar el panel. Inténtalo de nuevo."}
        </Alert>
        <p className="text-sm text-muted-foreground">Sesión iniciada como {session.user.email}.</p>
        <Button variant="outline" onClick={signOut} className="self-start">
          Cerrar sesión
        </Button>
      </main>
    );
  }

  const { admin } = state;
  const canManageAccount = admin.role === "owner" || admin.role === "admin" || admin.isSuperadmin;
  const groups: Record<AdminGroup, NavItem[]> = { sales: [], catalog: [], store: [], business: [] };
  for (const mod of ADMIN_MODULES) {
    const enabled = admin.enabledModules.has(mod.code);
    const price = admin.addonPrices[mod.code];
    groups[mod.group].push({
      key: mod.code,
      href: enabled ? mod.adminPath : "/admin/billing",
      label: mod.label,
      icon: mod.icon,
      testId: enabled ? `nav-${mod.code}` : `nav-locked-${mod.code}`,
      locked: enabled
        ? undefined
        : price != null
          ? `Incluido en Pro, o ${formatUsd(price)}/mes suelto`
          : "Incluido en el plan Pro",
      count: mod.code === "orders" && toConfirm > 0 ? toConfirm : undefined,
    });
    // Customers live inside Pedidos.
    if (mod.code === "orders" && enabled) {
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
  const email = session.user.email ?? "";
  const otherStores = admin.stores.filter((s) => s.id !== store.id);

  const sidebar = (
    <>
      <StoreSwitcher
        name={store.name}
        role={admin.role ? ROLE_LABELS[admin.role] : "Superadmin"}
        others={otherStores}
      />
      <nav className="flex flex-col gap-0.5" aria-label="Módulos">
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
        <span className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold">
          {(email[0] ?? "?").toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">
            {admin.role ? ROLE_LABELS[admin.role] : "Superadmin"}
          </span>
          <span className="truncate text-xs text-[#C8C0DA]">{email}</span>
        </span>
        <button
          type="button"
          onClick={signOut}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="flex size-9 items-center justify-center rounded-lg text-[#D9D3EA] hover:bg-white/8 hover:text-white"
        >
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </>
  );

  return (
    <AdminContext.Provider value={admin}>
      <div className="flex min-h-dvh bg-surface">
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-1.5 overflow-y-auto bg-night px-3 py-4 text-white md:flex dark:bg-ink">
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
              className="relative flex h-full w-[280px] flex-col gap-1.5 overflow-y-auto bg-night px-3 py-4 text-white"
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
          <main className="min-w-0 flex-1 px-4 py-6 md:px-7">
            <AccountBanner admin={admin} />
            {children}
          </main>
        </div>
      </div>
    </AdminContext.Provider>
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
        active ? "bg-primary font-semibold text-white" : "text-[#D9D3EA] hover:bg-white/8 hover:text-white",
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
