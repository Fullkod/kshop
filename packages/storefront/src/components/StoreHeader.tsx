import type { NavLink } from "@kshop/data";
import { chipVariants, ChevronDown, Flame, Heart, Search, User } from "@kshop/ui";
import { CartLink } from "../cart/CartProvider";
import { Link } from "../navigation";
import type { PublicStore } from "../store-context";
import { CurrencySelect } from "./Currency";
import { iconButton, SALE_HREF } from "./header-shared";
import { MobileMenu } from "./MobileMenu";

// Breakpoints are container queries on .sf-root (the same component in the web, the app and the theme preview):
// < 720 phone (search and category chips under the row), < 1180 hamburger, ≥ 1400 search field instead of an icon.
// The logo and the actions never shrink and the menu clips, so the store name never runs into the menu.

export function StoreLogo({ store, inverse = false }: { store: PublicStore; inverse?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {store.logoUrl ? (
        // store logo from Supabase Storage
        <img
          src={store.logoUrl}
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-sf-sm object-contain"
        />
      ) : (
        <span
          aria-hidden
          className={`sf-heading flex size-9 shrink-0 items-center justify-center rounded-sf-sm text-lg font-extrabold ${inverse ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}
        >
          {store.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="sf-heading truncate text-[19px] leading-none font-bold">{store.name}</span>
    </span>
  );
}

export function StoreHeader({
  store,
  links,
  chips,
}: {
  store: PublicStore;
  links: NavLink[];
  /** Phone row under the header (top categories). */
  chips: { label: string; href: string }[];
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md">
      <div className="flex items-center gap-[clamp(6px,1.8cqw,24px)] px-[clamp(16px,4.4cqw,56px)] py-3">
        <MobileMenu links={links} />

        <Link href="/" className="flex max-w-[60%] min-w-0 flex-none" aria-label={`${store.name}, inicio`}>
          <StoreLogo store={store} />
        </Link>

        <nav
          aria-label="Menú principal"
          className="ml-2 hidden min-w-0 flex-1 overflow-x-clip @min-[1180px]:block"
        >
          <ul className="flex items-center gap-0.5">
            {links.map((link) => (
              <li key={link.href + link.label} className="group relative flex-none">
                <Link
                  href={link.href}
                  className="flex items-center gap-1 rounded-sf-btn px-2.5 py-[9px] text-sm font-medium whitespace-nowrap hover:bg-surface"
                >
                  {link.label}
                  {link.children.length > 0 && <ChevronDown size={14} className="opacity-60" aria-hidden />}
                </Link>
                {link.children.length > 0 && (
                  <ul className="invisible absolute top-full left-0 z-10 min-w-48 rounded-sf border border-border bg-background p-1 opacity-0 shadow-sf-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {link.children.map((child) => (
                      <li key={child.href + child.label}>
                        <Link
                          href={child.href}
                          className="block rounded-sf-sm px-3 py-2 text-sm whitespace-nowrap hover:bg-surface"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            <li className="flex-none">
              <Link
                href={SALE_HREF}
                className="flex items-center gap-1.5 rounded-sf-btn px-2.5 py-[9px] text-sm font-semibold whitespace-nowrap text-sale hover:bg-sale-soft"
              >
                <Flame size={15} aria-hidden />
                Ofertas
              </Link>
            </li>
          </ul>
        </nav>

        <div className="ml-auto flex flex-none items-center gap-1">
          <form action="/search" role="search" className="mr-1.5 hidden @min-[1400px]:block">
            <label className="flex h-[42px] w-[clamp(150px,15cqw,240px)] items-center gap-2 rounded-sf-btn border border-border bg-surface px-3.5 text-sm text-muted-foreground focus-within:border-primary">
              <Search size={18} aria-hidden className="shrink-0" />
              <span className="sr-only">Buscar productos</span>
              <input
                name="q"
                type="search"
                placeholder="Buscar productos"
                className="w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </form>
          <Link
            href="/search"
            aria-label="Buscar"
            className={`${iconButton} hidden @min-[720px]:flex @min-[1400px]:hidden`}
          >
            <Search size={21} aria-hidden />
          </Link>
          <CurrencySelect />
          <Link href="/favorites" aria-label="Favoritos" className={`${iconButton} hidden @min-[720px]:flex`}>
            <Heart size={21} aria-hidden />
          </Link>
          <Link href="/account" aria-label="Mi cuenta" className={`${iconButton} hidden @min-[720px]:flex`}>
            <User size={21} aria-hidden />
          </Link>
          <CartLink />
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-3 @min-[720px]:hidden">
        <form action="/search" role="search" className="px-4">
          <label className="flex h-11 items-center gap-2 rounded-sf-btn border border-border bg-surface px-3.5 text-sm text-muted-foreground focus-within:border-primary">
            <Search size={18} aria-hidden className="shrink-0" />
            <span className="sr-only">Buscar productos</span>
            <input
              name="q"
              type="search"
              placeholder={`Buscar en ${store.name}`}
              className="w-full min-w-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>
        {chips.length > 0 && (
          <nav aria-label="Categorías" className="sf-scroller flex gap-2 overflow-x-auto px-4">
            {chips.map((chip) => (
              <Link key={chip.href} href={chip.href} className={chipVariants()}>
                {chip.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
