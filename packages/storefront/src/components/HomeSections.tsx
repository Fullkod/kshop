import type { BannerData, HomeSection, StorefrontShell } from "@kshop/data";
import { ArrowRight, Star, Tag, Zap } from "@kshop/ui";
import { Link } from "../navigation";
import { BENEFIT_ICON } from "./AnnouncementBar";
import { Carousel } from "./Carousel";
import { Countdown, UntilEnd } from "./Countdown";
import { HeroControls, HeroSlider, HeroWhatsapp } from "./HeroSlider";
import { imageSrcSet } from "./images";
import { Markdown } from "./Markdown";
import { ProductCard, QuickAdd } from "./ProductCard";
import { FeaturedProduct } from "./ProductView";
import { Eyebrow, SectionHeader, sectionTitle } from "./SectionHeader";
import { Price } from "./Currency";

// Home sections of the redesign (docs/design-v2/03-PORTADA.md). P = side gutter, S = space above a section.
const P = "px-[clamp(16px,4.4cqw,56px)]";
const S = "pt-[clamp(44px,5.6cqw,72px)]";
const productColumns = "auto-cols-[clamp(164px,calc((100cqw-172px)/4),300px)]";
const wideColumns = "auto-cols-[clamp(240px,calc((100cqw-152px)/3),420px)]";

type Delivery = Pick<StorefrontShell, "delivery" | "freeShipping">;

export function HomeSections({ sections, delivery }: { sections: HomeSection[]; delivery?: Delivery }) {
  return (
    <div className="flex flex-col">
      {sections.map((section, index) => (
        <HomeSectionView key={section.id} section={section} first={index === 0} delivery={delivery} />
      ))}
    </div>
  );
}

