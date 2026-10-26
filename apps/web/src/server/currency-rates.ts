import "server-only";
import type { CurrencyCode } from "@kshop/core";
import type { CurrencyRatesResponse } from "@kshop/data";
import { serverEnv } from "./env";
import { getServiceClient } from "./supabase";

// Phase 6 (PRP-6 D16, D17, Roberto decision 9): Admin › Monedas. The rate is always the owner's; elTOQUE's informal
// rate is only a suggestion. elTOQUE is called at most once per Havana day for the whole platform (cached in
// private.market_rates), like LensSpace does.

const HISTORY_SIZE = 20;

type MarketRates = { date: string; cupPer: Partial<Record<CurrencyCode, number>> };

const havanaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Havana" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

/** elTOQUE publishes CUP per unit; the euro is "ECU". */
function toCupPer(rates: Record<string, unknown>): MarketRates["cupPer"] {
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = Number(rates[key]);
      if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
    }
    return undefined;
  };
  return { CUP: 1, USD: read("USD"), EUR: read("ECU", "EUR") };
}

async function fetchElToque(token: string, date: string): Promise<Record<string, unknown> | null> {
  const range = new URLSearchParams({ date_from: `${date} 00:00:01`, date_to: `${date} 23:59:01` });
  const res = await fetch(`https://tasas.eltoque.com/v1/trmi?${range}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`eltoque_http_${res.status}`);
  const body = (await res.json()) as { tasas?: Record<string, unknown> };
  return body.tasas && Number(body.tasas.USD) > 0 ? body.tasas : null;
}

/** Today's elTOQUE rates (or the last ones cached); null without token and without cache. Never throws. */
export async function getMarketRates(): Promise<MarketRates | null> {
  const db = getServiceClient();
  const { data } = await db.rpc("market_rate_get", { p_source: "eltoque" });
  const cached = data as { rate_date: string; rates: Record<string, unknown> } | null;
  const today = havanaDate();
  if (cached?.rate_date === today || !serverEnv.elToqueToken) {
    return cached ? { date: cached.rate_date, cupPer: toCupPer(cached.rates) } : null;
  }
  try {
    // Early in the day elTOQUE may not have published today's rate yet.
    let date = today;
    let rates = await fetchElToque(serverEnv.elToqueToken, today);
    if (!rates) {
      date = havanaDate(-1);
      rates = await fetchElToque(serverEnv.elToqueToken, date);
    }
    if (!rates) throw new Error("eltoque_no_usd");
    await db.rpc("market_rate_put", { p_source: "eltoque", p_rate_date: today, p_rates: rates });
    return { date, cupPer: toCupPer(rates) };
  } catch (error) {
    console.error("elTOQUE rate refresh failed.", {
      message: error instanceof Error ? error.message : String(error),
    });
    return cached ? { date: cached.rate_date, cupPer: toCupPer(cached.rates) } : null;
  }
}

export async function getCurrencyRates(storeId: string): Promise<CurrencyRatesResponse> {
  const db = getServiceClient();
  const [store, currencies, history, fixed, market] = await Promise.all([
    db.from("stores").select("base_currency").eq("id", storeId).single(),
    db
      .from("store_currencies")
      .select("currency, is_base, sells, rate_to_base, rounding, updated_at")
      .eq("store_id", storeId),
    db
      .from("currency_rate_history")
      .select("currency, rate, set_at, set_by")
      .eq("store_id", storeId)
      .order("set_at", { ascending: false })
      .limit(HISTORY_SIZE * 3),
    db.rpc("currency_fixed_prices", { p_store_id: storeId }),
    getMarketRates(),
  ]);
  for (const result of [store, currencies, history, fixed]) if (result.error) throw result.error;

  const base = store.data!.base_currency as CurrencyCode;
  const setByIds = [...new Set((history.data ?? []).flatMap((h) => (h.set_by ? [h.set_by] : [])))];
  const users = await Promise.all(setByIds.map((id) => db.auth.admin.getUserById(id)));
  const emailById = new Map(users.map((r, i) => [setByIds[i], r.data.user?.email ?? null]));
  const fixedByCurrency = new Map(
    ((fixed.data ?? []) as { currency: string; variants: number }[]).map((f) => [f.currency, f.variants]),
  );
  const cupPerBase = market?.cupPer[base];

  return {
    baseCurrency: base,
    currencies: (currencies.data ?? [])
      .map((c) => {
        const code = c.currency as CurrencyCode;
        const cupPer = market?.cupPer[code];
        return {
          currency: code,
          isBase: c.is_base,
          sells: c.sells,
          rateToBase: Number(c.rate_to_base),
          rounding: c.rounding === null ? null : Number(c.rounding),
          updatedAt: c.updated_at,
          fixedPrices: fixedByCurrency.get(code) ?? 0,
          history: (history.data ?? [])
            .filter((h) => h.currency === code)
            .slice(0, HISTORY_SIZE)
            .map((h) => ({
              rate: Number(h.rate),
              setAt: h.set_at,
              setBy: h.set_by ? (emailById.get(h.set_by) ?? null) : null,
            })),
          suggested:
            !c.is_base && cupPer && cupPerBase ? Math.round((cupPer / cupPerBase) * 10_000) / 10_000 : null,
        };
      })
      .sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.currency.localeCompare(b.currency)),
    reference: market ? { source: "eltoque", date: market.date } : null,
  };
}
