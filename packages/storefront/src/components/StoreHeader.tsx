import { Link } from "../navigation";
import type { PublicStore } from "../store-context";
import type { NavLink } from "@kshop/data";
import { CartLink } from "../cart/CartProvider";
import { CurrencySelect } from "./Currency";

/** Header: name/logo, menu (dropdowns on desktop, a <details> panel on mobile, no JS needed), search, currency. */
export function StoreHeader({ store, links }: { store: PublicStore; links: NavLink[] }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <details className="group relative md:hidden">
          <summary
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-sf-btn hover:bg-surface [&::-webkit-details-marker]:hidden"
            aria-label="Menú"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </summary>
          <nav
            aria-label="Menú principal"
            className="fixed inset-x-0 top-[61px] max-h-[80dvh] overflow-y-auto border-b bg-background px-4 py-3 shadow-lg"
          >
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.href + link.label}>
                  <Link href={link.href} className="block py-2 font-medium">
                    {link.label}
                  </Link>
                  {link.children.length > 0 && (
                    <ul className="mb-2 border-l pl-4">
                      {link.children.map((child) => (
                        <li key={child.href + child.label}>
                          <Link href={child.href} className="block py-1.5 text-sm text-muted-foreground">
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </details>

        <Link href="/" className="flex min-w-0 items-center gap-2" aria-label={`${store.name}, inicio`}>
          {store.logoUrl ? (
            // store logo from Supabase Storage
            <img
              src={store.logoUrl}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded object-contain"
            />
          ) : null}
          <span className="sf-heading truncate text-lg font-semibold">{store.name}</span>
        </Link>

        <nav aria-label="Menú principal" className="ml-4 hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href + link.label} className="group relative">
                <Link
                  href={link.href}
                  className="block rounded-sf-btn px-3 py-2 text-sm font-medium hover:bg-surface"
                >
                  {link.label}
                </Link>
                {link.children.length > 0 && (
                  <ul className="invisible absolute left-0 top-full min-w-48 rounded-sf border bg-background p-1 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                    {link.children.map((child) => (
                      <li key={child.href + child.label}>
                        <Link href={child.href} className="block rounded px-3 py-2 text-sm hover:bg-surface">
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <form action="/search" role="search" className="hidden sm:block">
            <label htmlFor="store-search" className="sr-only">
              Buscar productos
            </label>
            <input
              id="store-search"
              name="q"
              type="search"
              placeholder="Buscar productos"
              className="h-9 w-48 rounded-sf-btn border bg-background px-3 text-sm lg:w-64"
            />
          </form>
          <Link
            href="/search"
            className="flex h-10 w-10 items-center justify-center rounded-sf-btn hover:bg-surface sm:hidden"
            aria-label="Buscar"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <CurrencySelect />
          <CartLink />
          <Link
            href="/account"
            className="flex h-10 w-10 items-center justify-center rounded-sf-btn hover:bg-surface"
            aria-label="Mi cuenta"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
