import { parseHost } from "@kshop/core";
import { NextResponse, type NextRequest } from "next/server";

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "kshop.localhost:3000";

// Internal route that store hosts are rewritten to. Never reachable directly.
const STORE_PREFIX = "/s/";
const NOT_FOUND = "/__not-found";

/**
 * Routes by host without touching the database:
 *   kshop.localhost:3000           -> platform pages (landing, /superadmin)
 *   {slug}.kshop.localhost:3000/x  -> /s/{slug}/x (store front and /admin)
 * /api/* is never rewritten: the API takes the store from the path, not the host (mobile apps have no host).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) return NextResponse.next();

  // The internal store route must not be reachable from any host.
  if (pathname === "/s" || pathname.startsWith(STORE_PREFIX)) {
    return NextResponse.rewrite(new URL(NOT_FOUND, request.url));
  }

  const target = parseHost(request.headers.get("host") ?? "", PLATFORM_DOMAIN);

  if (target.kind === "platform") return NextResponse.next();

  if (target.kind === "store") {
    const url = new URL(
      `${STORE_PREFIX}${target.slug}${pathname === "/" ? "" : pathname}${search}`,
      request.url,
    );
    return NextResponse.rewrite(url);
  }

  // Custom domains arrive in Phase 6 (store_domains lookup + Vercel).
  return NextResponse.rewrite(new URL(NOT_FOUND, request.url));
}

export const config = {
  // Skip Next internals and public files (anything with an extension: icons, logos, manifest).
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
