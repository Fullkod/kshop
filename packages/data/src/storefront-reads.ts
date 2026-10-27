import {
  currencyCodeSchema,
  homeSectionInputSchema,
  linkHref,
  PRODUCTS_PER_PAGE,
  savingPercent,
  sortOrderBy,
  type BenefitIcon,
  type CurrencyCode,
  type Link,
  type LinkType,
  type ProductSort,
} from "@kshop/core";
import type { ResultOf, VariablesOf } from "@graphql-typed-document-node/core";
import type { Client } from "@urql/core";
import {
  ProductSlugsQuery,
  StorefrontCarouselQuery,
  StorefrontCollectionCarouselQuery,
  StorefrontFacetsQuery,
  StorefrontHomeQuery,
  StorefrontPageQuery,
  StorefrontProductByIdQuery,
  StorefrontProductCardFragment,
  StorefrontProductCountsQuery,
  StorefrontProductCardsQuery,
  StorefrontProductFullFragment,
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
  collections: { id: string; name: string; slug: string; imageUrl: string | null }[];
  pages: { id: string; slug: string; title: string }[];
  currencies: StoreCurrency[];
  /** What the plan turns on in the storefront (multi_currency, vouchers). */
  features: { multiCurrency: boolean; vouchers: boolean };
  /** Slugs by id, to turn typed links (menus, banners) into paths. */
  slugs: Record<string, string>;
  /** Lowest «free over» subtotal of the active shipping methods (base currency), for the cart's progress bar. */
  freeShipping: { from: number; method: string } | null;
  /** Active shipping methods (one per name, the cheapest) and payment methods: product page benefits and delivery. */
  delivery: { methods: DeliveryMethod[]; payments: string[] };
  /** First visible `announcement_bar` section: a band above the header on every page (R5). */
  announcement: Announcement | null;
};

export type Announcement = {
  text: string;
  secondaryText: string | null;
  icon: BenefitIcon;
  link: { href: string; label: string } | null;
};

/** Path of a typed link stored in settings JSON ("" when the target is gone). */
function linkPath(link: Link | null | undefined, slugs: Record<string, string>): string {
  if (!link) return "";
  return link.type === "url" ? link.url : linkHref(link.type, slugs[link.targetId]);
}

/** Product ids among the typed links of some settings (their slugs are read apart from the shell's). */
const productLinkIds = (links: (Link | null | undefined)[]) =>
  links.flatMap((l) => (l && l.type === "product" ? [l.targetId] : []));

/** Settings JSON of the announcement section, validated (pg_graphql returns jsonb as a string). */
function parseAnnouncement(raw: string | null | undefined) {
  const parsed = homeSectionInputSchema.safeParse({
    type: "announcement_bar",
    settings: JSON.parse(raw || "{}"),
  });
  return parsed.success && parsed.data.type === "announcement_bar" ? parsed.data.settings : null;
}

export type DeliveryMethod = {
  name: string;
  type: "delivery" | "pickup" | "to_agree";
  price: number;
  minDays: number | null;
  maxDays: number | null;
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
  const announcement = parseAnnouncement(nodes(d.announcement)[0]?.settings);
  const productIds = [
    ...nodes(d.menusCollection).flatMap((m) =>
      nodes(m.menuItemsCollection).flatMap((i) =>
        i.linkType === "product" && i.linkTargetId ? [i.linkTargetId] : [],
      ),
    ),
    ...productLinkIds([announcement?.link]),
  ];
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
    collections: nodes(d.collectionsCollection).map((c) => ({ ...c, imageUrl: c.imageUrl ?? null })),
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
    freeShipping: (() => {
      const free = nodes(d.shippingMethodsCollection)
        .filter((m) => m.freeOverSubtotal != null)
        .sort((a, b) => Number(a.freeOverSubtotal) - Number(b.freeOverSubtotal))[0];
      return free ? { from: Number(free.freeOverSubtotal), method: free.name } : null;
    })(),
    delivery: {
      // The same method can exist per zone: one entry per name, with its lowest price.
      methods: [
        ...nodes(d.shippingMethodsCollection)
          .reduce((byName, m) => {
            const current = byName.get(m.name);
            if (!current || Number(m.price) < current.price) {
              byName.set(m.name, {
                name: m.name,
                type: m.type as DeliveryMethod["type"],
                price: Number(m.price),
                minDays: m.minDays ?? null,
                maxDays: m.maxDays ?? null,
              });
            }
            return byName;
          }, new Map<string, DeliveryMethod>())
          .values(),
      ],
      payments: nodes(d.paymentMethodsCollection).map((p) => p.name),
    },
    announcement: announcement && {
      text: announcement.text,
      secondaryText: announcement.secondaryText ?? null,
      icon: announcement.icon,
      link: (() => {
        const href = linkPath(announcement.link, slugs);
        return href && announcement.linkLabel ? { href, label: announcement.linkLabel } : null;
      })(),
    },
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
  /** Whole percent saved on the cheapest variant (promotion or compare-at price), or null. */
  discountPercent: number | null;
  /** The store's own label for the product («Nuevo», «Más vendido»). */
  badge: string | null;
  inStock: boolean;
  overrides: PriceOverride[];
  /** Hex colors of the variants' swatch values, without repeats. */
  swatches: string[];
  variantCount: number;
  /** The only variant, when it can be added without choosing (quick add). */
  defaultVariantId: string | null;
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
    products: nodes(connection).map(toProductCard),
  };
}

