"use client";

import { Alert, Card } from "@kshop/ui";
import { notFound, useParams } from "next/navigation";
import { getAdminModuleByPath } from "@/features/registry";
import { useAdmin } from "../admin-context";

// Placeholder until each module ships its screens (see availableInPhase in its module.ts).
export default function AdminModulePage() {
  const { module: segment } = useParams<{ module: string }>();
  const admin = useAdmin();
  const adminModule = getAdminModuleByPath(segment);
  if (!adminModule) notFound();

  if (!admin.enabledModules.has(adminModule.code)) {
    return (
      <Alert variant="destructive">«{adminModule.label}» no está incluido en el plan de tu tienda.</Alert>
    );
  }

  return (
    <Card className="max-w-xl">
      <h1 className="text-2xl font-semibold">{adminModule.label}</h1>
      <p className="mt-2 text-muted-foreground">Esta sección estará lista muy pronto.</p>
    </Card>
  );
}
