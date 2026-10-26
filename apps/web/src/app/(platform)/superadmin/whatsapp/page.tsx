"use client";

import { WHATSAPP_MODE_LABELS, WHATSAPP_MODES, type WhatsappMode } from "@kshop/core";
import { ApiError, type PlatformWhatsapp } from "@kshop/data";
import { Alert, Button, Card, FieldError, Input, Label, Select } from "@kshop/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/lib/session";

// The platform WhatsApp (one OpenWA session for every store, only outgoing notices). While there is no instance
// the mode stays "Simulado": notices are generated and visible in each store's log, never sent.

export default function SuperadminWhatsappPage() {
  const { api } = useSession();
  const [data, setData] = useState<PlatformWhatsapp | null>(null);
  const [mode, setMode] = useState<WhatsappMode>("dry_run");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.platform
      .whatsapp()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setMode(d.mode);
      })
      .catch(() => !cancelled && setError("No se pudo cargar la configuración."));
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    setFields({});
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Algo salió mal.");
      if (e instanceof ApiError)
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
    } finally {
      setPending(false);
    }
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    void run(async () => {
      const saved = await api.platform.setWhatsapp({
        mode,
        url: text("url") || null,
        session: text("session") || null,
        apiKey: text("apiKey") || undefined,
        ratePerMinute: Number(text("ratePerMinute")) || 20,
        storeRatePerMinute: Number(text("storeRatePerMinute")) || 10,
      });
      setData(saved);
      setNotice("Guardado.");
      // The key is write-only: never left in the form.
      (element.elements.namedItem("apiKey") as HTMLInputElement).value = "";
    });
  }

  function onTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const r = await api.platform.testWhatsapp(
        String(form.get("phone") ?? ""),
        String(form.get("text") ?? ""),
      );
      setNotice(
        r.status === "pending"
          ? "Mensaje en cola: sale en menos de un minuto."
          : "Mensaje simulado (modo sin envío).",
      );
    });
  }

  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">WhatsApp de la plataforma</h1>
      <p className="text-sm text-muted-foreground">
        Un solo número (OpenWA) envía los avisos de todas las tiendas. Cada mensaje empieza con el nombre de
        la tienda.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <Card className="grid gap-2 text-sm sm:grid-cols-4" data-testid="whatsapp-queue">
        <span>En cola: {data.queue.pending}</span>
        <span>Enviados (24 h): {data.queue.sent24h}</span>
        <span>Simulados (24 h): {data.queue.simulated24h}</span>
        <span className={data.queue.failed24h ? "text-destructive" : undefined}>
          Fallidos (24 h): {data.queue.failed24h}
        </span>
      </Card>

      <Card>
        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="mode">Modo</Label>
            <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as WhatsappMode)}>
              {WHATSAPP_MODES.map((m) => (
                <option key={m} value={m}>
                  {WHATSAPP_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="url">URL de OpenWA</Label>
            <Input
              id="url"
              name="url"
              defaultValue={data.url ?? ""}
              placeholder="https://openwa.ejemplo.com"
            />
            <FieldError>{fields.url}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="session">Sesión</Label>
            <Input id="session" name="session" defaultValue={data.session ?? ""} placeholder="kshop" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="apiKey">
              API key {data.hasApiKey && "(guardada; escribe otra para cambiarla)"}
            </Label>
            <Input id="apiKey" name="apiKey" type="password" autoComplete="off" />
            <FieldError>{fields.apiKey}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ratePerMinute">Mensajes por minuto (plataforma)</Label>
            <Input
              id="ratePerMinute"
              name="ratePerMinute"
              type="number"
              min={1}
              max={120}
              defaultValue={data.ratePerMinute}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="storeRatePerMinute">Mensajes por minuto (por tienda)</Label>
            <Input
              id="storeRatePerMinute"
              name="storeRatePerMinute"
              type="number"
              min={1}
              max={120}
              defaultValue={data.storeRatePerMinute}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              Guardar
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <form onSubmit={onTest} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <div className="flex flex-col gap-1">
            <Label htmlFor="test-phone">Teléfono</Label>
            <Input id="test-phone" name="phone" type="tel" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="test-text">Mensaje de prueba</Label>
            <Input id="test-text" name="text" defaultValue="Prueba del WhatsApp de Kshop" required />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            Enviar prueba
          </Button>
        </form>
      </Card>
    </div>
  );
}
