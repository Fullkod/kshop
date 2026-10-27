"use client";

import { formatMoney } from "@kshop/core";
import { ApiError, type Cart, type CartLine } from "@kshop/data";
import { Alert, Button, buttonVariants, Input, Minus, Plus, ShoppingBag, X } from "@kshop/ui";
import { useState } from "react";
import { Link } from "../navigation";
import { useStore } from "../store-context";
import { useCart } from "./CartProvider";

// The cart's blocks, shared by the /cart page and the CartDrawer: lines (ProductCard «row» with a stepper), free
// shipping progress, voucher, totals and the call to finish the order.

export type FreeShipping = { from: number; method: string } | null;

export function CartView({ freeShipping = null }: { freeShipping?: FreeShipping }) {
  const { cart } = useCart();

  if (!cart) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;
  if (cart.lines.length === 0) return <EmptyCart />;
  return (
    <div className="grid gap-8 @min-[1000px]:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <FreeShippingBar cart={cart} freeShipping={freeShipping} />
        <CartLines cart={cart} />
      </div>
      <aside className="flex h-fit flex-col gap-4 rounded-sf border border-border p-5">
        {cart.vouchersEnabled && <VoucherForm />}
        <CartSummary cart={cart} />
        <Link href="/products" className="text-center text-sm text-muted-foreground underline">
          Seguir comprando
        </Link>
      </aside>
    </div>
  );
}

export function EmptyCart({ onBrowse }: { onBrowse?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-primary">
        <ShoppingBag size={24} aria-hidden />
      </span>
      <p className="text-lg">Tu carrito está vacío.</p>
      <Link href="/products" onClick={onBrowse} className={buttonVariants()}>
        Ver productos
      </Link>
    </div>
  );
}

