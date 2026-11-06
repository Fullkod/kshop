"use client";

import {
  CURRENCY_CODES,
  amountToSettle,
  formatMoney,
  parseDecimal,
  paymentPreview,
  posCartTotal,
  posItemPrice,
  posSaleSchema,
  posSearchIndex,
  quoteToOrderRate,
  rateQuote,
  searchPosCatalog,
  suggestedQuote,
  type CurrencyCode,
  type PosSaleInput,
} from "@kshop/core";
import type { PosCatalogItem } from "@kshop/data";
import {
  Alert,
  Badge,
  Button,
  Card,
  CircleCheck,
  Dialog,
  Ellipsis,
  Input,
  Label,
  Select,
  Minus,
  Plus,
  Search,
  cn,
} from "@kshop/ui";
import { useMemo, useRef, useState } from "react";
import { useAdmin } from "../admin-context";
import { PosDay } from "./PosDay";
import { usePosSales } from "./pos-sync";
import { PosStatus, usePosCatalog, usePosPlace, usePosStorage } from "./PosStatus";
import type { PosCatalogSnapshot } from "./storage";

type CartLine = {
  item: PosCatalogItem;
  quantity: number;
  unitPrice: number;
  /** The cashier changed the price on purpose (KSH0011), with an optional reason. */
  priceChanged?: boolean;
  priceNote?: string;
};
type Paid = NonNullable<PosSaleInput["payments"]>[number] & { applied: number };

/** The ticket in progress outlives leaving the Caja (to open a sale's order, say) until the app or page closes. */
const drafts = new Map<string, CartLine[]>();

const itemLabel = (item: PosCatalogItem) =>
  item.variantName ? `${item.productName} · ${item.variantName}` : item.productName;

/** Selling at the counter, with or without a connection: search, add, charge. The sale is saved on the phone first.
 * The ticket is the screen; the catalog and the day's sales live in a sheet behind «⋯» (Roberto, 2026-11-05). */
