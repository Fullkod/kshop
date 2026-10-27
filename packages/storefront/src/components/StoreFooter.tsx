import type { NavLink, StoreCurrency } from "@kshop/data";
import { buttonVariants, MessageCircle } from "@kshop/ui";
import { Link } from "../navigation";
import type { PublicStore } from "../store-context";
import { StoreLogo } from "./StoreHeader";
import { whatsappUrl } from "./whatsapp";

/** Footer columns from the footer menu: each item with children is a column; loose items share one. */
function footerColumns(links: NavLink[]): { title: string; links: NavLink[] }[] {
  const loose = links.filter((l) => l.children.length === 0);
  return [
    ...links.filter((l) => l.children.length > 0).map((l) => ({ title: l.label, links: l.children })),
    ...(loose.length ? [{ title: "Tienda", links: loose }] : []),
  ];
}

const listFormat = new Intl.ListFormat("es", { type: "conjunction" });

export function StoreFooter({
  store,
  links,
  currencies,
}: {
  store: PublicStore;
  links: NavLink[];
  currencies: StoreCurrency[];
}) {
  const columns = footerColumns(links);
  const codes = currencies.length ? currencies.map((c) => c.currency) : [store.baseCurrency];
  return (
    <footer className="mt-[clamp(44px,5.6cqw,72px)] bg-ink px-[clamp(16px,4.4cqw,56px)] pt-[clamp(40px,5cqw,64px)] text-ink-foreground">
      <div className="flex flex-wrap justify-between gap-10">
        <div className="flex max-w-[360px] flex-[1_1_260px] flex-col items-start gap-3.5">
          <StoreLogo store={store} inverse />
          {store.whatsappPhone && (
            <a
              href={whatsappUrl(store.whatsappPhone)}
              rel="noopener"
              className={buttonVariants({ variant: "whatsapp", className: "h-[46px]" })}
            >
              <MessageCircle size={18} aria-hidden />
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
        {columns.length > 0 && (
          <nav
            aria-label="Enlaces del pie"
            className="grid flex-[2_1_420px] grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-7"
          >
            {columns.map((column) => (
              <div key={column.title} className="flex flex-col gap-2.5">
                <span className="text-[11.5px] font-bold tracking-[.1em] text-ink-muted uppercase">
                  {column.title}
                </span>
                {column.links.map((l) => (
                  <Link key={l.href + l.label} href={l.href} className="text-sm hover:text-secondary">
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
      </div>
      <div className="mt-10 flex flex-wrap justify-between gap-2.5 border-t border-[color-mix(in_srgb,var(--ink-fg)_14%,transparent)] py-[18px] text-[12.5px] text-ink-muted">
        <span>
          © {store.name} · Precios en {listFormat.format(codes)}
        </span>
        <span>
          Tienda creada con{" "}
          <a href="https://kshop.fullkod.com" className="text-ink-foreground underline">
            Kshop
          </a>
        </span>
      </div>
    </footer>
  );
}
