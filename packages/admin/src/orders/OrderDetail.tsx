"use client";

import {
  CANCELLABLE_STATUSES,
  formatMoney,
  formatPhone,
  needsShippingCost,
  ORDER_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  orderCode,
  PAYMENT_STATUS_LABELS,
  SHIPPING_TYPE_LABELS,
  storePublicOrigin,
  whatsappLink,
  type OrderStatus,
  type PaymentStatus,
  type ShippingType,
} from "@kshop/core";
import { AdminOrderQuery, type ResultOf } from "@kshop/data";
import { Alert, Badge, Button, Card, cn, Input, Label, Select } from "@kshop/ui";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useApiAction } from "../catalog/use-catalog";
import { useSession } from "../session";
import { Link, useStore } from "@kshop/storefront";
import { useCheckoutSettings } from "./use-orders";
import { STATUS_VARIANT } from "./OrderList";

// Payment evidence is private (staff of the store only): it is opened through a signed URL valid for 1 h.
const EVIDENCE_BUCKET = "store-private";

function EvidenceLink({ path, signedUrl }: { path: string; signedUrl: (path: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    signedUrl(path).then((u) => !cancelled && setUrl(u));
    return () => {
      cancelled = true;
    };
  }, [path, signedUrl]);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
      comprobante
    </a>
  );
}

type OrderNode = NonNullable<ResultOf<typeof AdminOrderQuery>["ordersCollection"]>["edges"][number]["node"];

const json = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const nodes = <T,>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Havana" }).format(new Date(iso));

const EVENT_LABELS: Record<string, string> = {
  created: "Pedido creado",
  status_changed: "Cambio de estado",
  shipping_set: "Costo de envío fijado",
  payment_recorded: "Pago registrado",
  refund_recorded: "Reembolso registrado",
  note: "Nota interna",
};

