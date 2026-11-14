"use client";

import { formatMoney, formatQuantity, orderCode } from "@kshop/core";
import type { PosProductSales as PosProductSalesData } from "@kshop/data";
import { Link, useStore } from "@kshop/storefront";
import { Alert, Button, Card, Input, Label } from "@kshop/ui";
import { useEffect, useMemo, useState } from "react";
import { useCheckoutSettings } from "../orders/use-orders";
import { useSession } from "../session";
import { SaleCard, closingDayLabel } from "./PosClosingSales";
import { rememberScroll, rememberState, rememberedState, restoreScroll, setUrlParam } from "./screen-memory";

type Product = { id: string; name: string };
type Loaded = {
  product: Product | null;
  sales: PosProductSalesData["sales"];
  before: string;
  hasOlder: boolean;
};

/**
 * Buscar un producto en todos los cierres (Minimercado, 2026-11-14): the counter sales with one product, by day, with
 * the closing each one went into (or «Sin cerrar»), 30 days at a time going back. The product is in the address
 * (?product=), and what was loaded is remembered for «atrás».
 */
export function PosProductSales({
  closingsHref,
  initialProductId = "",
}: {
  closingsHref: string;
  /** ?product= of the address, from the page's router. */
  initialProductId?: string;
}) {
  const store = useStore();
  const { reads } = useSession();
  const { data: settings } = useCheckoutSettings();
  const [productId, setProductId] = useState(initialProductId);
  const memoryKey = `product-sales:${store.id}:${productId}`;
  const [data, setData] = useState<Loaded | undefined>(() => rememberedState<Loaded>(memoryKey));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // First page of the chosen product (unless it was remembered: then «atrás» shows exactly what was there).
  useEffect(() => {
    if (!productId || rememberedState(memoryKey)) return;
    let cancelled = false;
    reads.posProductSales(store.id, productId).then(
      (d) => {
        if (cancelled) return;
        setFailed(false);
        const loaded = { product: d.product, sales: d.sales, before: d.before, hasOlder: d.hasOlder };
        rememberState(memoryKey, loaded);
        setData(loaded);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, productId, memoryKey, attempt]);

  const loaded = data !== undefined;
  useEffect(() => {
    if (loaded) restoreScroll(memoryKey);
  }, [loaded, memoryKey]);

  const days = useMemo(() => {
    const byDay = new Map<string, Loaded["sales"]>();
    for (const s of data?.sales ?? []) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
    return [...byDay.entries()];
  }, [data]);

  const choose = (p: Product | null) => {
    setUrlParam("product", p?.id ?? "");
    setProductId(p?.id ?? "");
    setFailed(false);
    setData(p ? rememberedState<Loaded>(`product-sales:${store.id}:${p.id}`) : undefined);
  };

  const loadOlder = async () => {
    if (!data) return;
    setLoadingOlder(true);
    try {
      const d = await reads.posProductSales(store.id, productId, 30, data.before);
      const next = { ...data, sales: [...data.sales, ...d.sales], before: d.before, hasOlder: d.hasOlder };
      rememberState(memoryKey, next);
      setData(next);
    } catch {
      setFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const code = (n: number) => (settings ? orderCode(settings.orderPrefix, n) : `#${n}`);
  const isProduct = (l: { productId: string | null }) => l.productId === productId;

  return (
    <div className="flex flex-col gap-4" data-testid="pos-product-sales">
      <Link href={closingsHref} className="hidden text-sm text-muted-foreground underline md:inline">
        Cierres de caja
      </Link>
      {productId ? (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{data?.product?.name ?? (data ? "Producto borrado" : "…")}</span>
          <Button variant="outline" onClick={() => choose(null)} data-testid="product-sales-change">
            Cambiar de producto
          </Button>
        </Card>
      ) : (
        <ProductPicker onPick={choose} />
      )}

      {productId && failed && (
        <Alert variant="destructive">
          No se pudieron cargar las ventas.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            Reintentar
          </button>
        </Alert>
      )}
      {productId && !data && !failed && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {data && (
        <>
          {days.length === 0 && (
            <Card className="text-sm text-muted-foreground">
              Sin ventas de este producto en la caja{data.hasOlder ? " en estos días" : ""}.
            </Card>
          )}
          {days.map(([day, sales]) => {
            const kept = sales.filter((s) => !s.cancelled);
            const lines = kept.flatMap((s) =>
              s.lines.filter(isProduct).map((l) => ({ l, currency: s.currency })),
            );
            const quantity = Math.round(lines.reduce((n, x) => n + Number(x.l.quantity), 0) * 100) / 100;
            const amounts = new Map<string, number>();
            for (const x of lines)
              amounts.set(x.currency, (amounts.get(x.currency) ?? 0) + Number(x.l.lineTotal));
            return (
              <section key={day} className="flex flex-col gap-2" data-testid="product-sales-day">
                <h2 className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold capitalize">{closingDayLabel(day)}</span>
                  <span className="text-sm text-muted-foreground">
                    {kept.length} {kept.length === 1 ? "venta" : "ventas"}
                    {sales.length > kept.length &&
                      ` · ${sales.length - kept.length} ${sales.length - kept.length === 1 ? "anulada" : "anuladas"}`}
                    {lines.length > 0 && ` · ${formatQuantity(quantity, lines[0]!.l.unit)}`}
                    {[...amounts].map(([c, a]) => ` · ${formatMoney(Math.round(a * 100) / 100, c)}`).join("")}
                  </span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {sales.map((s) => (
                    <li key={s.orderId}>
                      <SaleCard
                        sale={s}
                        code={code}
                        memoryKey={memoryKey}
                        highlight={isProduct}
                        extra={
                          <span className="text-muted-foreground">
                            {s.closingId
                              ? `Cierre del ${closingDayLabel(s.closingDay!)}${
                                  (s.closingSequence ?? 1) > 1 ? ` (${s.closingSequence})` : ""
                                }`
                              : "Sin cerrar"}
                          </span>
                        }
                      />
                      {s.closingId && (
                        <Link
                          href={`/admin/pos/closings/${s.closingId}?q=${encodeURIComponent(
                            data.product?.name ?? "",
                          )}`}
                          onClick={() => rememberScroll(memoryKey)}
                          className="mt-1 inline-flex min-h-10 items-center px-1 text-sm text-primary underline"
                        >
                          Ver las ventas de ese cierre
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {data.hasOlder && (
            <Button
              variant="outline"
              onClick={loadOlder}
              disabled={loadingOlder}
              data-testid="product-sales-older"
            >
              {loadingOlder ? "Cargando…" : "Ver días anteriores"}
            </Button>
          )}
          {!data.hasOlder && days.length > 0 && (
            <p className="text-center text-sm text-muted-foreground">No hay ventas más antiguas.</p>
          )}
        </>
      )}
    </div>
  );
}

/** The products of the catalog by name or code (the same search as Catálogo › Productos). */
function ProductPicker({ onPick }: { onPick: (p: Product) => void }) {
  const store = useStore();
  const { reads } = useSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      reads.products({ storeId: store.id, first: 20, query: term }).then(
        (d) => {
          if (cancelled) return;
          setFailed(false);
          setResults(d.adminSearchProducts?.edges.map((e) => ({ id: e.node.id, name: e.node.name })) ?? []);
        },
        () => !cancelled && setFailed(true),
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reads, store.id, term]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="product-sales-search">Producto</Label>
      <Input
        id="product-sales-search"
        type="search"
        value={query}
        placeholder="Nombre o código, p. ej. aceite"
        onChange={(e) => setQuery(e.target.value)}
        data-testid="product-sales-search"
      />
      {term.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Escribe al menos dos letras y elige el producto para ver en qué días y ventas se vendió.
        </p>
      ) : failed ? (
        <p className="text-sm text-destructive">No se pudo buscar. Revisa la conexión.</p>
      ) : results === null ? (
        <p className="text-sm text-muted-foreground">Buscando…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún producto con «{term}».</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-surface"
                data-testid="product-sales-option"
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Address of the search with a product already chosen. */
export const productSalesHref = (productId?: string) =>
  `/admin/pos/closings/search${productId ? `?product=${encodeURIComponent(productId)}` : ""}`;
