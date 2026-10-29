"use client";

import {
  BILLING_INTERVAL_LABELS,
  formatUsd,
  GRANT_TYPE_LABELS,
  GRANT_TYPES,
  MODULE_SOURCE_LABELS,
  type BillingInterval,
  type GrantType,
  type PlanCode,
} from "@kshop/core";
import { ApiError, type PlatformSubscription } from "@kshop/data";
import { Alert, Badge, Button, Card, FieldError, Input, Label, Select, useConfirm } from "@kshop/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { InvoiceActions } from "@/features/billing/components/InvoiceActions";
import { InvoiceCard, LinesTable, UsageMeter } from "@/features/billing/components/BillingParts";
import { formatDate, STORE_STATUS_LABELS, storeUrl, SUBSCRIPTION_STATUS_LABELS } from "@/lib/format";
import { OwnerAccess } from "../../OwnerAccess";
import { StoreMenu } from "./StoreMenu";
import { useSession } from "@/lib/session";

// Superadmin › Tienda › Suscripción: plan, next invoice, modules (plan / add-on / gift), gifts, own price and
// limits, invoices with cash payments. Every action returns the fresh subscription.

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const isoFromDate = (value: string) => (value ? new Date(`${value}T23:59:00`).toISOString() : null);

export default function SuperadminStoreSubscriptionPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const { api } = useSession();
  const { confirm, prompt } = useConfirm();
  const sub = api.platform.subscription(storeId);
  const [data, setData] = useState<PlatformSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [grantType, setGrantType] = useState<GrantType>("free_days");

  useEffect(() => {
    let cancelled = false;
    api.platform
      .subscription(storeId)
      .get()
      .then((d) => !cancelled && setData(d))
      .catch(
        (e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : "No se pudo cargar."),
      );
    return () => {
      cancelled = true;
    };
  }, [api, storeId]);

  async function run(action: () => Promise<PlatformSubscription>, done?: string) {
    setPending(true);
    setError(null);
    setFields({});
    setNotice(null);
    try {
      setData(await action());
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Algo salió mal.");
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    } finally {
      setPending(false);
    }
  }

  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  function onPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        sub.changePlan({
          planCode: String(form.get("planCode")) as PlanCode,
          interval: String(form.get("interval")) as BillingInterval,
        }),
      "Plan cambiado. Los módulos y límites ya se aplican; la próxima factura usa el plan nuevo.",
    );
  }

  function onGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    void run(async () => {
      const result = await sub.addGrant({
        type: grantType,
        value: Number(String(form.get("value")).replace(",", ".")),
        reason: String(form.get("reason") ?? "").trim() || undefined,
        endsAt: isoFromDate(String(form.get("endsAt") ?? "")),
      });
      element.reset();
      return result;
    }, "Regalo añadido.");
  }

  function onSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const optionalNumber = (name: string) =>
      text(name) === "" ? null : Number(text(name).replace(",", "."));
    void run(
      () =>
        sub.update({
          priceOverride: optionalNumber("priceOverride"),
          limitOverrides: {
            maxProducts: optionalNumber("maxProducts"),
            maxStaff: optionalNumber("maxStaff"),
          },
          founder: form.get("founder") === "on",
          comped: form.get("comped") === "on",
          cancelAt: isoFromDate(text("cancelAt")),
          notes: text("notes"),
        }),
      "Guardado.",
    );
  }

  async function onModuleGrant(
    code: PlatformSubscription["modules"][number]["code"],
    name: string,
    enabled: boolean,
  ) {
    if (enabled) {
      const until = await prompt({
        title: `Regalar «${name}»`,
        description: "Déjalo vacío para que no tenga fecha de fin.",
        input: { label: "Hasta (opcional)", type: "date" },
        confirmLabel: "Regalar",
      });
      if (until === null) return;
      void run(() => sub.setModuleGrant(code, true, isoFromDate(until), "Regalo del superadmin"));
      return;
    }
    if (
      !(await confirm({
        title: `¿Quitar el regalo de «${name}»?`,
        description:
          "El módulo deja de estar activo en la tienda (sus datos se conservan) y la próxima factura se calcula sin él.",
        confirmLabel: "Quitar regalo",
        tone: "destructive",
      }))
    )
      return;
    void run(() => sub.setModuleGrant(code, false, null, undefined));
  }

  async function onAddon(code: PlatformSubscription["modules"][number]["code"], name: string, add: boolean) {
    if (
      !add &&
      !(await confirm({
        title: `¿Quitar «${name}» suelto?`,
        description:
          "Deja de cobrarse en la próxima factura y el módulo deja de estar activo en la tienda (sus datos se conservan).",
        confirmLabel: "Quitar suelto",
        tone: "destructive",
      }))
    )
      return;
    void run(() => sub.setAddon(code, add));
  }

  const store = data.store;
  const isPaused = store.status === "suspended";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/superadmin" className="text-sm text-primary hover:underline">
            ← Tiendas
          </Link>
          <h1 className="text-2xl font-semibold">{store.name}</h1>
          <a href={storeUrl(store.slug)} target="_blank" className="text-sm text-primary hover:underline">
            {store.primaryDomain ?? store.slug}
          </a>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{data.plan.name}</Badge>
            <Badge
              variant={
                data.status === "active" || data.status === "comped"
                  ? "success"
                  : data.status === "trialing"
                    ? "gold"
                    : "destructive"
              }
            >
              {SUBSCRIPTION_STATUS_LABELS[data.status] ?? data.status}
            </Badge>
            <Badge variant={isPaused ? "destructive" : "success"}>
              {STORE_STATUS_LABELS[store.status]}
              {data.suspendedReason === "billing"
                ? " por impago"
                : data.suspendedReason === "manual"
                  ? " a mano"
                  : ""}
            </Badge>
            {data.founder && <Badge variant="gold">Socio fundador</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Dueño: {store.owner?.email ?? "—"}
            {data.status === "trialing" && ` · prueba hasta ${formatDate(data.trialEndsAt)}`}
            {data.currentPeriodEnd && ` · periodo hasta ${formatDate(data.currentPeriodEnd)}`}
          </p>
          {store.owner?.email && <OwnerAccess storeId={store.id} storeName={store.name} />}
        </div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            if (
              !isPaused &&
              !(await confirm({
                title: `¿Suspender «${store.name}»?`,
                description:
                  "La tienda deja de vender y su admin queda en solo lectura hasta que la reactives.",
                confirmLabel: "Suspender",
                tone: "destructive",
              }))
            )
              return;
            void run(async () => {
              await api.platform.updateStoreStatus(store.id, isPaused ? "active" : "suspended");
              return sub.get();
            });
          }}
        >
          {isPaused ? "Reactivar tienda" : "Suspender a mano"}
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3" data-testid="next-invoice">
          <h2 className="font-semibold">Próxima factura</h2>
          {data.quote ? (
            <>
              <p className="text-xs text-muted-foreground">
                {BILLING_INTERVAL_LABELS[data.quote.interval]} · {formatDate(data.quote.periodStart)} –{" "}
                {formatDate(data.quote.periodEnd)}
              </p>
              <LinesTable lines={data.quote.lines} total={data.quote.total} />
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={pending}
                onClick={() => void run(() => sub.issueInvoice(), "Factura emitida.")}
              >
                Emitir factura ahora
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Esta tienda no se factura (cortesía o cancelada).</p>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Plan y uso</h2>
          <form onSubmit={onPlan} className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="planCode">Plan</Label>
              <Select id="planCode" name="planCode" defaultValue={data.plan.code}>
                {data.plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name} · {formatUsd(p.price)}/mes
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="interval">Pago</Label>
              <Select id="interval" name="interval" defaultValue={data.interval}>
                <option value="month">Mensual</option>
                <option value="year">Anual</option>
              </Select>
            </div>
            <Button type="submit" className="self-end" disabled={pending}>
              Cambiar plan
            </Button>
          </form>
          <UsageMeter label="Productos" usage={data.usage.maxProducts} />
          <UsageMeter label="Equipo" usage={data.usage.maxStaff} />
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-semibold">Módulos</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="border-b bg-surface text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Módulo</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Suelto</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.modules.map((m) => {
              const inPlan =
                data.plans.find((p) => p.code === data.plan.code)?.modules.includes(m.code) ?? false;
              const addon = data.storeModules.find(
                (r) => r.code === m.code && r.source === "addon" && r.enabled,
              );
              const gift = data.storeModules.find(
                (r) => r.code === m.code && r.source === "grant" && r.enabled,
              );
              return (
                <tr key={m.code} className="border-b last:border-0" data-testid={`module-${m.code}`}>
                  <td className="px-4 py-2">{m.name}</td>
                  <td className="px-4 py-2">
                    {m.source ? (
                      <Badge variant="success">
                        {MODULE_SOURCE_LABELS[m.source]}
                        {m.endsAt && ` hasta ${formatDate(m.endsAt)}`}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {addon
                      ? `${formatUsd(addon.price ?? 0)}/mes (congelado)`
                      : m.addonPrice != null
                        ? `${formatUsd(m.addonPrice)}/mes`
                        : "—"}
                  </td>
                  <td className="flex flex-wrap justify-end gap-2 px-4 py-2">
                    {!inPlan && m.addonPrice != null && (
                      <Button
                        size="sm"
                        variant={addon ? "ghost" : "outline"}
                        disabled={pending}
                        onClick={() => void onAddon(m.code, m.name, !addon)}
                      >
                        {addon ? "Quitar suelto" : "Añadir suelto"}
                      </Button>
                    )}
                    {!inPlan && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void onModuleGrant(m.code, m.name, !gift)}
                      >
                        {gift ? "Quitar regalo" : "Regalar"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <StoreMenu
        storeId={store.id}
        slug={store.slug}
        activeModules={new Set(data.modules.flatMap((m) => (m.source ? [m.code] : [])))}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Regalos y descuentos</h2>
          {data.grants.length === 0 && <p className="text-sm text-muted-foreground">Ninguno.</p>}
          <ul className="flex flex-col gap-2 text-sm">
            {data.grants.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2">
                <span className={g.revokedAt ? "text-muted-foreground line-through" : undefined}>
                  {GRANT_TYPE_LABELS[g.type]}:{" "}
                  {g.type === "free_days"
                    ? `${g.value} días`
                    : g.type === "discount_percent"
                      ? `${g.value} %`
                      : formatUsd(g.value)}
                  {g.reason && ` · ${g.reason}`}
                  {g.endsAt && ` · hasta ${formatDate(g.endsAt)}`}
                </span>
                {!g.revokedAt && g.type !== "free_days" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => void run(() => sub.revokeGrant(g.id))}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={onGrant} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="grantType">Tipo</Label>
              <Select
                id="grantType"
                value={grantType}
                onChange={(e) => setGrantType(e.target.value as GrantType)}
              >
                {GRANT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {GRANT_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="value">
                {grantType === "free_days"
                  ? "Días"
                  : grantType === "discount_percent"
                    ? "Porcentaje"
                    : "Precio (USD por periodo)"}
              </Label>
              <Input id="value" name="value" inputMode="decimal" required />
              <FieldError>{fields.value}</FieldError>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="reason">Motivo</Label>
              <Input id="reason" name="reason" maxLength={300} placeholder="Socio fundador" />
            </div>
            {grantType !== "free_days" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="endsAt">Hasta (vacío = siempre)</Label>
                <Input id="endsAt" name="endsAt" type="date" />
              </div>
            )}
            <Button type="submit" size="sm" className="self-end" disabled={pending}>
              Añadir
            </Button>
          </form>
        </Card>

        <Card>
          <form
            onSubmit={onSettings}
            className="grid gap-3 sm:grid-cols-2"
            key={JSON.stringify([
              data.priceOverride,
              data.limitOverrides,
              data.notes,
              data.cancelAt,
              data.status,
              data.founder,
            ])}
          >
            <h2 className="font-semibold sm:col-span-2">Condiciones de esta tienda</h2>
            <div className="flex flex-col gap-1">
              <Label htmlFor="priceOverride">Precio propio (USD por periodo)</Label>
              <Input
                id="priceOverride"
                name="priceOverride"
                inputMode="decimal"
                defaultValue={data.priceOverride ?? ""}
                placeholder="El del plan"
              />
              <FieldError>{fields.priceOverride}</FieldError>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cancelAt">Baja programada</Label>
              <Input id="cancelAt" name="cancelAt" type="date" defaultValue={dateInput(data.cancelAt)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="maxProducts">Límite de productos</Label>
              <Input
                id="maxProducts"
                name="maxProducts"
                inputMode="numeric"
                defaultValue={data.limitOverrides.maxProducts ?? ""}
                placeholder="El del plan"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="maxStaff">Límite de equipo</Label>
              <Input
                id="maxStaff"
                name="maxStaff"
                inputMode="numeric"
                defaultValue={data.limitOverrides.maxStaff ?? ""}
                placeholder="El del plan"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="founder" defaultChecked={data.founder} /> Socio fundador
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="comped" defaultChecked={data.status === "comped"} /> Cortesía (no
              se factura)
            </label>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="notes">Notas internas</Label>
              <Input id="notes" name="notes" defaultValue={data.notes ?? ""} maxLength={2000} />
            </div>
            <Button type="submit" size="sm" className="self-start" disabled={pending}>
              Guardar
            </Button>
          </form>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Facturas</h2>
        {data.invoices.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay facturas.</p>
        )}
        {data.invoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            actions={
              <InvoiceActions
                invoice={invoice}
                onChange={() => void run(() => sub.get(), "Factura actualizada.")}
              />
            }
          />
        ))}
      </section>
    </div>
  );
}
