import { PRODUCT_SORTS, type ProductSort } from "./content";

// Listing state <-> query string (D10): /products?talla=m,l&color=rojo&price=500-2000&sort=price-asc&page=2.
// Attribute filters use the attribute and value slugs (store data); the other keys are fixed.

export const PRODUCTS_PER_PAGE = 24;

export const SORT_LABELS: Record<ProductSort, string> = {
  newest: "Novedades",
  "price-asc": "Precio: menor a mayor",
  "price-desc": "Precio: mayor a menor",
  name: "Nombre",
};

const RESERVED = new Set(["q", "page", "sort", "price", "brand", "stock", "sale"]);

/** Query key of an attribute (prefixed when its slug collides with a fixed key). */
export const attributeParam = (slug: string) => (RESERVED.has(slug) ? `attr-${slug}` : slug);

export type FilterableAttribute = { id: string; slug: string; values: { id: string; slug: string }[] };
export type FilterableBrand = { id: string; slug: string };

export type ListingState = {
  query: string;
  page: number;
  sort: ProductSort;
  /** Selected value slugs per attribute slug. */
  values: Record<string, string[]>;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStock: boolean;
  onSale: boolean;
};

export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = (v: string | string[] | undefined) =>
  first(v)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export function parseListingParams(params: SearchParams, attributes: { slug: string }[]): ListingState {
  const page = Number.parseInt(first(params.page), 10);
  const sort = first(params.sort) as ProductSort;
  const [min, max] = first(params.price)
    .split("-")
    .map((x) => (x.trim() === "" ? null : Number(x)));
  const price = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n >= 0 ? n : null);
  const values: Record<string, string[]> = {};
  for (const a of attributes) {
    const selected = list(params[attributeParam(a.slug)]);
    if (selected.length) values[a.slug] = selected;
  }
  return {
    query: first(params.q).trim().slice(0, 100),
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 1000) : 1,
    sort: (PRODUCT_SORTS as readonly string[]).includes(sort) ? sort : "newest",
    values,
    brands: list(params.brand),
    minPrice: price(min),
    maxPrice: price(max),
    inStock: first(params.stock) === "1",
    onSale: first(params.sale) === "1",
  };
}

/** Query string of a listing state ("" when it is the default). Keys in a stable order for caching. */
export function listingQuery(state: Partial<ListingState>): string {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const [slug, selected] of Object.entries(state.values ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (selected.length) params.set(attributeParam(slug), [...selected].sort().join(","));
  }
  if (state.brands?.length) params.set("brand", [...state.brands].sort().join(","));
  if (state.minPrice != null || state.maxPrice != null) {
    params.set("price", `${state.minPrice ?? ""}-${state.maxPrice ?? ""}`);
  }
  if (state.inStock) params.set("stock", "1");
  if (state.onSale) params.set("sale", "1");
  if (state.sort && state.sort !== "newest") params.set("sort", state.sort);
  if (state.page && state.page > 1) params.set("page", String(state.page));
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `?${query}` : "";
}

/** Ids for storefront_search_products / storefront_product_facets (unknown slugs are dropped). */
export function listingFilterIds(
  state: ListingState,
  attributes: FilterableAttribute[],
  brands: FilterableBrand[],
): { valueIds: string | null; brandIds: string | null } {
  const valueIds = attributes.flatMap((a) =>
    (state.values[a.slug] ?? []).flatMap((slug) => a.values.find((v) => v.slug === slug)?.id ?? []),
  );
  const brandIds = state.brands.flatMap((slug) => brands.find((b) => b.slug === slug)?.id ?? []);
  return {
    valueIds: valueIds.length ? valueIds.join(",") : null,
    brandIds: brandIds.length ? brandIds.join(",") : null,
  };
}

/** pg_graphql orderBy for a sort option. */
export function sortOrderBy(sort: ProductSort) {
  switch (sort) {
    case "price-asc":
      return [{ minPrice: "AscNullsLast" as const }, { name: "AscNullsLast" as const }];
    case "price-desc":
      return [{ minPrice: "DescNullsLast" as const }, { name: "AscNullsLast" as const }];
    case "name":
      return [{ name: "AscNullsLast" as const }];
    default:
      return [{ publishedAt: "DescNullsLast" as const }, { name: "AscNullsLast" as const }];
  }
}
