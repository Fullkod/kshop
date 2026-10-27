"use client";

import { NavigationProvider, type LinkProps } from "@kshop/storefront";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

function Link({ href, ...props }: LinkProps) {
  return <NextLink href={href} {...props} />;
}

// On the server the path may still carry the host rewrite (/s/{slug}/…); the shopper never sees it.
function useShopperPathname() {
  return usePathname().replace(/^\/s\/[^/]+(?=\/|$)/, "") || "/";
}

/** Next's Link and router for the shared storefront components (@kshop/storefront). */
export function NextNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo(
    () => ({
      Link,
      usePathname: useShopperPathname,
      push: (href: string) => router.push(href),
      replace: (href: string) => router.replace(href),
    }),
    [router],
  );
  return <NavigationProvider value={value}>{children}</NavigationProvider>;
}
