import "server-only";
import type { PosClosingInput } from "@kshop/core";
import type { PosClosingPreview, PosClosingResult } from "@kshop/data";
import { mapDbError } from "./db-errors";
import { getServiceClient } from "./supabase";

// KSH0012: closing the day at the counter; since KSH0014 the whole till (every account and phone) at once. The SQL functions are service_role only; the routes check the store
// role and the pos module first.

type Money = Record<string, number>;
const money = (value: unknown): Money =>
  Object.fromEntries(
    Object.entries((value ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
  );
const methods = (value: unknown) =>
  ((value ?? []) as { name: string; currency: string; amount: unknown }[]).map((m) => ({
    name: m.name,
    currency: m.currency,
    amount: Number(m.amount),
  }));

export async function closingPreview(storeId: string, userId: string): Promise<PosClosingPreview> {
  const { data, error } = await getServiceClient().rpc("pos_closing_preview", {
    p_store_id: storeId,
    p_user_id: userId,
  });
  if (error) mapDbError(error);
  const row = data as Record<string, unknown>;
  return {
    day: String(row.day),
    float: money(row.float),
    cash: money(row.cash),
    expectedCash: money(row.expected_cash),
    methods: methods(row.methods),
    sales: Number(row.sales),
    voided: Number(row.voided),
    closedToday: Number(row.closed_today),
    olderOpen: Number(row.older_open),
    older: Number(row.older ?? 0),
    byCashier: ((row.by_cashier ?? []) as { cashier: string; sales: unknown; cash: unknown }[]).map((c) => ({
      cashier: c.cashier,
      sales: Number(c.sales),
      cash: money(c.cash),
    })),
  };
}

export async function closeDay(
  storeId: string,
  userId: string,
  input: PosClosingInput,
): Promise<PosClosingResult> {
  const { data, error } = await getServiceClient().rpc("pos_close_day", {
    p_store_id: storeId,
    p_user_id: userId,
    p_input: { counted: input.counted, ...(input.float && { float: input.float }), note: input.note ?? null },
  });
  if (error) mapDbError(error, "El cierre");
  const row = data as Record<string, unknown> & { expected: Record<string, unknown> };
  return {
    id: String(row.id),
    day: String(row.day),
    sequence: Number(row.sequence),
    expectedCash: money(row.expected.expected_cash),
    counted: money(row.counted),
    difference: money(row.difference),
  };
}

export async function setPosFloat(storeId: string, float: Money): Promise<void> {
  const { error } = await getServiceClient().from("stores").update({ pos_float: float }).eq("id", storeId);
  if (error) mapDbError(error);
}
