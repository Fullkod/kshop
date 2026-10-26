import {
  currencyCodeSchema,
  homeSectionInputSchema,
  linkHref,
  PRODUCTS_PER_PAGE,
  savingPercent,
  sortOrderBy,
  type CurrencyCode,
  type LinkType,
  type ProductSort,
} from "@kshop/core";
import type { ResultOf } from "@graphql-typed-document-node/core";
import type { Client } from "@urql/core";
import {
  ProductSlugsQuery,
  StorefrontFacetsQuery,
  StorefrontHomeQuery,
  StorefrontPageQuery,
  StorefrontProductQuery,
  StorefrontProductsQuery,
  StorefrontShellQuery,
  StorefrontSitemapQuery,
} from "./storefront-queries";

// Public storefront reads (anon pg_graphql) shared by the web and the store app (PRP-7 D3): same queries, same
// prices, promotions and stock. No caching here: the web wraps each one in "use cache" with the store's tags; the
// app caches on the device.

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);

export type NavLink = { label: string; href: string; children: NavLink[] };
export type StoreCurrency = {
  currency: CurrencyCode;
  isBase: boolean;
  rateToBase: number;
  rounding: number | null;
};
export type StorefrontShell = {
  header: NavLink[];
  footer: NavLink[];
  categories: { id: string; parentId: string | null; name: string; slug: string; imageUrl: string | null }[];
  brands: { id: string; name: string; slug: string; logoUrl: string | null }[];
  collections: { id: string; name: string; slug: string }[];
  pages: { id: string; slug: string; title: string }[];
  currencies: StoreCurrency[];
  /** What the plan turns on in the storefront (multi_currency, vouchers). */
  features: { multiCurrency: boolean; vouchers: boolean };
  /** Slugs by id, to turn typed links (menus, banners) into paths. */
  slugs: Record<string, string>;
};

export async function fetchStorefrontShell(gql: Client, storeId: string): Promise<StorefrontShell> {
  const result = await gql.query(StorefrontShellQuery, { storeId }).toPromise();
  if (result.error || !result.data) throw result.error ?? new Error("Storefront shell not available");
  const d = result.data;
  // pg_graphql returns jsonb as a JSON string.
  const features = JSON.parse(d.storefrontFeatures ?? "{}") as {
    multi_currency?: boolean;
    vouchers?: boolean;
  };

  const categories = nodes(d.categoriesCollection).map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    name: c.name,
    slug: c.slug,
    imageUrl: c.imageUrl ?? null,
  }));
  const brands = nodes(d.brandsCollection).map((b) => ({ ...b, logoUrl: b.logoUrl ?? null }));
  const slugs: Record<string, string> = Object.fromEntries([
    ...categories.map((c) => [c.id, c.slug]),
    ...brands.map((b) => [b.id, b.slug]),
    ...nodes(d.collectionsCollection).map((c) => [c.id, c.slug]),
    ...nodes(d.pagesCollection).map((p) => [p.id, p.slug]),
  ]);
  const productIds = nodes(d.menusCollection).flatMap((m) =>
    nodes(m.menuItemsCollection).flatMap((i) =>
      i.linkType === "product" && i.linkTargetId ? [i.linkTargetId] : [],
    ),
  );
  Object.assign(slugs, await fetchProductSlugs(gql, storeId, productIds));

  const menu = (location: "header" | "footer"): NavLink[] => {
    const items = nodes(nodes(d.menusCollection).find((m) => m.location === location)?.menuItemsCollection);
    const toLink = (i: (typeof items)[number]): NavLink | null => {
      const href = linkHref(i.linkType as LinkType, i.linkTargetId ? slugs[i.linkTargetId] : null, i.linkUrl);
      return href ? { label: i.label, href, children: [] } : null;
    };
    // Items pointing to something unpublished are dropped (and their children with them).
    return items.flatMap((parent) => {
      if (parent.parentId) return [];
      const link = toLink(parent);
      if (!link) return [];
      link.children = items.filter((c) => c.parentId === parent.id).flatMap((c) => toLink(c) ?? []);
      return [link];
    });
  };

  return {
    header: menu("header"),
    footer: menu("footer"),
    categories,
    brands,
    collections: nodes(d.collectionsCollection),
    pages: nodes(d.pagesCollection),
    // Without multi_currency (e.g. after moving down to Base) the extra currencies are kept but not offered.
    currencies: nodes(d.storeCurrenciesCollection)
      .filter((c) => c.isBase || features.multi_currency)
      .map((c) => ({
        currency: currencyCodeSchema.parse(c.currency),
        isBase: c.isBase,
        rateToBase: Number(c.rateToBase),
        rounding: c.rounding == null ? null : Number(c.rounding),
      })),
    features: { multiCurrency: !!features.multi_currency, vouchers: !!features.vouchers },
    slugs,
  };
}

