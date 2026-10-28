"use client";

import { NavigationProvider, type LinkProps } from "@kshop/storefront";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

function Link({ href, ...props }: LinkProps) {
  return <NextLink href={href} {...props} />;
}

/**
 * The path as the browser shows it. On the server the path still carries the host rewrite (/s/{slug}/…), so comparing
 * `usePathname()` with "/admin/…" differs between server and browser (hydration mismatch; R11: /admin/login never
 * loaded). Use this in every component under /s/[storeSlug].
 */
export function useStorePathname() {
  return usePathname().replace(/^\/s\/[^/]+(?=\/|$)/, "") || "/";
}

/** Next's Link and router for the shared storefront components (@kshop/storefront). */
export function NextNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo(
    () => ({
      Link,
      usePathname: useStorePathname,
      push: (href: string) => router.push(href),
      replace: (href: string) => router.replace(href),
    }),
    [router],
  );
  return <NavigationProvider value={value}>{children}</NavigationProvider>;
}
