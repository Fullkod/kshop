"use client";

import { useMemo, useState } from "react";
import type { StorefrontProduct } from "@/server/storefront/catalog";
import { Price, useFormatPrice } from "./Currency";
import { imageSrcSet } from "./ProductCard";
import { whatsappUrl } from "./whatsapp";

type Variant = StorefrontProduct["variants"][number];

/** Gallery + variant picker + price + «Pedir por WhatsApp» (D13; «Añadir al carrito» arrives in Phase 3). */
export function ProductView({
  product,
  whatsappPhone,
}: {
  product: StorefrontProduct;
  whatsappPhone: string | null;
}) {
  const axes = useMemo(() => variantAxes(product.variants), [product.variants]);
  const initial = product.variants.find((v) => v.available) ?? product.variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.options ?? []).map((o) => [o.attributeId, o.valueId])),
  );
  const variant = product.variants.find((v) => v.options.every((o) => selected[o.attributeId] === o.valueId));
  const formatPrice = useFormatPrice();

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

  const message = (url: string) =>
    [
      `Hola, quiero pedir: ${product.name}${variant?.name ? ` (${variant.name})` : ""}`,
      variant && `Precio: ${formatPrice(variant.price, variant.overrides)}`,
      variant && `SKU: ${variant.sku}`,
      url,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col gap-3">
        <div className="aspect-[4/5] overflow-hidden rounded-[var(--sf-radius)] bg-surface">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- D12: our own WebP sizes, no image optimizer
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
                  className={`block h-20 w-16 overflow-hidden rounded-[var(--sf-radius)] border-2 ${i === imageIndex ? "border-primary" : "border-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
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
                className="text-base text-muted-foreground line-through"
              />
            )}
          </p>
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
                    className={`flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-[var(--sf-radius)] border px-3 text-sm ${on ? "border-primary ring-2 ring-primary" : "hover:bg-surface"} ${available ? "" : "text-muted-foreground line-through"}`}
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

        {whatsappPhone && variant?.available ? (
          <a
            href={whatsappUrl(whatsappPhone, message(""))}
            onClick={(e) => {
              // The full page URL is only known in the browser.
              e.currentTarget.href = whatsappUrl(whatsappPhone, message(window.location.href));
            }}
            target="_blank"
            rel="noopener"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--sf-radius)] bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" />
            </svg>
            Pedir por WhatsApp
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex h-12 items-center justify-center rounded-[var(--sf-radius)] bg-surface px-6 font-semibold text-muted-foreground"
          >
            {variant?.available ? "Pedidos no disponibles" : "Agotado"}
          </button>
        )}
      </div>
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