/** Slugs of published products by id (links to products from menus and banners). */
export async function fetchProductSlugs(
  gql: Client,
  storeId: string,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const result = await gql.query(ProductSlugsQuery, { storeId, ids: [...new Set(ids)] }).toPromise();
  return Object.fromEntries(nodes(result.data?.productsCollection).map((p) => [p.id, p.slug]));
}

/** Paths of every public page of a store (sitemap), with the last change of products. */
export async function fetchSitemapPaths(
  gql: Client,
  storeId: string,
): Promise<{ path: string; lastModified?: string }[]> {
  const shell = await fetchStorefrontShell(gql, storeId);
  const paths: { path: string; lastModified?: string }[] = [
    { path: "/" },
    { path: "/products" },
    ...shell.categories.map((c) => ({ path: `/category/${c.slug}` })),
    ...shell.collections.map((c) => ({ path: `/collection/${c.slug}` })),
    ...shell.brands.map((b) => ({ path: `/brand/${b.slug}` })),
    ...shell.pages.map((p) => ({ path: `/page/${p.slug}` })),
  ];
  // Products, 100 per request (max_rows of pg_graphql).
  let after: string | null = null;
  for (let i = 0; i < 200; i++) {
    const result = await gql.query(StorefrontSitemapQuery, { storeId, after }).toPromise();
    const connection: ResultOf<typeof StorefrontSitemapQuery>["productsCollection"] | undefined =
      result.data?.productsCollection;
    for (const p of nodes(connection)) paths.push({ path: `/product/${p.slug}`, lastModified: p.updatedAt });
    if (!connection?.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor ?? null;
  }
  return paths;
}

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  /** "Before" price of the cheapest variant (its compare-at price, or its price when a promotion lowers it). */
  compareAtPrice: number | null;
  compareAtOverrides: PriceOverride[];
  /** "-20 %" for a promotion, "Oferta" for a compare-at price. */
  badge: string | null;
  inStock: boolean;
  overrides: PriceOverride[];
};

export type PriceOverride = { currency: string; price: number };
type VariantPromotion =
  { promoPrice: unknown; reward: unknown; value: unknown; promotionName: string } | null | undefined;

/**
 * Storefront price of a variant with its materialized promotion (PRP-4 D3/D4): the promotion price in the base
 * currency and the per-currency overrides lowered by the same percent (a fixed reward drops the overrides so the
 * base price is converted). The cart and the checkout always price again in SQL.
 */
function withPromotion(
  price: number,
  compareAt: number | null,
  overrides: PriceOverride[],
  promo: VariantPromotion,
) {
  const listCompare = compareAt != null && compareAt > price ? compareAt : null;
  if (!promo) {
    return {
      price,
      overrides,
      compareAtPrice: listCompare,
      compareAtOverrides: [],
      badge: listCompare ? "Oferta" : null,
      promotionName: null,
    };
  }
  const promoPrice = Number(promo.promoPrice);
  const value = Number(promo.value);
  const before = listCompare ?? price;
  return {
    price: promoPrice,
    overrides:
      String(promo.reward) === "percent"
        ? overrides.map((o) => ({ ...o, price: Math.round(o.price * (100 - value)) / 100 }))
        : [],
    compareAtPrice: before,
    compareAtOverrides: listCompare ? [] : overrides,
    badge: `-${savingPercent(before, promoPrice)} %`,
    promotionName: promo.promotionName,
  };
}

