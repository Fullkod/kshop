"use client";

import { convertFromBase, formatMoney, formatPhone, SHIPPING_TYPE_LABELS } from "@kshop/core";
import { ApiError, type CheckoutOptions } from "@kshop/data";
import { Alert, Button, FieldError, Input, Label, Select } from "@kshop/ui";
import { Link } from "../navigation";
import { useRouter } from "../navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useStore } from "../store-context";
import { useCustomerSession } from "../account/CustomerSession";
import { useSelectedCurrency } from "../components/Currency";
import { getCartToken } from "./cart-token";
import { useCart } from "./CartProvider";
import { VoucherForm } from "./CartView";

// One-page checkout, mobile first (D9): the server recomputes prices, stock and shipping; this page only
// shows an estimate and sends the choices.

export function CheckoutView() {
  const store = useStore();
  const router = useRouter();
  const { cart, refresh, reset } = useCart();
  const { customer, api, signIn } = useCustomerSession();
  const currency = useSelectedCurrency();
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  // One key per checkout attempt: a double tap or a retry after a network error never creates two orders.
  // Created on the first submit (a random value during render would break the prerendered shell).
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    api
      .checkout(store.id)
      .options()
      .then(setOptions, () => setError("No se pudieron cargar las opciones de entrega."));
  }, [api, store.id]);

  const zoneMethods = useMemo(
    () => options?.methods.filter((m) => m.zoneId === null || m.zoneId === zoneId) ?? [],
    [options, zoneId],
  );
  const method = zoneMethods.find((m) => m.id === methodId) ?? null;
  const payments = options?.paymentMethods.filter(
    (p) => p.currencies.length === 0 || (cart && p.currencies.includes(cart.currency)),
  );

  if (!cart || !options) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;
  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg">Tu carrito está vacío.</p>
        <Link href="/products" className="underline">
          Ver productos
        </Link>
      </div>
    );
  }

  const money = (v: number) => formatMoney(v, cart.currency);
  const toCartCurrency = (base: number) =>
    !currency || currency.isBase ? base : convertFromBase(base, currency.rateToBase, currency.rounding);
  const subtotalBase = currency && !currency.isBase ? cart.subtotal * currency.rateToBase : cart.subtotal;
  const voucher = cart.voucher && !cart.voucher.error ? cart.voucher : null;
  // Products after the voucher (a shipping voucher is priced by the server when the order is created).
  const goods = Math.max(0, cart.subtotal - cart.discountTotal);
  const shipping =
    !method || method.type === "to_agree"
      ? null
      : method.freeOverSubtotal !== null && subtotalBase >= method.freeOverSubtotal
        ? 0
        : toCartCurrency(method.price);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || undefined;
    setPending(true);
    setError(null);
    setFields({});
    try {
      idempotencyKey.current ??= crypto.randomUUID();
      const result = await api.checkout(store.id).place({
        idempotencyKey: idempotencyKey.current,
        cartToken: getCartToken(store.id),
        currency: cart.currency,
        customer: { name: text("name") ?? "", phone: text("phone") ?? "" },
        shipping: options?.shippingEnabled
          ? {
              zoneId: zoneId || undefined,
              methodId: methodId || undefined,
              recipient: text("recipient"),
              address: text("address"),
              reference: text("reference"),
            }
          : { address: text("address"), reference: text("reference") },
        paymentMethodId: paymentId || undefined,
        note: text("note"),
        createAccountPassword: !customer && createAccount ? String(data.get("password") ?? "") : undefined,
        notifyCustomer,
      });
      if (result.account) await signIn(result.account);
      reset();
      router.push(`/order/${result.order.publicToken}?new=1`);
    } catch (e) {
      setPending(false);
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields ?? {});
        // Stock or prices changed: show the cart as it is now and allow a fresh attempt.
        if (e.code === "insufficient_stock" || e.code === "empty_cart") {
          idempotencyKey.current = null;
          await refresh();
        }
      } else {
        setError("No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.");
      }
    }
  }

  const fieldError = (path: string) => fields[path]?.[0];

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_340px]" noValidate>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Tus datos</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              defaultValue={customer ? `${customer.firstName} ${customer.lastName ?? ""}`.trim() : ""}
              required
            />
            <FieldError>{fieldError("customer")}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Teléfono (con WhatsApp)</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="5123 4567"
              defaultValue={customer ? formatPhone(customer.phone) : ""}
              required
            />
          </div>
          {!customer && (
            <p className="text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link href="/account/login?next=/checkout" className="font-medium text-foreground underline">
                Entra
              </Link>
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Entrega</h2>
          {options.shippingEnabled ? (
            <>
              {options.zones.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="zone">Zona</Label>
                  <Select
                    id="zone"
                    value={zoneId}
                    onChange={(e) => {
                      setZoneId(e.target.value);
                      setMethodId("");
                    }}
                  >
                    <option value="">Elige tu zona</option>
                    {options.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Método de entrega</legend>
                {zoneMethods.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Elige una zona para ver cómo te lo hacemos llegar.
                  </p>
                )}
                {zoneMethods.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-3 rounded-sf border p-3 has-[:checked]:border-primary"
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m.id}
                      checked={methodId === m.id}
                      onChange={() => setMethodId(m.id)}
                      className="mt-1"
                    />
                    <span className="flex flex-1 flex-col text-sm">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-muted-foreground">
                        {SHIPPING_TYPE_LABELS[m.type]}
                        {m.pickupPoint &&
                          ` · ${m.pickupPoint.name}${m.pickupPoint.address ? `, ${m.pickupPoint.address}` : ""}`}
                        {m.minDays !== null &&
                          ` · ${m.minDays}${m.maxDays !== null && m.maxDays !== m.minDays ? `–${m.maxDays}` : ""} días`}
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      {m.type === "to_agree"
                        ? "A convenir"
                        : m.price === 0
                          ? "Gratis"
                          : money(toCartCurrency(m.price))}
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">La tienda acordará contigo la entrega y su costo.</p>
          )}
          {(!options.shippingEnabled || method?.type !== "pickup") && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">Dirección{method?.type === "delivery" ? "" : " (opcional)"}</Label>
                <Input
                  id="address"
                  name="address"
                  autoComplete="street-address"
                  required={method?.type === "delivery"}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reference">Referencias (opcional)</Label>
                <Input id="reference" name="reference" placeholder="Entre calles, color de la casa…" />
              </div>
              {method?.type === "delivery" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="recipient">Quién recibe (si no eres tú)</Label>
                  <Input id="recipient" name="recipient" />
                </div>
              )}
            </>
          )}
        </section>

        {payments && payments.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Pago</h2>
            {payments.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-start gap-3 rounded-sf border p-3 has-[:checked]:border-primary"
              >
                <input
                  type="radio"
                  name="payment"
                  value={p.id}
                  checked={paymentId === p.id}
                  onChange={() => setPaymentId(p.id)}
                  className="mt-1"
                />
                <span className="flex flex-col text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.instructions && paymentId === p.id && (
                    <span className="whitespace-pre-line text-muted-foreground">{p.instructions}</span>
                  )}
                </span>
              </label>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-1.5">
          <Label htmlFor="note">Nota para la tienda (opcional)</Label>
          <textarea
            id="note"
            name="note"
            rows={3}
            maxLength={1000}
            className="rounded-md border bg-background px-3 py-2 text-sm"
          />
        </section>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifyCustomer}
            onChange={(e) => setNotifyCustomer(e.target.checked)}
            className="mt-1"
          />
          Recibir por WhatsApp los avisos de este pedido (confirmación, pago, envío)
        </label>

        {!customer && (
          <section className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
                className="mt-1"
              />
              Crear una cuenta con este teléfono para ver mis pedidos
            </label>
            {createAccount && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Contraseña (mínimo 8 caracteres)</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                />
                <FieldError>{fieldError("password") ?? fieldError("createAccountPassword")}</FieldError>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="flex h-fit flex-col gap-3 rounded-sf border p-4 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold">Tu pedido</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span>
                {l.quantity} × {l.productName}
                {l.variantName && <span className="text-muted-foreground"> ({l.variantName})</span>}
              </span>
              <span className="shrink-0">{money(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(cart.subtotal)}</span>
          </div>
          {cart.promotionSavings > 0 && (
            <p className="text-xs text-primary">Ahorras {money(cart.promotionSavings)} con las ofertas.</p>
          )}
          {voucher && (
            <div className="flex justify-between text-primary">
              <span>Cupón {voucher.code}</span>
              <span>{voucher.amount === null ? "En el envío" : `−${money(voucher.amount)}`}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Entrega</span>
            <span>
              {!method ? "—" : shipping === null ? "A convenir" : shipping === 0 ? "Gratis" : money(shipping)}
            </span>
          </div>
          <div className="flex justify-between pt-1 text-base font-semibold">
            <span>Total</span>
            <span>{shipping === null ? `${money(goods)} + entrega` : money(goods + shipping)}</span>
          </div>
          {voucher?.amount === null && (
            <p className="text-xs text-muted-foreground">
              El cupón se descuenta del envío al confirmar el pedido.
            </p>
          )}
        </div>
        {cart.vouchersEnabled && <VoucherForm />}
        {cart.hasIssues && (
          <Alert variant="destructive">Algunos productos cambiaron. Revisa tu carrito.</Alert>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <Button type="submit" size="lg" disabled={pending || cart.hasIssues}>
          {pending ? "Enviando pedido…" : "Confirmar pedido"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Después de confirmar te llevamos a WhatsApp para enviar el pedido a {store.name}.
        </p>
      </aside>
    </form>
  );
}
