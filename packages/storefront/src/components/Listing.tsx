import { ChevronRight, chipVariants, SlidersHorizontal, X } from "@kshop/ui";
import {
  listingFilterIds,
  listingQuery,
  parseListingParams,
  PRODUCTS_PER_PAGE,
  type ListingState,
  type ProductSort,
  type SearchParams,
} from "@kshop/core";
import type { Facets, ProductCardData, ProductFilters } from "@kshop/data";
import { Link } from "../navigation";
import { PriceFilter, SortSelect } from "./ListingControls";
import { ProductGrid } from "./ProductCard";

export type Crumb = { label: string; href?: string };

/** How a listing reads its data: cached server functions on the web, direct reads (+ device cache) in the app. */
export type ListingReader = {
  products: (
    filters: ProductFilters,
    sort: ProductSort,
    page: number,
  ) => Promise<{ total: number; products: ProductCardData[] }>;
  facets: (filters: ProductFilters) => Promise<Facets>;
};

export type ListingData = {
  state: ListingState;
  /** Facets without the URL filters: every filterable attribute and brand of this listing (chips). */
  all: Facets;
  facets: Facets;
  total: number;
  products: ProductCardData[];
};

/** Everything comes from the URL (shareable, crawlable): the query string decides filters, sort and page. */
export async function loadListing(
  read: ListingReader,
  fixed: Pick<ProductFilters, "categoryId" | "collectionId" | "brandIds">,
  searchParams: SearchParams,
): Promise<ListingData> {
  // Common case, no filters in the URL: the listing only depends on `fixed`, so the products and the one
  // facets query run in parallel (otherwise the attribute slugs must be known before filtering: LCP).
  const unfiltered = Object.keys(searchParams).every((key) => key === "page" || key === "sort");
  const plain = parseListingParams(searchParams, []);
  const [all, unfilteredProducts] = await Promise.all([
    read.facets(fixed),
    unfiltered ? read.products(fixed, plain.sort, plain.page) : null,
  ]);
  const state = unfiltered ? plain : parseListingParams(searchParams, all.attributes);
  const ids = listingFilterIds(state, all.attributes, all.brands);
  const filters: ProductFilters = {
    ...fixed,
    query: state.query,
    valueIds: ids.valueIds,
    brandIds: fixed.brandIds ?? ids.brandIds,
    minPrice: state.minPrice,
    maxPrice: state.maxPrice,
    inStock: state.inStock,
    onSale: state.onSale,
  };
  const [{ total, products }, facets] = unfilteredProducts
    ? [unfilteredProducts, all]
    : await Promise.all([read.products(filters, state.sort, state.page), read.facets(filters)]);
  return { state, all, facets, total, products };
}

