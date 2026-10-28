"use client";

import { formatMoney, formatPhone, normalizePhone, SHIPPING_TYPE_LABELS } from "@kshop/core";
import { asResult } from "@kshop/data";
import { Alert, Button, Card, Input, Label, Select } from "@kshop/ui";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import { useCheckoutSettings } from "../use-orders";

// "Nuevo pedido" from the admin (decision 23): orders taken by phone or in person, through the same
// transactional checkout (channel admin). Prices are the base prices; the server recomputes everything.

type Result = { variantId: string; label: string; sku: string; price: number; available: number | null };
type Line = Result & { quantity: number };

export function NewOrder() {
  const store = useStore();
  const router = useRouter();
  const admin = useAdmin();
  const [manualReward, setManualReward] = useState<"" | "percent" | "fixed">("");
  const { reads, api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [linkCustomer, setLinkCustomer] = useState(true);
  const [zoneId, setZoneId] = useState("");
  const [methodId, setMethodId] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const r = await asResult(reads.variantSearch(store.id, q));
      if (cancelled) return;
      setResults(
        (r.data?.adminSearchProducts?.edges ?? []).flatMap(({ node: p }) =>
          (p.productVariantsCollection?.edges ?? []).map(({ node: v }) => ({
            variantId: v.id,
            label: v.name ? `${p.name} (${v.name})` : p.name,
            sku: v.sku,
            price: Number(v.price),
            available: v.trackInventory ? v.stockAvailable : null,
          })),
        ),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reads, store.id, query]);

  // An account with that phone in this store can be linked to the order (so it shows in «Mis pedidos»).
  const normalized = normalizePhone(phone);
  const match = normalized ? customer : null;
  useEffect(() => {
    if (!normalized) return;
    let cancelled = false;
    asResult(reads.customers({ storeId: store.id, phone: normalized, first: 1 })).then((r) => {
      const c = r.data?.customersCollection?.edges[0]?.node;
      if (!cancelled) setCustomer(c ? { id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() } : null);
    });
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, normalized]);

  const activeZones = settings?.zones.filter((z) => z.isActive) ?? [];
  const methods = useMemo(
    () => settings?.methods.filter((m) => m.isActive && (m.zoneId === null || m.zoneId === zoneId)) ?? [],
    [settings, zoneId],
  );
  const method = methods.find((m) => m.id === methodId);
  const currency = settings?.baseCurrency ?? "CUP";
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  function addLine(result: Result) {
    setLines((current) => {
      const existing = current.find((l) => l.variantId === result.variantId);
      if (existing) return current.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { ...result, quantity: 1 }];
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    idempotencyKey.current ??= crypto.randomUUID();
    const result = await action.run(() =>
      api.orders(store.id).create({
        idempotencyKey: idempotencyKey.current!,
        customerId: match && linkCustomer ? match.id : undefined,
        customer: { name: text("name") ?? "", phone },
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        shipping: {
          zoneId: zoneId || undefined,
          methodId: methodId || undefined,
          address: text("address"),
          reference: text("reference"),
        },
        paymentMethodId: text("payment"),
        note: text("note"),
        notifyCustomer: true,
        voucherCode: text("voucher")?.toUpperCase(),
        manualDiscount: manualReward
          ? {
              reward: manualReward,
              value: Number(text("manualValue") ?? 0),
              reason: text("manualReason") ?? null,
            }
          : undefined,
      }),
    );
    if (result) router.push(`/admin/orders/${result.orderId}`);
    else idempotencyKey.current = null;
  }

  if (!settings) return <p className="text-muted-foreground">Cargando…</p>;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Productos</h2>
          <Input
            type="search"
            placeholder="Buscar por nombre o SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar productos"
          />
          {query.trim().length >= 2 && results.length > 0 && (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
              {results.map((r) => (
                <li key={r.variantId} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{r.label}</span>
                    <span className="text-muted-foreground">
                      {r.sku} · {formatMoney(r.price, currency)}
                      {r.available !== null && ` · ${r.available} disponibles`}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={r.available === 0}
                    onClick={() => addLine(r)}
                  >
                    Añadir
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Busca y añade los productos del pedido.</p>
          ) : (
            <ul className="divide-y text-sm">
              {lines.map((l) => (
                <li key={l.variantId} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((c) =>
                        c.map((x) =>
                          x === l ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      )
                    }
                    className="w-20"
                    aria-label={`Cantidad de ${l.label}`}
                  />
                  <span className="w-24 text-right">{formatMoney(l.price * l.quantity, currency)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setLines((c) => c.filter((x) => x !== l))}
                  >
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Cliente</h2>
          <div className="flex flex-col gap-1">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5123 4567"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              key={match?.id ?? "none"}
              defaultValue={match?.name ?? ""}
              required
            />
          </div>
          {match && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={linkCustomer}
                onChange={(e) => setLinkCustomer(e.target.checked)}
              />
              Vincular a la cuenta de {match.name} ({formatPhone(normalized ?? phone)})
            </label>
          )}
        </Card>

        <Card className="grid gap-3 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Entrega y pago</h2>
          {activeZones.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="zone">Zona</Label>
              <Select
                id="zone"
                value={zoneId}
                onChange={(e) => {
                  setZoneId(e.target.value);
                  setMethodId("");
                }}
              >
                <option value="">—</option>
                {activeZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="method">Método de entrega</Label>
            <Select id="method" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ·{" "}
                  {m.type === "to_agree" ? SHIPPING_TYPE_LABELS.to_agree : formatMoney(m.price, currency)}
                </option>
              ))}
            </Select>
          </div>
          {method?.type !== "pickup" && (
            <>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="address">Dirección</Label>
                <Input id="address" name="address" />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="reference">Referencias</Label>
                <Input id="reference" name="reference" />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="payment">Método de pago</Label>
            <Select id="payment" name="payment" defaultValue="">
              <option value="">—</option>
              {settings.paymentMethods
                .filter((p) => p.isActive && (p.currencies.length === 0 || p.currencies.includes(currency)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="note">Nota del cliente</Label>
            <Input id="note" name="note" />
          </div>
        </Card>
      </div>

      <Card className="flex h-fit flex-col gap-3 lg:sticky lg:top-6">
        <h2 className="font-semibold">Resumen</h2>
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        {/* Coupons and the manual discount come with the vouchers module (Pro or add-on). */}
        {admin.enabledModules.has("vouchers") && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="voucher">Cupón (opcional)</Label>
              <Input id="voucher" name="voucher" className="uppercase" placeholder="BIENVENIDA10" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="manualReward">Descuento manual</Label>
              <Select
                id="manualReward"
                value={manualReward}
                onChange={(e) => setManualReward(e.target.value as typeof manualReward)}
              >
                <option value="">Sin descuento</option>
                <option value="percent">Porcentaje</option>
                <option value="fixed">Importe ({currency})</option>
              </Select>
            </div>
            {manualReward && (
              <>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="manualValue">
                    {manualReward === "percent" ? "Porcentaje (%)" : `Importe (${currency})`}
                  </Label>
                  <Input id="manualValue" name="manualValue" inputMode="decimal" required />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="manualReason">Motivo</Label>
                  <Input id="manualReason" name="manualReason" placeholder="Cliente habitual" />
                </div>
              </>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Las ofertas, el cupón, el envío y el total se calculan al crear el pedido.
        </p>
        {action.error && <Alert variant="destructive">{action.error}</Alert>}
        <Button type="submit" disabled={action.pending || lines.length === 0 || !normalized}>
          {action.pending ? "Creando…" : "Crear pedido"}
        </Button>
      </Card>
    </form>
  );
}
