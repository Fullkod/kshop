"use client";

import { Card } from "@kshop/ui";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { useStore } from "@kshop/storefront";

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
        <Link
          href="/admin/forgot-password"
          className="mt-4 block text-center text-sm text-primary hover:underline"
          data-testid="forgot-password"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </Card>
    </main>
  );
}