function toProductCard(p: ResultOf<typeof StorefrontProductCardFragment>): ProductCardData {
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
  const variantNodes = nodes(p.productVariantsCollection);
  const only = variantNodes.length === 1 ? variantNodes[0] : null;
  const swatches = new Set(
    variantNodes.flatMap((v) =>
      nodes(v.variantAttributeValuesCollection).flatMap((o) => {
        const hex = o.attributeValues?.value;
        return hex && HEX.test(hex) ? [hex.toUpperCase()] : [];
      }),
    ),
  );
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
    discountPercent: cheapest?.compareAtPrice
      ? savingPercent(cheapest.compareAtPrice, cheapest.price) || null
      : null,
    badge: p.badge ?? null,
    inStock: p.inStock,
    overrides: cheapest?.overrides ?? [],
    swatches: [...swatches],
    variantCount: variantNodes.length,
    defaultVariantId: only && (!only.trackInventory || only.stockAvailable > 0) ? only.id : null,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

export type CarouselSource =
  | { kind: "all" }
  | { kind: "category"; id: string }
  | { kind: "brand"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "on_sale" };

/** A category and its descendants, from the shell's categories (the ltree subtree, without a query). */
function categorySubtree(categories: { id: string; parentId: string | null }[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const c of categories) if (c.parentId === ids[i] && !ids.includes(c.id)) ids.push(c.id);
  }
  return ids;
}

/**
 * Products of a carousel (home sections, related products of a product). «Todo», category, brand and on sale are a
 * filter pg_graphql turns into an indexed read with the limit (R9); a collection (manual or by rules) still needs
 * the search function, without the totalCount that would run it a second time.
 */
export async function fetchCarousel(
  gql: Client,
  storeId: string,
  source: CarouselSource,
  sort: ProductSort,
  limit: number,
  categories: { id: string; parentId: string | null }[],
): Promise<ProductCardData[]> {
  const orderBy = sortOrderBy(sort);
  if (source.kind === "collection") {
    const result = await gql
      .query(StorefrontCollectionCarouselQuery, { storeId, collectionId: source.id, orderBy, first: limit })
      .toPromise();
    if (result.error) throw result.error;
    return nodes(result.data?.storefrontSearchProducts).map(toProductCard);
  }
  const filter: VariablesOf<typeof StorefrontCarouselQuery>["filter"] = {
    storeId: { eq: storeId },
    status: { eq: "published" },
    ...(source.kind === "category" && { categoryId: { in: categorySubtree(categories, source.id) } }),
    ...(source.kind === "brand" && { brandId: { eq: source.id } }),
    ...(source.kind === "on_sale" && { onSale: { eq: true } }),
  };
  const result = await gql.query(StorefrontCarouselQuery, { filter, orderBy, first: limit }).toPromise();
  if (result.error) throw result.error;
  return nodes(result.data?.productsCollection).map(toProductCard);
}

/** Published product cards by id, in the order given (favorites); unknown or unpublished ids are left out. */
export async function fetchProductCards(
  gql: Client,
  storeId: string,
  ids: string[],
): Promise<ProductCardData[]> {
  if (ids.length === 0) return [];
  const result = await gql
    .query(StorefrontProductCardsQuery, { storeId, ids: [...new Set(ids)] })
    .toPromise();
  if (result.error) throw result.error;
  const cards = new Map(nodes(result.data?.productsCollection).map((p) => [p.id, toProductCard(p)]));
  return ids.flatMap((id) => cards.get(id) ?? []);
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
  return p ? toStorefrontProduct(p) : null;
}

