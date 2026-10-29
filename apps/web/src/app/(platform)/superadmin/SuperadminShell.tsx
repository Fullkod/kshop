"use client";

import {
  Alert,
  buttonVariants,
  cn,
  CreditCard,
  ExternalLink,
  Globe,
  LogOut,
  type LucideIcon,
  Menu,
  MessageCircle,
  Plus,
  Receipt,
  Smartphone,
  Store,
  X,
  ConfirmProvider,
} from "@kshop/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { FullkodCredit } from "@/components/FullkodCredit";
import { ADMIN_CONTENT_CLASS, SIDEBAR_NAV_CLASS } from "@/components/admin-content";
import { useSession } from "@/lib/session";

const LOGIN_PATH = "/superadmin/login";

type NavItem = { href: string; label: string; icon: LucideIcon };

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Tiendas",
    items: [
      { href: "/superadmin", label: "Tiendas", icon: Store },
      { href: "/superadmin/domains", label: "Dominios", icon: Globe },
      { href: "/superadmin/apps", label: "Apps", icon: Smartphone },
    ],
  },
  {
    label: "Cobros",
    items: [
      { href: "/superadmin/billing", label: "Cobros", icon: Receipt },
      { href: "/superadmin/plans", label: "Planes y módulos", icon: CreditCard },
    ],
  },
  { label: "Plataforma", items: [{ href: "/superadmin/whatsapp", label: "WhatsApp", icon: MessageCircle }] },
];

/**
 * Superadmin panel (redesign R8, the same language as the store admin of R6): night sidebar with Kshop and the
 * groups, user card, a menu on phones, and a topbar with «Ver la web» and «Nueva tienda».
 */
export function SuperadminShell({ children }: { children: ReactNode }) {
  const { session, ready, supabase } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === LOGIN_PATH;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (ready && !session && !isLogin) router.replace(LOGIN_PATH);
  }, [ready, session, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!ready || !session) return <p className="p-8 text-muted-foreground">Cargando…</p>;

  const isSuperadmin = session.user.app_metadata?.role === "superadmin";
  const email = session.user.email ?? "";
  // The most specific path wins; a store's pages (/superadmin/stores/…) belong to Tiendas.
  const activeHref =
    GROUPS.flatMap((g) => g.items)
      .map((i) => i.href)
      .filter((href) => href !== "/superadmin" && (pathname === href || pathname.startsWith(`${href}/`)))
      .sort((a, b) => b.length - a.length)[0] ?? "/superadmin";

  const sidebar = (
    <>
      <Link href="/superadmin" className="mb-3 flex items-center gap-2.5 px-1.5 py-1">
        <Brand reversed className="h-7" />
        <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-night">Superadmin</span>
      </Link>
      <nav className={SIDEBAR_NAV_CLASS} aria-label="Secciones">
        {GROUPS.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="px-2.5 pt-3 pb-1 text-[10.5px] font-bold tracking-[.1em] text-[#9C93B8] uppercase">
              {g.label}
            </p>
            {g.items.map((item) => {
              const Icon = item.icon;
              const active = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] whitespace-nowrap transition-colors",
                    active
                      ? "bg-[#5B21B6] font-semibold text-white"
                      : "text-[#D9D3EA] hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon size={17} aria-hidden className="shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-xl bg-white/6 px-2.5 py-3">
        <span className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-[#5B21B6] text-sm font-bold">
          {(email[0] ?? "?").toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">Superadmin</span>
          <span className="truncate text-xs text-[#C8C0DA]">{email}</span>
        </span>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
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
          <span className="font-display truncate font-bold md:hidden">Superadmin</span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "hidden h-10 sm:inline-flex")}
            >
              Ver la web
              <ExternalLink size={15} aria-hidden />
            </a>
            <Link href="/superadmin/stores/new" className={cn(buttonVariants({ size: "sm" }), "h-10")}>
              <Plus size={16} aria-hidden />
              <span className="hidden sm:inline">Nueva tienda</span>
            </Link>
          </div>
        </header>
        <main className={cn("min-w-0 flex-1 px-4 py-6 md:px-7", ADMIN_CONTENT_CLASS)}>
          <div className="mx-auto w-full max-w-6xl [&>[class*=max-w-]]:mx-auto">
            {isSuperadmin ? (
              <ConfirmProvider>{children}</ConfirmProvider>
            ) : (
              <Alert variant="destructive">Esta cuenta no tiene acceso de superadmin.</Alert>
            )}
            <FullkodCredit />
          </div>
        </main>
      </div>
    </div>
  );
}
