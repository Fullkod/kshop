"use client";

import { Card } from "@kshop/ui";
import { LoginForm } from "@/components/LoginForm";
import { useStore } from "@/lib/store-context";

export default function StoreAdminLoginPage() {
  const store = useStore();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">Administración</p>
          <h1 className="text-xl font-semibold">{store.name}</h1>
        </div>
        <LoginForm redirectTo="/admin" />
      </Card>
    </main>
  );
}
