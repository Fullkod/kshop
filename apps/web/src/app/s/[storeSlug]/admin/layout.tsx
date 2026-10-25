import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = { title: "Administración", robots: { index: false } };

export default function StoreAdminLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AdminShell>{children}</AdminShell>
    </SessionProvider>
  );
}
