import type { HomeSection, NavLink, ProductCardData, StorefrontShell } from "@kshop/data";
import { chipVariants } from "@kshop/ui";
import { Link } from "../navigation";
import type { Crumb } from "./Listing";

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

/** Category chips under the phone header: the top-level categories. */
export function headerChips(shell: StorefrontShell): { label: string; href: string }[] {
  return shell.categories
    .filter((c) => !c.parentId)
    .slice(0, 12)
    .map((c) => ({ label: c.name, href: `/category/${c.slug}` }));
}

/** /categories (phone tab «Categorías»): top-level categories with their image and subcategories. */
export function CategoriesView({ shell }: { shell: StorefrontShell }) {
  const top = shell.categories.filter((c) => !c.parentId);
  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,4.4cqw,56px)] py-8">
      <h1 className="sf-heading text-[clamp(24px,2.6cqw,34px)] leading-tight font-bold">Categorías</h1>
      {top.length === 0 ? (
        <p className="text-muted-foreground">
          Esta tienda aún no tiene categorías.{" "}
          <Link href="/products" className="font-semibold text-primary">
            Ver todos los productos
          </Link>
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-[clamp(12px,1.6cqw,20px)] @min-[720px]:grid-cols-3 @min-[1180px]:grid-cols-4">
          {top.map((category) => {
            const children = shell.categories.filter((c) => c.parentId === category.id);
            return (
              <li key={category.id} className="flex flex-col gap-2">
                <Link
                  href={`/category/${category.slug}`}
                  className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-sf bg-surface shadow-sf"
                >
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <span aria-hidden className="sf-placeholder absolute inset-0" />
                  )}
                  <span className="relative w-full bg-linear-to-t from-scrim to-transparent p-3 pt-8 font-semibold text-ink-foreground">
                    {category.name}
                  </span>
                </Link>
                {children.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {children.map((child) => (
                      <Link key={child.id} href={`/category/${child.slug}`} className={chipVariants()}>
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
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
      eyebrow: "Recién llegados",
      href: "/products",
      products: newest,
    });
  }
  if (categories.length) {
    sections.push({
      id: "default-categories",
      type: "category_grid",
      title: "Categorías",
      eyebrow: null,
      categories: categories.map((c) => ({ ...c, count: null })),
    });
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
