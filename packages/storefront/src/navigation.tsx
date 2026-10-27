"use client";

import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";

// The storefront runs in Next (web) and in react-router (store app): each one provides its Link and router here,
// so the shared components never import a router (PRP-7 D3).

export type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  prefetch?: boolean;
  /** false: keep the scroll position (filters). */
  scroll?: boolean;
  replace?: boolean;
};

export type Navigation = {
  Link: ComponentType<LinkProps>;
  /** Hook: current path as the shopper sees it (/product/x), without the internal /s/{slug} rewrite. */
  usePathname: () => string;
  push: (href: string) => void;
  replace: (href: string) => void;
};

const NavigationContext = createContext<Navigation | null>(null);

export function NavigationProvider({ value, children }: { value: Navigation; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

function useNavigation(): Navigation {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("Storefront components need a <NavigationProvider>");
  return value;
}

export function Link(props: LinkProps) {
  const { Link: Impl } = useNavigation();
  return <Impl {...props} />;
}

/** Reads the URL: on the web, render it inside <Suspense> (Cache Components prerender). */
export function usePathname(): string {
  return useNavigation().usePathname();
}

export function useRouter(): Pick<Navigation, "push" | "replace"> {
  const { push, replace } = useNavigation();
  return { push, replace };
}
