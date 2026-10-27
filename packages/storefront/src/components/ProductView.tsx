"use client";

import { formatMoney } from "@kshop/core";
import type { DeliveryMethod, ProductCardData, StorefrontProduct, StorefrontShell } from "@kshop/data";
import {
  ArrowLeft,
  Badge,
  Banknote,
  buttonVariants,
  cn,
  Heart,
  House,
  type LucideIcon,
  MessageCircle,
  Minus,
  Plus,
  Share2,
  ShoppingBag,
  Trophy,
  Truck,
  Wallet,
} from "@kshop/ui";
import { useMemo, useState, type ReactNode } from "react";
import { useFavorites } from "../account/Favorites";
import { useCartUi } from "../cart/CartDrawer";
import { useCart } from "../cart/CartProvider";
import { Link } from "../navigation";
import { useStore } from "../store-context";
import { Price, PriceEquivalents, useFormatPrice } from "./Currency";
import { imageSrcSet } from "./images";
import { Breadcrumbs, type Crumb } from "./Listing";
import { ProductCard } from "./ProductCard";
import { useVariantSelection, VariantPicker } from "./VariantPicker";
import { whatsappUrl } from "./whatsapp";

type Variant = StorefrontProduct["variants"][number];
type Delivery = Pick<StorefrontShell, "delivery" | "freeShipping">;
type AddStatus = "idle" | "added" | "error";

/**
 * Product page (redesign R4): breadcrumbs (and «back» on phones), gallery (thumbnails in a column on the web, in a row
 * under the photo on phones), price box with the other currencies, variants, stock, «Añadir al carrito» + «Pedir por
 * WhatsApp», benefits and an accordion from the store's real delivery and payment data, and a sticky buy bar on phones.
 */
export function ProductView({
  product,
  crumbs,
  delivery,
}: {
  product: StorefrontProduct;
  crumbs: Crumb[];
  delivery: Delivery;
}) {
  const selection = useVariantSelection(product.variants);
  const { variant } = selection;
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<AddStatus>("idle");

  // Images of the chosen variant first.
  const media = useMemo(() => {
    const first = new Set(variant?.mediaIds ?? []);
    return [...product.media].sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)));
  }, [product.media, variant]);
  const [imageIndex, setImageIndex] = useState(0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <BackButton />
        <Breadcrumbs crumbs={crumbs} />
      </div>
      <div className="flex flex-wrap gap-[clamp(20px,4.4cqw,56px)]">
        <Gallery
          product={product}
          media={media}
          index={Math.min(imageIndex, Math.max(0, media.length - 1))}
          onIndex={setImageIndex}
          variant={variant}
        />
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <div className="flex flex-col gap-2">
            {product.brand && (
              <Link
                href={`/brand/${product.brand.slug}`}
                className="self-start text-xs font-medium tracking-[.08em] text-muted-foreground uppercase hover:text-foreground"
              >
                {product.brand.name}
              </Link>
            )}
            <h1 className="sf-heading text-[clamp(28px,3cqw,40px)] leading-[1.08] font-extrabold">
              {product.name}
            </h1>
          </div>

          <PriceBox product={product} variant={variant} />
          <VariantPicker selection={selection} onPick={() => setImageIndex(0)} />
          <StockLine variant={variant} />

          <div className="hidden flex-col gap-3 @min-[720px]:flex">
            <div className="flex gap-3">
              <QuantityStepper value={quantity} onChange={setQuantity} />
              <AddButton
                product={product}
                variant={variant}
                quantity={quantity}
                onStatus={setStatus}
                className="h-[54px] flex-1 text-base shadow-sf"
              />
            </div>
            <WhatsappOrder product={product} variant={variant} quantity={quantity} />
          </div>
          <AddedStatus status={status} />

          <Benefits delivery={delivery} />
          <Accordion product={product} delivery={delivery} />
        </div>
      </div>
      <BuyBar product={product} variant={variant} onStatus={setStatus} />
    </div>
  );
}

/** «Back» on phones (history when there is one, the home otherwise). */
function BackButton() {
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign("/"))}
      aria-label="Volver"
      className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface @min-[720px]:hidden"
    >
      <ArrowLeft size={20} aria-hidden />
    </button>
  );
}