export function PosScreen({ storeId, online }: { storeId: string; online: boolean }) {
  const storage = usePosStorage();
  const place = usePosPlace();
  const catalog = usePosCatalog(storeId, online);
  const [query, setQuery] = useState("");
  const [cart, setCartState] = useState<CartLine[]>(() => drafts.get(storeId) ?? []);
  function setCart(next: CartLine[] | ((lines: CartLine[]) => CartLine[])) {
    setCartState((lines) => {
      const value = typeof next === "function" ? next(lines) : next;
      drafts.set(storeId, value);
      return value;
    });
  }
  const [charging, setCharging] = useState(false);
  const [menu, setMenu] = useState(false);
  const [pricing, setPricing] = useState<string | null>(null);
  const admin = useAdmin();
  // Owner and admin get the cost in the catalog; a phone shared with staff must not show it from the cache.
  const seesCost = admin.role === null || admin.role === "owner" || admin.role === "admin";
  // While the search has the focus the on-screen keyboard is up: the bottom bars step aside.
  const [typing, setTyping] = useState(false);
  const [saved, setSaved] = useState<{ number: string; change: string | null } | null>(null);
  const queue = usePosSales(storeId, online);
  const searchRef = useRef<HTMLInputElement>(null);

  const items = catalog.snapshot?.items;
  const index = useMemo(() => posSearchIndex(items ?? []), [items]);
  const results = useMemo(() => searchPosCatalog(index, query), [index, query]);
  const currency = (catalog.snapshot?.currency ?? "CUP") as CurrencyCode;
  const total = posCartTotal(cart);
  const units = cart.reduce((sum, l) => sum + l.quantity, 0);
  const pending = queue.sales ? queue.sales.filter((s) => !s.uploaded).length : null;
  const held = queue.sales ? queue.sales.some((s) => s.held && !s.uploaded) : false;

  /** A tap closes the keyboard to show the ticket; a code reader (Enter) keeps the search ready for the next code. */
  function add(item: PosCatalogItem, keepTyping = false) {
    setSaved(null);
    setCart((lines) => {
      const found = lines.find((l) => l.item.variantId === item.variantId);
      if (found) {
        return lines.map((l) => (l === found ? { ...l, quantity: Math.min(l.quantity + 1, 999) } : l));
      }
      return [...lines, { item, quantity: 1, unitPrice: posItemPrice(item) }];
    });
    setQuery("");
    if (keepTyping) searchRef.current?.focus();
    else searchRef.current?.blur();
  }

  function setPrice(variantId: string, unitPrice: number, note: string) {
    setCart((lines) =>
      lines.map((l) => {
        if (l.item.variantId !== variantId) return l;
        const changed = Math.round(unitPrice * 100) !== Math.round(posItemPrice(l.item) * 100);
        return {
          ...l,
          unitPrice,
          priceChanged: changed || undefined,
          priceNote: changed && note.trim() ? note.trim() : undefined,
        };
      }),
    );
    setPricing(null);
  }

  function setQuantity(variantId: string, quantity: number) {
    setCart((lines) =>
      quantity < 1
        ? lines.filter((l) => l.item.variantId !== variantId)
        : lines.map((l) =>
            l.item.variantId === variantId ? { ...l, quantity: Math.min(quantity, 999) } : l,
          ),
    );
  }

  /** The reader ends a code with Enter: the exact code goes straight to the cart. */
  function onEnter() {
    const code = query.trim().toLowerCase();
    const exact = results.find((r) => r.sku.toLowerCase() === code);
    const only = results.length === 1 ? results[0] : undefined;
    if (exact ?? only) add((exact ?? only) as PosCatalogItem, true);
  }

  return (
    <div
      className={cn("flex flex-col gap-3", typing ? "pb-4" : "pb-28")}
      data-testid="pos-screen"
      data-pos-typing={typing || undefined}
    >
      {!online && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status" data-testid="pos-offline">
          {place === "teléfono"
            ? "Sin conexión. Lo guardado en este teléfono sigue disponible."
            : "Sin conexión. Puedes seguir vendiendo, pero no recargues ni cierres esta página: sin internet no vuelve a abrirse."}
        </p>
      )}

      {catalog.loaded && !catalog.snapshot && (
        <Alert variant="destructive" data-testid="pos-no-catalog">
          <span className="flex flex-col items-start gap-2">
            <span>
              Este {place} aún no tiene el catálogo.{" "}
              {online ? "Descárgalo para vender." : "Conéctalo a internet una vez."}
            </span>
            {online && (
              <Button
                size="sm"
                variant="outline"
                disabled={catalog.refreshing}
                onClick={() => void catalog.refresh()}
              >
                {catalog.refreshing ? "Descargando…" : "Descargar catálogo"}
              </Button>
            )}
          </span>
        </Alert>
      )}

      {catalog.snapshot && (
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-surface px-4 py-2">
          <div className="relative flex-1">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchRef}
              enterKeyHint="search"
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onEnter();
                }
              }}
              placeholder="Buscar por nombre o código"
              aria-label="Buscar producto"
              data-testid="pos-search"
            />
          </div>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={`Catálogo y ventas de hoy${pending ? ` (${pending} sin subir)` : ""}`}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground"
            data-testid="pos-menu"
          >
            <Ellipsis size={20} aria-hidden />
            {!!pending && (
              <span
                className={cn(
                  "absolute -top-1.5 -right-1.5 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold text-white",
                  held ? "bg-destructive" : "bg-primary",
                )}
              >
                {pending}
              </span>
            )}
          </button>
        </div>
      )}

      {saved && query.trim() === "" && (
        <Alert data-testid="pos-saved">
          Venta {saved.number} guardada en este {place}.{saved.change ? ` Vuelto: ${saved.change}.` : ""}
        </Alert>
      )}

      {query.trim() !== "" ? (
        <ul className="flex flex-col gap-1" data-testid="pos-results">
          {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin resultados.</li>}
          {results.map((item) => (
            <li key={item.variantId}>
              <button
                type="button"
                // The search keeps the focus until the tap lands, so the list does not jump under the finger.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => add(item)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{itemLabel(item)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.sku}
                    {item.trackInventory && ` · Stock ${item.stock}`}
                  </span>
                </span>
                <span className="font-semibold whitespace-nowrap">
                  {formatMoney(posItemPrice(item), currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : cart.length > 0 ? (
        <Card className="flex flex-col divide-y p-0" data-testid="pos-cart">
          {cart.map((line) => (
            <div key={line.item.variantId} className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                type="button"
                className="-mx-2 min-w-0 rounded-md px-2 py-1 text-left hover:bg-surface"
                aria-label={`Cambiar el precio de ${itemLabel(line.item)}`}
                onClick={() => setPricing(line.item.variantId)}
                data-testid="pos-line-price"
              >
                <p className="font-medium">{itemLabel(line.item)}</p>
                <p className="text-sm text-muted-foreground">
                  {line.priceChanged && (
                    <span className="mr-1 line-through">
                      {formatMoney(posItemPrice(line.item), currency)}
                    </span>
                  )}
                  <span className={cn(line.priceChanged && "font-semibold text-foreground")}>
                    {formatMoney(line.unitPrice, currency)}
                  </span>
                  {line.quantity > 1 && ` · ${formatMoney(line.unitPrice * line.quantity, currency)}`}
                  {line.item.trackInventory && line.quantity > line.item.stock && (
                    <Badge variant="muted" className="ml-2">
                      Stock {line.item.stock}
                    </Badge>
                  )}
                </p>
                {line.priceNote && <p className="text-xs text-muted-foreground">{line.priceNote}</p>}
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Quitar uno de ${itemLabel(line.item)}`}
                  onClick={() => setQuantity(line.item.variantId, line.quantity - 1)}
                >
                  <Minus size={16} aria-hidden />
                </Button>
                <input
                  aria-label={`Cantidad de ${itemLabel(line.item)}`}
                  inputMode="numeric"
                  value={line.quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    // Typed over the selected number; an empty or zero field keeps what it had (− removes the line).
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    if (n >= 1) setQuantity(line.item.variantId, n);
                  }}
                  className="h-10 w-11 rounded-md border bg-background text-center text-base font-semibold"
                  data-testid="pos-quantity"
                />
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Añadir uno de ${itemLabel(line.item)}`}
                  onClick={() => setQuantity(line.item.variantId, line.quantity + 1)}
                >
                  <Plus size={16} aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        catalog.snapshot &&
        !saved && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            Busca un producto o escanea su código para empezar la venta.
          </p>
        )
      )}

      {cart.length > 0 && !typing && (
        <div className="fixed right-0 left-[var(--app-sidebar-width,0px)] bottom-[calc(var(--app-tabs-height,4rem)+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
          <span className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {units} {units === 1 ? "producto" : "productos"}
            </span>
            <span className="text-lg font-semibold" data-testid="pos-total">
              {formatMoney(total, currency)}
            </span>
          </span>
          <Button onClick={() => setCharging(true)} data-testid="pos-charge">
            Cobrar
          </Button>
        </div>
      )}

      <Dialog open={menu} onClose={() => setMenu(false)} title={`Caja en este ${place}`} compact>
        <div className="flex flex-col gap-4">
          <PosStatus catalog={catalog} online={online} pending={pending} />
          {queue.sales && queue.sales.length > 0 && (
            <PosDay
              sales={queue.sales}
              currency={currency}
              methods={catalog.snapshot?.paymentMethods ?? []}
              syncing={queue.syncing}
              canUpload={queue.canUpload}
              onUpload={() => void queue.sync()}
              onVoid={queue.voidSale}
            />
          )}
        </div>
      </Dialog>

      {pricing &&
        (() => {
          const line = cart.find((l) => l.item.variantId === pricing);
          return line ? (
            <PosPriceDialog
              line={line}
              currency={currency}
              cost={seesCost ? (line.item.cost ?? null) : null}
              onClose={() => setPricing(null)}
              onApply={(price, note) => setPrice(line.item.variantId, price, note)}
            />
          ) : null;
        })()}

      {charging && catalog.snapshot && (
        <PosCheckout
          snapshot={catalog.snapshot}
          total={total}
          onClose={() => setCharging(false)}
          onConfirm={async (payments) => {
            const [deviceId, localNumber] = await Promise.all([
              storage.deviceId(),
              storage.nextLocalNumber(),
            ]);
            const sale = posSaleSchema.parse({
              id: crypto.randomUUID(),
              deviceId,
              localNumber,
              soldAt: new Date().toISOString(),
              lines: cart.map((l) => ({
                variantId: l.item.variantId,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                productName: l.item.productName,
                variantName: l.item.variantName || undefined,
                sku: l.item.sku,
                ...(l.priceChanged ? { priceChanged: true, priceNote: l.priceNote } : {}),
              })),
              payments: payments.map(({ applied: _applied, ...p }) => p),
            });
            // The cart is cleared only when the sale is safe; if this fails the cashier still has it on screen.
            await storage.putSale(storeId, { sale });
            const given = payments.find((p) => p.changeAmount);
            setSaved({
              number: localNumber,
              change: given?.changeAmount
                ? formatMoney(given.changeAmount, String(given.changeCurrency))
                : null,
            });
            setCart([]);
            setCharging(false);
            void queue.saved();
          }}
        />
      )}
    </div>
  );
}

function PosCheckout({
  snapshot,
  total,
  onClose,
  onConfirm,
}: {
  snapshot: PosCatalogSnapshot;
  total: number;
  onClose: () => void;
  onConfirm: (payments: Paid[]) => Promise<void>;
}) {
  const currency = snapshot.currency as CurrencyCode;
  const methods = snapshot.paymentMethods;
  const [payments, setPayments] = useState<Paid[]>([]);
  const remaining = Math.round((total - payments.reduce((sum, p) => sum + p.applied, 0)) * 100) / 100;
  const [paidIn, setPaidIn] = useState<CurrencyCode>(currency);
  const [amount, setAmount] = useState(String(total));
  const [quote, setQuote] = useState("");
  const [changeIn, setChangeIn] = useState<CurrencyCode>(currency);
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const place = usePosPlace();

  const same = paidIn === currency;
  const { unit, per } = rateQuote(paidIn, currency);
  const quoted = parseDecimal(quote);
  const rateToOrder = same ? 1 : quoted > 0 ? quoteToOrderRate(quoted, paidIn, currency) : null;
  const typed = parseDecimal(amount);
  const preview =
    rateToOrder !== null && typed > 0
      ? paymentPreview({ amount: typed, rateToOrder, remaining, sameCurrency: same })
      : null;
  const changeCurrency = preview && preview.changeInPaid > 0 ? changeIn : currency;

  function pickCurrency(code: CurrencyCode) {
    setPaidIn(code);
    setChangeIn(currency);
    const suggestion =
      code === currency || !snapshot.rates ? null : suggestedQuote(code, currency, snapshot.rates.values);
    setQuote(suggestion ? String(suggestion) : "");
    setAmount(
      code === currency
        ? String(remaining)
        : suggestion
          ? String(amountToSettle(remaining, quoteToOrderRate(suggestion, code, currency)))
          : "",
    );
  }

  function currentPayment(): Paid | null {
    if (!preview || rateToOrder === null) return null;
    const change =
      preview.change > 0 ? (changeCurrency === currency ? preview.change : preview.changeInPaid) : 0;
    return {
      amount: typed,
      applied: preview.applied,
      ...(same ? {} : { currency: paidIn, rate: rateToOrder }),
      ...(change > 0 ? { changeAmount: change, changeCurrency } : {}),
      ...(method ? { paymentMethodId: method } : {}),
    };
  }

  async function confirm(paid: Paid) {
    setSaving(true);
    setError(null);
    try {
      await onConfirm([...payments, paid]);
    } catch {
      setError(`No se pudo guardar la venta en este ${place}. Inténtalo de nuevo; no se ha perdido nada.`);
      setSaving(false);
    }
  }

  function submit() {
    const paid = currentPayment();
    if (!paid) {
      setError(rateToOrder === null ? `Escribe cuántos ${per} vale 1 ${unit}.` : "Escribe el monto.");
      return;
    }
    if (preview && preview.missing > 0) {
      setPayments((list) => [...list, paid]);
      // The next payment starts proposing what is missing, in the currency of the sale.
      setAmount(String(preview.missing));
      setPaidIn(currency);
      setChangeIn(currency);
      setQuote("");
      setError(null);
      return;
    }
    void confirm(paid);
  }

  return (
    <Dialog open onClose={onClose} title={`Cobrar ${formatMoney(total, currency)}`}>
      <div className="flex flex-col gap-3" data-testid="pos-checkout">
        {payments.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="pos-payments">
            {payments.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-success" />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      Cobrado: {formatMoney(p.amount, p.currency ?? currency)}
                    </span>
                    {p.currency && (
                      <span className="text-sm text-muted-foreground">
                        Equivale a {formatMoney(p.applied, currency)}
                      </span>
                    )}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPayments((l) => l.filter((_, j) => j !== i));
                    setPaidIn(currency);
                    setQuote("");
                    setAmount(String(Math.round((remaining + p.applied) * 100) / 100));
                  }}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {payments.length > 0 && remaining > 0 && (
          <p className="font-semibold" data-testid="pos-remaining">
            Falta por cobrar: {formatMoney(remaining, currency)}
          </p>
        )}
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-currency">Moneda que entrega</Label>
            <Select
              id="pos-currency"
              value={paidIn}
              onChange={(e) => pickCurrency(e.target.value as CurrencyCode)}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-amount">Cantidad que entrega ({paidIn})</Label>
            <Input
              id="pos-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        {!same && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-rate">
              1 {unit} = ¿cuántos {per}?
            </Label>
            <Input
              id="pos-rate"
              inputMode="decimal"
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
            {snapshot.rates?.source === "eltoque" && (
              <p className="text-xs text-muted-foreground">
                Sugerida: tasa de elTOQUE del {snapshot.rates.date}. Puedes cambiarla.
              </p>
            )}
            {snapshot.rates?.source === "store" && (
              <p className="text-xs text-muted-foreground">
                Sugerida: la tasa de tu tienda. Puedes cambiarla.
              </p>
            )}
          </div>
        )}
        {methods.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-method">Método (opcional)</Label>
            <Select id="pos-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">—</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {preview && (
          <div
            className="flex flex-col gap-2 rounded-md bg-muted p-3 text-sm"
            role="status"
            data-testid="pos-preview"
          >
            {!same && <p>Equivale a {formatMoney(preview.applied, currency)}.</p>}
            {preview.missing > 0 && (
              <p className="font-medium">Faltan {formatMoney(preview.missing, currency)}.</p>
            )}
            {preview.missing === 0 && preview.change === 0 && <p className="font-medium">Salda la venta.</p>}
            {preview.change > 0 && (
              <>
                <p className="font-medium">
                  Vuelto:{" "}
                  {changeCurrency === currency
                    ? formatMoney(preview.change, currency)
                    : formatMoney(preview.changeInPaid, paidIn)}
                </p>
                {!same && (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="pos-change">Moneda del vuelto</Label>
                    <Select
                      id="pos-change"
                      value={changeIn}
                      onChange={(e) => setChangeIn(e.target.value as CurrencyCode)}
                    >
                      <option value={currency}>{currency}</option>
                      <option value={paidIn}>{paidIn}</option>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={saving} data-testid="pos-submit">
            {preview && preview.missing > 0 ? "Añadir pago" : saving ? "Guardando…" : "Confirmar venta"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Volver
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Changing the price of a line (KSH0011): anyone at the counter; «Al costo» and the warning only with the cost. */
function PosPriceDialog({
  line,
  currency,
  cost,
  onClose,
  onApply,
}: {
  line: CartLine;
  currency: CurrencyCode;
  /** In the sale currency; null when this user does not see costs or the product has none. */
  cost: number | null;
  onClose: () => void;
  onApply: (unitPrice: number, note: string) => void;
}) {
  const list = posItemPrice(line.item);
  const [price, setPrice] = useState(String(line.unitPrice));
  const [note, setNote] = useState(line.priceNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const typed = parseDecimal(price);
  const valid = price.trim() !== "" && Number.isFinite(typed) && typed >= 0;
  const below = cost !== null && valid && typed < cost;

  function apply() {
    if (!valid) {
      setError("Escribe el precio de venta.");
      return;
    }
    onApply(Math.round(typed * 100) / 100, note);
  }

  return (
    <Dialog open onClose={onClose} title={itemLabel(line.item)} compact>
      <form
        className="flex flex-col gap-3"
        data-testid="pos-price-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <p className="text-sm text-muted-foreground">
          Precio de la tienda:{" "}
          <span className="font-medium text-foreground">{formatMoney(list, currency)}</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pos-price">Precio de venta</Label>
          <Input
            id="pos-price"
            inputMode="decimal"
            value={price}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setPrice(e.target.value);
              setError(null);
            }}
            data-testid="pos-price-input"
          />
        </div>
        {cost !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrice(String(cost))}
            data-testid="pos-price-cost"
          >
            Al costo ({formatMoney(cost, currency)})
          </Button>
        )}
        {below && (
          <Alert variant="warning" data-testid="pos-price-below-cost">
            Por debajo del costo ({formatMoney(cost, currency)}): esta venta pierde dinero.
          </Alert>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pos-price-note">Motivo (opcional)</Label>
          <Input
            id="pos-price-note"
            value={note}
            maxLength={200}
            placeholder="Cliente fijo, liquidación…"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" data-testid="pos-price-apply">
            Aplicar
          </Button>
          {line.priceChanged && (
            <Button type="button" variant="ghost" onClick={() => onApply(list, "")}>
              Volver al precio de la tienda
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