/** `notices` renders below the payments (the web passes the WhatsApp notices log of the order). */
export function OrderDetail({ orderId, notices }: { orderId: string; notices?: (orderId: string) => ReactNode }) {
  const store = useStore();
  const { graphql, api, supabase, config } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  const [order, setOrder] = useState<OrderNode | null>(null);
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  const signedEvidenceUrl = useCallback(
    async (path: string) => (await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 60 * 60)).data?.signedUrl ?? null,
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    graphql
      .query(AdminOrderQuery, { id: orderId })
      .toPromise()
      .then((r) => {
        if (cancelled) return;
        const node = nodes(r.data?.ordersCollection)[0];
        if (!node || node.storeId !== store.id) setMissing(true);
        else setOrder(node);
      });
    return () => {
      cancelled = true;
    };
  }, [graphql, orderId, store.id, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const run = async (fn: () => Promise<unknown>) => {
    const ok = await action.run(fn);
    if (ok) reload();
    return !!ok;
  };

  if (missing) return <Alert variant="destructive">Pedido no encontrado.</Alert>;
  if (!order || !settings) return <p className="text-muted-foreground">Cargando…</p>;

  const status = order.status as OrderStatus;
  const paymentStatus = order.paymentStatus as PaymentStatus;
  const code = orderCode(settings.orderPrefix, order.number);
  // pg_graphql exposes the currency_code domain as an opaque scalar.
  const currency = String(order.currency);
  const money = (v: number | string) => formatMoney(Number(v), currency);
  const shippingTotal = order.shippingTotal == null ? null : Number(order.shippingTotal);
  const total = order.total == null ? null : Number(order.total);
  const paid = Number(order.paidTotal);
  const shipping = json<Record<string, unknown> & { pickup_point?: { name: string; address: string | null } }>(order.shippingSnapshot);
  const payment = json<{ name?: string; instructions?: string | null }>(order.paymentSnapshot);
  const lines = nodes(order.orderLinesCollection);
  const events = nodes(order.orderEventsCollection);
  const payments = nodes(order.paymentsCollection).map((p) => ({ ...p, currency: String(p.currency) }));
  const refunds = nodes(order.refundsCollection).map((r) => ({ ...r, currency: String(r.currency) }));
  const publicUrl = `${storePublicOrigin(store, config.platformDomain, config.protocol)}/order/${order.publicToken}`;
  const customerText = `Hola, ${order.customerName}. Tu pedido ${code} en ${store.name} está: ${ORDER_STATUS_LABELS[status]}.${
    total !== null && paid < total && status !== "cancelled" ? ` Total: ${money(total)}.` : ""
  }\n${publicUrl}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-sm text-muted-foreground underline">
            ← Pedidos
          </Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {code}
            <Badge variant={STATUS_VARIANT[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
            <Badge variant="muted">{PAYMENT_STATUS_LABELS[paymentStatus]}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {dateTime(order.createdAt)} · {order.channel === "admin" ? "Creado desde el admin" : "Tienda online"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ORDER_TRANSITIONS[status].map((to) => (
            <Button
              key={to}
              disabled={action.pending || needsShippingCost(to, shippingTotal)}
              title={needsShippingCost(to, shippingTotal) ? "Fija antes el costo de envío" : undefined}
              onClick={() => run(() => api.orders(store.id).transition(order.id, to as Exclude<OrderStatus, "cancelled">))}
            >
              {ORDER_ACTION_LABELS[to] ?? ORDER_STATUS_LABELS[to]}
            </Button>
          ))}
          <a
            href={whatsappLink(order.customerPhone, customerText)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-surface"
          >
            WhatsApp al cliente
          </a>
        </div>
      </div>

      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {status === "cancelled" && (
        <Alert variant="destructive">
          Cancelado{order.cancelledAt ? ` el ${dateTime(order.cancelledAt)}` : ""}
          {order.cancelReason ? `: ${order.cancelReason}` : "."}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Card>
            <h3 className="mb-3 font-semibold">Productos</h3>
            <ul className="divide-y">
              {lines.map((l) => {
                const cost = l.orderLineCosts;
                const costCurrency = cost ? String(cost.costCurrency) : null;
                const sameCurrency = cost && costCurrency === currency;
                const margin = sameCurrency && Number(l.unitPrice) > 0
                  ? Math.round(((Number(l.unitPrice) - Number(cost.unitCost)) / Number(l.unitPrice)) * 1000) / 10
                  : null;
                const attributes = json<{ name: string; value: string }[]>(l.attributes);
                return (
                  <li key={l.id} className="flex gap-3 py-3 text-sm">
                    <div className="h-14 w-12 shrink-0 overflow-hidden rounded bg-surface">
                      {l.imageUrl && (
                        <img src={l.imageUrl} alt="" width={48} height={56} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{l.productName}</span>
                      <span className="text-muted-foreground">
                        {attributes.map((a) => `${a.name}: ${a.value}`).join(" · ") || l.variantName} · SKU {l.sku}
                      </span>
                      {cost && (
                        <span className="text-muted-foreground">
                          Costo {formatMoney(Number(cost.unitCost), costCurrency!)}
                          {margin !== null && ` · margen ${margin} %`}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div>
                        {l.quantity} × {money(l.unitPrice)}
                        {l.unitListPrice != null && Number(l.unitListPrice) > Number(l.unitPrice) && (
                          <s className="ml-1 text-muted-foreground">{money(l.unitListPrice)}</s>
                        )}
                      </div>
                      {l.promotionName && <div className="text-xs text-primary">{l.promotionName}</div>}
                      <div className="font-medium">{money(l.lineTotal)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {nodes(order.orderDiscountsCollection).map((d) => (
                <div key={d.id} className={cn("flex justify-between", d.kind === "promotion" ? "text-xs text-muted-foreground" : "text-primary")}>
                  <dt>
                    {d.kind === "promotion" ? `Oferta «${d.name}» (ya en los precios)` : d.kind === "voucher" ? `Cupón ${d.code}` : d.name}
                    {d.reason && ` · ${d.reason}`}
                  </dt>
                  <dd>−{money(d.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd>{shippingTotal === null ? "A convenir" : money(shippingTotal)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd>{total === null ? "Pendiente" : money(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Pagado</dt>
                <dd>{money(paid)}</dd>
              </div>
            </dl>
          </Card>

          <PaymentsCard
            orderId={order.id}
            currency={currency}
            remaining={total === null ? null : Math.max(0, total - paid)}
            payments={payments}
            refunds={refunds}
            methods={settings.paymentMethods}
            disabled={status === "cancelled"}
            onRecord={(input) => run(() => api.orders(store.id).recordPayment(order.id, input))}
            upload={async (file) => {
              const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
              const path = `stores/${store.id}/payments/${order.id}/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, { contentType: file.type });
              if (error) throw error;
              return path;
            }}
            signedUrl={signedEvidenceUrl}
          />

          {notices?.(order.id)}

          <Card>
            <h3 className="mb-3 font-semibold">Historial</h3>
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e) => {
                const payload = json<Record<string, unknown>>(e.payload);
                const detail =
                  e.type === "status_changed"
                    ? ORDER_STATUS_LABELS[payload.to as OrderStatus] + (payload.reason ? ` (${String(payload.reason)})` : "")
                    : e.type === "note"
                      ? String(payload.text ?? "")
                      : payload.amount !== undefined
                        ? money(Number(payload.amount))
                        : "";
                return (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span>
                      <span className={e.isInternal ? "text-muted-foreground" : "font-medium"}>
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                      {detail && <span> · {detail}</span>}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{dateTime(e.createdAt)}</span>
                  </li>
                );
              })}
            </ol>
            <NoteForm onAdd={(text) => run(() => api.orders(store.id).addNote(order.id, text))} />
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card className="text-sm">
            <h3 className="mb-2 font-semibold">Cliente</h3>
            <p className="font-medium">{order.customerName}</p>
            <p>{formatPhone(order.customerPhone)}</p>
            {order.customers ? (
              <p className="text-muted-foreground">Con cuenta en la tienda</p>
            ) : (
              <p className="text-muted-foreground">Compra sin cuenta</p>
            )}
            {order.customerNote && <p className="mt-2 rounded bg-surface p-2">«{order.customerNote}»</p>}
          </Card>

          <Card className="text-sm">
            <h3 className="mb-2 font-semibold">Entrega</h3>
            <p>{String(shipping.method ?? SHIPPING_TYPE_LABELS[(order.shippingType ?? "to_agree") as ShippingType])}</p>
            {typeof shipping.zone === "string" && <p className="text-muted-foreground">{shipping.zone}</p>}
            {shipping.pickup_point && <p>Recoge en {shipping.pickup_point.name}</p>}
            {typeof shipping.address === "string" && <p>{shipping.address}</p>}
            {typeof shipping.reference === "string" && <p className="text-muted-foreground">{shipping.reference}</p>}
            {typeof shipping.recipient === "string" && <p>Recibe: {shipping.recipient}</p>}
            {!["shipped", "delivered", "cancelled"].includes(status) && (
              <ShippingForm
                current={shippingTotal}
                currency={currency}
                onSave={(amount) => run(() => api.orders(store.id).setShipping(order.id, amount))}
              />
            )}
          </Card>

          <Card className="text-sm">
            <h3 className="mb-2 font-semibold">Pago elegido</h3>
            <p>{payment.name ?? "Sin elegir"}</p>
          </Card>

          {CANCELLABLE_STATUSES.includes(status) && (
            <CancelForm paid={paid > 0 ? money(paid) : null} onCancel={(reason) => run(() => api.orders(store.id).cancel(order.id, reason))} />
          )}
        </div>
      </div>
    </div>
  );
}

