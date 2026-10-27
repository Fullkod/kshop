"use client";

import {
  EXPENSE_CATEGORY_SUGGESTIONS,
  formatMoney,
  INVENTORY_FILTER_LABELS,
  INVENTORY_FILTERS,
  MARGIN_GROUP_LABELS,
  MARGIN_GROUPS,
  ORDER_CHANNEL_LABELS,
  type CurrencyCode,
  type FinancePeriod,
  type InventoryFilter,
  type MarginGroup,
} from "@kshop/core";
import {
  ApiError,
  type Expense,
  type FinanceBreakdown,
  type FinanceBreakdownRow,
  type FinanceDay,
  type FinanceInventory,
  type FinanceMargin,
  type FinanceSummary,
  type MoneyByCurrency,
  type WarehouseSummary,
} from "@kshop/data";
import { Alert, BarChart, Button, Card, FieldError, Input, Label, Select, cn } from "@kshop/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

// Admin › Finanzas (module finance, owner/admin, PRP-6 D1–D10 and Roberto's answers): Resumen with the daily close
// in every currency, Margen, Inventario, Desglose and Gastos. The period and the currency of the «Equivalente» live
// in the URL so every tab and the export use the same ones.

const SECTIONS = [
  { href: "/admin/finance", label: "Resumen" },
  { href: "/admin/finance/margin", label: "Margen" },
  { href: "/admin/finance/inventory", label: "Inventario" },
  { href: "/admin/finance/breakdown", label: "Desglose" },
  { href: "/admin/finance/expenses", label: "Gastos" },
];

const havanaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Havana" }).format(new Date());
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("es", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const moneyList = (list: MoneyByCurrency[]) =>
  list.length === 0 ? "—" : list.map((m) => formatMoney(m.amount, m.currency)).join(" · ");

/** Period and currency from the URL (default: this month until today, in the base currency). */
export function useFinanceFilters(): FinancePeriod & { set: (patch: Partial<FinancePeriod>) => void } {
  const store = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = havanaToday();
  const from = params.get("from") ?? `${today.slice(0, 8)}01`;
  const to = params.get("to") ?? today;
  const currency = (params.get("currency") as CurrencyCode | null) ?? store.baseCurrency;
  return {
    from,
    to,
    currency,
    set: (patch) => {
      const next = new URLSearchParams({ from, to, currency, ...patch });
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
  };
}

/** Currencies of the store (base first): the options of «Ver todo en» and of an expense. */
function useStoreCurrencies(): CurrencyCode[] {
  const store = useStore();
  const { supabase } = useSession();
  const [currencies, setCurrencies] = useState<CurrencyCode[]>([store.baseCurrency]);
  useEffect(() => {
    supabase
      .from("store_currencies")
      .select("currency, is_base")
      .eq("store_id", store.id)
      .then(({ data }) => {
        if (!data?.length) return;
        setCurrencies(
          [...data]
            .sort(
              (a, b) => Number(b.is_base) - Number(a.is_base) || String(a.currency).localeCompare(b.currency),
            )
            .map((c) => c.currency as CurrencyCode),
        );
      });
  }, [supabase, store.id]);
  return currencies;
}

function useReport<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // Key of the request whose data is shown: while it differs from the current one the old numbers are dimmed.
  const key = JSON.stringify([...deps, version]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoadedKey(key);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(errorText(e, "No se pudo cargar el informe."));
        setLoadedKey(key);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading: loadedKey !== key, reload: () => setVersion((v) => v + 1) };
}

/** Wrapper of a report: dimmed and aria-busy while the numbers of the new period arrive. */
function Busy({ loading, children, testId }: { loading: boolean; children: ReactNode; testId?: string }) {
  return (
    <div
      aria-busy={loading}
      data-testid={testId}
      className={cn("flex flex-col gap-6 transition-opacity", loading && "pointer-events-none opacity-50")}
    >
      {children}
    </div>
  );
}

export function FinanceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const filters = useFinanceFilters();
  const store = useStore();
  const { api } = useSession();
  const currencies = useStoreCurrencies();
  const [exporting, setExporting] = useState(false);
  const today = havanaToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Hoy", from: today, to: today },
    { label: "7 días", from: addDays(today, -6), to: today },
    { label: "Este mes", from: monthStart, to: today },
    { label: "Mes pasado", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },
  ];

  async function exportExcel() {
    setExporting(true);
    try {
      const { blob, fileName } = await api.finance(store.id).export(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Finanzas</h1>
        <Button variant="outline" size="sm" onClick={() => void exportExcel()} disabled={exporting}>
          {exporting ? "Preparando…" : "Exportar a Excel"}
        </Button>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-b" aria-label="Secciones de finanzas">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={`${s.href}?${search}`}
            className={cn(
              "-mb-px border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              pathname === s.href && "border-primary font-bold text-primary",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {!pathname.endsWith("/inventory") && (
        <Card className="flex flex-wrap items-end gap-3" data-testid="finance-filters">
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant={filters.from === p.from && filters.to === p.to ? "default" : "outline"}
                onClick={() => filters.set({ from: p.from, to: p.to })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="finance-from">Desde</Label>
            <Input
              id="finance-from"
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(e) => e.target.value && filters.set({ from: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="finance-to">Hasta</Label>
            <Input
              id="finance-to"
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={(e) => e.target.value && filters.set({ to: e.target.value })}
              className="h-9"
            />
          </div>
          <CurrencyPicker
            value={filters.currency}
            options={currencies}
            onChange={(currency) => filters.set({ currency })}
          />
        </Card>
      )}
      {children}
    </div>
  );
}

function CurrencyPicker({
  value,
  options,
  onChange,
}: {
  value: CurrencyCode;
  options: CurrencyCode[];
  onChange: (c: CurrencyCode) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="finance-currency">Ver todo en</Label>
      <Select
        id="finance-currency"
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        className="h-9 w-28"
      >
        {options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  testId,
  tone,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  testId?: string;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resumen + cierre del día
// ---------------------------------------------------------------------------

export function FinanceSummaryPage() {
  const store = useStore();
  const { api } = useSession();
  const f = useFinanceFilters();
  const period = { from: f.from, to: f.to, currency: f.currency };
  const summary = useReport<FinanceSummary>(
    () => api.finance(store.id).summary(period),
    [f.from, f.to, f.currency],
  );
  const daily = useReport<{ days: FinanceDay[] }>(
    () => api.finance(store.id).daily(period),
    [f.from, f.to, f.currency],
  );

  if (summary.error) return <Alert variant="destructive">{summary.error}</Alert>;
  if (!summary.data) return <p className="text-muted-foreground">Cargando…</p>;
  const s = summary.data;
  const t = s.totals;
  const money = (v: number) => formatMoney(v, s.currency);
  const change =
    s.previous.sold > 0 ? Math.round(((t.sold - s.previous.sold) / s.previous.sold) * 100) : null;

  return (
    <Busy loading={summary.loading || daily.loading} testId="finance-summary">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Vendido"
          value={money(t.sold)}
          testId="kpi-sold"
          detail={
            <>
              {moneyList(s.sold)} · {t.orders} {t.orders === 1 ? "pedido" : "pedidos"}
              {change !== null && (
                <span className={cn("ml-1 font-medium", change >= 0 ? "text-success" : "text-destructive")}>
                  {change >= 0 ? "+" : ""}
                  {change} % vs. periodo anterior
                </span>
              )}
            </>
          }
        />
        <Kpi
          label="Cobrado"
          value={money(t.collected)}
          detail={moneyList(s.collected)}
          testId="kpi-collected"
        />
        <Kpi
          label="Pendiente de cobro"
          value={money(t.pending)}
          detail={moneyList(
            s.sold.filter((x) => x.pending > 0).map((x) => ({ currency: x.currency, amount: x.pending })),
          )}
          testId="kpi-pending"
        />
        <Kpi
          label="Margen bruto"
          value={money(t.margin)}
          testId="kpi-margin"
          detail={
            t.linesWithoutCost > 0
              ? `${t.linesWithoutCost} ${t.linesWithoutCost === 1 ? "línea sin costo queda" : "líneas sin costo quedan"} fuera`
              : "Ventas de productos − su costo (sin envío)"
          }
        />
        <Kpi label="Gastos" value={money(t.expenses)} detail={moneyList(s.expenses)} testId="kpi-expenses" />
        <Kpi
          label="Ganancia neta"
          value={money(t.net)}
          tone={t.net >= 0 ? "good" : "bad"}
          detail={`Margen − gastos · Ticket medio ${money(t.avgTicket)}`}
          testId="kpi-net"
        />
      </section>

      {daily.data && daily.data.days.length > 1 && (
        <Card>
          <h2 className="mb-3 font-semibold">Ventas por día ({s.currency})</h2>
          <BarChart
            ariaLabel={`Vendido y cobrado por día en ${s.currency}`}
            data={daily.data.days.map((d) => ({ label: dayLabel(d.day), values: [d.soldEq, d.collectedEq] }))}
            series={[
              { name: "Vendido", className: "fill-primary" },
              { name: "Cobrado", className: "fill-gold" },
            ]}
            format={money}
          />
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cierre del día</h2>
        <p className="text-sm text-muted-foreground">
          Lo vendido, cobrado y gastado cada día en cada moneda, y el total en {s.currency}.
        </p>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm" data-testid="daily-close">
            <thead className="border-b bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Día</th>
                <th className="px-4 py-2 font-medium">Pedidos</th>
                <th className="px-4 py-2 font-medium">Vendido</th>
                <th className="px-4 py-2 font-medium">Cobrado</th>
                <th className="px-4 py-2 font-medium">Gastos</th>
                <th className="px-4 py-2 text-right font-medium">Cobrado − gastos ({s.currency})</th>
              </tr>
            </thead>
            <tbody>
              {(daily.data?.days ?? [])
                .filter((d) => d.orders || d.collected.length || d.expenses.length)
                .reverse()
                .map((d) => (
                  <tr key={d.day} className="border-b last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{dayLabel(d.day)}</td>
                    <td className="px-4 py-2 tabular-nums">{d.orders}</td>
                    <td className="px-4 py-2">{moneyList(d.sold)}</td>
                    <td className="px-4 py-2">{moneyList(d.collected)}</td>
                    <td className="px-4 py-2">{moneyList(d.expenses)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {money(d.collectedEq - d.expensesEq)}
                    </td>
                  </tr>
                ))}
              {daily.data &&
                !daily.data.days.some((d) => d.orders || d.collected.length || d.expenses.length) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No hubo ventas, cobros ni gastos en este periodo.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </Card>
      </section>
      <p className="text-xs text-muted-foreground">
        «Vendido» cuenta los pedidos no cancelados (como «Ventas de hoy»); «Cobrado», los pagos menos las
        devoluciones. Lo convertido a {s.currency} usa la tasa de cada pedido, así que cambiar la tasa hoy no
        cambia el pasado.
      </p>
    </Busy>
  );
}

// ---------------------------------------------------------------------------
// Margen
// ---------------------------------------------------------------------------

export function FinanceMarginPage() {
  const store = useStore();
  const { api } = useSession();
  const f = useFinanceFilters();
  const [group, setGroup] = useState<MarginGroup>("product");
  const report = useReport<FinanceMargin>(
    () => api.finance(store.id).margin({ from: f.from, to: f.to, currency: f.currency }, group),
    [f.from, f.to, f.currency, group],
  );
  if (report.error) return <Alert variant="destructive">{report.error}</Alert>;
  if (!report.data) return <p className="text-muted-foreground">Cargando…</p>;
  const m = report.data;
  const money = (v: number) => formatMoney(v, m.currency);
  const pct =
    m.totals.revenueWithCost > 0
      ? Math.round((m.totals.margin / m.totals.revenueWithCost) * 1000) / 10
      : null;

  return (
    <Busy loading={report.loading} testId="finance-margin">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ingresos de productos"
          value={money(m.totals.revenue)}
          detail={`${m.totals.units} unidades`}
        />
        <Kpi label="Costo de lo vendido" value={money(m.totals.cost)} />
        <Kpi
          label="Margen bruto"
          value={money(m.totals.margin)}
          detail={pct !== null ? `${pct} % sobre lo que tiene costo` : undefined}
          testId="margin-total"
        />
        <Kpi
          label="Sin costo"
          value={String(m.totals.linesWithoutCost)}
          detail="Líneas vendidas sin costo cargado: quedan fuera del margen"
        />
      </section>
      {m.totals.linesWithoutCost > 0 && (
        <Alert>
          Hay {m.totals.linesWithoutCost}{" "}
          {m.totals.linesWithoutCost === 1 ? "línea vendida" : "líneas vendidas"} de productos sin costo: el
          margen está incompleto. Pon el costo en el producto para que cuente en los próximos pedidos.
        </Alert>
      )}
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="margin-group">Agrupar por</Label>
          <Select
            id="margin-group"
            value={group}
            onChange={(e) => setGroup(e.target.value as MarginGroup)}
            className="h-9 w-40"
          >
            {MARGIN_GROUPS.map((g) => (
              <option key={g} value={g}>
                {MARGIN_GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm" data-testid="margin-rows">
          <thead className="border-b bg-surface text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{MARGIN_GROUP_LABELS[group]}</th>
              <th className="px-4 py-2 text-right font-medium">Unidades</th>
              <th className="px-4 py-2 text-right font-medium">Ingresos</th>
              <th className="px-4 py-2 text-right font-medium">Costo</th>
              <th className="px-4 py-2 text-right font-medium">Margen</th>
              <th className="px-4 py-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  No hubo ventas en este periodo.
                </td>
              </tr>
            )}
            {m.rows.map((r) => (
              <tr key={r.key ?? r.name} className="border-b last:border-0">
                <td className="px-4 py-2">
                  {r.name}
                  {r.linesWithoutCost > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({r.linesWithoutCost} sin costo)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.units}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(r.revenue)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(r.cost)}</td>
                <td
                  className={cn(
                    "px-4 py-2 text-right font-medium tabular-nums",
                    r.margin < 0 && "text-destructive",
                  )}
                >
                  {money(r.margin)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.marginPct ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">
        El descuento de cada pedido se reparte entre sus productos; el envío no cuenta como ingreso de
        producto. El costo usa la tasa del día de la venta.
      </p>
    </Busy>
  );
}

// ---------------------------------------------------------------------------
// Inventario valorado
// ---------------------------------------------------------------------------

export function FinanceInventoryPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const f = useFinanceFilters();
  const [warehouseId, setWarehouseId] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [warehouses, setWarehouses] = useState<WarehouseSummary[]>([]);
  const currencies = useStoreCurrencies();
  const multiWarehouse = admin.enabledModules.has("multi_warehouse");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (multiWarehouse)
      api
        .warehouses(store.id)
        .overview()
        .then(
          (o) => setWarehouses(o.warehouses),
          () => undefined,
        );
  }, [api, store.id, multiWarehouse]);

  const report = useReport<FinanceInventory>(
    () =>
      api.finance(store.id).inventory({
        currency: f.currency,
        warehouseId: warehouseId || undefined,
        filter,
        q: search || undefined,
        page,
      }),
    [f.currency, warehouseId, filter, search, page],
  );
  const money = (v: number) => formatMoney(v, f.currency);
  const pages = report.data ? Math.max(1, Math.ceil(report.data.total / report.data.pageSize)) : 1;
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {report.data && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Unidades en stock"
            value={String(report.data.totals.units)}
            detail={`${report.data.totals.reserved} reservadas por pedidos`}
          />
          <Kpi
            label="Valor a costo"
            value={money(report.data.totals.costValue)}
            testId="inventory-cost"
            detail={
              report.data.totals.withoutCost > 0
                ? `${report.data.totals.withoutCost} productos con stock no tienen costo`
                : "Con la tasa de hoy"
            }
          />
          <Kpi label="Valor a precio de venta" value={money(report.data.totals.saleValue)} />
          <Kpi
            label="Agotados / pocas unidades"
            value={`${report.data.totals.outOfStock} / ${report.data.totals.lowStock}`}
          />
        </section>
      )}
      <Card className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {INVENTORY_FILTERS.map((x) => (
            <Button
              key={x}
              size="sm"
              variant={filter === x ? "default" : "outline"}
              onClick={() => {
                setFilter(x);
                setPage(1);
              }}
            >
              {INVENTORY_FILTER_LABELS[x]}
            </Button>
          ))}
        </div>
        {multiWarehouse && warehouses.length > 1 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="inv-warehouse">Almacén</Label>
            <Select
              id="inv-warehouse"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              className="h-9 w-44"
            >
              <option value="">Todos</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="inv-search">Buscar</Label>
          <Input
            id="inv-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o SKU"
            className="h-9 w-48"
          />
        </div>
        <CurrencyPicker
          value={f.currency}
          options={currencies}
          onChange={(currency) => f.set({ currency })}
        />
      </Card>
      {report.error && <Alert variant="destructive">{report.error}</Alert>}
      {!report.data ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <Card
          className={cn("overflow-x-auto p-0 transition-opacity", report.loading && "opacity-50")}
          aria-busy={report.loading}
        >
          <table className="w-full text-left text-sm" data-testid="inventory-rows">
            <thead className="border-b bg-surface text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Producto</th>
                <th className="px-4 py-2 text-right font-medium">Stock</th>
                <th className="px-4 py-2 text-right font-medium">Reservadas</th>
                <th className="px-4 py-2 text-right font-medium">Disponibles</th>
                <th className="px-4 py-2 text-right font-medium">Valor a costo</th>
                <th className="px-4 py-2 text-right font-medium">Valor a precio</th>
                <th className="px-4 py-2 font-medium">Último movimiento</th>
              </tr>
            </thead>
            <tbody>
              {report.data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No hay productos con este filtro.
                  </td>
                </tr>
              )}
              {report.data.rows.map((r) => (
                <tr key={r.variantId} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {r.productName}
                    {r.variantName && ` · ${r.variantName}`}{" "}
                    <span className="text-muted-foreground">({r.sku})</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.allocated}</td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium tabular-nums",
                      r.available <= 0 ? "text-destructive" : r.available <= r.threshold && "text-gold",
                    )}
                  >
                    {r.available}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.costValue === null ? (
                      <span className="text-muted-foreground">Sin costo</span>
                    ) : (
                      money(r.costValue)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.saleValue)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                    {r.lastMovement ? dateFmt.format(new Date(r.lastMovement)) : "Nunca"}
                    {multiWarehouse && (
                      <Link
                        href={`/admin/multi-warehouse/movements?${new URLSearchParams(warehouseId ? { warehouseId } : {})}`}
                        className="ml-2 underline"
                      >
                        Ver
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {report.data && pages > 1 && (
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

// ---------------------------------------------------------------------------
// Desglose
// ---------------------------------------------------------------------------

function BreakdownTable({
  title,
  rows,
  money,
}: {
  title: string;
  rows: FinanceBreakdownRow[];
  money: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin ventas.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2">
                <span>
                  {r.name} <span className="text-muted-foreground">· {r.orders} pedidos</span>
                </span>
                <span className="font-medium tabular-nums">{money(r.amount)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(r.amount / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FinanceBreakdownPage() {
  const store = useStore();
  const { api } = useSession();
  const f = useFinanceFilters();
  const report = useReport<FinanceBreakdown>(
    () => api.finance(store.id).breakdown({ from: f.from, to: f.to, currency: f.currency }),
    [f.from, f.to, f.currency],
  );
  if (report.error) return <Alert variant="destructive">{report.error}</Alert>;
  if (!report.data) return <p className="text-muted-foreground">Cargando…</p>;
  const b = report.data;
  const money = (v: number) => formatMoney(v, b.currency);
  return (
    <div
      className={cn("grid gap-3 transition-opacity md:grid-cols-2", report.loading && "opacity-50")}
      aria-busy={report.loading}
      data-testid="breakdown"
    >
      <BreakdownTable title="Por método de pago" rows={b.paymentMethods} money={money} />
      <BreakdownTable title="Por zona de entrega" rows={b.zones} money={money} />
      <BreakdownTable
        title="Por canal"
        rows={b.channels.map((c) => ({ ...c, name: ORDER_CHANNEL_LABELS[c.name] ?? c.name }))}
        money={money}
      />
      <BreakdownTable
        title="Por moneda del pedido"
        rows={b.currencies.map((c) => ({
          ...c,
          name: `${c.name} (${formatMoney(c.original ?? 0, c.name)})`,
        }))}
        money={money}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------

export function FinanceExpensesPage() {
  const store = useStore();
  const { api } = useSession();
  const f = useFinanceFilters();
  const list = useReport<{ expenses: Expense[] }>(
    () => api.finance(store.id).expenses({ from: f.from, to: f.to }),
    [f.from, f.to],
  );
  const [editing, setEditing] = useState<Expense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const currencies = useStoreCurrencies();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      spentOn: String(form.get("spentOn")),
      category: String(form.get("category") ?? ""),
      amount: Number(form.get("amount")),
      currency: String(form.get("currency")) as CurrencyCode,
      note: String(form.get("note") ?? ""),
    };
    setPending(true);
    setError(null);
    setFields({});
    try {
      if (editing) await api.finance(store.id).updateExpense(editing.id, input);
      else await api.finance(store.id).createExpense(input);
      setEditing(null);
      setFormKey((k) => k + 1);
      list.reload();
    } catch (e) {
      setError(errorText(e, "No se pudo guardar el gasto."));
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(expense: Expense) {
    if (
      !window.confirm(
        `¿Borrar el gasto «${expense.category}» de ${formatMoney(expense.amount, expense.currency)}?`,
      )
    )
      return;
    try {
      await api.finance(store.id).deleteExpense(expense.id);
      list.reload();
    } catch (e) {
      setError(errorText(e, "No se pudo borrar el gasto."));
    }
  }

  const totals = (list.data?.expenses ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = Math.round(((acc[e.currency] ?? 0) + e.amount) * 100) / 100;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form
          key={`${formKey}-${editing?.id ?? "new"}`}
          onSubmit={(e) => void submit(e)}
          className="grid gap-3 sm:grid-cols-[10rem_1fr_8rem_6rem]"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="expense-date">Fecha</Label>
            <Input
              id="expense-date"
              name="spentOn"
              type="date"
              defaultValue={editing?.spentOn ?? havanaToday()}
              required
            />
            <FieldError>{fields.spentOn}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="expense-category">En qué</Label>
            <Input
              id="expense-category"
              name="category"
              list="expense-categories"
              defaultValue={editing?.category ?? ""}
              required
              maxLength={60}
            />
            <datalist id="expense-categories">
              {EXPENSE_CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FieldError>{fields.category}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="expense-amount">Importe</Label>
            <Input
              id="expense-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={editing ? String(editing.amount) : ""}
              required
            />
            <FieldError>{fields.amount}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="expense-currency">Moneda</Label>
            <Select
              id="expense-currency"
              name="currency"
              defaultValue={editing?.currency ?? store.baseCurrency}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-3">
            <Label htmlFor="expense-note">Nota (opcional)</Label>
            <Input id="expense-note" name="note" defaultValue={editing?.note ?? ""} maxLength={500} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={pending}>
              {editing ? "Guardar" : "Añadir gasto"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm" data-testid="expenses">
          <thead className="border-b bg-surface text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">En qué</th>
              <th className="px-4 py-2 text-right font-medium">Importe</th>
              <th className="px-4 py-2 font-medium">Nota</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  No hay gastos apuntados en este periodo.
                </td>
              </tr>
            )}
            {list.data?.expenses.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{dayLabel(e.spentOn)}</td>
                <td className="px-4 py-2">{e.category}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(e.amount, e.currency)}</td>
                <td className="px-4 py-2 text-muted-foreground">{e.note}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void remove(e)}>
                    Borrar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          {Object.keys(totals).length > 0 && (
            <tfoot className="border-t bg-surface">
              <tr>
                <td className="px-4 py-2 font-medium" colSpan={2}>
                  Total del periodo
                </td>
                <td className="px-4 py-2 text-right font-medium tabular-nums" data-testid="expenses-total">
                  {Object.entries(totals)
                    .map(([c, v]) => formatMoney(v, c))
                    .join(" · ")}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
