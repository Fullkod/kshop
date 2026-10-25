import { connection } from "next/server";
import { getSitemapPaths } from "@/server/storefront/data";
import { storeUrl } from "@/server/storefront/page-helpers";
import { getStoreBySlug } from "@/server/stores";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// GET {store host}/sitemap.xml (rewritten by the proxy to this route).
// Rendered per request (the data is cached per store): fully cached, the build prerendered it only for a
// placeholder slug and Vercel answered 404 for every real store.
export async function GET(_request: Request, ctx: RouteContext<"/s/[storeSlug]/sitemap.xml">) {
  await connection();
  const store = await getStoreBySlug((await ctx.params).storeSlug);
  if (!store || store.status !== "active") return new Response("Not found", { status: 404 });
  const origin = storeUrl(store);
  const urls = (await getSitemapPaths(store.id))
    .map(
      (u) =>
        `<url><loc>${xml(origin + u.path)}</loc>${u.lastModified ? `<lastmod>${u.lastModified.slice(0, 10)}</lastmod>` : ""}</url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
