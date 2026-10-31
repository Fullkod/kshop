"use client";

import { formatUsd } from "@kshop/core";
import { ApiError, type BillingSettings, type PlatformInvoice } from "@kshop/data";
import { Alert, Button, Card, cn, FieldError, Input, Label } from "@kshop/ui";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { InvoiceActions } from "@/features/billing/components/InvoiceActions";
import { InvoiceCard } from "@/features/billing/components/BillingParts";
import { useRealtimeVersion } from "@kshop/admin";
import { useSession } from "@/lib/session";

// Superadmin › Cobros: what to collect (overdue first), the cash received, and the settings of the billing cycle.

const TABS = [
  { key: "open", label: "Por cobrar" },
  { key: "overdue", label: "Vencidas" },
  { key: "paid", label: "Pagadas" },
  { key: "all", label: "Todas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function SuperadminBillingPage() {
  const { api } = useSession();
  const [tab, setTab] = useState<Tab>("open");
  const [invoices, setInvoices] = useState<PlatformInvoice[] | null>(null);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // New invoices and payments show on their own (Realtime).
  const live = useRealtimeVersion("platform");

  useEffect(() => {
    let cancelled = false;
    api.platform
      .invoices(tab)
      .then((r) => !cancelled && setInvoices(r.invoices))
      .catch(() => !cancelled && setError("No se pudieron cargar las facturas."));
    return () => {
      cancelled = true;
    };
  }, [api, tab, version, live]);

  useEffect(() => {
    api.platform.billingSettings().then(setSettings, () => setError("No se pudo cargar la configuración."));
  }, [api]);

  async function onSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const n = (name: string) => Number(form.get(name));
    setError(null);
    setFields({});
    setNotice(null);
    try {
      setSettings(
        await api.platform.setBillingSettings({
          invoiceLeadDays: n("invoiceLeadDays"),
          invoiceDueDays: n("invoiceDueDays"),
          graceDays: n("graceDays"),
          trialReminderDays: n("trialReminderDays"),
          defaultTrialDays: n("defaultTrialDays"),
          billingInstructions: String(form.get("billingInstructions") ?? "").trim(),
          supportWhatsapp: String(form.get("supportWhatsapp") ?? "").trim() || null,
        }),
      );
      setNotice("Configuración guardada.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    }
  }

  const due =
    invoices?.reduce((sum, i) => sum + (i.status === "pending" ? i.total - i.amountPaid : 0), 0) ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Cobros</h1>
        <p className="text-sm text-muted-foreground">
          Facturas en USD que se cobran en persona. Al registrar el pago, la tienda suspendida por impago se
          reactiva sola.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <nav className="flex gap-1 overflow-x-auto border-b pb-2" aria-label="Facturas">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-background touch:min-h-10",
              tab === t.key && "bg-background font-medium",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {invoices === null && <p className="text-muted-foreground">Cargando…</p>}
      {invoices && (tab === "open" || tab === "overdue") && invoices.length > 0 && (
        <p className="text-sm" data-testid="billing-due">
          {invoices.length} {invoices.length === 1 ? "factura" : "facturas"} · falta cobrar{" "}
          <strong>{formatUsd(due)}</strong>
        </p>
      )}
      {invoices?.length === 0 && (
        <Card className="text-center text-muted-foreground">No hay facturas aquí.</Card>
      )}
      <div className="flex flex-col gap-3">
        {invoices?.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            showStore
            actions={
              <div className="flex flex-col gap-2">
                <Link
                  href={`/superadmin/stores/${invoice.storeId}`}
                  className="text-sm text-primary hover:underline"
                >
                  Ver suscripción de la tienda
                </Link>
                <InvoiceActions invoice={invoice} onChange={() => setVersion((v) => v + 1)} />
              </div>
            }
          />
        ))}
      </div>

      {settings && (
        <Card>
          <form onSubmit={onSettings} className="grid gap-3 sm:grid-cols-3" key={JSON.stringify(settings)}>
            <h2 className="text-lg font-semibold sm:col-span-3">Ciclo de cobro</h2>
            {(
              [
                ["invoiceLeadDays", "Factura, días antes del periodo"],
                ["invoiceDueDays", "Vence a los (días)"],
                ["graceDays", "Días de gracia antes de suspender"],
                ["trialReminderDays", "Aviso de fin de prueba (días antes)"],
                ["defaultTrialDays", "Días de prueba por defecto"],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className="flex flex-col gap-1">
                <Label htmlFor={name}>{label}</Label>
                <Input id={name} name={name} inputMode="numeric" defaultValue={settings[name]} required />
                <FieldError>{fields[name]}</FieldError>
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <Label htmlFor="supportWhatsapp">WhatsApp de soporte de Kshop</Label>
              <Input
                id="supportWhatsapp"
                name="supportWhatsapp"
                defaultValue={settings.supportWhatsapp ?? ""}
                placeholder="+5351234567"
              />
              <FieldError>{fields.supportWhatsapp}</FieldError>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-3">
              <Label htmlFor="billingInstructions">
                Cómo pagar (va en cada aviso y en el panel de la tienda)
              </Label>
              <Input
                id="billingInstructions"
                name="billingInstructions"
                defaultValue={settings.billingInstructions}
                maxLength={500}
              />
            </div>
            <Button type="submit" className="self-start">
              Guardar
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
