"use client";

import { formatMoney, ORDER_STATUS_LABELS, type CurrencyCode, type OrderStatus } from "@kshop/core";
import { asResult } from "@kshop/data";
import { cn, type LucideIcon, Package, Search, ShoppingBag, UserRound, X } from "@kshop/ui";
import { useStore } from "@kshop/storefront";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/session";

export type SearchSection = { href: string; label: string; icon: LucideIcon };

type Result = { key: string; href: string; icon: LucideIcon; title: string; detail: string; group: string };

/**
 * Global search of the admin topbar (redesign v2, 04-ADMIN «búsqueda global»): orders by number, name or phone,
 * products by name or SKU, customers by name or phone and the admin sections by name. Ctrl/⌘ K focuses it; arrows and
 * Enter pick a result. Each group only when its module is on.
 */
export function AdminSearch({
  sections,
  orders,
  catalog,
}: {
  sections: SearchSection[];
  orders: boolean;
  catalog: boolean;
}) {
  const store = useStore();
  const { reads } = useSession();
  const router = useRouter();
  const desktopInput = useRef<HTMLInputElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; results: Result[] }>({ query: "", results: [] });
  const [active, setActive] = useState(0);
  const q = query.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        // The visible field: the topbar one on wide screens, the overlay one on phones.
        requestAnimationFrame(() =>
          (desktopInput.current?.offsetParent ? desktopInput : phoneInput).current?.focus(),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sectionHits = useMemo<Result[]>(() => {
    if (!q) return [];
    const needle = fold(q);
    return sections
      .filter((s) => fold(s.label).includes(needle))
      .slice(0, 4)
      .map((s) => ({
        key: `s-${s.href}`,
        href: s.href,
        icon: s.icon,
        title: s.label,
        detail: "",
        group: "Ir a",
      }));
  }, [q, sections]);

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const digits = q.replace(/\D/g, "");
      // «DM-1151» or «1151», as in the order list.
      const number = q.replace(/^[A-Z0-9]+-/i, "");
      const phone = digits.length >= 3 ? `%${digits}%` : undefined;
      const [o, p, c] = await Promise.all([
        orders
          ? asResult(
              reads.orders({
                storeId: store.id,
                first: 5,
                search: {
                  name: `%${q}%`,
                  phone,
                  number: /^\d{1,9}$/.test(number) ? Number(number) : undefined,
                },
              }),
            )
          : null,
        catalog ? asResult(reads.products({ storeId: store.id, query: q, first: 5 })) : null,
        orders
          ? asResult(reads.customers({ storeId: store.id, first: 4, search: { name: `%${q}%`, phone } }))
          : null,
      ]);
      if (cancelled) return;
      const results: Result[] = [
        ...(o?.data?.ordersCollection.edges ?? []).map(({ node }) => ({
          key: `o-${node.id}`,
          href: `/admin/orders/${node.id}`,
          icon: ShoppingBag,
          title: `Pedido ${node.number} · ${node.customerName}`,
          detail: [
            ORDER_STATUS_LABELS[node.status as OrderStatus],
            node.total == null
              ? null
              : formatMoney(Number(node.total), String(node.currency) as CurrencyCode),
          ]
            .filter(Boolean)
            .join(" · "),
          group: "Pedidos",
        })),
        ...(p?.data?.adminSearchProducts?.edges ?? []).map(({ node }) => ({
          key: `p-${node.id}`,
          href: `/admin/catalog/products/${node.id}`,
          icon: Package,
          title: node.name,
          detail: node.status === "published" ? "Publicado" : "Borrador",
          group: "Productos",
        })),
        ...(c?.data?.customersCollection?.edges ?? []).map(({ node }) => ({
          key: `c-${node.id}`,
          href: `/admin/orders?q=${encodeURIComponent(node.phone)}`,
          icon: UserRound,
          title: [node.firstName, node.lastName].filter(Boolean).join(" ") || node.phone,
          detail: `${node.phone} · ver sus pedidos`,
          group: "Clientes",
        })),
      ];
      setFound({ query: q, results });
      setActive(0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, reads, store.id, orders, catalog]);

  const results = q ? [...sectionHits, ...(found.query === q ? found.results : [])] : [];
  const searching = q.length >= 2 && found.query !== q;

  const go = (r: Result) => {
    setOpen(false);
    setQuery("");
    router.push(r.href);
  };

  const field = (ref: typeof desktopInput, id: string) => (
    <label
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-[10px] border bg-surface px-3 text-sm",
        "focus-within:ring-2 focus-within:ring-ring",
      )}
    >
      <Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.currentTarget.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active]);
          }
        }}
        placeholder="Buscar pedidos, productos, clientes…"
        aria-label="Buscar en el panel"
        role="combobox"
        aria-expanded={open && !!q}
        aria-controls={`${id}-results`}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        data-testid={id}
      />
      <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground lg:inline">
        Ctrl K
      </kbd>
    </label>
  );

  const list = (id: string) =>
    open &&
    q && (
      <div
        id={`${id}-results`}
        role="listbox"
        className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-[12px] border bg-background p-1.5 shadow-lg"
      >
        {results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {q.length < 2 ? "Escribe al menos 2 letras." : searching ? "Buscando…" : "Sin resultados."}
          </p>
        ) : (
          results.map((r, i) => {
            const Icon = r.icon;
            const first = i === 0 || results[i - 1]!.group !== r.group;
            return (
              <div key={r.key}>
                {first && (
                  <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-bold tracking-[.1em] text-muted-foreground uppercase">
                    {r.group}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(r)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left text-sm",
                    i === active && "bg-surface",
                  )}
                >
                  <Icon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                  {r.detail && <span className="shrink-0 text-xs text-muted-foreground">{r.detail}</span>}
                </button>
              </div>
            );
          })
        )}
        {searching && results.length > 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Buscando…</p>
        )}
      </div>
    );

  return (
    <>
      {/* Wide screens: the field in the topbar. */}
      <div
        className="relative hidden w-full max-w-[420px] md:block"
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      >
        {field(desktopInput, "admin-search")}
        {list("admin-search")}
      </div>
      {/* Phones: an icon that opens the field over the topbar. */}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => phoneInput.current?.focus());
        }}
        aria-label="Buscar"
        className="flex size-10 items-center justify-center rounded-[10px] border md:hidden"
      >
        <Search size={18} aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-x-0 top-0 z-50 border-b bg-background p-3 md:hidden">
          <div className="relative flex items-center gap-2">
            {field(phoneInput, "admin-search-phone")}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar búsqueda"
              className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border"
            >
              <X size={18} aria-hidden />
            </button>
            {list("admin-search-phone")}
          </div>
        </div>
      )}
    </>
  );
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
