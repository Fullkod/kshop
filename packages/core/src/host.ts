import { SLUG_PATTERN } from "./slug";

export type HostTarget =
  { kind: "platform" } | { kind: "store"; slug: string } | { kind: "custom"; host: string };

/**
 * Classifies a request host against the platform domain (e.g. "kshop.fullkod.com" or "kshop.localhost:3000").
 * Ports are compared as part of the host, so local dev hosts must include them.
 */
export function parseHost(rawHost: string, platformDomain: string): HostTarget {
  const host = rawHost.trim().toLowerCase();
  const platform = platformDomain.trim().toLowerCase();

  if (host === platform || host === `www.${platform}`) return { kind: "platform" };

  const suffix = `.${platform}`;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    // Only one label below the platform domain is a store; anything else is not routable.
    if (SLUG_PATTERN.test(sub)) return { kind: "store", slug: sub };
  }

  return { kind: "custom", host };
}

/** Public origin of a store, e.g. storeOrigin("tienda-a", "kshop.localhost:3000", "http"). */
export function storeOrigin(slug: string, platformDomain: string, protocol: "http" | "https"): string {
  return `${protocol}://${slug}.${platformDomain}`;
}
