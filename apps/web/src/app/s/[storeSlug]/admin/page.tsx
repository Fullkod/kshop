"use client";

import { Card } from "@kshop/ui";
import { ADMIN_MODULES } from "@/features/registry";
import { SalesTodayCard } from "@/features/sales-today/SalesTodayCard";
import { useStore } from "@/lib/store-context";
import { useAdmin } from "./admin-context";

export default function AdminHomePage() {
  const store = useStore();
  const admin = useAdmin();
  const enabled = ADMIN_MODULES.filter((m) => admin.enabledModules.has(m.code));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, bienvenido a {store.name}</h1>
        <p className="text-muted-foreground">Desde aquí gestionarás tu tienda.</p>
      </div>
      {admin.enabledModules.has("sales_today") && <SalesTodayCard />}
      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Tu plan incluye</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="enabled-modules">
          {enabled.map((m) => (
            <li key={m.code}>✓ {m.label}</li>
          ))}
        </ul>
        {admin.limits.max_staff !== undefined && (
          <p className="text-sm text-muted-foreground">Hasta {admin.limits.max_staff} usuarios de equipo.</p>
        )}
      </Card>
    </div>
  );
}
