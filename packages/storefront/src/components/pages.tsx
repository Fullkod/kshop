import type { HomeSection, NavLink, ProductCardData, StorefrontProduct, StorefrontShell } from "@kshop/data";
import type { Crumb } from "./Listing";
import { ProductGrid } from "./ProductCard";

// Page pieces shared by the web and the store app, so both show the same navigation, home and product page.

/** Header menu; without one, «Productos» and the top-level categories (with their children). */
export function headerLinks(shell: StorefrontShell): NavLink[] {
  if (shell.header.length) return shell.header;
  return [
    { label: "Productos", href: "/products", children: [] },
    ...shell.categories
      .filter((c) => !c.parentId)
      .slice(0, 6)
      .map((c) => ({
        label: c.name,
        href: `/category/${c.slug}`,
        children: shell.categories
          .filter((child) => child.parentId === c.id)
          .map((child) => ({ label: child.name, href: `/category/${child.slug}`, children: [] })),
      })),
  ];
}

/** Home of a store that has not set up its sections: newest products and the categories. */
export function defaultHome(newest: ProductCardData[], shell: StorefrontShell): HomeSection[] {
  const categories = shell.categories.filter((c) => !c.parentId);
  const sections: HomeSection[] = [];
  if (newest.length) {
    sections.push({
      id: "default-new",
      type: "product_carousel",
      title: "Novedades",
      href: "/products",
      products: newest,
    });
  }
  if (categories.length) {
    sections.push({ id: "default-categories", type: "category_grid", title: "Categorías", categories });
  }
  return sections;
}

/** Breadcrumb of a category and its parents (outermost first), without the category itself unless asked. */
export function categoryTrail(
  shell: StorefrontShell,
  categoryId: string | null | undefined,
  includeSelf = true,
): Crumb[] {
  const crumbs: Crumb[] = [];
  let c = shell.categories.find((x) => x.id === categoryId);
  if (c && !includeSelf) c = shell.categories.find((x) => x.id === c!.parentId);
  while (c) {
    crumbs.unshift({ label: c.name, href: `/category/${c.slug}` });
    const parentId = c.parentId;
    c = shell.categories.find((x) => x.id === parentId);
  }
  return crumbs;
}

/** Description, characteristics and related products under the product view. */
export function ProductDetails({
  product,
  related,
}: {
  product: StorefrontProduct;
  related: ProductCardData[];
}) {
  return (
    <>
      {(product.description || product.attributes.length > 0) && (
        <section className="grid gap-8 border-t pt-8 md:grid-cols-2 md:gap-12">
          {product.description && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Descripción</h2>
              <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}
          {product.attributes.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Características</h2>
              <dl className="divide-y rounded-[var(--sf-radius)] border">
                {product.attributes.map((a) => (
                  <div key={a.name} className="grid grid-cols-2 gap-4 px-4 py-2 text-sm">
                    <dt className="text-muted-foreground">{a.name}</dt>
                    <dd>{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="flex flex-col gap-4 border-t pt-8">
          <h2 className="text-xl font-semibold">También te puede gustar</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
