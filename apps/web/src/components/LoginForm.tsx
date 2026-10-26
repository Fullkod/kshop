"use client";

import { StaffLoginForm } from "@kshop/admin";
import { useRouter } from "next/navigation";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  return <StaffLoginForm onSignedIn={() => router.replace(redirectTo)} />;
}
