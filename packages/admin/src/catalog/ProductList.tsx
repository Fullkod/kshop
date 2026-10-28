"use client";

import { formatMoney, type ProductStatus } from "@kshop/core";
import { AdminProductsQuery, type ResultOf } from "@kshop/data";
import { Alert, Badge, Button, buttonVariants, Card, Input, Select } from "@kshop/ui";
import { useEffect, useRef, useState } from "react";
import { LoadError } from "../LoadError";
import { useSession } from "../session";
import { Link, useStore } from "@kshop/storefront";
import { categoryOptions, useApiAction, useCatalogApi, useCatalogStructure } from "./use-catalog";

type Row = NonNullable<ResultOf<typeof AdminProductsQuery>["adminSearchProducts"]>["edges"][number]["node"];

export const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};
const STATUS_VARIANT = { draft: "muted", published: "success", archived: "destructive" } as const;
const PAGE_SIZE = 25;

export function ProductList() {
  const store = useStore();
  const { graphql } = useSession();
  const { data: structure } = useCatalogStructure();
  const { catalog } = useCatalogApi();
  const action = useApiAction();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The first page loads at once; later changes (typing in the search) wait 250 ms (R11: the delay pushed the first
  // read out of the screen's batch).
  const loadedOnce = useRef(false);

  const variables = (after: string | null) => ({
    storeId: store.id,
    query: query.trim() || null,
    status: status || null,
    categoryId: categoryId || null,
    lowStock: lowStock || null,
    first: PAGE_SIZE,
    after,
  });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        loadedOnce.current = true;
        const result = await graphql.query(AdminProductsQuery, variables(null)).toPromise();
        if (cancelled) return;
        if (result.error) {
          setLoadError("No se pudieron cargar los productos.");
          return;
        }
        setLoadError(null);
        const page = result.data?.adminSearchProducts;
        setRows(page?.edges.map((e) => e.node) ?? []);
        setTotal(page?.totalCount ?? 0);
        setCursor(page?.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? null) : null);
        setSelected(new Set());
      },
      loadedOnce.current ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- variables() is derived from these
  }, [graphql, store.id, query, status, categoryId, lowStock, version]);

  async function loadMore() {
    const result = await graphql.query(AdminProductsQuery, variables(cursor)).toPromise();
    const page = result.data?.adminSearchProducts;
    setRows((current) => [...(current ?? []), ...(page?.edges.map((e) => e.node) ?? [])]);
    setCursor(page?.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? null) : null);
  }

  async function bulk(next: ProductStatus) {
    const ok = await action.run(() => catalog.setProductsStatus([...selected], next));
    if (ok) setVersion((v) => v + 1);
  }

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const currency = structure?.currencies.find((c) => c.isBase)?.currency ?? store.baseCurrency;
  const price = (r: Row) => {
    if (r.minPrice == null) return "—";
    const min = formatMoney(Number(r.minPrice), currency);
    return r.maxPrice != null && r.maxPrice !== r.minPrice
      ? `${min} – ${formatMoney(Number(r.maxPrice), currency)}`
      : min;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rows ? `${total} productos` : "Cargando…"}</p>
        <Link href="/admin/catalog/products/new" className={buttonVariants()}>
          Nuevo producto
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_14rem_auto]">
        <Input
          placeholder="Buscar por nombre o SKU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar productos"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado">
          <option value="">Activos</option>
          <option value="draft">Borradores</option>
          <option value="published">Publicados</option>
          <option value="archived">Archivados</option>
        </Select>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {structure &&
            categoryOptions(structure.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </Select>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          Stock bajo
        </label>
      </div>

      {loadError && <LoadError message={loadError} onRetry={() => setVersion((v) => v + 1)} />}
      {action.error && <Alert variant="destructive">{action.error}</Alert>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm">
          {selected.size} seleccionados:
          <Button size="sm" onClick={() => bulk("published")} disabled={action.pending}>
            Publicar
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk("draft")} disabled={action.pending}>
            Pasar a borrador
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk("archived")} disabled={action.pending}>
            Archivar
          </Button>
        </div>
      )}

      {rows && rows.length === 0 && (
        <Card className="text-center text-muted-foreground">
          No hay productos{query || status || categoryId || lowStock ? " con esos filtros" : " todavía"}.
        </Card>
      )}

      {rows && rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="product-table">
            <thead className="border-b bg-surface text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={selected.size === rows.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Precio</th>
                <th className="px-3 py-2 font-medium">Stock</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const variants = r.productVariantsCollection?.edges.map((e) => e.node) ?? [];
                const stock = variants.reduce((sum, v) => sum + (v.trackInventory ? v.stockAvailable : 0), 0);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.name}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/catalog/products/${r.id}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        {r.primaryMediaUrl ? (
                          <img src={r.primaryMediaUrl} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <span className="h-10 w-10 rounded bg-surface" />
                        )}
                        <span>
                          <span className="font-medium">{r.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {variants.length === 1 ? variants[0]!.sku : `${variants.length} variantes`}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{price(r)}</td>
                    <td className="px-3 py-2">
                      <span className={r.inStock ? "" : "text-destructive"}>
                        {r.inStock ? stock : "Agotado"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {cursor && (
        <Button variant="outline" onClick={loadMore} className="self-center">
          Cargar más
        </Button>
      )}
    </div>
  );
}
