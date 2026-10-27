"use client";

import { formatMoney, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_TYPE_LABELS } from "@kshop/core";
import type { PublicOrder } from "@kshop/data";
import { Alert, Badge, Card } from "@kshop/ui";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePublicApi, useStore } from "../store-context";

// Public order page (/order/{token}): confirmation after the checkout and the link the customer keeps.
// Opening WhatsApp after an await is blocked by mobile browsers, so the customer taps the button here (gotcha).

// ?new=1 right after the checkout (read from the URL, false while prerendering).
const noSubscribe = () => () => {};
const readIsNew = () => new URLSearchParams(window.location.search).get("new") === "1";

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Havana",
  }).format(new Date(iso));

/** By the token in the URL (/order/{token}) or a given one (/account/orders/{id}). */
export function OrderView({ token }: { token: string }) {
  const store = useStore();
  const publicApi = usePublicApi();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [missing, setMissing] = useState(false);
  const isNew = useSyncExternalStore(noSubscribe, readIsNew, () => false);

  useEffect(() => {
    publicApi
      .checkout(store.id)
      .order(token)
      .then(
        (r) => setOrder(r.order),
        () => setMissing(true),
      );
  }, [publicApi, store.id, token]);

  if (missing) return <p className="py-12 text-center">No encontramos este pedido.</p>;
  if (!order) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;

  const money = (v: number) => formatMoney(v, order.currency);
  const s = order.shipping;
  return (
    <div className="flex flex-col gap-6">
      {isNew && (
        <Card className="flex flex-col gap-3 border-primary">
          <h2 className="text-xl font-semibold">¡Pedido {order.code} recibido!</h2>
          <p>
            Último paso: envíalo a {order.storeName} por WhatsApp para que lo confirmen. Guarda esta página
            para ver cómo va tu pedido.
          </p>
          {order.whatsappUrl && (
            <a
              href={order.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-sf-btn bg-whatsapp px-6 font-semibold text-white hover:opacity-90"
            >
              Enviar pedido por WhatsApp
            </a>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="sf-heading text-2xl font-semibold">Pedido {order.code}</h1>
          <p className="text-sm text-muted-foreground">{dateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Badge>{ORDER_STATUS_LABELS[order.status]}</Badge>
          <Badge variant="muted">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Badge>
        </div>
      </div>

      {order.status === "cancelled" && <Alert variant="destructive">Este pedido fue cancelado.</Alert>}

      <Card>
        <ul className="flex flex-col divide-y">
          {order.lines.map((l, i) => (
            <li key={`${l.sku}-${i}`} className="flex gap-3 py-3">
              <div className="h-16 w-14 shrink-0 overflow-hidden rounded bg-surface">
                {l.imageUrl && (
                  // snapshot URL from Supabase Storage
                  <img
                    src={l.imageUrl}
                    alt=""
                    width={56}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col text-sm">
                <span className="font-medium">{l.productName}</span>
                {l.variantName && <span className="text-muted-foreground">{l.variantName}</span>}
                <span className="text-muted-foreground">
                  {l.quantity} × {money(l.unitPrice)}
                  {l.listPrice !== null && l.listPrice > l.unitPrice && (
                    <s className="ml-2">{money(l.listPrice)}</s>
                  )}
                </span>
              </div>
              <span className="text-sm font-medium">{money(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{money(order.subtotal)}</dd>
          </div>
          {order.discounts
            .filter((d) => d.kind === "promotion")
            .map((d, i) => (
              <p key={`p-${i}`} className="text-xs text-primary">
                {d.name}: ahorras {money(d.amount)}
              </p>
            ))}
          {order.discounts
            .filter((d) => d.kind !== "promotion")
            .map((d, i) => (
              <div key={`d-${i}`} className="flex justify-between text-primary">
                <dt>{d.kind === "voucher" ? `Cupón ${d.code}` : d.name}</dt>
                <dd>−{money(d.amount)}</dd>
              </div>
            ))}
          <div className="flex justify-between">
            <dt>Entrega</dt>
            <dd>
              {order.shippingTotal === null
                ? "A convenir"
                : order.shippingTotal === 0
                  ? "Gratis"
                  : money(order.shippingTotal)}
            </dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{order.total === null ? "Pendiente del costo de entrega" : money(order.total)}</dd>
          </div>
          {order.paidTotal > 0 && (
            <div className="flex justify-between text-success">
              <dt>Pagado</dt>
              <dd>{money(order.paidTotal)}</dd>
            </div>
          )}
        </dl>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">Entrega</h2>
          <p>{s.method ?? SHIPPING_TYPE_LABELS[order.shippingType]}</p>
          {s.zone && <p className="text-muted-foreground">{s.zone}</p>}
          {s.pickup_point && (
            <p>
              Recoger en {s.pickup_point.name}
              {s.pickup_point.address && `, ${s.pickup_point.address}`}
            </p>
          )}
          {s.address && <p>{s.address}</p>}
          {s.reference && <p className="text-muted-foreground">{s.reference}</p>}
          {s.recipient && <p>Recibe: {s.recipient}</p>}
        </Card>
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">Pago</h2>
          {order.paymentMethod ? (
            <>
              <p>{order.paymentMethod.name}</p>
              {order.paymentMethod.instructions && (
                <p className="whitespace-pre-line text-muted-foreground">
                  {order.paymentMethod.instructions}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">A acordar con la tienda.</p>
          )}
        </Card>
      </div>

      {order.events.length > 0 && (
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">Historial</h2>
          <ol className="flex flex-col gap-1">
            {order.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {e.type === "created" ? "Pedido recibido" : e.to ? ORDER_STATUS_LABELS[e.to] : e.type}
                </span>
                <span className="text-muted-foreground">{dateTime(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {!isNew && order.whatsappUrl && (
        <a
          href={order.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-sm underline"
        >
          Escribir a {store.name} sobre este pedido
        </a>
      )}
    </div>
  );
}
