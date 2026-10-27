import type { SearchParams } from "@kshop/core";
import type { ProductFilters } from "@kshop/data";
import {
  AccountView,
  Breadcrumbs,
  CartView,
  categoryTrail,
  CheckoutView,
  CustomerLoginForm,
  CustomerRecoverForm,
  CustomerRegisterForm,
  defaultHome,
  HomeSections,
  Link,
  ListingSkeleton,
  ListingView,
  loadListing,
  Markdown,
  MyOrder,
  MyOrders,
  OrderView,
  ProductDetails,
  ProductView,
  useRouter,
  useStore,
  type Crumb,
} from "@kshop/storefront";
import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { useShell } from "./App";
import { useCached } from "./cache";
import { listingReader, loadHome, loadNewest, loadPage, loadProduct, loadRelated } from "./data";

// The routes of the store app: the same pieces as the web pages (apps/web/src/app/s/[storeSlug]/(front)), with the
// data read on the device (cached for offline) instead of on the server.

const Loading = () => <p className="py-16 text-center text-muted-foreground">Cargando…</p>;

function Missing({ what }: { what: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="text-lg">{what}</p>
      <Link href="/" className="text-primary underline">
        Volver al inicio
      </Link>
    </div>
  );
}

const Narrow = ({ width, title, children }: { width: string; title?: string; children: ReactNode }) => (
  <div className={`mx-auto w-full ${width} px-4 py-8`}>
    {title && <h1 className="sf-heading mb-6 text-2xl font-semibold">{title}</h1>}
    {children}
  </div>
);

export function HomePage() {
  const shell = useShell();
  const store = useStore();
  const home = useCached("home", async () => {
    const sections = await loadHome();
    return sections.length ? sections : defaultHome((await loadNewest(8)).products, shell);
  });
  if (!home.data) return home.loading ? <ListingSkeleton /> : <Missing what="No se pudo cargar la tienda." />;
  return (
    <>
      <h1 className="sr-only">{store.name}</h1>
      <HomeSections sections={home.data} />
    </>
  );
}

type ListingKind = "all" | "search" | "category" | "collection" | "brand";

function toSearchParams(params: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}