export type ProductFilters = {
  query?: string | null;
  categoryId?: string | null;
  collectionId?: string | null;
  brandIds?: string | null;
  valueIds?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  onSale?: boolean;
};

const filterVariables = (f: ProductFilters) => ({
  query: f.query || null,
  categoryId: f.categoryId ?? null,
  collectionId: f.collectionId ?? null,
  brandIds: f.brandIds ?? null,
  valueIds: f.valueIds ?? null,
  minPrice: f.minPrice != null ? String(f.minPrice) : null,
  maxPrice: f.maxPrice != null ? String(f.maxPrice) : null,
  inStock: f.inStock || null,
  onSale: f.onSale || null,
});

export async function fetchProducts(
  gql: Client,
  storeId: string,
  filters: ProductFilters,
  sort: ProductSort,
  page: number,
  perPage = PRODUCTS_PER_PAGE,
): Promise<{ total: number; products: ProductCardData[] }> {
  const result = await gql
    .query(StorefrontProductsQuery, {
      storeId,
      ...filterVariables(filters),
      orderBy: sortOrderBy(sort),
      first: perPage,
      offset: (page - 1) * perPage,
    })
    .toPromise();
  if (result.error) throw result.error;
  const connection = result.data?.storefrontSearchProducts;
  return {
    total: connection?.totalCount ?? 0,
    products: nodes(connection).map((p) => {
      const variants = nodes(p.productVariantsCollection).map((v) =>
        withPromotion(
          Number(v.price),
          v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
          nodes(v.variantPricesCollection).map((o) => ({
            currency: String(o.currency),
            price: Number(o.price),
          })),
          v.variantPromotions,
        ),
      );
      const cheapest = [...variants].sort((a, b) => a.price - b.price)[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brands?.name ?? null,
        imageUrl: p.primaryMediaUrl ?? null,
        minPrice: Number(p.minPrice ?? 0),
        maxPrice: Number(p.maxPrice ?? 0),
        compareAtPrice: cheapest?.compareAtPrice ?? null,
        compareAtOverrides: cheapest?.compareAtOverrides ?? [],
        badge: cheapest?.badge ?? null,
        inStock: p.inStock,
        overrides: cheapest?.overrides ?? [],
      };
    }),
  };
}

export type Facets = {
  total: number;
  price: { min: number | null; max: number | null };
  brands: { id: string; name: string; slug: string; count: number; selected: boolean }[];
  attributes: {
    id: string;
    name: string;
    slug: string;
    inputType: string;
    unit: string | null;
    values: {
      id: string;
      name: string;
      slug: string;
      value: string | null;
      count: number;
      selected: boolean;
    }[];
  }[];
};

export async function fetchFacets(gql: Client, storeId: string, filters: ProductFilters): Promise<Facets> {
  const result = await gql.query(StorefrontFacetsQuery, { storeId, ...filterVariables(filters) }).toPromise();
  if (result.error) throw result.error;
  // pg_graphql returns jsonb as a JSON string.
  const raw = result.data?.storefrontProductFacets;
  const facets = (raw ? JSON.parse(raw) : null) as Facets | null;
  return facets ?? { total: 0, price: { min: null, max: null }, brands: [], attributes: [] };
}

