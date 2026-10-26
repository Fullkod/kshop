import { Link } from "../navigation";
import type { PublicStore } from "../store-context";
import type { NavLink } from "@kshop/data";
import { whatsappUrl } from "./whatsapp";

export function StoreFooter({ store, links }: { store: PublicStore; links: NavLink[] }) {
  const flat = links.flatMap((l) => [l, ...l.children]);
  return (
    <footer className="mt-16 border-t bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <span className="sf-heading text-lg font-semibold">{store.name}</span>
          {store.whatsappPhone && (
            <a
              href={whatsappUrl(store.whatsappPhone)}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              rel="noopener"
            >
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
        {flat.length > 0 && (
          <nav aria-label="Enlaces del pie">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {flat.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-muted-foreground hover:text-foreground hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <p className="border-t py-4 text-center text-xs text-muted-foreground">
        Tienda creada con{" "}
        <a href="https://kshop.fullkod.com" className="underline">
          Kshop
        </a>
      </p>
    </footer>
  );
}
