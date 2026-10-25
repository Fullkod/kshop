import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { SuperadminShell } from "./SuperadminShell";

export const metadata: Metadata = { title: "Superadmin", robots: { index: false } };

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SuperadminShell>{children}</SuperadminShell>
    </SessionProvider>
  );
}
