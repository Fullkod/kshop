"use client";

import {
  DISCOUNT_TARGET_LABELS,
  formatMoney,
  hasMinRole,
  isoToLocal,
  localToIso,
  orderCode,
  rewardLabel,
  VOUCHER_SCOPE_LABELS,
  VOUCHER_SCOPES,
  type DiscountReward,
  type DiscountTarget,
  type PromotionInput,
  type VoucherInput,
  type VoucherScope,
} from "@kshop/core";
import { asResult } from "@kshop/data";
import { Alert, Badge, Button, Card, cn, Dialog, FieldError, Input, Label, Select } from "@kshop/ui";
import Link from "next/link";
import { useStorePathname } from "@/lib/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useCheckoutSettings } from "@/features/orders/use-orders";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

// Admin screens of the discounts module (PRP-4): automatic promotions (crossed-out price in the storefront) and
// vouchers typed in the cart. Admins and owners edit them; the staff sees them read-only. Dates are typed in
// Cuba's time zone; fixed amounts and minimums in the store's base currency.

type Target = { type: DiscountTarget; id: string };
type Promotion = {
  id: string;
  name: string;
  description: string | null;
  reward: DiscountReward;
  value: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
  targets: Target[];
};
type Voucher = {
  id: string;
  code: string;
  name: string;
  scope: VoucherScope;
  reward: DiscountReward;
  value: number;
  minSubtotal: number | null;
  minQuantity: number | null;
  usageLimit: number | null;
  usagePerCustomer: number | null;
  usedCount: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  targets: Target[];
  usages: {
    id: string;
    amount: number;
    currency: string;
    phone: string;
    createdAt: string;
    released: boolean;
    order: { id: string; number: number; customerName: string } | null;
  }[];
};

const nodes = <T,>(c: { edges: { node: T }[] } | null | undefined): T[] =>
  (c?.edges ?? []).map((e) => e.node);
const num = (v: unknown) => (v == null ? null : Number(v));
const targetsOf = (
  c: { edges: { node: { targetType: unknown; targetId: string } }[] } | null | undefined,
): Target[] => nodes(c).map((t) => ({ type: String(t.targetType) as DiscountTarget, id: t.targetId }));

function useCanEdit() {
  const admin = useAdmin();
  return admin.role === null || hasMinRole(admin.role, "admin");
}

/** Scheduled / active / over / paused, from the flag and the dates. */
function status(item: { isActive: boolean; startsAt: string; endsAt: string | null }) {
  const now = Date.now();
  if (!item.isActive) return { label: "Pausada", variant: "muted" as const };
  if (new Date(item.startsAt).getTime() > now) return { label: "Programada", variant: "gold" as const };
  if (item.endsAt && new Date(item.endsAt).getTime() <= now)
    return { label: "Terminada", variant: "muted" as const };
  return { label: "Activa", variant: "success" as const };
}

const dateText = (iso: string) =>
  new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short", timeZone: "America/Havana" });

function dates(item: { startsAt: string; endsAt: string | null }) {
  return item.endsAt
    ? `${dateText(item.startsAt)} → ${dateText(item.endsAt)}`
    : `Desde ${dateText(item.startsAt)}`;
}

// ---------------------------------------------------------------------------
// Navigation and data
// ---------------------------------------------------------------------------

const SECTIONS = [
  { href: "/admin/discounts", label: "Promociones", module: "discounts" },
  { href: "/admin/discounts/vouchers", label: "Cupones", module: "vouchers" },
] as const;

