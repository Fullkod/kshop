"use client";

import { NavigationProvider, type LinkProps } from "@kshop/storefront";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

function Link({ href, ...props }: LinkProps) {
  return <NextLink href={href} {...props} />;
}

/** Next's Link and router for the shared storefront components (@kshop/storefront). */
export function NextNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo(
    () => ({
      Link,
      push: (href: string) => router.push(href),
      replace: (href: string) => router.replace(href),
    }),
    [router],
  );
  return <NavigationProvider value={value}>{children}</NavigationProvider>;
}
