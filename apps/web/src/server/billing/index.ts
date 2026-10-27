import "server-only";
import type {
  BillingSettingsInput,
  ChangePlanInput,
  ModuleCode,
  PlanCode,
  PlanUpdateInput,
  PlatformPaymentInput,
  SubscriptionGrantInput,
  SubscriptionUpdateInput,
} from "@kshop/core";
import type {
  BillingModule,
  BillingPlan,
  BillingQuote,
  BillingSettings,
  InvoiceLine,
  PlatformInvoice,
  PlatformSubscription,
  StoreBilling,
  StoreUsage,
} from "@kshop/data";
import { revalidateTag } from "next/cache";
import { invalidateCatalog } from "../catalog/access";
import { mapDbError } from "../db-errors";
import { notFound } from "../http";
import { getPlatformStore } from "../platform-stores";
import { storeCacheTag } from "../stores";
import { getServiceClient } from "../supabase";

// Plans, subscriptions and invoices (PRP-5). Every write is a service_role SQL function (one transaction each);
// this module reads with the service client and shapes the API responses.

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

async function rpc<T>(fn: string, args: Record<string, unknown>, entity = "El registro"): Promise<T> {
  const { data, error } = await getServiceClient().rpc(fn, args);
  if (error) mapDbError(error, entity);
  return data as T;
}

/** The platform landing shows the public plans, add-on prices and support WhatsApp (redesign R7). */
export const LANDING_CACHE_TAG = "platform-landing";

/** A plan, add-on or status change shows at once in the storefront (currencies, coupons, suspension). */
export async function expireStoreCaches(storeIds: string[]): Promise<void> {
  if (!storeIds.length) return;
  const { data } = await getServiceClient().from("stores").select("id, slug").in("id", storeIds);
  for (const store of data ?? []) {
    revalidateTag(storeCacheTag(store.slug), { expire: 0 });
    invalidateCatalog(store.id);
  }
}

// ---------------------------------------------------------------------------
// Plans and modules
// ---------------------------------------------------------------------------

type PlanRow = {
  code: PlanCode;
  name: string;
  price: number;
  yearly_price: number | null;
  is_public: boolean;
  sort_order: number;
  plan_modules: { module_code: ModuleCode }[];
  plan_limits: { key: string; value: number }[];
};

export async function getPlans(): Promise<{ plans: BillingPlan[]; modules: BillingModule[] }> {
  const service = getServiceClient();
  const [plans, modules] = await Promise.all([
    service
      .from("plans")
      .select(
        "code, name, price, yearly_price, is_public, sort_order, plan_modules (module_code), plan_limits (key, value)",
      )
      .order("sort_order")
      .returns<PlanRow[]>(),
    service
      .from("modules")
      .select("code, name, description, addon_price, depends_on, sort_order")
      .order("sort_order"),
  ]);
  if (plans.error) throw plans.error;
  if (modules.error) throw modules.error;
  return {
    plans: plans.data.map((p) => {
      const limit = (key: string) => p.plan_limits.find((l) => l.key === key)?.value ?? null;
      return {
        code: p.code,
        name: p.name,
        price: num(p.price),
        yearlyPrice: numOrNull(p.yearly_price),
        isPublic: p.is_public,
        modules: p.plan_modules.map((m) => m.module_code),
        limits: { maxProducts: limit("max_products"), maxStaff: limit("max_staff") },
      };
    }),
    modules: modules.data.map((m) => ({
      code: m.code as ModuleCode,
      name: m.name,
      description: m.description,
      addonPrice: numOrNull(m.addon_price),
      dependsOn: m.depends_on ?? [],
    })),
  };
}

export async function updatePlan(code: PlanCode, input: PlanUpdateInput) {
  const result = await rpc<{ store_ids: string[] }>(
    "plan_update",
    {
      p_plan_code: code,
      p_input: {
        price: input.price,
        yearly_price: input.yearlyPrice,
        is_public: input.isPublic,
        modules: input.modules,
        limits: { max_products: input.limits.maxProducts, max_staff: input.limits.maxStaff },
      },
    },
    "El plan",
  );
  await expireStoreCaches(result.store_ids);
  revalidateTag(LANDING_CACHE_TAG, { expire: 0 });
  return getPlans();
}