/** The same by id (featured product of the home); null when it is not published. */
export async function fetchProductById(gql: Client, storeId: string, id: string) {
  const result = await gql.query(StorefrontProductByIdQuery, { storeId, id }).toPromise();
  if (result.error) throw result.error;
  const p = nodes(result.data?.productsCollection)[0];
  return p ? toStorefrontProduct(p) : null;
}

function toStorefrontProduct(p: ResultOf<typeof StorefrontProductFullFragment>) {
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
      /** Units left when the variant tracks stock (null = not tracked). */
      stock: v.trackInventory ? v.stockAvailable : null,
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
export type StorefrontProduct = ReturnType<typeof toStorefrontProduct>;

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
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  imageUrl: string;
  imageMobileUrl: string | null;
  alt: string;
  href: string;
  /** Product of the hero's floating mini card (published only). */
  product: ProductCardData | null;
};

type SectionHead = { id: string; title: string | null; eyebrow: string | null };

export type HomeSection = SectionHead &
  (
    | { type: "hero_slider"; banners: BannerData[]; autoplaySeconds: number; whatsapp: boolean }
    | { type: "banner"; banners: BannerData[] }
    | { type: "benefits"; items: { icon: BenefitIcon; title: string; text: string | null }[] }
    | {
        type: "banner_mosaic";
        banners: BannerData[];
        block: {
          eyebrow: string | null;
          title: string;
          text: string | null;
          ctaLabel: string | null;
          href: string;
          bigText: string | null;
        } | null;
      }
    | { type: "product_carousel"; href: string; products: ProductCardData[] }
    | {
        type: "offer_countdown";
        endsAt: string;
        text: string | null;
        href: string;
        products: ProductCardData[];
      }
    | { type: "featured_product"; badge: string | null; product: StorefrontProduct }
    | {
        type: "category_grid";
        categories: { name: string; slug: string; imageUrl: string | null; count: number | null }[];
      }
    | {
        type: "collection_cards";
        collections: { name: string; slug: string; imageUrl: string | null; count: number | null }[];
      }
    | { type: "brand_strip"; brands: { name: string; slug: string; logoUrl: string | null }[] }
    | {
        type: "testimonials";
        items: {
          quote: string;
          name: string;
          place: string | null;
          product: string | null;
          rating: number;
        }[];
        summary: { rating: number; count: number } | null;
      }
    | { type: "rich_text"; markdown: string; link: { href: string; label: string } | null }
  );

type ProductCounts = { categories: Record<string, number>; collections: Record<string, number> };

/** Published products of the categories (subcategories included) and collections shown, in one query. Empty if it
 *  fails: the tiles just omit the number. */
async function fetchProductCounts(
  gql: Client,
  storeId: string,
  categoryIds: string[],
  collectionIds: string[],
): Promise<ProductCounts> {
  if (!categoryIds.length && !collectionIds.length) return { categories: {}, collections: {} };
  const result = await gql
    .query(StorefrontProductCountsQuery, {
      storeId,
      categoryIds: categoryIds.join(",") || null,
      collectionIds: collectionIds.join(",") || null,
    })
    .toPromise();
  const raw = result.error ? null : result.data?.storefrontProductCounts;
  // pg_graphql returns jsonb as a JSON string.
  return raw ? (JSON.parse(raw) as ProductCounts) : { categories: {}, collections: {} };
}

