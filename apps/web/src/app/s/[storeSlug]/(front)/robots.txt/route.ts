import { storeUrl } from "@/server/storefront/page-helpers";
import { getStoreBySlug } from "@/server/stores";

// GET {store host}/robots.txt: the storefront is indexable; the admin and search results are not.
export async function GET(_request: Request, ctx: RouteContext<"/s/[storeSlug]/robots.txt">) {
  const store = await getStoreBySlug((await ctx.params).storeSlug);
  const body =
    store?.status === "active"
      ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /search\n\nSitemap: ${storeUrl(store)}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
