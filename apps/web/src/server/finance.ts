import "server-only";
import {
  INVENTORY_FILTER_LABELS,
  MARGIN_GROUP_LABELS,
  ORDER_CHANNEL_LABELS,
  type ExpenseInput,
  type FinanceInventoryQuery,
  type FinancePeriod,
  type MarginGroup,
} from "@kshop/core";
import type {
  Expense,
  FinanceBreakdown,
  FinanceDay,
  FinanceInventory,
  FinanceMargin,
  FinanceSummary,
  MoneyByCurrency,
} from "@kshop/data";
import ExcelJS from "exceljs";
import type { ApiUser } from "./auth";
import { mapDbError } from "./db-errors";
import { notFound } from "./http";
import { getServiceClient } from "./supabase";

// Phase 6 (PRP-6 D1–D8): Finanzas. The SQL functions do the sums (service_role); here only the call, the camelCase
// shape and the Excel export. The routes check owner/admin and the finance module first.

const INVENTORY_PAGE_SIZE = 50;

/** snake_case keys of the SQL jsonb -> camelCase (values untouched). */
function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camelize(v)]),
    ) as T;
  }
  return value as T;
}

async function report<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getServiceClient().rpc(fn, args);
  if (error) mapDbError(error, "El informe");
  return camelize<T>(data);
}

const periodArgs = (storeId: string, p: FinancePeriod) => ({
  p_store_id: storeId,
  p_from: p.from,
  p_to: p.to,
  p_currency: p.currency,
});

export const getSummary = (storeId: string, p: FinancePeriod) =>
  report<FinanceSummary>("finance_summary", periodArgs(storeId, p));

export const getDaily = async (storeId: string, p: FinancePeriod) => ({
  days: await report<FinanceDay[]>("finance_daily", periodArgs(storeId, p)),
});

export const getMargin = (storeId: string, p: FinancePeriod, group: MarginGroup) =>
  report<FinanceMargin>("finance_margin", { ...periodArgs(storeId, p), p_group: group });

export const getBreakdown = (storeId: string, p: FinancePeriod) =>
  report<FinanceBreakdown>("finance_breakdown", periodArgs(storeId, p));

export async function getInventory(storeId: string, q: FinanceInventoryQuery): Promise<FinanceInventory> {
  const result = await report<Omit<FinanceInventory, "page" | "pageSize">>("finance_inventory", {
    p_store_id: storeId,
    p_warehouse_id: q.warehouseId ?? null,
    p_currency: q.currency,
    p_filter: q.filter,
    p_stale_days: q.staleDays,
    p_search: q.q ?? null,
    p_limit: INVENTORY_PAGE_SIZE,
    p_offset: (q.page - 1) * INVENTORY_PAGE_SIZE,
  });
  return { ...result, page: q.page, pageSize: INVENTORY_PAGE_SIZE };
}

// ---------------------------------------------------------------------------
// Expenses (owner/admin; plain rows of the store, written with the service client)
// ---------------------------------------------------------------------------

type ExpenseRow = {
  id: string;
  spent_on: string;
  category: string;
  amount: number;
  currency: Expense["currency"];
  note: string | null;
  created_by: string | null;
};

const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  spentOn: r.spent_on,
  category: r.category,
  amount: Number(r.amount),
  currency: r.currency,
  note: r.note,
  createdBy: r.created_by,
});

const EXPENSE_COLUMNS = "id, spent_on, category, amount, currency, note, created_by";

export async function listExpenses(storeId: string, from: string, to: string): Promise<Expense[]> {
  const { data, error } = await getServiceClient()
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("store_id", storeId)
    .gte("spent_on", from)
    .lte("spent_on", to)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as ExpenseRow[]).map(toExpense);
}

const expenseRow = (input: ExpenseInput) => ({
  spent_on: input.spentOn,
  category: input.category,
  amount: input.amount,
  currency: input.currency,
  note: input.note ?? null,
});

export async function createExpense(storeId: string, input: ExpenseInput, user: ApiUser): Promise<Expense> {
  const { data, error } = await getServiceClient()
    .from("expenses")
    .insert({ store_id: storeId, ...expenseRow(input), created_by: user.id })
    .select(EXPENSE_COLUMNS)
    .single();
  if (error) mapDbError(error, "El gasto");
  return toExpense(data as ExpenseRow);
}

export async function updateExpense(storeId: string, id: string, input: ExpenseInput): Promise<Expense> {
  const { data, error } = await getServiceClient()
    .from("expenses")
    .update({ ...expenseRow(input), updated_at: new Date().toISOString() })
    .eq("store_id", storeId)
    .eq("id", id)
    .select(EXPENSE_COLUMNS)
    .maybeSingle();
  if (error) mapDbError(error, "El gasto");
  if (!data) throw notFound("Gasto");
  return toExpense(data as ExpenseRow);
}

export async function deleteExpense(storeId: string, id: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("expenses")
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, "El gasto");
  if (!data?.length) throw notFound("Gasto");
}

// ---------------------------------------------------------------------------
// Excel export (D8): one sheet per view, the same numbers as the screens.
// ---------------------------------------------------------------------------

const money = (list: MoneyByCurrency[]) => list.map((m) => `${m.amount} ${m.currency}`).join(" · ") || "—";

