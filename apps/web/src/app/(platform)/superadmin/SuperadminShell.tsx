"use client";

import { Alert, Button } from "@kshop/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { useSession } from "@/lib/session";

const LOGIN_PATH = "/superadmin/login";

export function SuperadminShell({ children }: { children: ReactNode }) {
  const { session, ready, supabase } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === LOGIN_PATH;

  useEffect(() => {
    if (ready && !session && !isLogin) router.replace(LOGIN_PATH);
  }, [ready, session, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!ready || !session) return <p className="p-8 text-muted-foreground">Cargando…</p>;

  const isSuperadmin = session.user.app_metadata?.role === "superadmin";

  return (
    <div className="min-h-dvh bg-surface">
      <header className="bg-night text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/superadmin" className="flex items-center gap-3">
            <Brand reversed className="h-7" />
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-night">
              Superadmin
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/superadmin" className="hover:underline">
              Tiendas
            </Link>
            <Link href="/superadmin/whatsapp" className="hover:underline">
              WhatsApp
            </Link>
            <span className="hidden text-white/70 sm:inline">{session.user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => supabase.auth.signOut()}
            >
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {isSuperadmin ? (
          children
        ) : (
          <Alert variant="destructive">Esta cuenta no tiene acceso de superadmin.</Alert>
        )}
      </main>
    </div>
  );
}
