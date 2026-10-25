import { Card } from "@kshop/ui";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";

export default function SuperadminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-night px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-3">
          <Brand className="h-8 self-start" />
          <h1 className="text-xl font-semibold">Acceso de superadmin</h1>
        </div>
        <LoginForm redirectTo="/superadmin" />
      </Card>
    </main>
  );
}