function ShippingForm({ current, currency, onSave }: { current: number | null; currency: string; onSave: (amount: number) => Promise<boolean> }) {
  const [value, setValue] = useState(current === null ? "" : String(current));
  return (
    <form
      className="mt-3 flex items-end gap-2 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() !== "") void onSave(Number(value));
      }}
    >
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="shipping-cost">Costo de envío ({currency})</Label>
        <Input id="shipping-cost" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="outline">
        {current === null ? "Fijar" : "Cambiar"}
      </Button>
    </form>
  );
}

function PaymentsCard({
  orderId,
  currency,
  remaining,
  payments,
  refunds,
  methods,
  disabled,
  onRecord,
  upload,
  signedUrl,
}: {
  orderId: string;
  currency: string;
  remaining: number | null;
  payments: { id: string; amount: string; currency: string; reference?: string | null; evidencePath?: string | null; createdAt: string }[];
  refunds: { id: string; amount: string; currency: string; reason?: string | null; createdAt: string }[];
  methods: { id: string; name: string; isActive: boolean }[];
  disabled: boolean;
  onRecord: (input: { amount: number; paymentMethodId?: string; reference?: string; evidencePath?: string }) => Promise<boolean>;
  upload: (file: File) => Promise<string>;
  signedUrl: (path: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      const file = data.get("evidence");
      const evidencePath = file instanceof File && file.size > 0 ? await upload(file) : undefined;
      const ok = await onRecord({
        amount: Number(data.get("amount")),
        paymentMethodId: String(data.get("method") ?? "") || undefined,
        reference: String(data.get("reference") ?? "") || undefined,
        evidencePath,
      });
      if (ok) setOpen(false);
    } catch {
      setError("No se pudo subir el comprobante (JPG, PNG o WebP de hasta 5 MB).");
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Pagos</h3>
        {!disabled && !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Registrar pago
          </Button>
        )}
      </div>
      {payments.length === 0 && refunds.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos todavía.</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex justify-between gap-2">
            <span>
              {formatMoney(Number(p.amount), p.currency)}
              {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
              {p.evidencePath && (
                <EvidenceLink path={p.evidencePath} signedUrl={signedUrl} />
              )}
            </span>
            <span className="text-muted-foreground">{dateTime(p.createdAt)}</span>
          </li>
        ))}
        {refunds.map((r) => (
          <li key={r.id} className="flex justify-between gap-2 text-destructive">
            <span>
              Reembolso {formatMoney(Number(r.amount), r.currency)}
              {r.reason && ` · ${r.reason}`}
            </span>
            <span>{dateTime(r.createdAt)}</span>
          </li>
        ))}
      </ul>
      {open && (
        <form key={orderId} onSubmit={onSubmit} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-amount">Monto ({currency})</Label>
            <Input id="pay-amount" name="amount" inputMode="decimal" defaultValue={remaining ?? ""} required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-method">Método</Label>
            <Select id="pay-method" name="method" defaultValue="">
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-reference">Referencia (opcional)</Label>
            <Input id="pay-reference" name="reference" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pay-evidence">Comprobante (opcional)</Label>
            <Input id="pay-evidence" name="evidence" type="file" accept="image/jpeg,image/png,image/webp" />
          </div>
          {error && <Alert variant="destructive" className="sm:col-span-2">{error}</Alert>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit">Guardar pago</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  return (
    <form
      className="mt-4 flex gap-2 border-t pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim() && (await onAdd(text.trim()))) setText("");
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Nota interna (el cliente no la ve)"
        aria-label="Nota interna"
      />
      <Button type="submit" variant="outline">
        Añadir
      </Button>
    </form>
  );
}

function CancelForm({ paid, onCancel }: { paid: string | null; onCancel: (reason?: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        Cancelar pedido
      </Button>
    );
  }
  return (
    <Card className="flex flex-col gap-3 border-destructive/40 text-sm">
      <h3 className="font-semibold">Cancelar pedido</h3>
      <p className="text-muted-foreground">
        Las unidades vuelven al stock.{paid && ` Se registrará el reembolso de ${paid}.`}
      </p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo" />
      <div className="flex gap-2">
        <Button variant="destructive" onClick={() => onCancel(reason.trim() || undefined)}>
          Confirmar cancelación
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
    </Card>
  );
}
