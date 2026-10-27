"use client";

import { Heart, House, LayoutGrid, ShoppingBag, User, type LucideIcon } from "@kshop/ui";
import { CountBadge, useCart } from "../cart/CartProvider";
import { Link, usePathname } from "../navigation";

const TABS: { href: string; label: string; icon: LucideIcon; also?: string[] }[] = [
  { href: "/", label: "Inicio", icon: House },
  {
    href: "/categories",
    label: "Categorías",
    icon: LayoutGrid,
    also: ["/category/", "/collection/", "/brand/"],
  },
  { href: "/favorites", label: "Favoritos", icon: Heart },
  { href: "/cart", label: "Carrito", icon: ShoppingBag, also: ["/checkout"] },
  { href: "/account", label: "Cuenta", icon: User },
];

const isActive = (pathname: string, tab: (typeof TABS)[number]) =>
  tab.href === "/"
    ? pathname === "/"
    : pathname === tab.href ||
      pathname.startsWith(`${tab.href}/`) ||
      !!tab.also?.some((prefix) => pathname.startsWith(prefix));

/**
 * Phone navigation (< 720 px of the storefront, web and store app). Sticky at the end of the page on the web; fixed
 * in the app (`fixed`), with a spacer so the footer is not hidden. Not on the product page (it has its own buy bar).
 */
export function BottomTabBar({ fixed = false }: { fixed?: boolean }) {
  const pathname = usePathname();
  const { count } = useCart();
  if (pathname.startsWith("/product/")) return null;
  return (
    <>
      {fixed && (
        <div aria-hidden className="h-[calc(64px+env(safe-area-inset-bottom))] @min-[720px]:hidden" />
      )}
      <nav
        aria-label="Navegación"
        data-testid="bottom-tab-bar"
        className={`${fixed ? "fixed inset-x-0" : "sticky"} bottom-0 z-30 grid grid-cols-5 border-t border-border bg-[color-mix(in_srgb,var(--bg)_94%,transparent)] px-1 pt-1.5 pb-[calc(10px+env(safe-area-inset-bottom))] backdrop-blur-md @min-[720px]:hidden`}
      >
        {TABS.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-[3px] pt-0.5 text-[11px] font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`relative flex h-[30px] w-14 items-center justify-center rounded-full ${active ? "bg-accent-soft" : ""}`}
              >
                <Icon size={21} aria-hidden />
                {tab.href === "/cart" && count > 0 && (
                  <CountBadge
                    count={count}
                    className="absolute -top-0.5 right-2 h-[18px] min-w-[18px] text-[10px]"
                  />
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
