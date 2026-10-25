"use client";

import { formatMoney } from "@kshop/core";
import type { CartLine } from "@kshop/data";
import { Alert } from "@kshop/ui";
import Link from "next/link";
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
        <div className="flex justify-between text-lg font-semibold">
          <span>Subtotal</span>
          <span>{money(cart.subtotal)}</span>
        </div>
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
          {line.compareAtPrice && line.compareAtPrice > line.unitPrice && (
            <s className="ml-2 text-muted-foreground">{money(line.compareAtPrice)}</s>
          )}
        </p>
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
