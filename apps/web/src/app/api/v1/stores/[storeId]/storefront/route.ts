import { PRODUCT_SORTS } from "@kshop/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, notFound, uuidParam } from "@/server/http";
import { getFacets, getHome, getPage, getProduct, getProducts } from "@/server/storefront/catalog";
import { getStorefrontShell } from "@/server/storefront/data";
import { getStoreById } from "@/server/stores";

// GET /api/v1/stores/{storeId}/storefront?view=…  (public) — the storefront reads of the store app (PRP-7 D3).
// The same cached functions as the web pages, so many phones do not hit the database (anon pg_graphql has a 3 s
// statement timeout): view=store | shell | home | products&filters={…}&sort=&page=&perPage= | facets&filters={…} |
// product&slug= | page&slug=. Short CDN cache; catalog changes expire the server cache at once.

const filtersSchema = z
  .object({
    query: z.string().max(200).nullish(),
    categoryId: z.uuid().nullish(),
    collectionId: z.uuid().nullish(),
    brandIds: z.string().max(2000).nullish(),
    valueIds: z.string().max(4000).nullish(),
    minPrice: z.number().nonnegative().nullish(),
    maxPrice: z.number().nonnegative().nullish(),
    inStock: z.boolean().optional(),
    onSale: z.boolean().optional(),
  })
  .strict();

const querySchema = z.discriminatedUnion("view", [
  z.object({ view: z.enum(["store", "shell", "home"]) }),
  z.object({
    view: z.literal("products"),
    filters: filtersSchema.default({}),
    sort: z.enum(PRODUCT_SORTS).default("newest"),
    page: z.coerce.number().int().min(1).max(500).default(1),
    perPage: z.coerce.number().int().min(1).max(48).optional(),
  }),
  z.object({ view: z.literal("facets"), filters: filtersSchema.default({}) }),
  z.object({ view: z.enum(["product", "page"]), slug: z.string().min(1).max(200) }),
]);

function parseQuery(url: URL) {
  const raw: Record<string, unknown> = Object.fromEntries(url.searchParams);
  if (typeof raw.filters === "string") {
    try {
      raw.filters = JSON.parse(raw.filters);
    } catch {
      raw.filters = null;
    }
  }
  return querySchema.parse(raw);
}

export const GET = apiHandler(
  async (request: Request, ctx: RouteContext<"/api/v1/stores/[storeId]/storefront">) => {
    const storeId = uuidParam.parse((await ctx.params).storeId);
    const store = await getStoreById(storeId);
    if (!store || store.status !== "active") throw notFound("Tienda");
    const q = parseQuery(new URL(request.url));

    let body: unknown;
    switch (q.view) {
      case "store":
        body = store;
        break;
      case "shell":
        body = await getStorefrontShell(storeId);
        break;
      case "home":
        body = await getHome(storeId);
        break;
      case "products":
        body = await getProducts(storeId, q.filters, q.sort, q.page, q.perPage);
        break;
      case "facets":
        body = await getFacets(storeId, q.filters);
        break;
      case "product":
        body = await getProduct(storeId, q.slug);
        break;
      case "page":
        body = await getPage(storeId, q.slug);
        break;
    }
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
    });
  },
);
