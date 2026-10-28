import { hostWithoutPort, parseHost, storeOrigin, storePublicOrigin } from "@kshop/core";
import { NextResponse, type NextRequest } from "next/server";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "kshop.localhost:3000";
const PROTOCOL = PLATFORM_DOMAIN.includes("localhost") ? "http" : "https";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
// "off" while no store has a live custom domain (R11 T9): a visit to {slug}.kshop.fullkod.com then skips the lookup of
// the domain it should redirect to (one database call per store page and instance). Turn it back on (remove the
// variable in Vercel) before the first store goes live on its own domain; that domain is resolved either way.
const SUBDOMAIN_REDIRECT = process.env.KSHOP_CUSTOM_DOMAIN_REDIRECT !== "off";

// Internal route that store hosts are rewritten to. Never reachable directly.
const STORE_PREFIX = "/s/";
const NOT_FOUND = "/__not-found";

// Custom domain lookups (PRP-6 D19), cached in this process for a minute, misses too (bots on unknown hosts).
// A change of domain or of plan reaches the proxy within that minute.
const CACHE_MS = 60_000;
const cache = new Map<string, { value: unknown; expires: number }>();

async function cachedRpc<T>(fn: string, args: Record<string, string>): Promise<T | undefined> {
  const key = `${fn}:${JSON.stringify(args)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) throw new Error(`rpc_${res.status}`);
    const value = (await res.json()) as T;
    if (cache.size > 5_000) cache.clear();
    cache.set(key, { value, expires: Date.now() + CACHE_MS });
    return value;
  } catch (error) {
    // Not cached: the next request tries again. The caller serves without the custom domain.
    console.error("Custom domain lookup failed.", {
      fn,
      message: error instanceof Error ? error.message : error,
    });
    return undefined;
  }
}

// Capacitor apps call /api/v1 from their WebView origin (PRP-7 D5); the web itself is same-origin. In local dev the
// Vite servers of the apps (5173 store, 5174 admin) too. Never "*".
const APP_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  ...(PROTOCOL === "http" ? ["http://localhost:5173", "http://localhost:5174"] : []),
]);

function withCors(request: NextRequest) {
  const origin = request.headers.get("origin");
  const response =
    request.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  if (!origin || !APP_ORIGINS.has(origin)) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Kshop-Channel");
  response.headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/** Redirects keep the path and query; no-store so turning the module off never leaves a cached loop. */
function redirect(url: string, status: 307 | 308) {
  const response = NextResponse.redirect(url, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const rewriteToStore = (request: NextRequest, slug: string) => {
  const { pathname, search } = request.nextUrl;
  return NextResponse.rewrite(
    new URL(`${STORE_PREFIX}${slug}${pathname === "/" ? "" : pathname}${search}`, request.url),
  );
};

/**
 * Routes by host:
 *   kshop.localhost:3000           -> platform pages (landing, /superadmin)
 *   {slug}.kshop.localhost:3000/x  -> /s/{slug}/x (store front and /admin); the storefront redirects (308) to the
 *                                     store's live custom domain, the admin stays (D21, D22)
 *   mitienda.com/x                 -> /s/{slug}/x; /admin and a domain that is no longer live go to the subdomain
 * /api/* is never rewritten: the API takes the store from the path, not the host (mobile apps have no host).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) return withCors(request);

  // The internal store route must not be reachable from any host.
  if (pathname === "/s" || pathname.startsWith(STORE_PREFIX)) {
    return NextResponse.rewrite(new URL(NOT_FOUND, request.url));
  }

  const target = parseHost(request.headers.get("host") ?? "", PLATFORM_DOMAIN);

  if (target.kind === "platform") return NextResponse.next();

  if (target.kind === "store") {
    if (SUBDOMAIN_REDIRECT && !isAdminPath(pathname)) {
      const domain = await cachedRpc<string | null>("resolve_store_custom_domain", { p_slug: target.slug });
      if (domain) {
        const origin = storePublicOrigin(
          { slug: target.slug, customDomain: domain },
          PLATFORM_DOMAIN,
          PROTOCOL,
        );
        return redirect(`${origin}${pathname}${search}`, 308);
      }
    }
    return rewriteToStore(request, target.slug);
  }

  const host = hostWithoutPort(target.host);
  const rows = await cachedRpc<{ slug: string; domain: string; live: boolean }[]>("resolve_store_domain", {
    p_host: host,
  });
  const match = rows?.[0];
  if (!match) return NextResponse.rewrite(new URL(NOT_FOUND, request.url));

  // The admin lives on the subdomain (D22); a domain without the module or of a suspended store too (D23).
  if (!match.live || isAdminPath(pathname)) {
    return redirect(`${storeOrigin(match.slug, PLATFORM_DOMAIN, PROTOCOL)}${pathname}${search}`, 307);
  }
  if (host !== match.domain) {
    const origin = storePublicOrigin(
      { slug: match.slug, customDomain: match.domain },
      PLATFORM_DOMAIN,
      PROTOCOL,
    );
    return redirect(`${origin}${pathname}${search}`, 308);
  }
  return rewriteToStore(request, match.slug);
}

export const config = {
  // Skip Next internals and public files (anything with an extension: icons, logos, manifest).
  // The per-store sitemap and robots have an extension but are store pages too.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)", "/sitemap.xml", "/robots.txt"],
};