/** Tabs of the sections the plan includes (nothing to switch to when there is only one). */
export function DiscountsNav() {
  const pathname = useStorePathname();
  const admin = useAdmin();
  const sections = SECTIONS.filter((s) => admin.enabledModules.has(s.module));
  if (sections.length < 2) return null;
  return (
    <nav
      className="mb-6 flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]"
      aria-label="Secciones de descuentos"
    >
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "shrink-0 border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
            pathname === s.href && "border-primary font-bold text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

function useQueryData<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (d) => {
        if (cancelled) return;
        if (d === null) setError("No se pudieron cargar los descuentos.");
        else setData(d);
      },
      () => !cancelled && setError("No se pudieron cargar los descuentos."),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is rebuilt from deps
  }, [...deps, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

/** Names of categories, collections, brands and the chosen products (for the target chips and pickers). */
function useTargetNames(productIds: string[]) {
  const store = useStore();
  const { reads } = useSession();
  const key = [...new Set(productIds)].sort().join(",");
  const { data } = useQueryData(async () => {
    const r = await asResult(reads.discountTargets(store.id, key ? key.split(",") : []));
    if (r.error || !r.data) return null;
    return {
      category: nodes(r.data.categoriesCollection).map((c) => ({
        id: c.id,
        name: `${"— ".repeat(c.depth)}${c.name}`,
      })),
      collection: nodes(r.data.collectionsCollection),
      brand: nodes(r.data.brandsCollection),
      product: nodes(r.data.productsCollection),
    };
  }, [reads, store.id, key]);
  return data;
}

type TargetNames = NonNullable<ReturnType<typeof useTargetNames>>;

function targetName(names: TargetNames | null, t: Target): string {
  if (t.type === "variant") return "Variante";
  const list: { id: string; name: string }[] | undefined = names?.[t.type];
  return list?.find((x) => x.id === t.id)?.name.replace(/^(— )+/, "") ?? "…";
}

// ---------------------------------------------------------------------------
// Target picker
// ---------------------------------------------------------------------------

function TargetPicker({
  value,
  onChange,
  names,
}: {
  value: Target[];
  onChange: (t: Target[]) => void;
  names: TargetNames | null;
}) {
  const store = useStore();
  const { reads } = useSession();
  const [type, setType] = useState<Exclude<DiscountTarget, "variant">>("category");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  const add = (t: Target) =>
    !value.some((v) => v.type === t.type && v.id === t.id) && onChange([...value, t]);

  useEffect(() => {
    const q = query.trim();
    if (type !== "product" || q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await asResult(reads.variantSearch(store.id, q));
      if (!cancelled) setFound(nodes(r.data?.adminSearchProducts).map((p) => ({ id: p.id, name: p.name })));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reads, store.id, query, type]);

  const options = type === "product" ? [] : (names?.[type] ?? []);
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Se aplica a">
          {value.map((t) => (
            <li
              key={`${t.type}:${t.id}`}
              className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
            >
              <span className="text-muted-foreground">{DISCOUNT_TARGET_LABELS[t.type]}:</span>{" "}
              {targetName(names, t)}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${targetName(names, t)}`}
                onClick={() => onChange(value.filter((v) => v !== t))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          aria-label="Tipo"
          className="w-36"
        >
          <option value="category">Categoría</option>
          <option value="collection">Colección</option>
          <option value="brand">Marca</option>
          <option value="product">Producto</option>
        </Select>
        {type === "product" ? (
          <Input
            type="search"
            placeholder="Buscar producto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar producto"
            className="min-w-48 flex-1"
          />
        ) : (
          <Select
            value=""
            onChange={(e) => e.target.value && add({ type, id: e.target.value })}
            aria-label={`Añadir ${DISCOUNT_TARGET_LABELS[type].toLowerCase()}`}
            className="min-w-48 flex-1"
          >
            <option value="">Añadir {DISCOUNT_TARGET_LABELS[type].toLowerCase()}…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {type === "product" && query.trim().length >= 2 && found.length > 0 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
          {found.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate">{p.name}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => add({ type: "product", id: p.id })}
              >
                Añadir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form fields
// ---------------------------------------------------------------------------

function Field({
  id,
  label,
  error,
  children,
  wide,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}

function RewardFields({
  reward,
  setReward,
  value,
  currency,
  errors,
}: {
  reward: DiscountReward;
  setReward: (r: DiscountReward) => void;
  value: number | null;
  currency: string;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field id="reward" label="Tipo de descuento">
        <Select
          id="reward"
          name="reward"
          value={reward}
          onChange={(e) => setReward(e.target.value as DiscountReward)}
        >
          <option value="percent">Porcentaje</option>
          <option value="fixed">Importe fijo ({currency})</option>
        </Select>
      </Field>
      <Field
        id="value"
        label={reward === "percent" ? "Porcentaje (%)" : `Importe (${currency})`}
        error={errors.value}
      >
        <Input id="value" name="value" inputMode="decimal" defaultValue={value ?? ""} required />
      </Field>
    </>
  );
}

function DateFields({
  startsAt,
  endsAt,
  errors,
}: {
  startsAt?: string;
  endsAt: string | null;
  errors: Record<string, string>;
}) {
  return (
    <>
      <Field id="startsAt" label="Empieza (hora de Cuba)" error={errors.startsAt}>
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={isoToLocal(startsAt)} />
      </Field>
      <Field id="endsAt" label="Termina (opcional)" error={errors.endsAt}>
        <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={isoToLocal(endsAt)} />
      </Field>
    </>
  );
}

const formText = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const formNumber = (data: FormData, name: string) =>
  formText(data, name) === "" ? null : Number(formText(data, name));

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export function PromotionsPage() {
  const store = useStore();
  const { reads, api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);
  const { data, error, reload } = useQueryData<Promotion[]>(async () => {
    const r = await asResult(reads.promotions(store.id));
    if (r.error || !r.data) return null;
    return nodes(r.data.promotionsCollection).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      reward: String(p.reward) as DiscountReward,
      value: Number(p.value),
      startsAt: p.startsAt,
      endsAt: p.endsAt ?? null,
      isActive: p.isActive,
      priority: p.priority,
      targets: targetsOf(p.promotionTargetsCollection),
    }));
  }, [reads, store.id]);
  const names = useTargetNames(
    (data ?? []).flatMap((p) => p.targets.filter((t) => t.type === "product").map((t) => t.id)),
  );
  const currency = settings?.baseCurrency ?? "CUP";
  const discounts = api.discounts(store.id);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Rebajas automáticas: la tienda muestra el precio tachado y la etiqueta. Si a un producto le tocan
          varias, se aplica la que deja el precio más bajo.
        </p>
        {canEdit && <Button onClick={() => setEditing("new")}>Nueva promoción</Button>}
      </div>
      {action.error && !editing && <Alert variant="destructive">{action.error}</Alert>}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nueva promoción" : "Editar promoción"}
        size="lg"
      >
        {action.error && (
          <Alert variant="destructive" className="mb-4">
            {action.error}
          </Alert>
        )}
        {editing && (
          <PromotionForm
            promotion={editing === "new" ? null : editing}
            currency={currency}
            names={names}
            errors={action.fieldErrors}
            pending={action.pending}
            onCancel={() => setEditing(null)}
            onSave={async (input, id) => {
              const ok = await action.run(() =>
                id ? discounts.updatePromotion(id, input) : discounts.createPromotion(input),
              );
              if (ok) {
                setEditing(null);
                reload();
              }
            }}
          />
        )}
      </Dialog>
      <Card className="p-0">
        <ul className="divide-y" data-testid="promotions-list">
          {data.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Sin promociones.</li>}
          {data.map((p) => {
            const s = status(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {p.name} <Badge variant={s.variant}>{s.label}</Badge>
                    <Badge variant="default">{rewardLabel(p.reward, p.value, currency)}</Badge>
                  </span>
                  <span className="text-muted-foreground">
                    {p.targets.map((t) => targetName(names, t)).join(", ")} · {dates(p)}
                  </span>
                </span>
                {canEdit && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () =>
                        (await action.run(() => discounts.deletePromotion(p.id))) !== undefined && reload()
                      }
                    >
                      Borrar
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function PromotionForm({
  promotion,
  currency,
  names,
  errors,
  pending,
  onCancel,
  onSave,
}: {
  promotion: Promotion | null;
  currency: string;
  names: TargetNames | null;
  errors: Record<string, string>;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: PromotionInput, id: string | null) => Promise<void>;
}) {
  const [reward, setReward] = useState<DiscountReward>(promotion?.reward ?? "percent");
  const [targets, setTargets] = useState<Target[]>(promotion?.targets ?? []);
  const [isActive, setIsActive] = useState(promotion?.isActive ?? true);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSave(
      {
        name: formText(data, "name"),
        description: formText(data, "description") || null,
        reward,
        value: Number(formText(data, "value")),
        startsAt: localToIso(formText(data, "startsAt")) ?? undefined,
        endsAt: localToIso(formText(data, "endsAt")),
        isActive,
        priority: formNumber(data, "priority") ?? 0,
        targets,
      },
      promotion?.id ?? null,
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field id="name" label="Nombre (lo ve el cliente)" error={errors.name}>
        <Input
          id="name"
          name="name"
          defaultValue={promotion?.name ?? ""}
          placeholder="Black Friday"
          required
        />
      </Field>
      <Field id="priority" label="Prioridad (desempate)" error={errors.priority}>
        <Input
          id="priority"
          name="priority"
          type="number"
          min={-100}
          max={100}
          defaultValue={promotion?.priority ?? 0}
        />
      </Field>
      <RewardFields
        reward={reward}
        setReward={setReward}
        value={promotion?.value ?? null}
        currency={currency}
        errors={errors}
      />
      <DateFields startsAt={promotion?.startsAt} endsAt={promotion?.endsAt ?? null} errors={errors} />
      <Field id="description" label="Descripción interna (opcional)" error={errors.description} wide>
        <Input id="description" name="description" defaultValue={promotion?.description ?? ""} />
      </Field>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label>Se aplica a</Label>
        <TargetPicker value={targets} onChange={setTargets} names={names} />
        <FieldError>{errors.targets}</FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Activa (desmárcala para pausarla sin borrarla)
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

export function VouchersPage() {
  const store = useStore();
  const { reads, api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<Voucher | "new" | null>(null);
  const [usagesOf, setUsagesOf] = useState<string | null>(null);
  const { data, error, reload } = useQueryData<Voucher[]>(async () => {
    const r = await asResult(reads.vouchers(store.id));
    if (r.error || !r.data) return null;
    return nodes(r.data.vouchersCollection).map((v) => ({
      id: v.id,
      code: v.code,
      name: v.name,
      scope: String(v.scope) as VoucherScope,
      reward: String(v.reward) as DiscountReward,
      value: Number(v.value),
      minSubtotal: num(v.minSubtotal),
      minQuantity: v.minQuantity ?? null,
      usageLimit: v.usageLimit ?? null,
      usagePerCustomer: v.usagePerCustomer ?? null,
      usedCount: v.usedCount,
      startsAt: v.startsAt,
      endsAt: v.endsAt ?? null,
      isActive: v.isActive,
      targets: targetsOf(v.voucherTargetsCollection),
      usages: nodes(v.voucherUsagesCollection).map((u) => ({
        id: u.id,
        amount: Number(u.amount),
        currency: String(u.currency),
        phone: u.phone,
        createdAt: u.createdAt,
        released: !!u.releasedAt,
        order: u.orders
          ? { id: u.orders.id, number: u.orders.number, customerName: u.orders.customerName }
          : null,
      })),
    }));
  }, [reads, store.id]);
  const names = useTargetNames(
    (data ?? []).flatMap((v) => v.targets.filter((t) => t.type === "product").map((t) => t.id)),
  );
  const currency = settings?.baseCurrency ?? "CUP";
  const discounts = api.discounts(store.id);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Códigos que el cliente escribe en el carrito. Un cupón por pedido, compatible con las promociones.
          El uso se cuenta al crear el pedido y se devuelve si se cancela.
        </p>
        {canEdit && <Button onClick={() => setEditing("new")}>Nuevo cupón</Button>}
      </div>
      {action.error && !editing && <Alert variant="destructive">{action.error}</Alert>}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nuevo cupón" : "Editar cupón"}
        size="lg"
      >
        {action.error && (
          <Alert variant="destructive" className="mb-4">
            {action.error}
          </Alert>
        )}
        {editing && (
          <VoucherForm
            voucher={editing === "new" ? null : editing}
            currency={currency}
            names={names}
            errors={action.fieldErrors}
            pending={action.pending}
            onCancel={() => setEditing(null)}
            onSave={async (input, id) => {
              const ok = await action.run(() =>
                id ? discounts.updateVoucher(id, input) : discounts.createVoucher(input),
              );
              if (ok) {
                setEditing(null);
                reload();
              }
            }}
          />
        )}
      </Dialog>
      <Card className="p-0">
        <ul className="divide-y" data-testid="vouchers-list">
          {data.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Sin cupones.</li>}
          {data.map((v) => {
            const s = status(v);
            return (
              <li key={v.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      <code className="rounded bg-surface px-1.5">{v.code}</code> {v.name}
                      <Badge variant={s.variant}>{s.label}</Badge>
                      <Badge variant="default">
                        {v.scope === "shipping" && v.reward === "percent" && v.value === 100
                          ? "Envío gratis"
                          : rewardLabel(v.reward, v.value, currency)}
                      </Badge>
                    </span>
                    <span className="text-muted-foreground">
                      {VOUCHER_SCOPE_LABELS[v.scope]}
                      {v.minSubtotal !== null && ` · mínimo ${formatMoney(v.minSubtotal, currency)}`}
                      {` · ${v.usedCount}${v.usageLimit !== null ? `/${v.usageLimit}` : ""} usos`}
                      {v.usagePerCustomer !== null && ` · ${v.usagePerCustomer} por cliente`} · {dates(v)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setUsagesOf(usagesOf === v.id ? null : v.id)}
                  >
                    Usos
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(v)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () =>
                          (await action.run(() => discounts.deleteVoucher(v.id))) !== undefined && reload()
                        }
                      >
                        {v.usedCount > 0 || v.usages.length > 0 ? "Desactivar" : "Borrar"}
                      </Button>
                    </>
                  )}
                </div>
                {usagesOf === v.id && (
                  <ul className="rounded-md border text-sm">
                    {v.usages.length === 0 && (
                      <li className="px-3 py-2 text-muted-foreground">Sin usos todavía.</li>
                    )}
                    {v.usages.map((u) => (
                      <li
                        key={u.id}
                        className="flex flex-wrap justify-between gap-2 border-b px-3 py-2 last:border-b-0"
                      >
                        <span>
                          {u.order ? (
                            <Link href={`/admin/orders/${u.order.id}`} className="underline">
                              {settings
                                ? orderCode(settings.orderPrefix, u.order.number)
                                : `#${u.order.number}`}
                            </Link>
                          ) : (
                            "—"
                          )}{" "}
                          · {u.order?.customerName ?? u.phone}
                          {u.released && (
                            <span className="text-muted-foreground"> (cancelado, uso devuelto)</span>
                          )}
                        </span>
                        <span>
                          −{formatMoney(u.amount, u.currency)} · {dateText(u.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function VoucherForm({
  voucher,
  currency,
  names,
  errors,
  pending,
  onCancel,
  onSave,
}: {
  voucher: Voucher | null;
  currency: string;
  names: TargetNames | null;
  errors: Record<string, string>;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: VoucherInput, id: string | null) => Promise<void>;
}) {
  const [reward, setReward] = useState<DiscountReward>(voucher?.reward ?? "percent");
  const [scope, setScope] = useState<VoucherScope>(voucher?.scope ?? "order");
  const [targets, setTargets] = useState<Target[]>(voucher?.targets ?? []);
  const [isActive, setIsActive] = useState(voucher?.isActive ?? true);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSave(
      {
        code: formText(data, "code").toUpperCase(),
        name: formText(data, "name"),
        scope,
        reward,
        value: Number(formText(data, "value")),
        minSubtotal: formNumber(data, "minSubtotal"),
        minQuantity: formNumber(data, "minQuantity"),
        usageLimit: formNumber(data, "usageLimit"),
        usagePerCustomer: formNumber(data, "usagePerCustomer"),
        startsAt: localToIso(formText(data, "startsAt")) ?? undefined,
        endsAt: localToIso(formText(data, "endsAt")),
        isActive,
        targets: scope === "specific" ? targets : [],
      },
      voucher?.id ?? null,
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field id="code" label="Código" error={errors.code}>
        <Input
          id="code"
          name="code"
          defaultValue={voucher?.code ?? ""}
          placeholder="BIENVENIDA10"
          className="uppercase"
          required
        />
      </Field>
      <Field id="name" label="Nombre" error={errors.name}>
        <Input id="name" name="name" defaultValue={voucher?.name ?? ""} placeholder="Bienvenida" required />
      </Field>
      <Field id="scope" label="Se descuenta de" wide>
        <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as VoucherScope)}>
          {VOUCHER_SCOPES.map((s) => (
            <option key={s} value={s}>
              {VOUCHER_SCOPE_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <RewardFields
        reward={reward}
        setReward={setReward}
        value={voucher?.value ?? null}
        currency={currency}
        errors={errors}
      />
      {scope === "shipping" && (
        <p className="text-xs text-muted-foreground sm:col-span-2">Envío gratis = porcentaje 100.</p>
      )}
      {scope === "specific" && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label>Productos a los que se aplica</Label>
          <TargetPicker value={targets} onChange={setTargets} names={names} />
          <FieldError>{errors.targets}</FieldError>
        </div>
      )}
      <Field id="minSubtotal" label={`Pedido mínimo (${currency}, opcional)`} error={errors.minSubtotal}>
        <Input
          id="minSubtotal"
          name="minSubtotal"
          inputMode="decimal"
          defaultValue={voucher?.minSubtotal ?? ""}
        />
      </Field>
      <Field id="minQuantity" label="Mínimo de productos (opcional)" error={errors.minQuantity}>
        <Input
          id="minQuantity"
          name="minQuantity"
          type="number"
          min={1}
          defaultValue={voucher?.minQuantity ?? ""}
        />
      </Field>
      <Field id="usageLimit" label="Usos en total (opcional)" error={errors.usageLimit}>
        <Input
          id="usageLimit"
          name="usageLimit"
          type="number"
          min={1}
          defaultValue={voucher?.usageLimit ?? ""}
        />
      </Field>
      <Field id="usagePerCustomer" label="Usos por cliente (opcional)" error={errors.usagePerCustomer}>
        <Input
          id="usagePerCustomer"
          name="usagePerCustomer"
          type="number"
          min={1}
          defaultValue={voucher?.usagePerCustomer ?? ""}
        />
      </Field>
      <DateFields startsAt={voucher?.startsAt} endsAt={voucher?.endsAt ?? null} errors={errors} />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Activo
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
