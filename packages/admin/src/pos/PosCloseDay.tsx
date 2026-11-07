"use client";

import { formatMoney, parseDecimal } from "@kshop/core";
import type { PosClosingPreview, PosClosingResult } from "@kshop/data";
import { ApiError } from "@kshop/data";
import { Alert, Button, Dialog, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { Link } from "@kshop/storefront";
import { useSession } from "../session";

type Money = Record<string, number>;

const cents = (n: number) => Math.round(n * 100);
const add = (a: Money, b: Money): Money => {
  const out: Money = {};
  for (const [k, v] of [...Object.entries(a), ...Object.entries(b)])
    out[k] = (cents(out[k] ?? 0) + cents(v)) / 100;
  return out;
};
const moneyList = (m: Money, zero: string) =>
  Object.entries(m)
    .filter(([, v]) => v !== 0)
    .map(([c, v]) => formatMoney(v, c))
    .join(" y ") || formatMoney(0, zero);

/** The difference per currency in words: «Cuadra», «Sobran 20 CUP», «Faltan 150 CUP». */
export function differenceText(diff: Money): string {
  const parts = Object.entries(diff)
    .filter(([, v]) => cents(v) !== 0)
    .map(([c, v]) => `${v > 0 ? "Sobran" : "Faltan"} ${formatMoney(Math.abs(v), c)}`);
  return parts.length ? parts.join(" · ") : "Cuadra";
}

/**
 * «Cerrar el día» (KSH0012): uploads what is pending, shows what should be there (float + cash − change, the other
 * methods apart), takes the count and closes. The closing is never edited; the owner gets it by WhatsApp.
 */
export function PosCloseDay({
  storeId,
  currency,
  online,
  pending,
  onUpload,
  closingsHref,
}: {
  storeId: string;
  /** The store's base currency (the count always offers it). */
  currency: string;
  online: boolean;
  /** Sales still on this phone: they are uploaded before closing. */
  pending: number;
  onUpload: () => Promise<void>;
  closingsHref?: string;
}) {
  const { api } = useSession();
  const [step, setStep] = useState<"idle" | "loading" | "count" | "done">("idle");
  const [preview, setPreview] = useState<PosClosingPreview | null>(null);
  const [float, setFloat] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [result, setResult] = useState<PosClosingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function start() {
    setError(null);
    setStep("loading");
    try {
      if (pending > 0) await onUpload();
      const p = await api.pos(storeId).closingPreview();
      setPreview(p);
      setFloat(Object.fromEntries(Object.entries(p.float).map(([c, v]) => [c, String(v)])));
      setCounted({});
      setNote("");
      setStep("count");
    } catch {
      setError("No se pudo preparar el cierre. Revisa la conexión e inténtalo de nuevo.");
      setStep("idle");
    }
  }

  const floatMoney: Money = Object.fromEntries(
    Object.entries(float)
      .map(([c, v]) => [c, parseDecimal(v)] as const)
      .filter(([, v]) => Number.isFinite(v) && v > 0),
  );
  const expected = preview ? add(preview.cash, floatMoney) : {};
  const currencies = [...new Set([currency, ...Object.keys(expected), ...Object.keys(preview?.float ?? {})])];
  const countedMoney: Money = Object.fromEntries(
    currencies.map((c) => [c, parseDecimal(counted[c] ?? "")] as const).filter(([, v]) => Number.isFinite(v)),
  );
  const complete = currencies.every(
    (c) => (counted[c] ?? "").trim() !== "" && Number.isFinite(countedMoney[c]),
  );
  const diff = add(countedMoney, Object.fromEntries(Object.entries(expected).map(([c, v]) => [c, -v])));

  async function close() {
    if (!complete) {
      setError("Escribe lo contado en cada moneda (0 si no hay).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const done = await api
        .pos(storeId)
        .closeDay({ counted: countedMoney, float: floatMoney, note: note.trim() || undefined });
      setResult(done);
      setStep("done");
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? e.message
          : "No se pudo cerrar. Revisa la conexión e inténtalo de nuevo; no se ha guardado nada.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-4" data-testid="pos-close">
      <h2 className="font-semibold">Cierre del día</h2>
      <p className="text-sm text-muted-foreground">
        Cuenta el efectivo de la caja al terminar: Kshop lo compara con las ventas de todos los teléfonos del
        local y le manda el cuadre al dueño. Se cierra una sola vez, desde cualquier teléfono.
      </p>
      {error && step === "idle" && <Alert variant="destructive">{error}</Alert>}
      <Button
        variant="outline"
        disabled={!online || step === "loading"}
        onClick={() => void start()}
        data-testid="pos-close-start"
      >
        {step === "loading" ? (pending > 0 ? "Subiendo ventas…" : "Preparando…") : "Cerrar el día"}
      </Button>
      {!online && <p className="text-xs text-muted-foreground">Para cerrar hace falta conexión.</p>}
      {closingsHref && (
        <Link href={closingsHref} className="text-sm text-primary underline" data-testid="pos-closings-link">
          Ver los cierres
        </Link>
      )}

      {(step === "count" || step === "done") && preview && (
        <Dialog
          open
          onClose={() => setStep("idle")}
          title={step === "done" ? "Caja cerrada" : "Cerrar el día"}
          compact
        >
          {step === "done" && result ? (
            <div className="flex flex-col gap-3" data-testid="pos-close-done">
              <Alert variant={Object.keys(result.difference).length ? "warning" : "success"}>
                <span className="font-semibold">{differenceText(result.difference)}.</span> Debía haber{" "}
                {moneyList(result.expectedCash, currency)}; contaste {moneyList(result.counted, currency)}.
              </Alert>
              <p className="text-sm text-muted-foreground">
                El cierre quedó guardado con las ventas de todos los teléfonos y el dueño recibe el cuadre por
                WhatsApp. Si se vende algo más hoy, irá a otro cierre.
              </p>
              <Button onClick={() => setStep("idle")}>Listo</Button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              data-testid="pos-close-count"
              onSubmit={(e) => {
                e.preventDefault();
                void close();
              }}
            >
              <p className="text-sm">
                {preview.sales} {preview.sales === 1 ? "venta" : "ventas"}
                {preview.voided > 0 && ` · ${preview.voided} anuladas`}
                {preview.closedToday > 0 && " desde el último cierre"}
                {preview.older > 0 && ` · ${preview.older} de días anteriores`}
              </p>
              {preview.byCashier.length > 1 && (
                <ul
                  className="flex flex-col gap-0.5 text-sm text-muted-foreground"
                  data-testid="pos-close-cashiers"
                >
                  {preview.byCashier.map((c) => (
                    <li key={c.cashier}>
                      {c.cashier}: {c.sales} {c.sales === 1 ? "venta" : "ventas"}
                      {Object.keys(c.cash).length > 0 && ` · ${moneyList(c.cash, currency)} en efectivo`}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-1.5">
                {currencies.map((c) => (
                  <div key={`f-${c}`} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`pos-float-${c}`}>Fondo de hoy ({c})</Label>
                    <Input
                      id={`pos-float-${c}`}
                      inputMode="decimal"
                      className="w-32 text-right"
                      value={float[c] ?? ""}
                      placeholder="0"
                      onChange={(e) => setFloat((f) => ({ ...f, [c]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-surface p-3" data-testid="pos-close-expected">
                <p className="text-sm text-muted-foreground">Debe haber en efectivo</p>
                <p className="text-lg font-semibold">{moneyList(expected, currency)}</p>
                {preview.methods.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Aparte, a comprobar:{" "}
                    {preview.methods.map((m) => `${m.name} ${formatMoney(m.amount, m.currency)}`).join(", ")}
                  </p>
                )}
              </div>
              {currencies.map((c) => (
                <div key={`c-${c}`} className="flex flex-col gap-1.5">
                  <Label htmlFor={`pos-counted-${c}`}>Efectivo contado ({c})</Label>
                  <Input
                    id={`pos-counted-${c}`}
                    inputMode="decimal"
                    value={counted[c] ?? ""}
                    onChange={(e) => {
                      setCounted((v) => ({ ...v, [c]: e.target.value }));
                      setError(null);
                    }}
                    data-testid={`pos-close-counted-${c}`}
                  />
                </div>
              ))}
              {complete && (
                <Alert
                  variant={Object.values(diff).some((v) => cents(v) !== 0) ? "warning" : "success"}
                  data-testid="pos-close-difference"
                >
                  {differenceText(diff)}
                </Alert>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pos-close-note">Nota (opcional)</Label>
                <Input
                  id="pos-close-note"
                  value={note}
                  maxLength={500}
                  placeholder="Faltó cambio, un billete roto…"
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              {error && <Alert variant="destructive">{error}</Alert>}
              <Button type="submit" disabled={saving} data-testid="pos-close-confirm">
                {saving ? "Cerrando…" : "Cerrar el día"}
              </Button>
              <p className="text-xs text-muted-foreground">Un cierre no se puede cambiar después.</p>
            </form>
          )}
        </Dialog>
      )}
    </section>
  );
}