export async function setAddonPrice(code: ModuleCode, price: number | null) {
  await rpc("module_set_addon_price", { p_module_code: code, p_price: price }, "El módulo");
  revalidateTag(LANDING_CACHE_TAG, { expire: 0 });
  return getPlans();
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const INVOICE_SELECT = `id, store_id, number, period_start, period_end, subtotal, discount, total, amount_paid, status,
  issued_at, due_at, paid_at, void_reason, stores (name, slug),
  platform_invoice_lines (kind, description, quantity, unit_amount, amount, sort_order),
  platform_payments (id, amount, method, reference, paid_at)`;

type InvoiceRow = {
  id: string;
  store_id: string;
  number: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  status: PlatformInvoice["status"];
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  void_reason: string | null;
  stores: { name: string; slug: string } | null;
  platform_invoice_lines: {
    kind: InvoiceLine["kind"];
    description: string;
    quantity: number;
    unit_amount: number;
    amount: number;
    sort_order: number;
  }[];
  platform_payments: {
    id: string;
    amount: number;
    method: PlatformInvoice["payments"][number]["method"];
    reference: string | null;
    paid_at: string;
  }[];
};

function toLine(l: {
  kind: InvoiceLine["kind"];
  description: string;
  quantity: unknown;
  unit_amount: unknown;
  amount: unknown;
}): InvoiceLine {
  return {
    kind: l.kind,
    description: l.description,
    quantity: num(l.quantity),
    unitAmount: num(l.unit_amount),
    amount: num(l.amount),
  };
}

function toInvoice(row: InvoiceRow): PlatformInvoice {
  return {
    id: row.id,
    storeId: row.store_id,
    store: row.stores,
    number: row.number,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    total: num(row.total),
    amountPaid: num(row.amount_paid),
    status: row.status,
    overdue: row.status === "pending" && new Date(row.due_at) <= new Date(),
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    voidReason: row.void_reason,
    lines: [...row.platform_invoice_lines].sort((a, b) => a.sort_order - b.sort_order).map(toLine),
    payments: row.platform_payments
      .map((p) => ({
        id: p.id,
        amount: num(p.amount),
        method: p.method,
        reference: p.reference,
        paidAt: p.paid_at,
      }))
      .sort((a, b) => a.paidAt.localeCompare(b.paidAt)),
  };
}

export async function listInvoices(filter: {
  status?: string;
  storeId?: string;
}): Promise<PlatformInvoice[]> {
  let query = getServiceClient().from("platform_invoices").select(INVOICE_SELECT);
  if (filter.storeId) query = query.eq("store_id", filter.storeId);
  if (filter.status === "open") query = query.eq("status", "pending");
  if (filter.status === "overdue")
    query = query.eq("status", "pending").lte("due_at", new Date().toISOString());
  if (filter.status === "paid") query = query.eq("status", "paid");
  const { data, error } = await query
    .order(filter.status === "open" || filter.status === "overdue" ? "due_at" : "issued_at", {
      ascending: filter.status === "open" || filter.status === "overdue",
    })
    .limit(200)
    .returns<InvoiceRow[]>();
  if (error) throw error;
  return data.map(toInvoice);
}

async function getInvoice(invoiceId: string): Promise<PlatformInvoice> {
  const { data, error } = await getServiceClient()
    .from("platform_invoices")
    .select(INVOICE_SELECT)
    .eq("id", invoiceId)
    .maybeSingle<InvoiceRow>();
  if (error) throw error;
  if (!data) throw notFound("La factura");
  return toInvoice(data);
}

export async function recordPayment(invoiceId: string, input: PlatformPaymentInput, actor: string) {
  const result = await rpc<{ store_id: string; reactivated: boolean }>(
    "record_platform_payment",
    {
      p_invoice_id: invoiceId,
      p_amount: input.amount,
      p_method: input.method,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_paid_at: input.paidAt ?? null,
      p_actor: actor,
    },
    "La factura",
  );
  if (result.reactivated) await expireStoreCaches([result.store_id]);
  return getInvoice(invoiceId);
}

export async function adjustInvoice(invoiceId: string, description: string, amount: number, actor: string) {
  const result = await rpc<{ store_id: string }>(
    "platform_invoice_adjust",
    {
      p_invoice_id: invoiceId,
      p_description: description,
      p_amount: amount,
      p_actor: actor,
    },
    "La factura",
  );
  await expireStoreCaches([result.store_id]);
  return getInvoice(invoiceId);
}

export async function voidInvoice(invoiceId: string, reason: string | undefined, actor: string) {
  const result = await rpc<{ store_id: string }>(
    "platform_invoice_void",
    {
      p_invoice_id: invoiceId,
      p_reason: reason ?? null,
      p_actor: actor,
    },
    "La factura",
  );
  await expireStoreCaches([result.store_id]);
  return getInvoice(invoiceId);
}

// ---------------------------------------------------------------------------
// A store's subscription (owner view and superadmin view)
// ---------------------------------------------------------------------------

type SubscriptionRow = {
  status: string;
  billing_interval: StoreBilling["interval"];
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  founder: boolean;
  cancel_at: string | null;
  price_override: number | null;
  limit_overrides: { max_products?: number | null; max_staff?: number | null };
  notes: string | null;
  plans: { code: PlanCode; name: string };
  stores: { status: StoreBilling["storeStatus"]; suspended_reason: StoreBilling["suspendedReason"] };
};

async function readSubscription(storeId: string): Promise<SubscriptionRow> {
  const { data, error } = await getServiceClient()
    .from("subscriptions")
    .select(
      `status, billing_interval, trial_ends_at, current_period_start, current_period_end, founder, cancel_at,
      price_override, limit_overrides, notes, plans (code, name), stores (status, suspended_reason)`,
    )
    .eq("store_id", storeId)
    .maybeSingle<SubscriptionRow>();
  if (error) throw error;
  if (!data) throw notFound("La suscripción");
  return data;
}

async function getBillingSettings(): Promise<BillingSettings> {
  const s = await rpc<Record<string, unknown>>("platform_billing_get", {});
  return {
    invoiceLeadDays: num(s.invoice_lead_days),
    invoiceDueDays: num(s.invoice_due_days),
    graceDays: num(s.grace_days),
    trialReminderDays: num(s.trial_reminder_days),
    defaultTrialDays: num(s.default_trial_days),
    billingInstructions: String(s.billing_instructions ?? ""),
    supportWhatsapp: (s.support_whatsapp as string | null) ?? null,
  };
}

export { getBillingSettings };

export async function setBillingSettings(input: BillingSettingsInput): Promise<BillingSettings> {
  await rpc("platform_billing_set", {
    p_input: {
      invoice_lead_days: input.invoiceLeadDays,
      invoice_due_days: input.invoiceDueDays,
      grace_days: input.graceDays,
      trial_reminder_days: input.trialReminderDays,
      default_trial_days: input.defaultTrialDays,
      billing_instructions: input.billingInstructions,
      support_whatsapp: input.supportWhatsapp,
    },
  });
  revalidateTag(LANDING_CACHE_TAG, { expire: 0 });
  return getBillingSettings();
}

type StoreModuleRow = {
  module_code: ModuleCode;
  source: "plan" | "addon" | "grant";
  enabled: boolean;
  price: number | null;
  starts_at: string;
  ends_at: string | null;
  reason: string | null;
};

const SOURCE_RANK = { grant: 3, addon: 2, plan: 1 } as const;

export async function getStoreBilling(
  storeId: string,
): Promise<StoreBilling & { _modules: StoreModuleRow[] }> {
  const service = getServiceClient();
  const sub = await readSubscription(storeId);
  const billable = sub.status !== "comped" && sub.status !== "cancelled";
  const [catalog, storeModules, usage, quote, invoices, settings] = await Promise.all([
    getPlans(),
    service
      .from("store_modules")
      .select("module_code, source, enabled, price, starts_at, ends_at, reason")
      .eq("store_id", storeId)
      .returns<StoreModuleRow[]>(),
    rpc<{
      max_products: { limit: number | null; used: number };
      max_staff: { limit: number | null; used: number };
    }>("store_usage", { p_store_id: storeId }),
    billable
      ? rpc<Record<string, unknown>>("subscription_quote", { p_store_id: storeId })
      : Promise.resolve(null),
    listInvoices({ storeId, status: "all" }),
    getBillingSettings(),
  ]);
  if (storeModules.error) throw storeModules.error;
  const now = Date.now();
  // starts_at comes from the database clock, which may run a second ahead of this server: a module bought just now
  // must show as active.
  const active = (m: StoreModuleRow) =>
    m.enabled &&
    new Date(m.starts_at).getTime() <= now + 60_000 &&
    (!m.ends_at || new Date(m.ends_at).getTime() > now);
  const pro = catalog.plans.find((p) => p.code === "pro");

  const usageOut: StoreUsage = {
    maxProducts: { limit: usage.max_products.limit, used: num(usage.max_products.used) },
    maxStaff: { limit: usage.max_staff.limit, used: num(usage.max_staff.used) },
  };
  const quoteOut: BillingQuote | null = quote && {
    periodStart: String(quote.period_start),
    periodEnd: String(quote.period_end),
    interval: quote.interval as BillingQuote["interval"],
    lines: (quote.lines as Parameters<typeof toLine>[0][]).map(toLine),
    subtotal: num(quote.subtotal),
    discount: num(quote.discount),
    total: num(quote.total),
  };

  return {
    plan: sub.plans,
    interval: sub.billing_interval,
    status: sub.status,
    storeStatus: sub.stores.status,
    suspendedReason: sub.stores.suspended_reason,
    trialEndsAt: sub.trial_ends_at,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    founder: sub.founder,
    cancelAt: sub.cancel_at,
    quote: quoteOut,
    usage: usageOut,
    modules: catalog.modules.map((m) => {
      const best = storeModules.data
        .filter((r) => r.module_code === m.code && active(r))
        .sort((a, b) => SOURCE_RANK[b.source] - SOURCE_RANK[a.source])[0];
      return {
        ...m,
        source: best?.source ?? null,
        inPro: !!pro?.modules.includes(m.code),
        endsAt: best?.ends_at ?? null,
      };
    }),
    invoices,
    plans: catalog.plans.filter((p) => p.isPublic),
    instructions: settings.billingInstructions || null,
    supportWhatsapp: settings.supportWhatsapp,
    _modules: storeModules.data,
  };
}

/** What the owner/admin sees (no override, notes or grants). */
export async function getOwnerBilling(storeId: string): Promise<StoreBilling> {
  const { _modules: _, ...billing } = await getStoreBilling(storeId);
  return billing;
}

export async function getPlatformSubscription(storeId: string): Promise<PlatformSubscription> {
  const [{ _modules, ...billing }, sub, store, grants] = await Promise.all([
    getStoreBilling(storeId),
    readSubscription(storeId),
    getPlatformStore(storeId),
    getServiceClient()
      .from("subscription_grants")
      .select("id, type, value, reason, starts_at, ends_at, revoked_at, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false }),
  ]);
  if (grants.error) throw grants.error;
  return {
    ...billing,
    plans: (await getPlans()).plans,
    store,
    priceOverride: numOrNull(sub.price_override),
    limitOverrides: {
      maxProducts: sub.limit_overrides.max_products,
      maxStaff: sub.limit_overrides.max_staff,
    },
    notes: sub.notes,
    grants: grants.data.map((g) => ({
      id: g.id,
      type: g.type,
      value: num(g.value),
      reason: g.reason,
      startsAt: g.starts_at,
      endsAt: g.ends_at,
      revokedAt: g.revoked_at,
      createdAt: g.created_at,
    })),
    storeModules: _modules.map((m) => ({
      code: m.module_code,
      source: m.source,
      enabled: m.enabled,
      price: numOrNull(m.price),
      endsAt: m.ends_at,
      reason: m.reason,
    })),
  };
}

// ---------------------------------------------------------------------------
// Superadmin actions on a subscription (each returns the fresh view)
// ---------------------------------------------------------------------------

async function afterChange(storeId: string): Promise<PlatformSubscription> {
  await expireStoreCaches([storeId]);
  return getPlatformSubscription(storeId);
}

export async function changePlan(storeId: string, input: ChangePlanInput, actor: string) {
  await rpc(
    "change_plan",
    { p_store_id: storeId, p_plan_code: input.planCode, p_interval: input.interval, p_user_id: actor },
    "La tienda",
  );
  return afterChange(storeId);
}

export async function setStoreAddon(
  storeId: string,
  moduleCode: ModuleCode,
  enabled: boolean,
  actor: string,
) {
  await rpc(
    "set_store_addon",
    { p_store_id: storeId, p_module_code: moduleCode, p_enabled: enabled, p_user_id: actor },
    "El módulo",
  );
  return afterChange(storeId);
}

export async function setStoreModuleGrant(
  storeId: string,
  input: { moduleCode: ModuleCode; enabled: boolean; endsAt?: string | null; reason?: string },
  actor: string,
) {
  await rpc(
    "set_store_module_grant",
    {
      p_store_id: storeId,
      p_module_code: input.moduleCode,
      p_enabled: input.enabled,
      p_ends_at: input.endsAt ?? null,
      p_reason: input.reason ?? null,
      p_user_id: actor,
    },
    "El módulo",
  );
  return afterChange(storeId);
}

export async function addGrant(storeId: string, input: SubscriptionGrantInput, actor: string) {
  await rpc(
    "subscription_add_grant",
    {
      p_store_id: storeId,
      p_type: input.type,
      p_value: input.value,
      p_reason: input.reason ?? null,
      p_ends_at: input.endsAt ?? null,
      p_actor: actor,
    },
    "La tienda",
  );
  return afterChange(storeId);
}

export async function revokeGrant(storeId: string, grantId: string, actor: string) {
  const { data } = await getServiceClient()
    .from("subscription_grants")
    .select("store_id")
    .eq("id", grantId)
    .maybeSingle();
  if (data?.store_id !== storeId) throw notFound("El regalo");
  await rpc("subscription_revoke_grant", { p_grant_id: grantId, p_actor: actor }, "El regalo");
  return afterChange(storeId);
}

export async function updateSubscription(storeId: string, input: SubscriptionUpdateInput, actor: string) {
  const patch: Record<string, unknown> = {};
  if (input.priceOverride !== undefined) patch.price_override = input.priceOverride;
  if (input.limitOverrides !== undefined) {
    const limits: Record<string, number> = {};
    if (input.limitOverrides.maxProducts != null) limits.max_products = input.limitOverrides.maxProducts;
    if (input.limitOverrides.maxStaff != null) limits.max_staff = input.limitOverrides.maxStaff;
    patch.limit_overrides = limits;
  }
  if (input.founder !== undefined) patch.founder = input.founder;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.cancelAt !== undefined) patch.cancel_at = input.cancelAt;
  if (input.comped !== undefined) patch.comped = input.comped;
  await rpc("subscription_update", { p_store_id: storeId, p_patch: patch, p_actor: actor }, "La tienda");
  return afterChange(storeId);
}

export async function issueInvoice(storeId: string, actor: string) {
  await rpc("platform_invoice_issue", { p_store_id: storeId, p_actor: actor }, "La tienda");
  return afterChange(storeId);
}