/** Products, search, category, collection and brand listings (filters, sort and page in the URL, like the web). */
export function ListingRoute({ kind }: { kind: ListingKind }) {
  const shell = useShell();
  const store = useStore();
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const router = useRouter();

  let title = kind === "search" ? "Buscar" : "Productos";
  let crumbs: Crumb[] = [];
  let fixed: Pick<ProductFilters, "categoryId" | "collectionId" | "brandIds"> = {};
  let basePath = kind === "search" ? "/search" : "/products";
  let intro: ReactNode = null;
  if (kind === "category") {
    const category = shell.categories.find((c) => c.slug === slug);
    if (!category) return <Missing what="Esta categoría no existe." />;
    title = category.name;
    crumbs = categoryTrail(shell, category.id, false);
    fixed = { categoryId: category.id };
    basePath = `/category/${slug}`;
    const children = shell.categories.filter((c) => c.parentId === category.id);
    if (children.length) {
      intro = (
        <ul className="flex flex-wrap gap-2" aria-label="Subcategorías">
          {children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/category/${c.slug}`}
                className="inline-flex rounded-full border px-4 py-1.5 text-sm"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      );
    }
  } else if (kind === "collection") {
    const collection = shell.collections.find((c) => c.slug === slug);
    if (!collection) return <Missing what="Esta colección no existe." />;
    title = collection.name;
    fixed = { collectionId: collection.id };
    basePath = `/collection/${slug}`;
  } else if (kind === "brand") {
    const brand = shell.brands.find((b) => b.slug === slug);
    if (!brand) return <Missing what="Esta marca no existe." />;
    title = brand.name;
    fixed = { brandIds: brand.id };
    basePath = `/brand/${slug}`;
  } else if (kind === "search") {
    intro = (
      <form
        role="search"
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(`/search?q=${encodeURIComponent(String(q ?? ""))}`);
        }}
      >
        <label htmlFor="search-q" className="sr-only">
          ¿Qué buscas?
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={params.get("q") ?? ""}
          placeholder="¿Qué buscas?"
          className="h-11 flex-1 rounded-sf-btn border bg-background px-4"
        />
        <button className="h-11 rounded-sf-btn bg-primary px-4 text-primary-foreground">Buscar</button>
      </form>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <Breadcrumbs crumbs={[...crumbs, { label: title }]} />
      <h1 className="text-3xl font-semibold">{title}</h1>
      {intro}
      <ListingData
        cacheKey={`listing:${basePath}?${params.toString()}`}
        fixed={fixed}
        searchParams={toSearchParams(params)}
        basePath={basePath}
        currency={store.baseCurrency}
        hideBrandFacet={kind === "brand"}
      />
    </div>
  );
}

function ListingData(props: {
  cacheKey: string;
  fixed: Pick<ProductFilters, "categoryId" | "collectionId" | "brandIds">;
  searchParams: SearchParams;
  basePath: string;
  currency: string;
  hideBrandFacet: boolean;
}) {
  const listing = useCached(props.cacheKey, () =>
    loadListing(listingReader, props.fixed, props.searchParams),
  );
  if (!listing.data)
    return listing.loading ? <ListingSkeleton /> : <Missing what="No se pudieron cargar los productos." />;
  return (
    <ListingView
      data={listing.data}
      basePath={props.basePath}
      currency={props.currency}
      hideBrandFacet={props.hideBrandFacet}
    />
  );
}

export function ProductPage() {
  const shell = useShell();
  const { slug = "" } = useParams();
  const page = useCached(`product:${slug}`, async () => {
    const product = await loadProduct(slug);
    const related = product?.category
      ? (await loadRelated(product.category.id)).products.filter((p) => p.id !== product.id).slice(0, 4)
      : [];
    return { product, related };
  });
  if (!page.data) return page.loading ? <Loading /> : <Missing what="No se pudo cargar el producto." />;
  const { product, related } = page.data;
  if (!product) return <Missing what="Este producto ya no está disponible." />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6">
      <Breadcrumbs crumbs={[...categoryTrail(shell, product.category?.id), { label: product.name }]} />
      <ProductView product={product} />
      <ProductDetails product={product} related={related} />
    </div>
  );
}

export function StaticPage() {
  const { slug = "" } = useParams();
  const page = useCached(`page:${slug}`, () => loadPage(slug));
  if (!page.data) return page.loading ? <Loading /> : <Missing what="Esta página no existe." />;
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <Breadcrumbs crumbs={[{ label: page.data.title }]} />
      <h1 className="text-3xl font-semibold">{page.data.title}</h1>
      <Markdown>{page.data.content}</Markdown>
    </article>
  );
}

export const CartPage = () => (
  <Narrow width="max-w-5xl" title="Carrito">
    <CartView />
  </Narrow>
);

export const CheckoutPage = () => (
  <Narrow width="max-w-5xl" title="Finalizar pedido">
    <CheckoutView />
  </Narrow>
);

export function OrderPage() {
  const { token = "" } = useParams();
  return (
    <Narrow width="max-w-3xl">
      <OrderView token={token} />
    </Narrow>
  );
}

export const AccountPage = () => (
  <Narrow width="max-w-2xl" title="Mi cuenta">
    <AccountView orders={<MyOrders />} />
  </Narrow>
);

export const LoginPage = () => (
  <Narrow width="max-w-sm" title="Entrar a mi cuenta">
    <CustomerLoginForm />
  </Narrow>
);

export const RegisterPage = () => (
  <Narrow width="max-w-sm" title="Crear cuenta">
    <CustomerRegisterForm />
  </Narrow>
);

export const RecoverPage = () => (
  <Narrow width="max-w-sm" title="Recuperar contraseña">
    <CustomerRecoverForm />
  </Narrow>
);

export function MyOrderPage() {
  const { orderId = "" } = useParams();
  return (
    <Narrow width="max-w-3xl">
      <MyOrder orderId={orderId} />
    </Narrow>
  );
}

export const NotFound = () => <Missing what="No encontramos esta página." />;
