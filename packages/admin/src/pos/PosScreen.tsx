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
import { Alert, Badge, Button, Card, Dialog, Input, Label, Select, Minus, Plus, Search } from "@kshop/ui";
import { useMemo, useRef, useState } from "react";
import { PosStatus, usePosCatalog, usePosStorage } from "./PosStatus";
import type { PosCatalogSnapshot } from "./storage";

type CartLine = { item: PosCatalogItem; quantity: number; unitPrice: number };
type Paid = NonNullable<PosSaleInput["payments"]>[number] & { applied: number };

const itemLabel = (item: PosCatalogItem) =>
  item.variantName ? `${item.productName} · ${item.variantName}` : item.productName;

/** Selling at the counter, with or without a connection: search, add, charge. The sale is saved on the phone first. */
export function PosScreen({ storeId, online }: { storeId: string; online: boolean }) {
  const storage = usePosStorage();
  const catalog = usePosCatalog(storeId, online);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [charging, setCharging] = useState(false);
  const [saved, setSaved] = useState<{ number: string; change: string | null } | null>(null);
  const [salesVersion, setSalesVersion] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const items = catalog.snapshot?.items;
  const index = useMemo(() => posSearchIndex(items ?? []), [items]);
  const results = useMemo(() => searchPosCatalog(index, query), [index, query]);
  const currency = (catalog.snapshot?.currency ?? "CUP") as CurrencyCode;
  const total = posCartTotal(cart);

  function add(item: PosCatalogItem) {
    setSaved(null);
    setCart((lines) => {
      const found = lines.find((l) => l.item.variantId === item.variantId);
      if (found) {
        return lines.map((l) => (l === found ? { ...l, quantity: Math.min(l.quantity + 1, 999) } : l));
      }
      return [...lines, { item, quantity: 1, unitPrice: posItemPrice(item) }];
    });
    setQuery("");
    searchRef.current?.focus();
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
    if (exact ?? only) add((exact ?? only) as PosCatalogItem);
  }

  return (
    <div className="flex flex-col gap-4 pb-28" data-testid="pos-screen">
      <PosStatus catalog={catalog} storeId={storeId} online={online} salesVersion={salesVersion} />

      {saved && (
        <Alert data-testid="pos-saved">
          Venta {saved.number} guardada en el teléfono.{saved.change ? ` Vuelto: ${saved.change}.` : ""}
        </Alert>
      )}

      {catalog.snapshot && (
        <div className="relative">
          <Search
            size={18}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={searchRef}
            className="pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
      )}

      {query.trim() !== "" && (
        <ul className="flex flex-col gap-1" data-testid="pos-results">
          {results.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin resultados.</li>}
          {results.map((item) => (
            <li key={item.variantId}>
              <button
                type="button"
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
      )}

      {cart.length > 0 && (
        <Card className="flex flex-col gap-3" data-testid="pos-cart">
          {cart.map((line) => (
            <div key={line.item.variantId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{itemLabel(line.item)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(line.unitPrice, currency)}
                  {line.item.trackInventory && line.quantity > line.item.stock && (
                    <Badge variant="muted" className="ml-2">
                      Stock {line.item.stock}
                    </Badge>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Quitar uno de ${itemLabel(line.item)}`}
                  onClick={() => setQuantity(line.item.variantId, line.quantity - 1)}
                >
                  <Minus size={16} aria-hidden />
                </Button>
                <span className="w-7 text-center font-semibold" data-testid="pos-quantity">
                  {line.quantity}
                </span>
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
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(var(--app-tabs-height,4rem)+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
          <span className="text-lg font-semibold" data-testid="pos-total">
            {formatMoney(total, currency)}
          </span>
          <Button onClick={() => setCharging(true)} data-testid="pos-charge">
            Cobrar
          </Button>
        </div>
      )}

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
            setSalesVersion((v) => v + 1);
            searchRef.current?.focus();
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
      setError("No se pudo guardar la venta en el teléfono. Inténtalo de nuevo; no se ha perdido nada.");
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
          <ul className="flex flex-col gap-1 text-sm" data-testid="pos-payments">
            {payments.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {formatMoney(p.amount, p.currency ?? currency)}
                  {p.currency && ` · aplica ${formatMoney(p.applied, currency)}`}
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
        <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="pos-amount">Monto ({paidIn})</Label>
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
            {!same && <p>Aplica {formatMoney(preview.applied, currency)}.</p>}
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
