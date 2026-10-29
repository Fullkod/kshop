"use client";

import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@kshop/core";
import { ApiError, type PlatformInvoice } from "@kshop/data";
import { Alert, Button, Dialog, FieldError, Input, Label, Select } from "@kshop/ui";
import { useState, type FormEvent } from "react";
import { useSession } from "@/lib/session";

type Mode = "payment" | "adjust" | "void" | null;

/** Superadmin actions on a pending invoice: cash received, a manual line, or void it. */
export function InvoiceActions({
  invoice,
  onChange,
}: {
  invoice: PlatformInvoice;
  onChange: (invoice: PlatformInvoice) => void;
}) {
  const { api } = useSession();
  const [mode, setMode] = useState<Mode>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  if (invoice.status !== "pending") return null;

  async function run(action: () => Promise<{ invoice: PlatformInvoice }>) {
    setPending(true);
    setError(null);
    setFields({});
    try {
      const { invoice: updated } = await action();
      setMode(null);
      onChange(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Algo salió mal.");
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    if (mode === "payment") {
      const date = text("paidAt");
      void run(() =>
        api.platform.recordPayment(invoice.id, {
          amount: Number(text("amount").replace(",", ".")),
          method: text("method") as PaymentMethod,
          reference: text("reference") || undefined,
          notes: text("notes") || undefined,
          paidAt: date ? new Date(`${date}T12:00:00`).toISOString() : undefined,
        }),
      );
    } else if (mode === "adjust") {
      void run(() =>
        api.platform.adjustInvoice(invoice.id, text("description"), Number(text("amount").replace(",", "."))),
      );
    } else if (mode === "void") {
      void run(() => api.platform.voidInvoice(invoice.id, text("reason") || undefined));
    }
  }

  const remaining = Math.max(0, invoice.total - invoice.amountPaid);
  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            setError(null);
            setMode("payment");
          }}
          data-testid="invoice-pay"
        >
          Registrar pago
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setError(null);
            setMode("adjust");
          }}
        >
          Ajuste
        </Button>
        {invoice.amountPaid === 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setError(null);
              setMode("void");
            }}
          >
            Anular
          </Button>
        )}
      </div>
      {error && !mode && <Alert variant="destructive">{error}</Alert>}
      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={
          mode === "payment"
            ? `Registrar pago · ${invoice.number}`
            : mode === "adjust"
              ? `Ajuste · ${invoice.number}`
              : `¿Anular la factura ${invoice.number}?`
        }
        description={
          mode === "void" ? "La factura deja de contar como pendiente; no se puede deshacer." : undefined
        }
      >
        {mode && (
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            {error && (
              <Alert variant="destructive" className="sm:col-span-2">
                {error}
              </Alert>
            )}
            {mode === "payment" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`amount-${invoice.id}`}>Importe (USD)</Label>
                  <Input
                    id={`amount-${invoice.id}`}
                    name="amount"
                    inputMode="decimal"
                    defaultValue={remaining}
                    required
                  />
                  <FieldError>{fields.amount}</FieldError>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`method-${invoice.id}`}>Forma de pago</Label>
                  <Select id={`method-${invoice.id}`} name="method" defaultValue="cash">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`paidAt-${invoice.id}`}>Fecha (hoy si se deja vacía)</Label>
                  <Input id={`paidAt-${invoice.id}`} name="paidAt" type="date" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`reference-${invoice.id}`}>Referencia (opcional)</Label>
                  <Input id={`reference-${invoice.id}`} name="reference" maxLength={120} />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label htmlFor={`notes-${invoice.id}`}>Nota (opcional)</Label>
                  <Input
                    id={`notes-${invoice.id}`}
                    name="notes"
                    maxLength={500}
                    placeholder="Entregado en mano a…"
                  />
                </div>
              </>
            )}
            {mode === "adjust" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`description-${invoice.id}`}>Concepto</Label>
                  <Input id={`description-${invoice.id}`} name="description" required maxLength={200} />
                  <FieldError>{fields.description}</FieldError>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`adj-${invoice.id}`}>Importe (USD; negativo = a favor)</Label>
                  <Input id={`adj-${invoice.id}`} name="amount" inputMode="decimal" required />
                  <FieldError>{fields.amount}</FieldError>
                </div>
              </>
            )}
            {mode === "void" && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor={`reason-${invoice.id}`}>Motivo (opcional)</Label>
                <Input id={`reason-${invoice.id}`} name="reason" maxLength={300} />
              </div>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                variant={mode === "void" ? "destructive" : "default"}
              >
                {pending
                  ? "Guardando…"
                  : mode === "payment"
                    ? "Guardar pago"
                    : mode === "adjust"
                      ? "Añadir ajuste"
                      : "Anular factura"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
