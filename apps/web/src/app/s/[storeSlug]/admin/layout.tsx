import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = { title: "Administración", robots: { index: false } };

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
