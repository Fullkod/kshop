import "server-only";
import {
  homeSectionInputSchema,
  linkHref,
  PRODUCTS_PER_PAGE,
  sortOrderBy,
  type LinkType,
  type ProductSort,
} from "@kshop/core";
import {
  StorefrontFacetsQuery,
  StorefrontHomeQuery,
  StorefrontPageQuery,
  StorefrontProductQuery,
  StorefrontProductsQuery,
} from "@kshop/data";
import { anonGraphql, getProductSlugs, getStorefrontShell, storefrontCache } from "./data";

// Cached public reads of the catalog and content of one store (keys = arguments, tags = the store).

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  /** Highest "before" price among the variants that are on sale. */
  compareAtPrice: number | null;
  inStock: boolean;
  overrides: { currency: string; price: number }[];
};

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

export async function getProducts(
  storeId: string,
  filters: ProductFilters,
  sort: ProductSort,
  page: number,
  perPage = PRODUCTS_PER_PAGE,
): Promise<{ total: number; products: ProductCardData[] }> {
  "use cache";
  storefrontCache(storeId);
  const result = await anonGraphql
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
      const variants = nodes(p.productVariantsCollection);
      const onSale = variants.filter(
        (v) => v.compareAtPrice != null && Number(v.compareAtPrice) > Number(v.price),
      );
      const cheapest = [...variants].sort((a, b) => Number(a.price) - Number(b.price))[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brands?.name ?? null,
        imageUrl: p.primaryMediaUrl ?? null,
        minPrice: Number(p.minPrice ?? 0),
        maxPrice: Number(p.maxPrice ?? 0),
        compareAtPrice: onSale.length ? Math.max(...onSale.map((v) => Number(v.compareAtPrice))) : null,
        inStock: p.inStock,
        overrides: nodes(cheapest?.variantPricesCollection).map((o) => ({
          currency: String(o.currency),
          price: Number(o.price),
        })),
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

export async function getFacets(storeId: string, filters: ProductFilters): Promise<Facets> {
  "use cache";
  storefrontCache(storeId);
  const result = await anonGraphql
    .query(StorefrontFacetsQuery, { storeId, ...filterVariables(filters) })
    .toPromise();
  if (result.error) throw result.error;
  // pg_graphql returns jsonb as a JSON string.
  const raw = result.data?.storefrontProductFacets;
  const facets = (raw ? JSON.parse(raw) : null) as Facets | null;
  return facets ?? { total: 0, price: { min: null, max: null }, brands: [], attributes: [] };
}

/** Filterable attributes of a store with every value (to read attribute filters from the URL). */
export async function getFilterableAttributes(storeId: string): Promise<Facets["attributes"]> {
  return (await getFacets(storeId, {})).attributes;
}

export async function getProduct(storeId: string, slug: string) {
  "use cache";
  storefrontCache(storeId);
  const result = await anonGraphql.query(StorefrontProductQuery, { storeId, slug }).toPromise();
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
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
      available: !v.trackInventory || v.stockAvailable > 0,
      overrides: nodes(v.variantPricesCollection).map((o) => ({
        currency: String(o.currency),
        price: Number(o.price),
      })),
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
export type StorefrontProduct = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

export async function getPage(storeId: string, slug: string) {
  "use cache";
  storefrontCache(storeId);
  const result = await anonGraphql.query(StorefrontPageQuery, { storeId, slug }).toPromise();
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

export async function getHome(storeId: string): Promise<HomeSection[]> {
  "use cache";
  storefrontCache(storeId);
  const [result, shell] = await Promise.all([
    anonGraphql.query(StorefrontHomeQuery, { storeId }).toPromise(),
    getStorefrontShell(storeId),
  ]);
  if (result.error) throw result.error;
  const rows = nodes(result.data?.homeSectionsCollection);

  const banners = rows.flatMap((s) =>
    nodes(s.homeSectionBannersCollection).flatMap((b) => (b.banners ? [b.banners] : [])),
  );
  const productSlugs = await getProductSlugs(
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
          const { products } = await getProducts(storeId, filters, settings.sort, 1, settings.limit);
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
