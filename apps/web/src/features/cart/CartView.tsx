"use client";

import { formatMoney } from "@kshop/core";
import { ApiError, type Cart, type CartLine } from "@kshop/data";
import { Alert, Button, Input } from "@kshop/ui";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "./CartProvider";

export function CartView() {
  const { cart, setQuantity, pending } = useCart();

  if (!cart) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;
  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg">Tu carrito está vacío.</p>
        <Link
          href="/products"
          className="inline-flex h-11 items-center rounded-[var(--sf-radius)] bg-primary px-6 font-semibold text-primary-foreground"
        >
          Ver productos
        </Link>
      </div>
    );
  }

  const money = (v: number) => formatMoney(v, cart.currency);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <ul className="flex flex-col divide-y border-y">
        {cart.lines.map((line) => (
          <CartLineRow key={line.variantId} line={line} money={money} disabled={pending} onChange={setQuantity} />
        ))}
      </ul>
      <aside className="flex h-fit flex-col gap-4 rounded-[var(--sf-radius)] border p-4">
        <CartTotals cart={cart} money={money} />
        {cart.vouchersEnabled && <VoucherForm />}
        <p className="text-sm text-muted-foreground">La entrega se calcula en el siguiente paso.</p>
        {cart.hasIssues && (
          <Alert variant="destructive">Ajusta los productos marcados antes de continuar.</Alert>
        )}
        <Link
          href="/checkout"
          aria-disabled={cart.hasIssues}
          className="inline-flex h-12 items-center justify-center rounded-[var(--sf-radius)] bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          Continuar con el pedido
        </Link>
        <Link href="/products" className="text-center text-sm underline">
          Seguir comprando
        </Link>
      </aside>
    </div>
  );
}

function CartLineRow({
  line,
  money,
  disabled,
  onChange,
}: {
  line: CartLine;
  money: (v: number) => string;
  disabled: boolean;
  onChange: (variantId: string, quantity: number) => Promise<void>;
}) {
  return (
    <li className="flex gap-3 py-4">
      <Link href={`/product/${line.productSlug}`} className="h-24 w-20 shrink-0 overflow-hidden rounded-[var(--sf-radius)] bg-surface">
        {line.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- D12: our own WebP sizes, no image optimizer
          <img src={line.imageUrl} alt="" width={80} height={96} className="h-full w-full object-cover" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/product/${line.productSlug}`} className="font-medium leading-tight">
          {line.productName}
        </Link>
        {line.variantName && <p className="text-sm text-muted-foreground">{line.variantName}</p>}
        <p className="text-sm">
          {money(line.unitPrice)}
          {beforePrice(line) !== null && <s className="ml-2 text-muted-foreground">{money(beforePrice(line)!)}</s>}
        </p>
        {line.promotionName && <p className="text-xs text-primary">{line.promotionName}</p>}
        {line.issue === "unavailable" && <p className="text-sm text-destructive">Ya no está disponible.</p>}
        {line.issue === "insufficient" && (
          <p className="text-sm text-destructive">
            Solo quedan {line.available}.{" "}
            <button type="button" className="underline" onClick={() => onChange(line.variantId, line.available)}>
              Ajustar
            </button>
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex h-9 items-center rounded-[var(--sf-radius)] border">
            <button
              type="button"
              className="h-full w-9 disabled:opacity-40"
              disabled={disabled || line.quantity <= 1}
              onClick={() => onChange(line.variantId, line.quantity - 1)}
              aria-label={`Quitar uno de ${line.productName}`}
            >
              −
            </button>
            <span className="w-8 text-center text-sm">{line.quantity}</span>
            <button
              type="button"
              className="h-full w-9 disabled:opacity-40"
              disabled={disabled || line.quantity >= line.available}
              onClick={() => onChange(line.variantId, line.quantity + 1)}
              aria-label={`Añadir uno de ${line.productName}`}
            >
              +
            </button>
          </div>
          <span className="font-medium">{money(line.lineTotal)}</span>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            disabled={disabled}
            onClick={() => onChange(line.variantId, 0)}
          >
            Quitar
          </button>
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

/** Subtotal with the promotion saving, the voucher and the total before shipping. */
export function CartTotals({ cart, money }: { cart: Cart; money: (v: number) => string }) {
  const voucher = cart.voucher && !cart.voucher.error ? cart.voucher : null;
  return (
    <dl className="flex flex-col gap-1 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{money(cart.subtotal)}</dd>
      </div>
      {cart.promotionSavings > 0 && (
        <p className="text-xs text-primary">Ahorras {money(cart.promotionSavings)} con las ofertas.</p>
      )}
      {voucher && (
        <div className="flex justify-between text-primary">
          <dt>Cupón {voucher.code}</dt>
          <dd>{voucher.amount === null ? "Se aplica al envío" : `−${money(voucher.amount)}`}</dd>
        </div>
      )}
      <div className="mt-1 flex justify-between text-lg font-semibold">
        <dt>Total</dt>
        <dd>{money(Math.max(0, cart.subtotal - cart.discountTotal))}</dd>
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
          className="uppercase"
        />
        <Button type="button" variant="outline" disabled={pending || code.trim().length < 3} onClick={apply}>
          Aplicar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
