"use client";

import { STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TYPES, type StockMovementType } from "@kshop/core";
import {
  ApiError,
  type StockMovementsPage,
  type WarehouseStockRow,
  type WarehousesOverview,
  type ZoneWarehouses,
} from "@kshop/data";
import { Alert, Badge, Button, Card, Input, Label, Select, cn } from "@kshop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

// Admin › Almacenes (module multi_warehouse, PRP-6 D11–D15): stock per warehouse, which warehouses serve each zone,
// transfers and the movement history. Creating and editing warehouses stays in Catálogo › Almacenes.

const SECTIONS = [
  { href: "/admin/multi-warehouse", label: "Resumen" },
  { href: "/admin/multi-warehouse/transfer", label: "Traspasar" },
  { href: "/admin/multi-warehouse/movements", label: "Movimientos" },
];

export function WarehousesNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b pb-2" aria-label="Secciones de almacenes">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-surface",
            pathname === s.href && "bg-accent-soft font-medium text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function useOverview() {
  const store = useStore();
  const { api } = useSession();
  const [data, setData] = useState<WarehousesOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api
        .warehouses(store.id)
        .overview()
        .then(setData, (e: unknown) => setError(errorText(e, "No se pudieron cargar los almacenes."))),
    [api, store.id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, reload: load };
}

// ---------------------------------------------------------------------------
// Resumen: warehouses and the zones each one serves
// ---------------------------------------------------------------------------