export async function buildFinanceExport(storeId: string, p: FinancePeriod): Promise<Buffer> {
  const [summary, daily, byProduct, byCategory, breakdown, inventory, expenses] = await Promise.all([
    getSummary(storeId, p),
    getDaily(storeId, p),
    getMargin(storeId, p, "product"),
    getMargin(storeId, p, "category"),
    getBreakdown(storeId, p),
    report<Omit<FinanceInventory, "page" | "pageSize">>("finance_inventory", {
      p_store_id: storeId,
      p_warehouse_id: null,
      p_currency: p.currency,
      p_filter: "all",
      p_stale_days: 60,
      p_search: null,
      p_limit: 500,
      p_offset: 0,
    }),
    listExpenses(storeId, p.from, p.to),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Kshop";
  const sheet = (name: string, columns: { header: string; key: string; width: number }[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns;
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B21B6" } };
    return ws;
  };
  const eq = `Equivalente (${p.currency})`;

  const resumen = sheet("Resumen", [
    { header: "Concepto", key: "label", width: 34 },
    { header: "Por moneda", key: "byCurrency", width: 40 },
    { header: eq, key: "eq", width: 20 },
  ]);
  const t = summary.totals;
  resumen.addRows([
    { label: `Periodo ${p.from} a ${p.to}`, byCurrency: "", eq: "" },
    { label: "Pedidos", byCurrency: "", eq: t.orders },
    { label: "Vendido", byCurrency: money(summary.sold), eq: t.sold },
    { label: "Cobrado", byCurrency: money(summary.collected), eq: t.collected },
    {
      label: "Pendiente de cobro",
      byCurrency: money(summary.sold.map((s) => ({ currency: s.currency, amount: s.pending }))),
      eq: t.pending,
    },
    { label: "Ticket medio", byCurrency: "", eq: t.avgTicket },
    { label: "Ingresos por envío", byCurrency: "", eq: t.shipping },
    { label: "Margen bruto (productos con costo)", byCurrency: "", eq: t.margin },
    { label: "Gastos", byCurrency: money(summary.expenses), eq: t.expenses },
    { label: "Ganancia neta", byCurrency: "", eq: t.net },
    { label: "Líneas sin costo (fuera del margen)", byCurrency: "", eq: t.linesWithoutCost },
    { label: `Vendido del periodo anterior (${summary.previous.from} a ${summary.previous.to})`, byCurrency: "", eq: summary.previous.sold },
  ]);

  const cierre = sheet("Cierre diario", [
    { header: "Día", key: "day", width: 12 },
    { header: "Pedidos", key: "orders", width: 10 },
    { header: "Vendido", key: "sold", width: 30 },
    { header: "Cobrado", key: "collected", width: 30 },
    { header: "Gastos", key: "expenses", width: 24 },
    { header: `Vendido (${p.currency})`, key: "soldEq", width: 16 },
    { header: `Cobrado (${p.currency})`, key: "collectedEq", width: 16 },
    { header: `Gastos (${p.currency})`, key: "expensesEq", width: 16 },
  ]);
  for (const d of daily.days) {
    cierre.addRow({
      ...d,
      sold: money(d.sold),
      collected: money(d.collected),
      expenses: money(d.expenses),
    });
  }

  for (const [name, data] of [
    [`Margen por ${MARGIN_GROUP_LABELS.product.toLowerCase()}`, byProduct],
    [`Margen por ${MARGIN_GROUP_LABELS.category.toLowerCase()}`, byCategory],
  ] as const) {
    const ws = sheet(name, [
      { header: "Nombre", key: "name", width: 32 },
      { header: "Unidades", key: "units", width: 10 },
      { header: `Ingresos (${p.currency})`, key: "revenue", width: 16 },
      { header: `Costo (${p.currency})`, key: "cost", width: 16 },
      { header: `Margen (${p.currency})`, key: "margin", width: 16 },
      { header: "Margen %", key: "marginPct", width: 10 },
      { header: "Líneas sin costo", key: "linesWithoutCost", width: 14 },
    ]);
    ws.addRows(data.rows);
  }

  const desglose = sheet("Desglose", [
    { header: "Por", key: "group", width: 16 },
    { header: "Nombre", key: "name", width: 28 },
    { header: "Pedidos", key: "orders", width: 10 },
    { header: eq, key: "amount", width: 18 },
  ]);
  for (const [group, rows] of [
    ["Método de pago", breakdown.paymentMethods],
    ["Zona", breakdown.zones],
    ["Canal", breakdown.channels.map((c) => ({ ...c, name: ORDER_CHANNEL_LABELS[c.name] ?? c.name }))],
    ["Moneda", breakdown.currencies],
  ] as const) {
    for (const r of rows) desglose.addRow({ group, ...r });
  }

  const inv = sheet("Inventario", [
    { header: "Producto", key: "productName", width: 30 },
    { header: "Variante", key: "variantName", width: 18 },
    { header: "SKU", key: "sku", width: 18 },
    { header: "Unidades", key: "quantity", width: 10 },
    { header: "Reservadas", key: "allocated", width: 11 },
    { header: "Disponibles", key: "available", width: 11 },
    { header: `Valor a costo (${p.currency})`, key: "costValue", width: 18 },
    { header: `Valor a precio (${p.currency})`, key: "saleValue", width: 18 },
  ]);
  inv.addRows(inventory.rows);
  if (inventory.total > inventory.rows.length) {
    inv.addRow({ productName: `… y ${inventory.total - inventory.rows.length} más (${INVENTORY_FILTER_LABELS.all})` });
  }

  const gastos = sheet("Gastos", [
    { header: "Fecha", key: "spentOn", width: 12 },
    { header: "Categoría", key: "category", width: 24 },
    { header: "Importe", key: "amount", width: 12 },
    { header: "Moneda", key: "currency", width: 8 },
    { header: "Nota", key: "note", width: 40 },
  ]);
  gastos.addRows(expenses);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