export async function fetchProduct(gql: Client, storeId: string, slug: string) {
  const result = await gql.query(StorefrontProductQuery, { storeId, slug }).toPromise();
  if (result.error) throw result.error;
  const p = nodes(result.data?.productsCollection)[0];
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.descriptionPlain,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    minPrice: Number(p.minPrice ?? 0),
    inStock: p.inStock,
    imageUrl: p.primaryMediaUrl ?? null,
    brand: p.brands ? { name: p.brands.name, slug: p.brands.slug } : null,
    category: p.categories ? { id: p.categories.id, name: p.categories.name, slug: p.categories.slug } : null,
    media: nodes(p.productMediaCollection).map((m) => ({
      id: m.id,
      url: m.url,
      thumbUrl: m.thumbUrl ?? null,
      alt: m.alt ?? null,
    })),
    attributes: nodes(p.productAttributeValuesCollection)
      .filter((a) => a.attributes?.visibleInStorefront !== false)
      .map((a) => ({
        name: a.attributes?.name ?? "",
        sortOrder: a.attributes?.sortOrder ?? 0,
        value:
          a.attributeValues?.name ??
          a.valueText ??
          (a.valueNumeric != null
            ? `${a.valueNumeric}${a.attributes?.unit ? ` ${a.attributes.unit}` : ""}`
            : null) ??
          (a.valueBoolean != null ? (a.valueBoolean ? "Sí" : "No") : null) ??
          a.valueDate ??
          "",
      }))
      // A multiselect has one row per value: join them under one name.
      .reduce<{ name: string; sortOrder: number; value: string }[]>((acc, a) => {
        const existing = acc.find((x) => x.name === a.name);
        if (existing) existing.value = `${existing.value}, ${a.value}`;
        else acc.push(a);
        return acc;
      }, [])
      .sort((a, b) => a.sortOrder - b.sortOrder),
    variants: nodes(p.productVariantsCollection).map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      ...withPromotion(
        Number(v.price),
        v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
        nodes(v.variantPricesCollection).map((o) => ({
          currency: String(o.currency),
          price: Number(o.price),
        })),
        v.variantPromotions,
      ),
      available: !v.trackInventory || v.stockAvailable > 0,
      mediaIds: nodes(v.variantMediaCollection).map((m) => m.mediaId),
      options: nodes(v.variantAttributeValuesCollection).flatMap((o) =>
        o.attributeValues
          ? [
              {
                attributeId: o.attributeId,
                attribute: o.attributeValues.attributes?.name ?? "",
                attributeSort: o.attributeValues.attributes?.sortOrder ?? 0,
                valueId: o.valueId,
                value: o.attributeValues.name,
                valueSort: o.attributeValues.sortOrder,
                swatch: o.attributeValues.value ?? null,
              },
            ]
          : [],
      ),
    })),
  };
}
export type StorefrontProduct = NonNullable<Awaited<ReturnType<typeof fetchProduct>>>;

