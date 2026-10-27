import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = { title: "Administración", robots: { index: false } };

// The admin is a client app that reads the staff session in the browser: it blocks on purpose, so Next's dev-only
// «instant navigation» validation is turned off for it (redesign R6).
export const instant = false;

export default function StoreAdminLayout({ children }: { children: ReactNode }) {
  return (
    // Client app driven by the URL (usePathname/useParams): rendered at request time, nothing to prerender.
    <Suspense fallback={null}>
      <SessionProvider>
        <AdminShell>{children}</AdminShell>
      </SessionProvider>
    </Suspense>
  );
}
