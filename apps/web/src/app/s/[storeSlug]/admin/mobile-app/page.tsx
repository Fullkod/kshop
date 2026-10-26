"use client";

import { Alert } from "@kshop/ui";
import { MobileAppPage } from "@/features/mobile-app/components/MobileAppPage";
import { useAdmin } from "../admin-context";

export default function AdminMobileAppPage() {
  const admin = useAdmin();
  if (!admin.enabledModules.has("mobile_app")) {
    return <Alert variant="destructive">«App móvil» no está incluida en el plan de tu tienda.</Alert>;
  }
  return <MobileAppPage />;
}
