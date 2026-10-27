"use client";

import { Link } from "../navigation";
import { useMemo, useState } from "react";
import { useCart } from "../cart/CartProvider";
import type { StorefrontProduct } from "@kshop/data";
import { Price } from "./Currency";
import { imageSrcSet } from "./ProductCard";

type Variant = StorefrontProduct["variants"][number];

/** Gallery + variant picker + price + «Añadir al carrito» (phase 3, D17: replaces «Pedir por WhatsApp»). */
export function ProductView({ product }: { product: StorefrontProduct }) {
  const axes = useMemo(() => variantAxes(product.variants), [product.variants]);
  const initial = product.variants.find((v) => v.available) ?? product.variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.options ?? []).map((o) => [o.attributeId, o.valueId])),
  );
  const variant = product.variants.find((v) => v.options.every((o) => selected[o.attributeId] === o.valueId));

  // Images of the chosen variant first.
  const media = useMemo(() => {
    const first = new Set(variant?.mediaIds ?? []);
    return [...product.media].sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)));
  }, [product.media, variant]);
  const [imageIndex, setImageIndex] = useState(0);
  const image = media[Math.min(imageIndex, media.length - 1)];

  const pick = (attributeId: string, valueId: string) => {
    setSelected((s) => ({ ...s, [attributeId]: valueId }));
    setImageIndex(0);
  };
  // A value is available if some available variant has it together with the other selected values.
  const valueAvailable = (attributeId: string, valueId: string) =>
    product.variants.some(
      (v) =>
        v.available &&
        v.options.some((o) => o.attributeId === attributeId && o.valueId === valueId) &&
        v.options.every((o) => o.attributeId === attributeId || selected[o.attributeId] === o.valueId),
    );

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-3">
        <div className="aspect-[4/5] overflow-hidden rounded-sf bg-surface">
          {image ? (
            // D12: our own WebP sizes, no image optimizer
            <img
              src={image.url}
              srcSet={imageSrcSet(image.url)}
              sizes="(min-width: 768px) 50vw, 100vw"
              alt={image.alt ?? product.name}
              width={1200}
              height={1500}
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">Sin imagen</div>
          )}
        </div>
        {media.length > 1 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Imágenes del producto">
            {media.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-current={i === imageIndex}
                  className={`block h-20 w-16 overflow-hidden rounded-sf-sm border-2 ${i === imageIndex ? "border-primary" : "border-transparent"}`}
                >
                  {/* thumbnail */}
                  <img
                    src={m.thumbUrl ?? m.url}
                    alt=""
                    width={64}
                    height={80}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {product.brand && (
            <a
              href={`/brand/${product.brand.slug}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {product.brand.name}
            </a>
          )}
          <h1 className="text-3xl font-semibold">{product.name}</h1>
          <p className="flex items-baseline gap-3 text-2xl">
            <Price
              amount={variant?.price ?? product.minPrice}
              overrides={variant?.overrides}
              className="font-semibold"
            />
            {variant?.compareAtPrice != null && variant.compareAtPrice > variant.price && (
              <Price
                amount={variant.compareAtPrice}
                overrides={variant.compareAtOverrides}
                className="text-base text-muted-foreground line-through"
              />
            )}
            {variant?.badge && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground">
                {variant.badge}
              </span>
            )}
          </p>
          {variant?.promotionName && <p className="text-sm text-primary">{variant.promotionName}</p>}
        </div>

        {axes.map((axis) => (
          <fieldset key={axis.attributeId} className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              {axis.name}:{" "}
              <span className="text-muted-foreground">
                {axis.values.find((v) => v.valueId === selected[axis.attributeId])?.value ??
                  "elige una opción"}
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {axis.values.map((v) => {
                const on = selected[axis.attributeId] === v.valueId;
                const available = valueAvailable(axis.attributeId, v.valueId);
                return (
                  <button
                    key={v.valueId}
                    type="button"
                    onClick={() => pick(axis.attributeId, v.valueId)}
                    aria-pressed={on}
                    className={`flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-sf-btn border px-3 text-sm ${on ? "border-primary ring-2 ring-primary" : "hover:bg-surface"} ${available ? "" : "text-muted-foreground line-through"}`}
                  >
                    {v.swatch && (
                      <span
                        className="h-4 w-4 rounded-full border"
                        style={{ background: v.swatch }}
                        aria-hidden
                      />
                    )}
                    {v.value}
                    {!available && <span className="sr-only">(agotado)</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="text-sm" aria-live="polite">
          {!variant ? (
            <span className="text-muted-foreground">Esta combinación no existe.</span>
          ) : variant.available ? (
            <span className="text-success">Disponible</span>
          ) : (
            <span className="text-destructive">Agotado</span>
          )}
        </p>

        {variant?.available ? (
          <AddToCart key={variant.id} variantId={variant.id} />
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-12 items-center justify-center rounded-sf-btn bg-surface px-6 font-semibold text-muted-foreground"
          >
            Agotado
          </button>
        )}
      </div>
    </div>
  );
}

function AddToCart({ variantId }: { variantId: string }) {
  const { add, pending } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  async function onAdd() {
    setStatus("idle");
    try {
      await add(variantId, quantity);
      setStatus("added");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex h-12 items-center rounded-sf-btn border">
          <button
            type="button"
            className="h-full w-11 text-lg disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Quitar uno"
          >
            −
          </button>
          <span
            className="w-8 text-center font-medium"
            aria-live="polite"
            aria-label={`Cantidad: ${quantity}`}
          >
            {quantity}
          </span>
          <button
            type="button"
            className="h-full w-11 text-lg"
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            aria-label="Añadir uno"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={pending}
          className="inline-flex h-12 flex-1 items-center justify-center rounded-sf-btn bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Añadiendo…" : "Añadir al carrito"}
        </button>
      </div>
      <p className="min-h-5 text-sm" role="status">
        {status === "added" && (
          <>
            <span className="text-success">Añadido al carrito.</span>{" "}
            <Link href="/cart" className="font-medium underline">
              Ver carrito
            </Link>
          </>
        )}
        {status === "error" && (
          <span className="text-destructive">No se pudo añadir. Inténtalo de nuevo.</span>
        )}
      </p>
    </div>
  );
}

type Axis = {
  attributeId: string;
  name: string;
  values: { valueId: string; value: string; swatch: string | null; sort: number }[];
};

function variantAxes(variants: Variant[]): Axis[] {
  const axes = new Map<string, Axis & { sort: number }>();
  for (const v of variants) {
    for (const o of v.options) {
      const axis = axes.get(o.attributeId) ?? {
        attributeId: o.attributeId,
        name: o.attribute,
        values: [],
        sort: o.attributeSort,
      };
      if (!axis.values.some((x) => x.valueId === o.valueId)) {
        axis.values.push({ valueId: o.valueId, value: o.value, swatch: o.swatch, sort: o.valueSort });
      }
      axes.set(o.attributeId, axis);
    }
  }
  return [...axes.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((a) => ({ ...a, values: a.values.sort((x, y) => x.sort - y.sort) }));
}
