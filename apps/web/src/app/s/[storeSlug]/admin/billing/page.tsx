"use client";

import { BILLING_INTERVAL_LABELS, formatUsd, MODULE_SOURCE_LABELS } from "@kshop/core";
import { ApiError, type BillingModuleState, type StoreBilling } from "@kshop/data";
import { Alert, Badge, buttonVariants, Card } from "@kshop/ui";
import { useEffect, useState } from "react";
import { InvoiceCard, LinesTable, UsageMeter } from "@/features/billing/components/BillingParts";
import { formatDate, SUBSCRIPTION_STATUS_LABELS } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import { useAdmin } from "../admin-context";

// Admin › Plan y facturación (owner/admin): plan and state, next invoice, usage against the limits, modules with
// their price (asked for by WhatsApp to Kshop support), and the invoices. Paid in person, in USD.

function supportLink(phone: string | null, text: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

export default function BillingPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const [data, setData] = useState<StoreBilling | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .billing(store.id)
      .get()
      .then((d) => !cancelled && setData(d))
      .catch(
        (e: unknown) => !cancelled && setError(e instanceof ApiError ? e.message : "No se pudo cargar."),
      );
    return () => {
      cancelled = true;
    };
  }, [api, store.id]);

  if (admin.role === "staff") {
    return (
      <Alert variant="destructive">Solo el dueño y los administradores ven el plan y la facturación.</Alert>
    );
  }
  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  const ask = (what: string) =>
    supportLink(data.supportWhatsapp, `Hola, soy de la tienda ${store.name}. ${what}`);
  const active = data.modules.filter((m) => m.source);
  const available = data.modules.filter((m) => !m.source && (m.inPro || m.addonPrice != null));
  const overProducts =
    data.usage.maxProducts.limit != null && data.usage.maxProducts.used > data.usage.maxProducts.limit;
  const overStaff = data.usage.maxStaff.limit != null && data.usage.maxStaff.used > data.usage.maxStaff.limit;
  const otherPlans = data.plans.filter((p) => p.code !== data.plan.code);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Plan y facturación</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge>Plan {data.plan.name}</Badge>
          <Badge
            variant={data.status === "past_due" || data.status === "suspended" ? "destructive" : "success"}
          >
            {SUBSCRIPTION_STATUS_LABELS[data.status] ?? data.status}
          </Badge>
          {data.founder && <Badge variant="gold">Socio fundador</Badge>}
          <span className="text-sm text-muted-foreground">
            {BILLING_INTERVAL_LABELS[data.interval]}
            {data.status === "trialing" && ` · prueba gratis hasta ${formatDate(data.trialEndsAt)}`}
            {data.cancelAt && ` · baja el ${formatDate(data.cancelAt)}`}
          </span>
        </div>
      </div>

      {(overProducts || overStaff) && (
        <Alert data-testid="over-limit">
          {overProducts &&
            `Tienes ${data.usage.maxProducts.used} productos y tu plan permite ${data.usage.maxProducts.limit}: siguen en la tienda y puedes editarlos, pero no crear más. `}
          {overStaff && `Tu equipo supera lo que permite tu plan: no se pueden añadir más personas. `}
          Nada se ha borrado.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3" data-testid="next-invoice">
          <h2 className="font-semibold">Próxima factura</h2>
          {data.quote ? (
            <>
              <p className="text-xs text-muted-foreground">
                Periodo {formatDate(data.quote.periodStart)} – {formatDate(data.quote.periodEnd)}
              </p>
              <LinesTable lines={data.quote.lines} total={data.quote.total} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Tu tienda no tiene facturas (cortesía de Kshop).</p>
          )}
          {data.instructions && (
            <div className="rounded-md bg-surface p-3 text-sm">
              <div className="font-medium">Cómo pagar</div>
              <p className="text-muted-foreground">{data.instructions}</p>
            </div>
          )}
          {ask("Quiero pagar mi factura de Kshop.") && (
            <a
              href={ask("Quiero pagar mi factura de Kshop.")!}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" }) + " self-start"}
            >
              Escribir a Kshop por WhatsApp
            </a>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Uso del plan</h2>
          <UsageMeter label="Productos" usage={data.usage.maxProducts} />
          <UsageMeter label="Equipo" usage={data.usage.maxStaff} />
          {otherPlans.map((plan) => {
            const link = ask(`Quiero pasarme al plan ${plan.name}.`);
            return (
              <div
                key={plan.code}
                className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"
              >
                <span>
                  Plan <strong>{plan.name}</strong>: {formatUsd(plan.price)}/mes
                  {plan.yearlyPrice != null && ` o ${formatUsd(plan.yearlyPrice)}/año`}
                </span>
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
                    Solicitar
                  </a>
                )}
              </div>
            );
          })}
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold">Módulos</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((m) => (
            <li key={m.code} className="flex items-center justify-between gap-2 text-sm">
              <span>{m.name}</span>
              <Badge variant="success">
                {MODULE_SOURCE_LABELS[m.source!]}
                {m.endsAt && ` hasta ${formatDate(m.endsAt)}`}
              </Badge>
            </li>
          ))}
        </ul>
        {available.length > 0 && (
          <>
            <h3 className="border-t pt-3 text-sm font-medium">Puedes añadir</h3>
            <ul className="flex flex-col gap-3">
              {available.map((m) => (
                <AvailableModule
                  key={m.code}
                  module={m}
                  plan={data.plan.code}
                  link={ask(`Quiero el módulo ${m.name}.`)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Facturas</h2>
        {data.invoices.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay facturas.</p>
        )}
        {data.invoices.map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
      </section>
    </div>
  );
}

function AvailableModule({
  module,
  plan,
  link,
}: {
  module: BillingModuleState;
  plan: string;
  link: string | null;
}) {
  const price = [
    module.inPro && plan !== "pro" ? "Incluido en Pro" : null,
    module.addonPrice != null
      ? `${module.inPro && plan !== "pro" ? "o " : ""}${formatUsd(module.addonPrice)}/mes suelto`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li
      className="flex flex-wrap items-start justify-between gap-2 text-sm"
      data-testid={`available-${module.code}`}
    >
      <div>
        <div className="font-medium">{module.name}</div>
        {module.description && <div className="text-muted-foreground">{module.description}</div>}
        <div className="text-xs text-primary">{price}</div>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Solicitar
        </a>
      )}
    </li>
  );
}
