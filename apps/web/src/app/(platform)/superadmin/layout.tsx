import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { SuperadminShell } from "./SuperadminShell";

export const metadata: Metadata = { title: "Superadmin", robots: { index: false } };

// Client app on the superadmin's browser session: blocking on purpose (no dev «instant navigation» validation).
export const instant = false;

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return (
    // Client app driven by the URL (usePathname/useParams): rendered at request time, nothing to prerender.
    <Suspense fallback={null}>
      <SessionProvider>
        <SuperadminShell>{children}</SuperadminShell>
      </SessionProvider>
    </Suspense>
  );
}