export function WarehousesOverviewPage() {
  const { data, error, reload } = useOverview();
  const admin = useAdmin();
  const canManage = admin.role !== "staff";

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.warehouses.map((w) => (
          <Card key={w.id} className="flex flex-col gap-2" data-testid={`warehouse-${w.name}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{w.name}</h2>
              {w.isDefault && <Badge>Principal</Badge>}
              {w.isPickupPoint && <Badge variant="muted">Punto de recogida</Badge>}
              {!w.isActive && <Badge variant="muted">Desactivado</Badge>}
            </div>
            {w.address && <p className="text-sm text-muted-foreground">{w.address}</p>}
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Unidades</dt>
                <dd className="text-lg font-semibold">{w.units}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reservadas</dt>
                <dd className="text-lg font-semibold">{w.reserved}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Productos</dt>
                <dd className="text-lg font-semibold">{w.variants}</dd>
              </div>
            </dl>
            <Link href={`/admin/multi-warehouse/movements?warehouseId=${w.id}`} className="text-sm underline">
              Ver movimientos
            </Link>
          </Card>
        ))}
      </section>
      <p className="-mt-4 text-sm text-muted-foreground">
        Para crear, renombrar o desactivar almacenes ve a{" "}
        <Link href="/admin/catalog/warehouses" className="underline">
          Catálogo › Almacenes
        </Link>
        .
      </p>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Qué almacén sirve cada zona</h2>
          <p className="text-sm text-muted-foreground">
            Al comprar, el pedido toma primero las unidades de los almacenes de su zona (en este orden) y, si
            no alcanzan, de los demás. Una zona sin almacenes elegidos usa el principal y luego el resto.
          </p>
        </div>
        {data.zones.length === 0 ? (
          <Card className="text-sm text-muted-foreground">
            No hay zonas de entrega. Créalas en{" "}
            <Link href="/admin/shipping" className="underline">
              Entregas
            </Link>
            .
          </Card>
        ) : (
          data.zones.map((zone) => (
            <ZoneEditor
              key={zone.id}
              zone={zone}
              warehouses={data.warehouses.filter((w) => w.isActive)}
              canManage={canManage}
              onSaved={reload}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ZoneEditor({
  zone,
  warehouses,
  canManage,
  onSaved,
}: {
  zone: ZoneWarehouses;
  warehouses: WarehousesOverview["warehouses"];
  canManage: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const store = useStore();
  const { api } = useSession();
  const [selected, setSelected] = useState<string[]>(zone.warehouseIds);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const nameOf = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";
  const dirty = selected.join() !== zone.warehouseIds.join();

  function move(index: number, delta: number) {
    const next = [...selected];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setSelected(next);
  }

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      await api.warehouses(store.id).setZone(zone.id, selected);
      await onSaved();
      setMessage({ ok: true, text: "Guardado." });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, "No se pudo guardar.") });
    } finally {
      setPending(false);
    }
  }

  const available = warehouses.filter((w) => !selected.includes(w.id));
  return (
    <Card className="flex flex-col gap-3" data-testid={`zone-${zone.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{zone.name}</h3>
        {!zone.isActive && <Badge variant="muted">Desactivada</Badge>}
      </div>
      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todos los almacenes (primero el principal).</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {selected.map((id, i) => (
            <li key={id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-muted-foreground">{i + 1}.</span>
              <span className="flex-1">{nameOf(id)}</span>
              {canManage && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    aria-label={`Subir ${nameOf(id)}`}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={i === selected.length - 1}
                    aria-label={`Bajar ${nameOf(id)}`}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelected(selected.filter((x) => x !== id))}
                  >
                    Quitar
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {available.length > 0 && (
            <Select
              aria-label={`Añadir almacén a ${zone.name}`}
              value=""
              onChange={(e) => e.target.value && setSelected([...selected, e.target.value])}
              className="h-9 w-56"
            >
              <option value="">Añadir almacén…</option>
              {available.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          )}
          <Button size="sm" onClick={() => void save()} disabled={!dirty || pending}>
            Guardar
          </Button>
          {message && (
            <span className={cn("text-sm", message.ok ? "text-muted-foreground" : "text-destructive")}>
              {message.text}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Traspasar
// ---------------------------------------------------------------------------

type TransferLine = WarehouseStockRow & { move: number };

export function TransferPage() {
  const store = useStore();
  const { api } = useSession();
  const { data, error } = useOverview();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WarehouseStockRow[]>([]);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!from) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .warehouses(store.id)
        .stock(from, query)
        .then(
          (r) => !cancelled && setResults(r.rows),
          () => !cancelled && setResults([]),
        );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, store.id, from, query]);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const warehouses = data.warehouses;
  if (warehouses.length < 2) {
    return (
      <Card className="text-sm">
        Necesitas al menos dos almacenes para traspasar. Créalos en{" "}
        <Link href="/admin/catalog/warehouses" className="underline">
          Catálogo › Almacenes
        </Link>
        .
      </Card>
    );
  }

  function changeFrom(id: string) {
    setFrom(id);
    setLines([]);
    setResults([]);
    if (id === to) setTo("");
  }

  function add(row: WarehouseStockRow) {
    if (lines.some((l) => l.variantId === row.variantId)) return;
    setLines([...lines, { ...row, move: Math.min(1, row.quantity - row.allocated) }]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const result = await api.warehouses(store.id).transfer({
        fromWarehouseId: from,
        toWarehouseId: to,
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.move })),
        note: note || undefined,
      });
      const fresh = await api.warehouses(store.id).stock(from, query);
      setResults(fresh.rows);
      setLines([]);
      setNote("");
      setMessage({
        ok: true,
        text: `Traspaso hecho: ${result.units} ${result.units === 1 ? "unidad" : "unidades"} de ${result.variants} ${
          result.variants === 1 ? "producto" : "productos"
        }.`,
      });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, "No se pudo hacer el traspaso.") });
    } finally {
      setPending(false);
    }
  }

  const invalid = lines.some((l) => l.move < 1 || l.move > l.quantity - l.allocated);
  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-4xl flex-col gap-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="transfer-from">Desde</Label>
          <Select id="transfer-from" value={from} onChange={(e) => changeFrom(e.target.value)} required>
            <option value="">Elige un almacén…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="transfer-to">Hacia</Label>
          <Select id="transfer-to" value={to} onChange={(e) => setTo(e.target.value)} required>
            <option value="">Elige un almacén…</option>
            {warehouses
              .filter((w) => w.id !== from && w.isActive)
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </Select>
        </div>
      </Card>

      {from && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="transfer-search">Buscar producto (nombre o SKU)</Label>
            <Input
              id="transfer-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Vacío: los que tienen stock en este almacén"
              autoComplete="off"
            />
          </div>
          <ul className="flex max-h-64 flex-col overflow-y-auto text-sm" data-testid="transfer-results">
            {results.length === 0 && <li className="py-2 text-muted-foreground">Sin resultados.</li>}
            {results.map((r) => {
              const free = r.quantity - r.allocated;
              return (
                <li key={r.variantId} className="flex items-center gap-2 border-b py-2 last:border-0">
                  <span className="flex-1">
                    {r.productName}
                    {r.variantName && ` · ${r.variantName}`}{" "}
                    <span className="text-muted-foreground">({r.sku})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {free} libres{r.allocated > 0 && ` · ${r.allocated} reservadas`}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={free < 1 || lines.some((l) => l.variantId === r.variantId)}
                    onClick={() => add(r)}
                  >
                    Añadir
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {lines.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">A traspasar</h2>
          {lines.map((l, i) => (
            <div key={l.variantId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">
                {l.productName}
                {l.variantName && ` · ${l.variantName}`}{" "}
                <span className="text-muted-foreground">({l.sku})</span>
              </span>
              <Input
                type="number"
                min={1}
                max={l.quantity - l.allocated}
                value={l.move}
                aria-label={`Unidades de ${l.sku}`}
                onChange={(e) =>
                  setLines(lines.map((x, j) => (j === i ? { ...x, move: Number(e.target.value) } : x)))
                }
                className="w-24"
              />
              <span className="text-muted-foreground">de {l.quantity - l.allocated}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setLines(lines.filter((x) => x.variantId !== l.variantId))}
              >
                Quitar
              </Button>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <Label htmlFor="transfer-note">Nota (opcional)</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
          </div>
        </Card>
      )}

      {message && <Alert variant={message.ok ? "success" : "destructive"}>{message.text}</Alert>}
      <div>
        <Button type="submit" disabled={pending || !from || !to || lines.length === 0 || invalid}>
          Traspasar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Havana",
  }).format(new Date(iso));

export function MovementsPage({ initialWarehouseId }: { initialWarehouseId?: string }) {
  const store = useStore();
  const { api } = useSession();
  const { data: overview } = useOverview();
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? "");
  const [type, setType] = useState<StockMovementType | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StockMovementsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .warehouses(store.id)
      .movements({ warehouseId: warehouseId || undefined, type: type || undefined, from, to, page })
      .then(
        (d) => {
          if (cancelled) return;
          setData(d);
          setError(null);
        },
        (e: unknown) => !cancelled && setError(errorText(e, "No se pudieron cargar los movimientos.")),
      );
    return () => {
      cancelled = true;
    };
  }, [api, store.id, warehouseId, type, from, to, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mov-warehouse">Almacén</Label>
          <Select
            id="mov-warehouse"
            value={warehouseId}
            onChange={(e) => {
              setWarehouseId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {overview?.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mov-type">Tipo</Label>
          <Select
            id="mov-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as StockMovementType | "");
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {STOCK_MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {STOCK_MOVEMENT_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mov-from">Desde</Label>
          <Input
            id="mov-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mov-to">Hasta</Label>
          <Input
            id="mov-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      {error && <Alert variant="destructive">{error}</Alert>}
      {!data ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="movements">
            <thead className="border-b bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 font-medium">Almacén</th>
                <th className="px-4 py-2 font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Unidades</th>
                <th className="px-4 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No hay movimientos con estos filtros.
                  </td>
                </tr>
              )}
              {data.movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{dateTime(m.createdAt)}</td>
                  <td className="px-4 py-2">
                    {m.productName}
                    {m.variantName && ` · ${m.variantName}`}{" "}
                    <span className="text-muted-foreground">({m.sku})</span>
                  </td>
                  <td className="px-4 py-2">{m.warehouseName}</td>
                  <td className="px-4 py-2">{STOCK_MOVEMENT_LABELS[m.type]}</td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium tabular-nums",
                      m.quantity < 0 ? "text-destructive" : "text-success",
                    )}
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.orderId ? (
                      <Link href={`/admin/orders/${m.orderId}`} className="underline">
                        Pedido {m.orderNumber ?? ""}
                      </Link>
                    ) : (
                      m.note
                    )}
                    {m.userEmail && <span className="block text-xs">{m.userEmail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && pages > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>
            Página {page} de {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
