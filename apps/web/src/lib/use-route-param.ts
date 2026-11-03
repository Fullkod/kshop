"use client";

import { useParams, usePathname } from "next/navigation";

/**
 * The value of the dynamic segment `name`, for pages where it is the last segment of the URL.
 *
 * With Cache Components a client navigation to a URL that was never prefetched (e.g. `router.replace` to a product
 * just created) renders the route's static shell, and there `useParams()` gives Next's opaque placeholder
 * (`%%drp:productId:…%%`) instead of the id. The address bar is right, so the last segment of the pathname is used.
 */
export function useRouteParam(name: string): string {
  const value = useParams<Record<string, string>>()[name];
  const pathname = usePathname();
  if (value && !value.startsWith("%%drp:")) return value;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}