export async function fetchPage(gql: Client, storeId: string, slug: string) {
  const result = await gql.query(StorefrontPageQuery, { storeId, slug }).toPromise();
  if (result.error) throw result.error;
  const page = nodes(result.data?.pagesCollection)[0];
  return page
    ? {
        title: page.title,
        content: page.content,
        seoTitle: page.seoTitle ?? null,
        seoDescription: page.seoDescription ?? null,
      }
    : null;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export type BannerData = {
  id: string;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  imageUrl: string;
  imageMobileUrl: string | null;
  alt: string;
  href: string;
};

export type HomeSection =
  | {
      id: string;
      type: "hero_slider" | "banner";
      title: string | null;
      banners: BannerData[];
      autoplaySeconds: number;
    }
  | { id: string; type: "product_carousel"; title: string | null; href: string; products: ProductCardData[] }
  | {
      id: string;
      type: "category_grid";
      title: string | null;
      categories: { name: string; slug: string; imageUrl: string | null }[];
    }
  | {
      id: string;
      type: "brand_strip";
      title: string | null;
      brands: { name: string; slug: string; logoUrl: string | null }[];
    }
  | { id: string; type: "rich_text"; title: string | null; markdown: string };

export async function fetchHome(gql: Client, storeId: string): Promise<HomeSection[]> {
  const [result, shell] = await Promise.all([
    gql.query(StorefrontHomeQuery, { storeId }).toPromise(),
    fetchStorefrontShell(gql, storeId),
  ]);
  if (result.error) throw result.error;
  const rows = nodes(result.data?.homeSectionsCollection);

  const banners = rows.flatMap((s) =>
    nodes(s.homeSectionBannersCollection).flatMap((b) => (b.banners ? [b.banners] : [])),
  );
  const productSlugs = await fetchProductSlugs(
    gql,
    storeId,
    banners.flatMap((b) => (b.linkType === "product" && b.linkTargetId ? [b.linkTargetId] : [])),
  );
  const slugs = { ...shell.slugs, ...productSlugs };
  const toBanner = (b: (typeof banners)[number]): BannerData => ({
    id: b.id,
    title: b.title ?? null,
    subtitle: b.subtitle ?? null,
    ctaLabel: b.ctaLabel ?? null,
    imageUrl: b.imageUrl,
    imageMobileUrl: b.imageMobileUrl ?? null,
    alt: b.alt ?? b.title ?? "",
    href: b.linkType
      ? linkHref(b.linkType as LinkType, b.linkTargetId ? slugs[b.linkTargetId] : null, b.linkUrl)
      : "",
  });

  const sections = await Promise.all(
    rows.map(async (row): Promise<HomeSection | null> => {
      // pg_graphql returns jsonb as a JSON string; settings are validated per type.
      const parsed = homeSectionInputSchema.safeParse({
        type: row.type,
        title: row.title,
        settings: JSON.parse(row.settings || "{}"),
        bannerIds: nodes(row.homeSectionBannersCollection).map((b) => b.banners?.id ?? ""),
        source: row.sourceCollectionId
          ? { kind: "collection", id: row.sourceCollectionId }
          : row.sourceCategoryId
            ? { kind: "category", id: row.sourceCategoryId }
            : row.sourceBrandId
              ? { kind: "brand", id: row.sourceBrandId }
              : { kind: "all" },
      });
      const title = row.title ?? null;
      switch (row.type) {
        case "hero_slider":
        case "banner": {
          const list = nodes(row.homeSectionBannersCollection).flatMap((b) =>
            b.banners ? [toBanner(b.banners)] : [],
          );
          if (!list.length) return null;
          const autoplay =
            parsed.success && parsed.data.type === "hero_slider" ? parsed.data.settings.autoplaySeconds : 0;
          return { id: row.id, type: row.type, title, banners: list, autoplaySeconds: autoplay };
        }
        case "product_carousel": {
          const settings =
            parsed.success && parsed.data.type === "product_carousel"
              ? parsed.data.settings
              : { limit: 8, sort: "newest" as const };
          const filters: ProductFilters = {
            collectionId: row.sourceCollectionId ?? null,
            categoryId: row.sourceCategoryId ?? null,
            brandIds: row.sourceBrandId ?? null,
          };
          const { products } = await fetchProducts(gql, storeId, filters, settings.sort, 1, settings.limit);
          if (!products.length) return null;
          const sourceId = row.sourceCollectionId ?? row.sourceCategoryId ?? row.sourceBrandId;
          const kind = row.sourceCollectionId ? "collection" : row.sourceCategoryId ? "category" : "brand";
          const href = sourceId && slugs[sourceId] ? `/${kind}/${slugs[sourceId]}` : "/products";
          return { id: row.id, type: "product_carousel", title, href, products };
        }
        case "category_grid": {
          const ids =
            parsed.success && parsed.data.type === "category_grid" ? parsed.data.settings.categoryIds : [];
          const categories = ids.length
            ? ids.flatMap((id) => shell.categories.find((c) => c.id === id) ?? [])
            : shell.categories.filter((c) => !c.parentId);
          if (!categories.length) return null;
          return { id: row.id, type: "category_grid", title, categories };
        }
        case "brand_strip":
          return shell.brands.length
            ? { id: row.id, type: "brand_strip", title, brands: shell.brands }
            : null;
        case "rich_text":
          return parsed.success && parsed.data.type === "rich_text"
            ? { id: row.id, type: "rich_text", title, markdown: parsed.data.settings.markdown }
            : null;
        default:
          return null;
      }
    }),
  );
  return sections.filter((s): s is HomeSection => s !== null);
}