/** «¡Te faltan X para el envío gratis!» with a progress bar; only when a method has a threshold (base currency). */
export function FreeShippingBar({ cart, freeShipping }: { cart: Cart; freeShipping: FreeShipping }) {
  const store = useStore();
  // The threshold is in the base currency: shown only while the cart is priced in it.
  if (!freeShipping || cart.currency !== store.baseCurrency) return null;
  const total = Math.max(0, cart.subtotal - cart.discountTotal);
  const missing = Math.max(0, freeShipping.from - total);
  const progress = Math.min(100, (total / freeShipping.from) * 100);
  return (
    <div className="flex flex-col gap-2 rounded-sf bg-accent-soft p-3.5 text-sm" data-testid="free-shipping">
      <p>
        {missing > 0 ? (
          <>
            ¡Te faltan <strong>{formatMoney(missing, cart.currency)}</strong> para el envío gratis!
          </>
        ) : (
          <strong>¡Tienes envío gratis con {freeShipping.method}!</strong>
        )}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,var(--bg))]"
        role="progressbar"
        aria-label="Progreso hasta el envío gratis"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function CartLines({ cart, onNavigate }: { cart: Cart; onNavigate?: () => void }) {
  const { setQuantity, pending } = useCart();
  const money = (v: number) => formatMoney(v, cart.currency);
  return (
    <ul className="flex flex-col divide-y divide-border">
      {cart.lines.map((line) => (
        <CartLineRow
          key={line.variantId}
          line={line}
          money={money}
          disabled={pending}
          onChange={setQuantity}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function CartLineRow({
  line,
  money,
  disabled,
  onChange,
  onNavigate,
}: {
  line: CartLine;
  money: (v: number) => string;
  disabled: boolean;
  onChange: (variantId: string, quantity: number) => Promise<void>;
  onNavigate?: () => void;
}) {
  const before = beforePrice(line);
  return (
    <li className="flex gap-3 py-4">
      <Link
        href={`/product/${line.productSlug}`}
        onClick={onNavigate}
        className="sf-placeholder relative aspect-[4/5] w-[76px] shrink-0 self-start overflow-hidden rounded-sf-sm"
      >
        {line.imageUrl && (
          // D12: our own WebP sizes, no image optimizer
          <img src={line.imageUrl} alt="" width={76} height={95} className="h-full w-full object-cover" />
        )}
        {before !== null && (
          <span className="absolute top-1 left-1 rounded-sf-sm bg-sale px-1 py-0.5 text-[10px] font-bold text-sale-foreground">
            -{Math.floor(((before - line.unitPrice) / before) * 100)}%
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/product/${line.productSlug}`}
            onClick={onNavigate}
            className="truncate leading-tight font-medium"
          >
            {line.productName}
          </Link>
          <button
            type="button"
            className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
            disabled={disabled}
            onClick={() => onChange(line.variantId, 0)}
            aria-label={`Quitar ${line.productName}`}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        {line.variantName && <p className="text-[13px] text-muted-foreground">{line.variantName}</p>}
        {line.promotionName && <p className="text-xs text-sale">{line.promotionName}</p>}
        {line.issue === "unavailable" && <p className="text-sm text-destructive">Ya no está disponible.</p>}
        {line.issue === "insufficient" && (
          <p className="text-sm text-destructive">
            Solo quedan {line.available}.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => onChange(line.variantId, line.available)}
            >
              Ajustar
            </button>
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex h-11 items-center rounded-sf-btn border border-border">
            <button
              type="button"
              className="flex h-full w-10 items-center justify-center disabled:opacity-40"
              disabled={disabled || line.quantity <= 1}
              onClick={() => onChange(line.variantId, line.quantity - 1)}
              aria-label={`Quitar uno de ${line.productName}`}
            >
              <Minus size={16} aria-hidden />
            </button>
            <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
            <button
              type="button"
              className="flex h-full w-10 items-center justify-center disabled:opacity-40"
              disabled={disabled || line.quantity >= line.available}
              onClick={() => onChange(line.variantId, line.quantity + 1)}
              aria-label={`Añadir uno de ${line.productName}`}
            >
              <Plus size={16} aria-hidden />
            </button>
          </div>
          <span className="flex flex-col items-end leading-tight">
            <span className="sf-heading text-[15px] font-bold">{money(line.lineTotal)}</span>
            {before !== null && (
              <s className="text-xs text-muted-foreground">{money(before * line.quantity)}</s>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

/** Struck "before" price of a line: its compare-at price, or its list price when a promotion lowers it. */
function beforePrice(line: CartLine): number | null {
  const before = Math.max(line.compareAtPrice ?? 0, line.listPrice);
  return before > line.unitPrice ? before : null;
}

/** Totals and «Finalizar pedido por WhatsApp» (the checkout sends the order by WhatsApp). */
export function CartSummary({ cart, onCheckout }: { cart: Cart; onCheckout?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <CartTotals cart={cart} money={(v) => formatMoney(v, cart.currency)} />
      <p className="text-[12.5px] text-muted-foreground">La entrega se calcula en el siguiente paso.</p>
      {cart.hasIssues && (
        <Alert variant="destructive">Ajusta los productos marcados antes de continuar.</Alert>
      )}
      <Link
        href="/checkout"
        onClick={onCheckout}
        aria-disabled={cart.hasIssues}
        className={buttonVariants({ variant: "whatsapp", className: "h-[54px] w-full text-base font-bold" })}
      >
        Finalizar pedido por WhatsApp
      </Link>
    </div>
  );
}

/** Subtotal with the promotion saving, the voucher and the total before shipping. */
export function CartTotals({ cart, money }: { cart: Cart; money: (v: number) => string }) {
  const voucher = cart.voucher && !cart.voucher.error ? cart.voucher : null;
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{money(cart.subtotal + cart.promotionSavings)}</dd>
      </div>
      {cart.promotionSavings > 0 && (
        <div className="flex justify-between text-sale">
          <dt>Descuentos</dt>
          <dd>−{money(cart.promotionSavings)}</dd>
        </div>
      )}
      {voucher && (
        <div className="flex justify-between text-sale">
          <dt>Cupón {voucher.code}</dt>
          <dd>{voucher.amount === null ? "Se aplica al envío" : `−${money(voucher.amount)}`}</dd>
        </div>
      )}
      <div className="mt-1 flex items-baseline justify-between">
        <dt className="font-semibold">Total</dt>
        <dd className="sf-heading text-2xl font-extrabold">
          {money(Math.max(0, cart.subtotal - cart.discountTotal))}
        </dd>
      </div>
    </dl>
  );
}

/** Voucher code of the cart: applied by the server, which says why when it does not apply. */
export function VoucherForm() {
  const { cart, setVoucher, pending } = useCart();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!cart) return null;

  // Not a <form>: it also lives inside the checkout form.
  async function apply() {
    setError(null);
    try {
      await setVoucher(code.trim() || null);
      setCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo aplicar el cupón.");
    }
  }

  if (cart.voucher) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span>
            Cupón <strong>{cart.voucher.code}</strong>
          </span>
          <button type="button" className="underline" disabled={pending} onClick={() => setVoucher(null)}>
            Quitar
          </button>
        </div>
        {cart.voucher.error && <p className="text-destructive">{cart.voucher.error}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (code.trim().length >= 3) void apply();
          }}
          placeholder="Código de cupón"
          aria-label="Código de cupón"
          autoCapitalize="characters"
          className="border-dashed uppercase"
        />
        <Button
          type="button"
          disabled={pending || code.trim().length < 3}
          onClick={apply}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          Aplicar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