function HomeSectionView({
  section,
  first,
  delivery,
}: {
  section: HomeSection;
  first: boolean;
  delivery?: Delivery;
}) {
  switch (section.type) {
    case "hero_slider":
      return (
        <section className={`${P} pt-[clamp(12px,2cqw,24px)]`} aria-label={section.title ?? "Destacados"}>
          <HeroSlider
            autoplaySeconds={section.autoplaySeconds}
            count={section.banners.length}
            label={section.title ?? "Destacados"}
          >
            {section.banners.map((b, i) => (
              <div key={b.id} className="w-full shrink-0 snap-start">
                <HeroSlide
                  banner={b}
                  index={i}
                  count={section.banners.length}
                  whatsapp={section.whatsapp}
                  priority={first && i === 0}
                />
              </div>
            ))}
          </HeroSlider>
        </section>
      );

    case "banner":
      return (
        <section className={`${P} ${first ? "pt-[clamp(12px,2cqw,24px)]" : S}`}>
          <PhotoBanner banner={section.banners[0]!} priority={first} wide />
        </section>
      );

    case "benefits":
      return (
        <section className={`${P} pt-[clamp(16px,2.4cqw,28px)]`} aria-label={section.title ?? "Ventajas"}>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-[clamp(8px,1.4cqw,16px)]">
            {section.items.map((item) => {
              const Icon = BENEFIT_ICON[item.icon];
              return (
                <li
                  key={item.title}
                  className="flex items-center gap-3 rounded-sf border border-border bg-surface p-[clamp(12px,1.4cqw,18px)]"
                >
                  <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
                    <Icon size={20} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm leading-tight font-semibold">{item.title}</span>
                    {item.text && (
                      <span className="text-[12.5px] leading-snug text-muted-foreground">{item.text}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      );

    case "category_grid":
      return (
        <section className={`flex flex-col gap-5 ${S}`}>
          <SectionHeader
            eyebrow={section.eyebrow}
            title={section.title ?? "Categorías"}
            href="/categories"
            hrefLabel="Todas"
          />
          <ul
            className={`${P} grid grid-cols-[repeat(auto-fill,minmax(max(96px,12cqw),1fr))] gap-[clamp(10px,1.6cqw,20px)]`}
          >
            {section.categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="group flex flex-col items-center gap-1 text-center"
                >
                  <span className="sf-stripes-secondary relative mb-2 block aspect-square w-full overflow-hidden rounded-sf-lg">
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        srcSet={imageSrcSet(c.imageUrl)}
                        sizes="(min-width: 720px) 16vw, 33vw"
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105 motion-reduce:transition-none"
                      />
                    )}
                  </span>
                  <span className="text-sm leading-tight font-semibold">{c.name}</span>
                  {!!c.count && <span className="text-xs text-muted-foreground">{products(c.count)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "product_carousel":
      return (
        <section className={S}>
          <Carousel
            eyebrow={section.eyebrow}
            title={section.title ?? "Productos"}
            href={section.href}
            columns={productColumns}
          >
            {section.products.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={first && i < 2} />
              </li>
            ))}
          </Carousel>
        </section>
      );

    case "banner_mosaic":
      return (
        <section className={`${P} ${S}`}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-[clamp(12px,1.6cqw,20px)]">
            <PhotoBanner banner={section.banners[0]!} priority={first} />
            {section.banners[1] ? (
              <PhotoBanner banner={section.banners[1]} priority={false} />
            ) : (
              section.block && <ColorBlock block={section.block} />
            )}
          </div>
        </section>
      );

    case "offer_countdown":
      return (
        <UntilEnd endsAt={section.endsAt}>
          <section className={`${P} ${S}`}>
            <div className="flex flex-wrap items-center gap-[clamp(24px,3cqw,44px)] rounded-sf-lg border border-[color-mix(in_srgb,var(--sale)_22%,transparent)] bg-sale-soft p-[clamp(20px,3.4cqw,44px)]">
              <div className="flex flex-[1_1_280px] flex-col gap-3.5">
                <span className="flex items-center gap-1.5 self-start rounded-full bg-sale px-3 py-[7px] text-xs leading-none font-bold tracking-[.1em] text-sale-foreground uppercase">
                  <Zap size={13} aria-hidden />
                  {section.eyebrow ?? "Oferta flash"}
                </span>
                <h2 className="sf-heading text-[clamp(26px,3cqw,40px)] leading-[1.08] font-extrabold text-balance">
                  {section.title ?? "Ofertas por tiempo limitado"}
                </h2>
                {section.text && <p className="max-w-[380px] text-muted-foreground">{section.text}</p>}
                <div className="mt-1.5">
                  <Countdown endsAt={section.endsAt} />
                </div>
                <Link
                  href={section.href}
                  className="flex items-center gap-1.5 self-start text-sm font-semibold"
                >
                  Ver todas las ofertas
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
              <ul className="grid flex-[2_1_420px] grid-cols-[repeat(auto-fill,minmax(146px,1fr))] gap-[clamp(12px,1.4cqw,18px)]">
                {section.products.map((p, i) => (
                  // Two on phones, up to the limit from 720 px.
                  <li key={p.id} className={i >= 2 ? "hidden @min-[720px]:block" : undefined}>
                    <ProductCard product={p} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </UntilEnd>
      );

    case "featured_product":
      return (
        <section className={`${P} ${S}`} aria-label={section.title ?? section.product.name}>
          <FeaturedProduct
            product={section.product}
            eyebrow={section.eyebrow ?? section.title}
            badge={section.badge}
            delivery={delivery}
          />
        </section>
      );

    case "collection_cards":
      return (
        <section className={S}>
          <Carousel eyebrow={section.eyebrow} title={section.title ?? "Colecciones"} columns={wideColumns}>
            {section.collections.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/collection/${c.slug}`}
                  className="sf-stripes-ink group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-sf-lg p-[22px] text-ink-foreground"
                >
                  {c.imageUrl && (
                    <img
                      src={c.imageUrl}
                      srcSet={imageSrcSet(c.imageUrl)}
                      sizes="(min-width: 720px) 33vw, 240px"
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-scrim to-transparent to-60%"
                  />
                  <span className="relative flex flex-col gap-1.5">
                    {!!c.count && <span className="text-[12.5px] opacity-80">{products(c.count)}</span>}
                    <span className="sf-heading text-[26px] leading-[1.1] font-extrabold">{c.name}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-secondary">
                      Ver colección
                      <ArrowRight size={16} aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Carousel>
        </section>
      );

    case "brand_strip":
      return (
        <section className={`${P} ${S} flex flex-col gap-[18px]`}>
          <Eyebrow className="text-center text-muted-foreground">
            {section.title ?? "Marcas que vendemos"}
          </Eyebrow>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(max(100px,13cqw),1fr))] gap-3">
            {section.brands.map((b) => (
              <li key={b.slug}>
                <Link
                  href={`/brand/${b.slug}`}
                  className="sf-heading flex h-[72px] items-center justify-center rounded-sf border border-border px-3 text-center text-[17px] leading-none font-bold text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {b.logoUrl ? (
                    <img
                      src={b.logoUrl}
                      alt={b.name}
                      loading="lazy"
                      className="max-h-8 w-auto max-w-full object-contain"
                    />
                  ) : (
                    b.name
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );

    case "testimonials":
      return (
        <section className="mt-[clamp(44px,5.6cqw,72px)] flex flex-col gap-5 bg-surface py-[clamp(44px,5.6cqw,72px)]">
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Eyebrow>{section.eyebrow ?? "Opiniones"}</Eyebrow>
            <h2 className={sectionTitle}>{section.title ?? "Lo que dicen nuestros clientes"}</h2>
            {section.summary && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stars rating={section.summary.rating} size={15} />
                <span>
                  <b className="text-foreground">{section.summary.rating.toLocaleString("es")}</b> de 5 ·{" "}
                  {section.summary.count.toLocaleString("es")} opiniones
                </span>
              </p>
            )}
          </div>
          <ul
            className={`sf-scroller grid scroll-px-[clamp(16px,4.4cqw,56px)] grid-flow-col gap-[clamp(12px,1.6cqw,20px)] overflow-x-auto py-2 ${P} ${wideColumns}`}
          >
            {section.items.map((t) => (
              <li key={t.name + t.quote.slice(0, 20)}>
                <figure className="flex h-full flex-col gap-3.5 rounded-sf border border-border bg-background p-6 shadow-sf">
                  <Stars rating={t.rating} size={16} />
                  <blockquote className="text-[15px] leading-[1.55] text-pretty">“{t.quote}”</blockquote>
                  <figcaption className="mt-auto flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="sf-heading flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-primary"
                    >
                      {initials(t.name)}
                    </span>
                    <span className="flex flex-col">
                      <b className="text-sm">{t.name}</b>
                      {(t.place || t.product) && (
                        <span className="text-[12.5px] text-muted-foreground">
                          {[t.place, t.product && `compró ${t.product}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      );

    case "rich_text":
      return (
        <section className={`${P} py-[clamp(48px,6cqw,80px)]`}>
          <div className="mx-auto flex max-w-[680px] flex-col items-center gap-3.5 text-center">
            {section.eyebrow && <Eyebrow>{section.eyebrow}</Eyebrow>}
            {section.title && <h2 className={sectionTitle}>{section.title}</h2>}
            <div className="text-base leading-[1.65] text-pretty text-muted-foreground">
              <Markdown>{section.markdown}</Markdown>
            </div>
            {section.link && (
              <Link href={section.link.href} className="flex items-center gap-1.5 font-semibold">
                {section.link.label}
                <ArrowRight size={16} aria-hidden />
              </Link>
            )}
          </div>
        </section>
      );
  }
}

const products = (n: number) => (n === 1 ? "1 producto" : `${n.toLocaleString("es")} productos`);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function Stars({ rating, size }: { rating: number; size: number }) {
  const full = Math.round(rating);
  return (
    <span className="flex gap-0.5 text-warning" role="img" aria-label={`${rating.toLocaleString("es")} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} size={size} aria-hidden fill={i < full ? "currentColor" : "none"} />
      ))}
    </span>
  );
}

/** Split hero slide: text on the accent color (eyebrow pill, title, subtitle, buttons, controls) and the photo with an
 *  optional floating product. A banner without a title is just the photo. */
function HeroSlide({
  banner,
  index,
  count,
  whatsapp,
  priority,
}: {
  banner: BannerData;
  index: number;
  count: number;
  whatsapp: boolean;
  priority: boolean;
}) {
  if (!banner.title) {
    const photo = (
      <div className="relative aspect-[4/5] overflow-hidden rounded-sf-lg @min-[720px]:aspect-[21/9]">
        <BannerPicture banner={banner} priority={priority} sizes="100vw" />
        <div className="absolute bottom-4 left-4">
          <HeroControls index={index} count={count} />
        </div>
      </div>
    );
    return banner.href ? (
      <Link href={banner.href} aria-label={banner.alt || undefined} className="block">
        {photo}
      </Link>
    ) : (
      photo
    );
  }
  return (
    <div className="flex flex-wrap overflow-hidden rounded-sf-lg bg-primary text-primary-foreground">
      <div className="relative flex flex-[1_1_380px] flex-col justify-between gap-8 overflow-hidden p-[clamp(24px,4.4cqw,56px)]">
        <span
          aria-hidden
          className="absolute -right-[70px] -bottom-[100px] size-[180px] rounded-full bg-secondary opacity-95 @min-[720px]:-right-[90px] @min-[720px]:-bottom-[110px] @min-[720px]:size-[260px]"
        />
        <div className="relative flex flex-col gap-[18px]">
          {banner.eyebrow && (
            <span className="self-start rounded-full bg-secondary px-3 py-[7px] text-[11px] leading-none font-bold tracking-[.1em] text-secondary-foreground uppercase">
              {banner.eyebrow}
            </span>
          )}
          {/* The page's h1 is the store name (sr-only); the hero title is the visual headline. */}
          <p className="sf-heading text-[clamp(38px,5cqw,68px)] leading-[1.02] font-extrabold text-balance">
            {banner.title}
          </p>
          {banner.subtitle && (
            <p className="max-w-[440px] text-[clamp(15px,1.4cqw,18px)] leading-normal text-pretty opacity-90">
              {banner.subtitle}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            {banner.href && (
              <Link
                href={banner.href}
                className="flex h-[50px] items-center gap-2 rounded-sf-btn bg-primary-foreground px-[22px] text-[15px] font-bold text-primary hover:opacity-90 focus-visible:shadow-[0_0_0_4px_var(--ring)] focus-visible:outline-none"
              >
                {banner.ctaLabel ?? "Ver más"}
                <ArrowRight size={18} aria-hidden />
              </Link>
            )}
            {whatsapp && <HeroWhatsapp />}
          </div>
        </div>
        <HeroControls index={index} count={count} />
      </div>
      <div className="sf-stripes-accent relative min-h-[clamp(300px,40cqw,540px)] flex-[1.25_1_420px]">
        <BannerPicture banner={banner} priority={priority} sizes="(min-width: 720px) 55vw, 100vw" />
        {banner.product && (
          <div className="absolute bottom-5 left-5 flex items-center gap-3 rounded-sf bg-background py-2.5 pr-3 pl-2.5 text-foreground shadow-sf-lg">
            <Link
              href={`/product/${banner.product.slug}`}
              className="sf-placeholder block size-12 shrink-0 overflow-hidden rounded-sf-sm"
              tabIndex={-1}
              aria-hidden
            >
              {banner.product.imageUrl && (
                <img
                  src={banner.product.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
            </Link>
            <Link href={`/product/${banner.product.slug}`} className="flex max-w-[180px] flex-col gap-0.5">
              <span className="truncate text-[13px] font-medium">{banner.product.name}</span>
              <Price
                amount={banner.product.minPrice}
                overrides={banner.product.overrides}
                className="sf-heading text-sm font-bold"
              />
            </Link>
            {banner.product.inStock && (
              <QuickAdd product={banner.product} iconOnly className="ml-1.5 size-[34px]" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BannerPicture({
  banner,
  priority,
  sizes,
}: {
  banner: BannerData;
  priority: boolean;
  sizes: string;
}) {
  return (
    <picture>
      {banner.imageMobileUrl && <source media="(max-width: 719px)" srcSet={banner.imageMobileUrl} />}
      <img
        src={banner.imageUrl}
        srcSet={imageSrcSet(banner.imageUrl)}
        sizes={sizes}
        alt={banner.alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </picture>
  );
}

/** Photo with the scrim and its text at the bottom: mosaic piece A, and the simple banner at full width (`wide`). */
function PhotoBanner({
  banner,
  priority,
  wide = false,
}: {
  banner: BannerData;
  priority: boolean;
  wide?: boolean;
}) {
  const content = (
    <div
      className={`sf-stripes-ink relative flex items-end overflow-hidden rounded-sf-lg p-[clamp(22px,2.8cqw,36px)] text-ink-foreground ${
        wide ? "aspect-[16/9] @min-[720px]:aspect-[21/7]" : "min-h-[clamp(280px,30cqw,400px)]"
      }`}
    >
      <BannerPicture
        banner={banner}
        priority={priority}
        sizes={wide ? "100vw" : "(min-width: 720px) 50vw, 100vw"}
      />
      {(banner.title || banner.eyebrow || banner.ctaLabel) && (
        <>
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-scrim to-transparent to-65%" />
          <div className="relative flex flex-col items-start gap-2.5">
            {banner.eyebrow && <Eyebrow className="text-secondary">{banner.eyebrow}</Eyebrow>}
            {banner.title && (
              <span className="sf-heading text-[clamp(28px,3.2cqw,42px)] leading-[1.05] font-extrabold text-balance">
                {banner.title}
              </span>
            )}
            {banner.subtitle && (
              <span className="max-w-[420px] text-[15px] opacity-90">{banner.subtitle}</span>
            )}
            {banner.ctaLabel && banner.href && (
              <span className="mt-1.5 flex h-11 items-center gap-2 rounded-sf-btn bg-background px-[18px] text-sm font-semibold text-foreground">
                {banner.ctaLabel}
                <ArrowRight size={16} aria-hidden />
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
  return banner.href ? (
    <Link href={banner.href} className="block" aria-label={banner.title ?? (banner.alt || undefined)}>
      {content}
    </Link>
  ) : (
    content
  );
}

/** Mosaic piece B: a block in the secondary color with a pill, title, text, button and a big faded number. */
function ColorBlock({
  block,
}: {
  block: NonNullable<Extract<HomeSection, { type: "banner_mosaic" }>["block"]>;
}) {
  const content = (
    <div className="relative flex min-h-[clamp(280px,30cqw,400px)] flex-col justify-between gap-6 overflow-hidden rounded-sf-lg bg-secondary p-[clamp(22px,2.8cqw,36px)] text-secondary-foreground">
      {block.bigText && (
        <span
          aria-hidden
          className="sf-heading pointer-events-none absolute -right-3 -bottom-10 text-[clamp(150px,18cqw,240px)] leading-none font-black tracking-[-0.05em] opacity-[.12]"
        >
          {block.bigText}
        </span>
      )}
      {block.eyebrow ? (
        <span className="flex items-center gap-1.5 self-start rounded-full bg-secondary-foreground px-3 py-[7px] text-xs leading-none font-bold tracking-[.1em] text-secondary uppercase">
          <Tag size={13} aria-hidden />
          {block.eyebrow}
        </span>
      ) : (
        <span />
      )}
      <div className="relative flex flex-col items-start gap-2.5">
        <span className="sf-heading max-w-[420px] text-[clamp(28px,3.2cqw,42px)] leading-[1.05] font-extrabold text-balance">
          {block.title}
        </span>
        {block.text && <span className="max-w-[360px] text-[15px] opacity-85">{block.text}</span>}
        {block.ctaLabel && block.href && (
          <span className="mt-1.5 flex h-11 items-center gap-2 rounded-sf-btn bg-ink px-[18px] text-sm font-semibold text-ink-foreground">
            {block.ctaLabel}
            <ArrowRight size={16} aria-hidden />
          </span>
        )}
      </div>
    </div>
  );
  return block.href ? (
    <Link href={block.href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}
