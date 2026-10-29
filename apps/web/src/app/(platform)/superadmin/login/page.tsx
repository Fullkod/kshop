import { Card } from "@kshop/ui";
import { Brand } from "@/components/Brand";
import { LoginForm } from "@/components/LoginForm";
import { FullkodCredit } from "@/components/FullkodCredit";

export default function SuperadminLoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-night px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col gap-3">
          <Brand className="h-8 self-start" />
          <h1 className="text-xl font-semibold">Acceso de superadmin</h1>
        </div>
        <LoginForm redirectTo="/superadmin" />
      </Card>
      <FullkodCredit pinned onDark />
    </main>
  );
}