/** Products of a listing page with its filter panel. */
export function ListingView({
  data: { state, all, facets, total, products },
  basePath,
  currency,
  hideBrandFacet,
}: {
  data: ListingData;
  basePath: string;
  currency: string;
  hideBrandFacet?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / PRODUCTS_PER_PAGE));
  const href = (next: Partial<ListingState>) => `${basePath}${listingQuery({ ...state, page: 1, ...next })}`;
  const chips = activeFilters(state, all, hideBrandFacet);

  const panel = (
    <FilterPanel
      state={state}
      facets={facets}
      href={href}
      basePath={basePath}
      currency={currency}
      hideBrandFacet={hideBrandFacet}
    />
  );

  return (
    <div className="flex flex-col gap-6 @min-[1000px]:flex-row @min-[1000px]:gap-10">
      <aside className="hidden w-60 shrink-0 @min-[1000px]:block">{panel}</aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total === 1 ? "1 producto" : `${total} productos`}
          </p>
          <div className="flex items-center gap-2">
            <details className="@min-[1000px]:hidden">
              <summary
                className={chipVariants({ className: "list-none [&::-webkit-details-marker]:hidden" })}
              >
                <SlidersHorizontal size={14} aria-hidden />
                Filtros{chips.length ? ` (${chips.length})` : ""}
              </summary>
              <div className="fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] overflow-y-auto rounded-t-sf-lg border-t border-border bg-background p-4 shadow-sf-lg">
                {panel}
              </div>
            </details>
            <SortSelect basePath={basePath} state={state} />
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Filtros activos">
            {chips.map((chip) => (
              <li key={chip.label}>
                <Link href={href(chip.remove)} rel="nofollow" className={chipVariants({ active: true })}>
                  {chip.label} <X size={14} aria-hidden />
                  <span className="sr-only">(quitar)</span>
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={basePath}
                rel="nofollow"
                className="inline-flex h-[34px] items-center px-2 text-[13px] underline"
              >
                Quitar todo
              </Link>
            </li>
          </ul>
        )}

        <h2 className="sr-only">Productos</h2>
        {products.length ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : (
          <div className="rounded-sf border border-dashed border-border px-6 py-16 text-center">
            <p className="font-medium">No encontramos productos.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Prueba con otros filtros o con otra búsqueda.
            </p>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="Páginas" className="mt-6 flex flex-wrap items-center justify-center gap-1">
            {state.page > 1 && <PageLink href={href({ page: state.page - 1 })} label="Anterior" rel="prev" />}
            {pageNumbers(state.page, pages).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="px-2 text-muted-foreground">
                  …
                </span>
              ) : (
                <PageLink key={n} href={href({ page: n })} label={String(n)} current={n === state.page} />
              ),
            )}
            {state.page < pages && (
              <PageLink href={href({ page: state.page + 1 })} label="Siguiente" rel="next" />
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

function PageLink({
  href,
  label,
  current,
  rel,
}: {
  href: string;
  label: string;
  current?: boolean;
  rel?: string;
}) {
  return (
    <Link
      href={href}
      rel={rel}
      aria-current={current ? "page" : undefined}
      className={`flex h-11 min-w-11 items-center justify-center rounded-sf-btn border px-3 text-sm ${current ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border hover:border-foreground"}`}
    >
      {label}
    </Link>
  );
}

/** 1 … 4 5 [6] 7 8 … 20 */
function pageNumbers(current: number, total: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let n = 1; n <= total; n++) {
    if (n === 1 || n === total || Math.abs(n - current) <= 2) out.push(n);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

function activeFilters(state: ListingState, all: Facets, hideBrand?: boolean) {
  const chips: { label: string; remove: Partial<ListingState> }[] = [];
  if (state.query) chips.push({ label: `«${state.query}»`, remove: { query: "" } });
  for (const a of all.attributes) {
    for (const slug of state.values[a.slug] ?? []) {
      const value = a.values.find((v) => v.slug === slug);
      if (!value) continue;
      chips.push({
        label: `${a.name}: ${value.name}`,
        remove: { values: { ...state.values, [a.slug]: state.values[a.slug]!.filter((s) => s !== slug) } },
      });
    }
  }
  if (!hideBrand) {
    for (const slug of state.brands) {
      const brand = all.brands.find((b) => b.slug === slug);
      if (brand)
        chips.push({ label: brand.name, remove: { brands: state.brands.filter((s) => s !== slug) } });
    }
  }
  if (state.minPrice != null || state.maxPrice != null) {
    chips.push({
      label: `Precio ${state.minPrice ?? 0}–${state.maxPrice ?? "…"}`,
      remove: { minPrice: null, maxPrice: null },
    });
  }
  if (state.inStock) chips.push({ label: "Disponibles", remove: { inStock: false } });
  if (state.onSale) chips.push({ label: "En oferta", remove: { onSale: false } });
  return chips;
}

function FilterPanel({
  state,
  facets,
  href,
  basePath,
  currency,
  hideBrandFacet,
}: {
  state: ListingState;
  facets: Facets;
  href: (next: Partial<ListingState>) => string;
  basePath: string;
  currency: string;
  hideBrandFacet?: boolean;
}) {
  const toggle = (list: string[], slug: string) =>
    list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
  return (
    <div className="flex flex-col gap-6 text-sm">
      <FilterGroup title="Disponibilidad">
        <FilterLink
          href={href({ inStock: !state.inStock })}
          checked={state.inStock}
          label="Solo disponibles"
        />
        <FilterLink href={href({ onSale: !state.onSale })} checked={state.onSale} label="En oferta" />
      </FilterGroup>
      {facets.attributes.map((a) => (
        <FilterGroup key={a.id} title={a.name}>
          {a.values.map((v) => {
            const selected = state.values[a.slug] ?? [];
            return (
              <FilterLink
                key={v.id}
                href={href({ values: { ...state.values, [a.slug]: toggle(selected, v.slug) } })}
                checked={selected.includes(v.slug)}
                label={v.name}
                count={v.count}
                swatch={a.inputType === "swatch" ? v.value : null}
              />
            );
          })}
        </FilterGroup>
      ))}
      {!hideBrandFacet && facets.brands.length > 0 && (
        <FilterGroup title="Marca">
          {facets.brands.map((b) => (
            <FilterLink
              key={b.id}
              href={href({ brands: toggle(state.brands, b.slug) })}
              checked={state.brands.includes(b.slug)}
              label={b.name}
              count={b.count}
            />
          ))}
        </FilterGroup>
      )}
      <FilterGroup title="Precio">
        <PriceFilter basePath={basePath} state={state} currency={currency} />
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sf-heading mb-2 font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function FilterLink({
  href,
  checked,
  label,
  count,
  swatch,
}: {
  href: string;
  checked: boolean;
  label: string;
  count?: number;
  swatch?: string | null;
}) {
  return (
    <Link
      href={href}
      rel="nofollow"
      role="checkbox"
      aria-checked={checked}
      scroll={false}
      className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : ""}`}
        aria-hidden
      >
        {checked && "✓"}
      </span>
      {swatch && (
        <span className="h-3.5 w-3.5 rounded-full border" style={{ background: swatch }} aria-hidden />
      )}
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
    </Link>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const all: Crumb[] = [{ label: "Inicio", href: "/" }, ...crumbs];
  return (
    <nav aria-label="Ruta de navegación">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
        {all.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden />}
            {c.href && i < all.length - 1 ? (
              <Link href={c.href} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span
                aria-current={i === all.length - 1 ? "page" : undefined}
                className="font-medium text-foreground"
              >
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ListingSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-7 @min-[640px]:grid-cols-3 @min-[1024px]:grid-cols-4 @min-[1024px]:gap-x-5"
      aria-busy="true"
      aria-label="Cargando"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="aspect-[4/5] animate-pulse rounded-sf bg-surface" />
          <div className="flex flex-col gap-1.5 px-0.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-surface" />
            <div className="h-[34px] w-1/2 animate-pulse rounded bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
