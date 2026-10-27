"use client";

import type { ProductCardData, StorefrontProduct } from "@kshop/data";
import { Badge, buttonVariants, cn, Heart, MessageCircle, Plus, Trophy, X } from "@kshop/ui";
import { useEffect, useRef, useState } from "react";
import { useFavorites } from "../account/Favorites";
import { useCustomerSession } from "../account/CustomerSession";
import { useCartUi } from "../cart/CartDrawer";
import { useCart } from "../cart/CartProvider";
import { Link } from "../navigation";
import { useStore } from "../store-context";
import { Price, useFormatPrice } from "./Currency";
import { useVariantSelection, VariantPicker } from "./VariantPicker";
import { imageSrcSet } from "./images";
import { whatsappUrl } from "./whatsapp";

const MAX_SWATCHES = 4;
const roundIcon =
  "flex shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:shadow-[0_0_0_4px_var(--ring)]";

/**
 * Product card. `grid` (listings, carousels): photo with discount/label/sold-out badges, favorite and quick add, then
 * brand, colors, name, price and «Pedir por WhatsApp». Below 720 px of the storefront the add button is only the
 * icon. `row` (search, offers on phones): small photo and an add button.
 */
export function ProductCard({
  product,
  priority = false,
  layout = "grid",
}: {
  product: ProductCardData;
  priority?: boolean;
  layout?: "grid" | "row";
}) {
  const href = `/product/${product.slug}`;
  if (layout === "row") {
    return (
      <article className="flex items-center gap-3">
        <Link
          href={href}
          className="sf-placeholder relative aspect-[4/5] w-[76px] shrink-0 overflow-hidden rounded-sf-sm"
        >
          {product.imageUrl && <ProductImage product={product} priority={priority} sizes="76px" />}
          {product.discountPercent && (
            <span className="absolute top-1 left-1 rounded-sf-sm bg-sale px-1 py-0.5 text-[10px] font-bold text-sale-foreground">
              -{product.discountPercent}%
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {product.brand && <Brand name={product.brand} />}
          <Link href={href} className="truncate font-medium">
            {product.name}
          </Link>
          <Prices product={product} size="text-[15px]" />
        </div>
        {product.inStock && <QuickAdd product={product} iconOnly />}
      </article>
    );
  }

  return (
    <article className="group flex flex-col gap-2.5">
      <div className="relative">
        <Link
          href={href}
          aria-label={product.name}
          className="sf-placeholder relative block aspect-[4/5] overflow-hidden rounded-sf shadow-sf"
        >
          {product.imageUrl && (
            <ProductImage
              product={product}
              priority={priority}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
              className={`transition duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${product.inStock ? "" : "opacity-45"}`}
            />
          )}
        </Link>
        <div className="pointer-events-none absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          {product.discountPercent && (
            <Badge variant="sale" shape="tag">
              -{product.discountPercent}%
            </Badge>
          )}
          {product.badge && (
            <Badge variant="secondary" shape="tag">
              {/más vendid/i.test(product.badge) && <Trophy size={13} aria-hidden />}
              {product.badge}
            </Badge>
          )}
          {!product.inStock && (
            <Badge variant="outline" shape="tag">
              Agotado
            </Badge>
          )}
        </div>
        <FavoriteButton product={product} />
        {product.inStock && (
          <div className="absolute right-2.5 bottom-2.5">
            <QuickAdd product={product} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 px-0.5">
        {(product.brand || product.swatches.length > 0) && (
          <div className="flex min-h-3 items-center justify-between gap-2">
            {product.brand ? <Brand name={product.brand} /> : <span />}
            <Swatches colors={product.swatches} />
          </div>
        )}
        <Link href={href} className="line-clamp-2 text-[15px] leading-[1.3] font-medium">
          {product.name}
        </Link>
        <div className="flex items-center justify-between gap-2">
          <Prices product={product} size="text-base" />
          <WhatsappButton product={product} />
        </div>
      </div>
    </article>
  );
}

function ProductImage({
  product,
  priority,
  sizes,
  className = "",
}: {
  product: ProductCardData;
  priority: boolean;
  sizes: string;
  className?: string;
}) {
  return (
    // D12: our own WebP sizes, no image optimizer
    <img
      src={product.imageUrl!}
      srcSet={imageSrcSet(product.imageUrl!)}
      sizes={sizes}
      alt=""
      width={480}
      height={600}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

const Brand = ({ name }: { name: string }) => (
  <span className="truncate text-[11px] font-medium tracking-[.08em] text-muted-foreground uppercase">
    {name}
  </span>
);

function Swatches({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  const more = colors.length - MAX_SWATCHES;
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={`${colors.length} colores`}>
      {colors.slice(0, MAX_SWATCHES).map((color) => (
        <span
          key={color}
          aria-hidden
          className="size-3 rounded-full border border-border"
          // Real color of the variant value (the one fixed color a store component may show).
          style={{ background: color }}
        />
      ))}
      {more > 0 && <span className="text-[11px] text-muted-foreground">+{more}</span>}
    </span>
  );
}

function Prices({ product, size }: { product: ProductCardData; size: string }) {
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      {product.maxPrice > product.minPrice && <span className="text-xs text-muted-foreground">Desde</span>}
      <Price
        amount={product.minPrice}
        overrides={product.overrides}
        className={`sf-heading font-bold ${size}`}
      />
      {product.compareAtPrice != null && (
        <Price
          amount={product.compareAtPrice}
          overrides={product.compareAtOverrides}
          className="text-xs text-muted-foreground line-through"
        />
      )}
    </p>
  );
}

function FavoriteButton({ product }: { product: ProductCardData }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(product.id);
  return (
    <button
      type="button"
      onClick={() => void toggle(product.id)}
      aria-pressed={on}
      aria-label={on ? `Quitar ${product.name} de favoritos` : `Guardar ${product.name} en favoritos`}
      className={`${roundIcon} absolute top-2.5 right-2.5 size-9 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] ${on ? "text-sale" : "text-foreground hover:text-sale"}`}
    >
      <Heart size={18} fill={on ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** «Pedir por WhatsApp» straight from the card: the store's wa.me with the product, its price and its link. */
function WhatsappButton({ product }: { product: ProductCardData }) {
  const store = useStore();
  const format = useFormatPrice();
  if (!store.whatsappPhone) return null;
  const price = `${product.maxPrice > product.minPrice ? "desde " : ""}${format(product.minPrice, product.overrides)}`;
  const text = `Hola, quiero: ${product.name} – ${price}`;
  return (
    <a
      href={whatsappUrl(store.whatsappPhone, text)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Pedir ${product.name} por WhatsApp`}
      // The product link is added on click: the page's own origin (subdomain or custom domain, web or app).
      onClick={(e) => {
        const link = `${store.customDomain ? `https://${store.customDomain}` : window.location.origin}/product/${product.slug}`;
        e.currentTarget.href = whatsappUrl(store.whatsappPhone!, `${text}\n${link}`);
      }}
      className={`${roundIcon} size-[34px] border border-border text-whatsapp hover:border-whatsapp`}
    >
      <MessageCircle size={17} aria-hidden />
    </a>
  );
}

/**
 * Quick add: a product with one variant goes straight to the cart; with several, a picker opens (bottom sheet on
 * phones, dialog on wider screens) with the same variant chips as the product page.
 */
export function QuickAdd({
  product,
  iconOnly = false,
  className,
}: {
  product: ProductCardData;
  iconOnly?: boolean;
  className?: string;
}) {
  const { add, pending } = useCart();
  const { added } = useCartUi();
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [picking, setPicking] = useState(false);

  async function onClick() {
    if (!product.defaultVariantId) {
      setPicking(true);
      dialog.current?.showModal();
      return;
    }
    setBusy(true);
    try {
      await add(product.defaultVariantId, 1);
      added({ name: product.name, detail: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || pending}
        aria-label={`Añadir ${product.name} al carrito`}
        className={cn(
          buttonVariants({ size: "sm" }),
          "h-10 w-10 px-0 shadow-sf",
          !iconOnly && "@min-[720px]:w-auto @min-[720px]:px-3",
          className,
        )}
      >
        <Plus size={18} aria-hidden />
        {!iconOnly && <span className="hidden @min-[720px]:inline">Añadir</span>}
      </button>
      <dialog
        ref={dialog}
        aria-label={`Elegir opciones de ${product.name}`}
        onClose={() => setPicking(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-sf-lg bg-background p-0 text-foreground shadow-sf-lg backdrop:bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] min-[720px]:m-auto min-[720px]:w-[440px] min-[720px]:rounded-sf-lg"
      >
        {picking && (
          <QuickAddPicker
            product={product}
            onDone={(detail) => {
              dialog.current?.close();
              added({ name: product.name, detail });
            }}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </>
  );
}

function QuickAddPicker({
  product,
  onDone,
  onClose,
}: {
  product: ProductCardData;
  onDone: (detail: string | null) => void;
  onClose: () => void;
}) {
  const store = useStore();
  const { api } = useCustomerSession();
  const [detail, setDetail] = useState<StorefrontProduct | null | undefined>(undefined);

  // Read when opened (the cached public read of the product page).
  useEffect(() => {
    let cancelled = false;
    api
      .storefront(store.id)
      .product(product.slug)
      .then(
        (p) => !cancelled && setDetail(p),
        () => !cancelled && setDetail(null),
      );
    return () => {
      cancelled = true;
    };
  }, [api, store.id, product.slug]);

  return (
    <div
      className="flex flex-col gap-4 p-5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      data-testid="quick-add"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="sf-heading text-lg leading-tight font-bold">{product.name}</h2>
          <Prices product={product} size="text-base" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={`${roundIcon} -mt-1 -mr-1 size-11 hover:bg-surface`}
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      {detail === undefined ? (
        <div className="flex flex-col gap-2" aria-busy>
          <div className="h-4 w-24 animate-pulse rounded bg-surface" />
          <div className="h-[46px] animate-pulse rounded-sf-btn bg-surface" />
        </div>
      ) : detail === null ? (
        <p className="text-sm text-destructive">No se pudo cargar el producto. Inténtalo de nuevo.</p>
      ) : (
        <QuickAddOptions product={detail} onDone={onDone} />
      )}
      <Link href={`/product/${product.slug}`} onClick={onClose} className="text-center text-sm underline">
        Ver el producto
      </Link>
    </div>
  );
}

function QuickAddOptions({
  product,
  onDone,
}: {
  product: StorefrontProduct;
  onDone: (detail: string | null) => void;
}) {
  const { add, pending } = useCart();
  const selection = useVariantSelection(product.variants);
  const { variant } = selection;
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <VariantPicker selection={selection} />
      {error && <p className="text-sm text-destructive">No se pudo añadir. Inténtalo de nuevo.</p>}
      <button
        type="button"
        disabled={!variant?.available || pending}
        onClick={async () => {
          if (!variant) return;
          setError(false);
          try {
            await add(variant.id, 1);
            onDone(variant.name || null);
          } catch {
            setError(true);
          }
        }}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {!variant ? "Esta combinación no existe" : variant.available ? "Añadir al carrito" : "Agotado"}
      </button>
    </div>
  );
}

export function ProductGrid({
  products,
  priorityCount = 0,
}: {
  products: ProductCardData[];
  priorityCount?: number;
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-7 @min-[640px]:grid-cols-3 @min-[1024px]:grid-cols-4 @min-[1024px]:gap-x-5">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
