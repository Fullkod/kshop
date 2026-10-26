"use client";

import { Alert } from "@kshop/ui";
import type { ReactNode } from "react";
import { NotificationsNav } from "@/features/whatsapp-notifications/components/NotificationsPages";
import { useAdmin } from "../admin-context";

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  const admin = useAdmin();
  if (!admin.enabledModules.has("whatsapp_notifications")) {
    return (
      <Alert variant="destructive">Los avisos por WhatsApp no están incluidos en el plan de tu tienda.</Alert>
    );
  }
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-2xl font-semibold">Avisos por WhatsApp</h1>
      <NotificationsNav />
      {children}
    </div>
  );
}