export async function fetchHome(gql: Client, storeId: string): Promise<HomeSection[]> {
  const [result, shell] = await Promise.all([
    gql.query(StorefrontHomeQuery, { storeId }).toPromise(),
    fetchStorefrontShell(gql, storeId),
  ]);
  if (result.error) throw result.error;
  // The announcement bar is drawn above the header from the shell, not in the flow of the home.
  const rows = nodes(result.data?.homeSectionsCollection).filter((r) => r.type !== "announcement_bar");

  // pg_graphql returns jsonb as a JSON string; settings are validated per type. The eyebrow of every section lives in
  // settings as well.
  const parsedRows = rows.map((row) => {
    const settings = JSON.parse(row.settings || "{}") as Record<string, unknown>;
    const parsed = homeSectionInputSchema.safeParse({
      type: row.type,
      title: row.title,
      eyebrow: typeof settings.eyebrow === "string" ? settings.eyebrow : null,
      endsAt: row.endsAt,
      settings,
      bannerIds: nodes(row.homeSectionBannersCollection).map((b) => b.banners?.id ?? ""),
      source: row.sourceCollectionId
        ? { kind: "collection", id: row.sourceCollectionId }
        : row.sourceCategoryId
          ? { kind: "category", id: row.sourceCategoryId }
          : row.sourceBrandId
            ? { kind: "brand", id: row.sourceBrandId }
            : { kind: row.type === "offer_countdown" ? "on_sale" : "all" },
    });
    return { row, input: parsed.success ? parsed.data : null };
  });

  // Slugs and cards that the sections point to, read once for the whole home.
  const banners = rows.flatMap((s) =>
    nodes(s.homeSectionBannersCollection).flatMap((b) => (b.banners ? [b.banners] : [])),
  );
  const settingLinks = parsedRows.flatMap(({ input }) =>
    input?.type === "banner_mosaic"
      ? [input.settings.block?.link]
      : input?.type === "rich_text"
        ? [input.settings.link]
        : [],
  );
  // Stage 2 (R9): everything the sections need, at once: slugs of the linked products, the hero cards, the counts of
  // the tiles shown, the products of every carousel (indexed reads) and the featured product by id.
  const shownCategoryIds = parsedRows.flatMap(({ input }) =>
    input?.type !== "category_grid"
      ? []
      : input.settings.categoryIds.length
        ? input.settings.categoryIds
        : shell.categories.filter((c) => !c.parentId).map((c) => c.id),
  );
  const shownCollectionIds = parsedRows.flatMap(({ input }) =>
    input?.type === "collection_cards" ? input.settings.collectionIds : [],
  );
  const carouselSource = (row: (typeof rows)[number]): CarouselSource =>
    row.sourceCollectionId
      ? { kind: "collection", id: row.sourceCollectionId }
      : row.sourceCategoryId
        ? { kind: "category", id: row.sourceCategoryId }
        : row.sourceBrandId
          ? { kind: "brand", id: row.sourceBrandId }
          : { kind: "all" };
  const [productSlugs, heroProducts, counts, fetched] = await Promise.all([
    fetchProductSlugs(gql, storeId, [
      ...banners.flatMap((b) => (b.linkType === "product" && b.linkTargetId ? [b.linkTargetId] : [])),
      ...productLinkIds(settingLinks),
    ]),
    fetchProductCards(
      gql,
      storeId,
      banners.flatMap((b) => (b.productId ? [b.productId] : [])),
    ),
    fetchProductCounts(gql, storeId, shownCategoryIds, shownCollectionIds),
    Promise.all(
      parsedRows.map(
        async ({
          row,
          input,
        }): Promise<{ cards?: ProductCardData[]; product?: StorefrontProduct | null }> => {
          switch (input?.type) {
            case "product_carousel": {
              const { limit, sort } = input.settings;
              return {
                cards: await fetchCarousel(gql, storeId, carouselSource(row), sort, limit, shell.categories),
              };
            }
            case "offer_countdown": {
              if (!input.endsAt) return {};
              const source: CarouselSource =
                input.source.kind === "collection"
                  ? { kind: "collection", id: input.source.id }
                  : { kind: "on_sale" };
              return {
                cards: await fetchCarousel(
                  gql,
                  storeId,
                  source,
                  "newest",
                  input.settings.limit,
                  shell.categories,
                ),
              };
            }
            case "featured_product":
              return { product: await fetchProductById(gql, storeId, input.settings.productId) };
            default:
              return {};
          }
        },
      ),
    ),
  ]);
  const slugs = { ...shell.slugs, ...productSlugs };
  const toBanner = (b: (typeof banners)[number]): BannerData => ({
    id: b.id,
    eyebrow: b.eyebrow ?? null,
    title: b.title ?? null,
    subtitle: b.subtitle ?? null,
    ctaLabel: b.ctaLabel ?? null,
    imageUrl: b.imageUrl,
    imageMobileUrl: b.imageMobileUrl ?? null,
    alt: b.alt ?? b.title ?? "",
    href: b.linkType
      ? linkHref(b.linkType as LinkType, b.linkTargetId ? slugs[b.linkTargetId] : null, b.linkUrl)
      : "",
    product: heroProducts.find((p) => p.id === b.productId) ?? null,
  });
  const sectionBanners = (row: (typeof rows)[number]) =>
    nodes(row.homeSectionBannersCollection).flatMap((b) => (b.banners ? [toBanner(b.banners)] : []));
  const sourceHref = (kind: "collection" | "category" | "brand", id: string | null | undefined) =>
    id && slugs[id] ? `/${kind}/${slugs[id]}` : "/products";

  const sections = parsedRows.map(({ row, input }, i): HomeSection | null => {
    if (!input) return null;
    const head: SectionHead = { id: row.id, title: row.title ?? null, eyebrow: input.eyebrow ?? null };
    switch (input.type) {
      case "hero_slider": {
        const list = sectionBanners(row);
        if (!list.length) return null;
        const { autoplaySeconds, whatsapp } = input.settings;
        return { ...head, type: "hero_slider", banners: list, autoplaySeconds, whatsapp };
      }
      case "banner": {
        const list = sectionBanners(row);
        return list.length ? { ...head, type: "banner", banners: list } : null;
      }
      case "benefits":
        return {
          ...head,
          type: "benefits",
          items: input.settings.items.map((i) => ({ icon: i.icon, title: i.title, text: i.text ?? null })),
        };
      case "banner_mosaic": {
        const list = sectionBanners(row);
        if (!list.length) return null;
        const block = input.settings.block;
        return {
          ...head,
          type: "banner_mosaic",
          banners: list,
          block: block && {
            eyebrow: block.eyebrow ?? null,
            title: block.title,
            text: block.text ?? null,
            ctaLabel: block.ctaLabel ?? null,
            href: linkPath(block.link, slugs),
            bigText: block.bigText ?? null,
          },
        };
      }
      case "product_carousel": {
        const products = fetched[i]?.cards ?? [];
        if (!products.length) return null;
        const href = row.sourceCollectionId
          ? sourceHref("collection", row.sourceCollectionId)
          : row.sourceCategoryId
            ? sourceHref("category", row.sourceCategoryId)
            : sourceHref("brand", row.sourceBrandId);
        return { ...head, type: "product_carousel", href, products };
      }
      case "offer_countdown": {
        if (!input.endsAt) return null;
        const collectionId = input.source.kind === "collection" ? input.source.id : null;
        const products = fetched[i]?.cards ?? [];
        if (!products.length) return null;
        return {
          ...head,
          type: "offer_countdown",
          endsAt: input.endsAt,
          text: input.settings.text ?? null,
          href: collectionId ? sourceHref("collection", collectionId) : "/products?sale=1",
          products,
        };
      }
      case "featured_product": {
        const product = fetched[i]?.product ?? null;
        return product
          ? { ...head, type: "featured_product", badge: input.settings.badge ?? null, product }
          : null;
      }
      case "category_grid": {
        const ids = input.settings.categoryIds;
        const list = ids.length
          ? ids.flatMap((id) => shell.categories.find((c) => c.id === id) ?? [])
          : shell.categories.filter((c) => !c.parentId);
        if (!list.length) return null;
        const categories = list.map((c) => ({
          name: c.name,
          slug: c.slug,
          imageUrl: c.imageUrl,
          count: counts.categories[c.id] ?? null,
        }));
        return { ...head, type: "category_grid", categories };
      }
      case "collection_cards": {
        const list = input.settings.collectionIds.flatMap(
          (id) => shell.collections.find((c) => c.id === id) ?? [],
        );
        if (!list.length) return null;
        const collections = list.map((c) => ({
          name: c.name,
          slug: c.slug,
          imageUrl: c.imageUrl,
          count: counts.collections[c.id] ?? null,
        }));
        return { ...head, type: "collection_cards", collections };
      }
      case "brand_strip":
        return shell.brands.length ? { ...head, type: "brand_strip", brands: shell.brands } : null;
      case "testimonials":
        return {
          ...head,
          type: "testimonials",
          items: input.settings.items.map((t) => ({
            quote: t.quote,
            name: t.name,
            place: t.place ?? null,
            product: t.product ?? null,
            rating: t.rating,
          })),
          summary: input.settings.summary,
        };
      case "rich_text": {
        const href = linkPath(input.settings.link, slugs);
        return {
          ...head,
          type: "rich_text",
          markdown: input.settings.markdown,
          link: href && input.settings.linkLabel ? { href, label: input.settings.linkLabel } : null,
        };
      }
      default:
        return null;
    }
  });
  return sections.filter((s): s is HomeSection => s !== null);
}