function Gallery({
  product,
  media,
  index,
  onIndex,
  variant,
}: {
  product: StorefrontProduct;
  media: StorefrontProduct["media"];
  index: number;
  onIndex: (i: number) => void;
  variant: Variant | undefined;
}) {
  const image = media[index];
  const discount = variant?.compareAtPrice ? percentOff(variant.compareAtPrice, variant.price) : null;
  return (
    <div className="flex min-w-0 flex-[1.1_1_380px] flex-col-reverse gap-3 @min-[720px]:flex-row">
      {media.length > 1 && (
        <ul
          className="sf-scroller flex shrink-0 gap-2 overflow-x-auto p-0.5 @min-[720px]:flex-col @min-[720px]:overflow-visible"
          aria-label="Imágenes del producto"
        >
          {media.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onIndex(i)}
                aria-label={`Ver imagen ${i + 1}`}
                aria-current={i === index}
                className={`block h-[84px] w-[68px] overflow-hidden rounded-sf-sm ${i === index ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              >
                <img
                  src={m.thumbUrl ?? m.url}
                  alt=""
                  width={68}
                  height={84}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="sf-placeholder relative aspect-[4/5] min-w-0 flex-1 overflow-hidden rounded-sf-lg">
        {image && (
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
        )}
        {discount && (
          <Badge variant="sale" shape="tag" className="absolute top-3 left-3">
            -{discount}%
          </Badge>
        )}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <FavoriteButton product={product} />
          <ShareButton product={product} />
        </div>
        {media.length > 1 && (
          <span className="absolute right-3 bottom-3 rounded-full bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-2.5 py-1 font-mono text-[11px]">
            {index + 1} / {media.length}
          </span>
        )}
      </div>
    </div>
  );
}

const photoButton =
  "flex size-11 items-center justify-center rounded-full bg-background shadow-sf outline-none focus-visible:shadow-[0_0_0_4px_var(--ring)]";

function FavoriteButton({ product }: { product: StorefrontProduct }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(product.id);
  return (
    <button
      type="button"
      onClick={() => void toggle(product.id)}
      aria-pressed={on}
      aria-label={on ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`${photoButton} ${on ? "text-sale" : "text-foreground hover:text-sale"}`}
    >
      <Heart size={20} fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** System share sheet when there is one (phones), otherwise copies the link. */
function ShareButton({ product }: { product: StorefrontProduct }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Enlace copiado" : "Compartir"}
      title={copied ? "Enlace copiado" : "Compartir"}
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          await navigator.share({ title: product.name, url }).catch(() => {});
          return;
        }
        await navigator.clipboard?.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`${photoButton} text-foreground`}
    >
      <Share2 size={19} aria-hidden />
    </button>
  );
}

const percentOff = (before: number, price: number) =>
  before > price ? Math.floor(((before - price) / before) * 100) : null;

function PriceBox({ product, variant }: { product: StorefrontProduct; variant: Variant | undefined }) {
  const amount = variant?.price ?? product.minPrice;
  const discount = variant?.compareAtPrice ? percentOff(variant.compareAtPrice, variant.price) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-sf bg-surface p-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Price
          amount={amount}
          overrides={variant?.overrides}
          className="sf-heading text-[30px] leading-none font-extrabold"
        />
        {variant?.compareAtPrice != null && discount && (
          <Price
            amount={variant.compareAtPrice}
            overrides={variant.compareAtOverrides}
            className="text-[15px] text-muted-foreground line-through"
          />
        )}
        {discount && (
          <Badge variant="sale" shape="tag">
            -{discount}%
          </Badge>
        )}
      </p>
      {variant?.promotionName && <p className="text-sm font-medium text-sale">{variant.promotionName}</p>}
      <PriceEquivalents
        amount={amount}
        overrides={variant?.overrides}
        className="text-[13px] text-muted-foreground"
      />
    </div>
  );
}

function StockLine({ variant }: { variant: Variant | undefined }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
      {!variant ? (
        <span className="text-muted-foreground">Esta combinación no existe.</span>
      ) : variant.available ? (
        <>
          <span aria-hidden className="size-2 rounded-full bg-success" />
          <span className="text-success">
            Disponible
            {variant.stock != null && variant.stock <= 5 && ` · quedan ${variant.stock}`}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="size-2 rounded-full bg-destructive" />
          <span className="text-destructive">Agotado</span>
        </>
      )}
    </p>
  );
}

function QuantityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex h-[54px] shrink-0 items-center rounded-sf-btn border border-border">
      <button
        type="button"
        className="flex h-full w-[46px] items-center justify-center disabled:opacity-40"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="Quitar uno"
      >
        <Minus size={16} aria-hidden />
      </button>
      <span className="w-7 text-center font-semibold" aria-live="polite" aria-label={`Cantidad: ${value}`}>
        {value}
      </span>
      <button
        type="button"
        className="flex h-full w-[46px] items-center justify-center"
        onClick={() => onChange(Math.min(99, value + 1))}
        aria-label="Añadir uno"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

/** «Añadido al carrito.» under the buttons (the drawer or the toast open as well). */
function AddedStatus({ status }: { status: AddStatus }) {
  return (
    <p className="-mt-2 min-h-5 text-sm" role="status">
      {status === "added" && (
        <>
          <span className="text-success">Añadido al carrito.</span>{" "}
          <Link href="/cart" className="font-medium underline">
            Ver carrito
          </Link>
        </>
      )}
      {status === "error" && <span className="text-destructive">No se pudo añadir. Inténtalo de nuevo.</span>}
    </p>
  );
}

function AddButton({
  product,
  variant,
  quantity,
  onStatus,
  className,
  children,
  label,
}: {
  product: StorefrontProduct;
  variant: Variant | undefined;
  quantity: number;
  onStatus: (s: AddStatus) => void;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  const { add, pending } = useCart();
  const { added } = useCartUi();
  const available = !!variant?.available;
  return (
    <button
      type="button"
      disabled={!available || pending}
      onClick={async () => {
        if (!variant) return;
        onStatus("idle");
        try {
          await add(variant.id, quantity);
          onStatus("added");
          added({ name: product.name, detail: variant.name || null });
        } catch {
          onStatus("error");
        }
      }}
      aria-label={label}
      className={cn(buttonVariants({ size: "lg" }), "font-bold", className)}
    >
      {children ??
        (!variant ? "No disponible" : !available ? "Agotado" : pending ? "Añadiendo…" : "Añadir al carrito")}
    </button>
  );
}

/** «Pedir por WhatsApp» with the product, the variant, the price and the link (components/whatsapp.ts). */
function WhatsappOrder({
  product,
  variant,
  quantity,
  compact = false,
}: {
  product: StorefrontProduct;
  variant: Variant | undefined;
  quantity: number;
  compact?: boolean;
}) {
  const store = useStore();
  const format = useFormatPrice();
  if (!store.whatsappPhone) return null;
  const phone = store.whatsappPhone;
  const name = variant?.name ? `${product.name} (${variant.name})` : product.name;
  const text = `Hola, quiero: ${quantity > 1 ? `${quantity} × ` : ""}${name} – ${format(variant?.price ?? product.minPrice, variant?.overrides)}`;
  return (
    <a
      href={whatsappUrl(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      // The product link is added on click: the page's own origin (subdomain or custom domain, web or app).
      onClick={(e) => {
        const origin = store.customDomain ? `https://${store.customDomain}` : window.location.origin;
        e.currentTarget.href = whatsappUrl(phone, `${text}\n${origin}/product/${product.slug}`);
      }}
      aria-label={compact ? "Pedir por WhatsApp" : undefined}
      className={cn(
        buttonVariants({ variant: "whatsappOutline" }),
        compact ? "size-[52px] shrink-0 px-0" : "h-[50px] w-full",
      )}
    >
      <MessageCircle size={compact ? 22 : 18} aria-hidden />
      {!compact && "Pedir por WhatsApp"}
    </a>
  );
}

/** Phones: sticky bar at the bottom instead of the tab bar: WhatsApp + «Añadir» with the price. */
function BuyBar({
  product,
  variant,
  onStatus,
}: {
  product: StorefrontProduct;
  variant: Variant | undefined;
  onStatus: (s: AddStatus) => void;
}) {
  const price = useFormatPrice()(variant?.price ?? product.minPrice, variant?.overrides);
  return (
    <div
      data-testid="buy-bar"
      className="sticky bottom-0 z-30 -mx-[clamp(16px,4.4cqw,56px)] flex gap-2.5 border-t border-border bg-[color-mix(in_srgb,var(--bg)_94%,transparent)] px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] backdrop-blur-md @min-[720px]:hidden"
    >
      <WhatsappOrder product={product} variant={variant} quantity={1} compact />
      <AddButton
        product={product}
        variant={variant}
        quantity={1}
        onStatus={onStatus}
        label={variant?.available ? `Añadir al carrito, ${price}` : undefined}
        className="h-[52px] flex-1 justify-between px-5"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag size={19} aria-hidden />
          {!variant ? "No disponible" : variant.available ? "Añadir" : "Agotado"}
        </span>
        <Price
          amount={variant?.price ?? product.minPrice}
          overrides={variant?.overrides}
          className="sf-heading"
        />
      </AddButton>
    </div>
  );
}

/** Benefits from the store's real data (PRP-R answer 11): delivery time, free shipping, pickup and payments. */
function Benefits({ delivery }: { delivery: Delivery }) {
  const store = useStore();
  const { methods, payments } = delivery.delivery;
  const fastest = methods
    .filter((m) => m.type === "delivery" && m.maxDays != null)
    .sort((a, b) => (a.maxDays ?? 0) - (b.maxDays ?? 0))[0];
  const items: { icon: LucideIcon; text: string }[] = [];
  if (fastest) items.push({ icon: Truck, text: `Entrega en ${days(fastest)}` });
  else if (methods.some((m) => m.type !== "pickup")) items.push({ icon: Truck, text: "Envío a domicilio" });
  if (delivery.freeShipping) {
    items.push({
      icon: Banknote,
      text: `Envío gratis desde ${formatMoney(delivery.freeShipping.from, store.baseCurrency)}`,
    });
  }
  if (methods.some((m) => m.type === "pickup")) items.push({ icon: House, text: "Recogida en la tienda" });
  if (payments.length) items.push({ icon: Wallet, text: `Pago: ${payments.slice(0, 2).join(" o ")}` });
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-3">
      {items.slice(0, 4).map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-2.5 text-[13px] leading-snug">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
            <Icon size={17} aria-hidden />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

function days(m: Pick<DeliveryMethod, "minDays" | "maxDays">): string {
  if (m.minDays != null && m.maxDays != null && m.minDays !== m.maxDays)
    return `${m.minDays}–${m.maxDays} días`;
  const n = m.maxDays ?? m.minDays ?? 0;
  return n === 0 ? "el día" : n === 1 ? "1 día" : `${n} días`;
}

function Accordion({ product, delivery }: { product: StorefrontProduct; delivery: Delivery }) {
  const store = useStore();
  const { methods } = delivery.delivery;
  const money = (v: number) => formatMoney(v, store.baseCurrency);
  const methodPrice = (m: DeliveryMethod) =>
    m.type === "to_agree" ? "Precio a convenir" : m.price === 0 ? "Gratis" : money(m.price);
  return (
    <div className="border-t border-border">
      {product.description && (
        <Fold title="Descripción" open>
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>
        </Fold>
      )}
      {product.attributes.length > 0 && (
        <Fold title="Características">
          <dl className="flex flex-col gap-2 text-sm">
            {product.attributes.map((a) => (
              <div key={a.name} className="grid grid-cols-2 gap-4">
                <dt className="text-muted-foreground">{a.name}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        </Fold>
      )}
      {methods.length > 0 && (
        <Fold title="Envío y entrega">
          <ul className="flex flex-col gap-2 text-sm">
            {methods.map((m) => (
              <li key={m.name} className="flex justify-between gap-4">
                <span>
                  {m.name}
                  {m.type === "delivery" && (m.minDays != null || m.maxDays != null) && (
                    <span className="text-muted-foreground"> · {days(m)}</span>
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">{methodPrice(m)}</span>
              </li>
            ))}
          </ul>
          {delivery.freeShipping && (
            <p className="mt-3 text-sm text-primary">
              Envío gratis con {delivery.freeShipping.method} desde {money(delivery.freeShipping.from)}.
            </p>
          )}
        </Fold>
      )}
    </div>
  );
}

function Fold({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-b border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <Plus size={18} aria-hidden className="group-open:hidden" />
        <Minus size={18} aria-hidden className="hidden group-open:block" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

/** «Combínalo con» / «También te puede gustar»: a carousel of cards under the product page. */
export function RelatedProducts({ products }: { products: ProductCardData[] }) {
  if (products.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold tracking-[.1em] text-primary uppercase">Combínalo con</span>
        <h2 className="sf-heading text-[clamp(24px,2.6cqw,34px)] leading-[1.1] font-bold">
          También te puede gustar
        </h2>
      </div>
      <ul className="sf-scroller -mx-[clamp(16px,4.4cqw,56px)] grid scroll-px-[clamp(16px,4.4cqw,56px)] auto-cols-[clamp(164px,calc((100cqw-172px)/4),300px)] grid-flow-col gap-[clamp(12px,1.6cqw,20px)] overflow-x-auto px-[clamp(16px,4.4cqw,56px)] pb-1">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Placeholder with the product page's shape while it loads in the store app (no layout shift). */
export function ProductSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando">
      <div className="h-11 w-2/3 animate-pulse rounded bg-surface @min-[720px]:h-5" />
      <div className="flex flex-wrap gap-[clamp(20px,4.4cqw,56px)]">
        <div className="aspect-[4/5] min-w-0 flex-[1.1_1_380px] animate-pulse rounded-sf-lg bg-surface" />
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <div className="h-10 w-3/4 animate-pulse rounded bg-surface" />
          <div className="h-24 animate-pulse rounded-sf bg-surface" />
          <div className="h-[46px] w-1/2 animate-pulse rounded-sf-btn bg-surface" />
          <div className="h-[46px] w-1/2 animate-pulse rounded-sf-btn bg-surface" />
          <div className="h-[54px] animate-pulse rounded-sf-btn bg-surface" />
        </div>
      </div>
    </div>
  );
}

/**
 * Home `featured_product`: the product page's pieces in one section — square photo with its badge and 3 thumbnails,
 * then eyebrow, brand, name, price, short description, variants, stepper, «Añadir al carrito», «Pedir por WhatsApp»
 * and the fastest delivery time of the store (no ratings, PRP-R answer 3).
 */
export function FeaturedProduct({
  product,
  eyebrow,
  badge,
  delivery,
}: {
  product: StorefrontProduct;
  eyebrow: string | null;
  badge: string | null;
  delivery?: Delivery;
}) {
  const selection = useVariantSelection(product.variants);
  const { variant } = selection;
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<AddStatus>("idle");
  const [index, setIndex] = useState(0);
  const media = product.media.slice(0, 3);
  const image = media[Math.min(index, media.length - 1)];
  const amount = variant?.price ?? product.minPrice;
  const discount = variant?.compareAtPrice ? percentOff(variant.compareAtPrice, variant.price) : null;
  const fastest = delivery?.delivery.methods
    .filter((m) => m.type === "delivery" && m.maxDays != null)
    .sort((a, b) => (a.maxDays ?? 0) - (b.maxDays ?? 0))[0];
  const href = `/product/${product.slug}`;
  return (
    <div className="flex flex-wrap items-center gap-[clamp(24px,4.4cqw,64px)]">
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3">
        <Link
          href={href}
          className="sf-placeholder relative block aspect-square overflow-hidden rounded-sf-lg shadow-sf"
        >
          {image && (
            <img
              src={image.url}
              srcSet={imageSrcSet(image.url)}
              sizes="(min-width: 720px) 50vw, 100vw"
              alt={image.alt ?? product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
          {badge && (
            <Badge variant="secondary" shape="tag" className="absolute top-3.5 left-3.5">
              {/más vendid/i.test(badge) && <Trophy size={13} aria-hidden />}
              {badge}
            </Badge>
          )}
        </Link>
        {media.length > 1 && (
          <div className="flex gap-2.5">
            {media.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver imagen ${i + 1}`}
                aria-current={m === image}
                className={`size-16 overflow-hidden rounded-sf-sm ${m === image ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              >
                <img src={m.thumbUrl ?? m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        {eyebrow && (
          <span className="text-xs font-bold tracking-[.1em] text-primary uppercase">{eyebrow}</span>
        )}
        <div className="flex flex-col gap-1.5">
          {product.brand && (
            <span className="text-xs font-medium tracking-[.08em] text-muted-foreground uppercase">
              {product.brand.name}
            </span>
          )}
          <h2 className="sf-heading text-[clamp(28px,3.2cqw,44px)] leading-[1.05] font-extrabold text-balance">
            <Link href={href}>{product.name}</Link>
          </h2>
        </div>
        <p className="flex flex-wrap items-center gap-2.5">
          <Price
            amount={amount}
            overrides={variant?.overrides}
            className="sf-heading text-[clamp(26px,2.6cqw,32px)] leading-none font-extrabold"
          />
          {variant?.compareAtPrice != null && discount && (
            <Price
              amount={variant.compareAtPrice}
              overrides={variant.compareAtOverrides}
              className="text-[15px] text-muted-foreground line-through"
            />
          )}
          {discount && (
            <Badge variant="sale" shape="tag">
              -{discount}%
            </Badge>
          )}
        </p>
        {product.description && (
          <p className="line-clamp-3 max-w-[460px] text-pretty text-muted-foreground">
            {product.description}
          </p>
        )}
        <VariantPicker selection={selection} />
        <div className="mt-1 flex flex-wrap gap-2.5">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <AddButton
            product={product}
            variant={variant}
            quantity={quantity}
            onStatus={setStatus}
            className="h-[54px] flex-[1_1_200px] shadow-sf"
          >
            <ShoppingBag size={18} aria-hidden />
            {!variant ? "No disponible" : variant.available ? "Añadir al carrito" : "Agotado"}
          </AddButton>
          <WhatsappOrder product={product} variant={variant} quantity={quantity} />
        </div>
        <AddedStatus status={status} />
        {fastest && (
          <span className="-mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
            <Truck size={16} aria-hidden className="text-success" />
            Recíbelo en {days(fastest)}
          </span>
        )}
      </div>
    </div>
  );
}
