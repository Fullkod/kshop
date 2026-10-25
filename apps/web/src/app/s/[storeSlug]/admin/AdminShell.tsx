"use client";

import { isModuleCode, ROLE_LABELS, type ModuleCode } from "@kshop/core";
import { StoreEntitlementsQuery } from "@kshop/data";
import { Alert, Badge, Button, cn } from "@kshop/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ADMIN_MODULES } from "@/features/registry";
import { useSession } from "@/lib/session";
import { useStore } from "@/lib/store-context";
import { AdminContext, type AdminState } from "./admin-context";

// Pages that work without a store session.
const PUBLIC_PATHS = ["/admin/login", "/admin/set-password"];

type LoadState =
  { kind: "loading" } | { kind: "forbidden" } | { kind: "error" } | { kind: "ready"; admin: AdminState };

export function AdminShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const { session, ready, api, graphql, supabase } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const userId = session?.user.id;

  useEffect(() => {
    if (ready && !session && !isPublic) router.replace("/admin/login");
  }, [ready, session, isPublic, router]);

  useEffect(() => {
    if (!userId || isPublic) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        const membership = me.stores.find((s) => s.id === store.id);
        if (!membership && !me.isSuperadmin) {
          if (!cancelled) setState({ kind: "forbidden" });
          return;
        }
        // Entitlements are read through pg_graphql; RLS returns them only to the store's staff.
        const result = await graphql.query(StoreEntitlementsQuery, { storeId: store.id }).toPromise();
        if (result.error) throw result.error;
        const codes = (result.data?.storeEntitlements?.edges ?? [])
          .map((e) => e.node.moduleCode)
          .filter(isModuleCode);
        const limits = JSON.parse(result.data?.storeLimits ?? "{}") as Record<string, number>;
        if (!cancelled) {
          setState({
            kind: "ready",
            admin: { role: membership?.role ?? null, enabledModules: new Set<ModuleCode>(codes), limits },
          });
        }
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isPublic, api, graphql, store.id]);

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

  return (
    <AdminContext.Provider value={admin}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <aside className="border-b bg-surface md:w-64 md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-2 px-5 py-5">
            <div>
              <Link
                href="/admin"
                className="font-display text-lg font-semibold"
                data-testid="admin-store-name"
              >
                {store.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {admin.role ? ROLE_LABELS[admin.role] : "Superadmin"} · {session.user.email}
              </div>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:flex-col" aria-label="Módulos">
            <Link
              href="/admin"
              className={cn(
                "rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-background",
                pathname === "/admin" && "bg-background font-medium",
              )}
            >
              Inicio
            </Link>
            {ADMIN_MODULES.map((module) => {
              const enabled = admin.enabledModules.has(module.code);
              return enabled ? (
                <Link
                  key={module.code}
                  href={module.adminPath}
                  data-testid={`nav-${module.code}`}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm whitespace-nowrap hover:bg-background",
                    pathname.startsWith(module.adminPath) && "bg-background font-medium",
                  )}
                >
                  {module.label}
                </Link>
              ) : (
                <span
                  key={module.code}
                  data-testid={`nav-locked-${module.code}`}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted-foreground"
                  title="Disponible en el plan Pro"
                >
                  {module.label}
                  <Badge variant="gold">Pro</Badge>
                </span>
              );
            })}
          </nav>
          <div className="hidden px-5 pb-6 md:block">
            <Button variant="ghost" size="sm" onClick={signOut}>
              Cerrar sesión
            </Button>
          </div>
        </aside>
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
