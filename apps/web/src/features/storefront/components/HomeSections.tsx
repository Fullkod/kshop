import Link from "next/link";
import type { BannerData, HomeSection } from "@/server/storefront/catalog";
import { HeroSlider } from "./HeroSlider";
import { Markdown } from "./Markdown";
import { ProductCard, imageSrcSet } from "./ProductCard";

export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return (
    <div className={`flex flex-col gap-14 pb-8 ${sections[0]?.type === "hero_slider" ? "" : "pt-8"}`}>
      {sections.map((section, index) => {
        const first = index === 0;
        switch (section.type) {
          case "hero_slider":
            return (
              <section key={section.id} aria-label={section.title ?? "Destacados"}>
                <HeroSlider autoplaySeconds={section.autoplaySeconds} count={section.banners.length}>
                  {section.banners.map((b, i) => (
                    <div key={b.id} className="w-full shrink-0 snap-start">
                      <Banner banner={b} priority={first && i === 0} tall />
                    </div>
                  ))}
                </HeroSlider>
              </section>
            );
          case "banner":
            return (
              <section key={section.id} className="mx-auto w-full max-w-6xl px-4 sm:px-6">
                <Banner banner={section.banners[0]!} priority={first} rounded />
              </section>
            );
          case "product_carousel":
            return (
              <section key={section.id} className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6">
                <SectionHeader title={section.title ?? "Productos"} href={section.href} />
                <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
                  {section.products.map((p, i) => (
                    <li key={p.id} className="w-[44%] shrink-0 snap-start sm:w-auto">
                      <ProductCard product={p} priority={first && i < 2} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          case "category_grid":
            return (
              <section key={section.id} className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6">
                <SectionHeader title={section.title ?? "Categorías"} />
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {section.categories.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`/category/${c.slug}`}
                        className="group relative flex aspect-[4/3] items-end overflow-hidden rounded-[var(--sf-radius)] bg-surface p-4"
                      >
                        {c.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- category image
                          <img
                            src={c.imageUrl}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105"
                          />
                        )}
                        <span
                          className={`sf-heading relative text-lg font-semibold ${c.imageUrl ? "rounded bg-background/90 px-2 py-0.5" : ""}`}
                        >
                          {c.name}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          case "brand_strip":
            return (
              <section key={section.id} className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6">
                <SectionHeader title={section.title ?? "Marcas"} />
                <ul className="flex flex-wrap gap-3">
                  {section.brands.map((b) => (
                    <li key={b.slug}>
                      <Link
                        href={`/brand/${b.slug}`}
                        className="flex h-14 items-center gap-2 rounded-[var(--sf-radius)] border px-4 hover:bg-surface"
                      >
                        {b.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- brand logo
                          <img
                            src={b.logoUrl}
                            alt={b.name}
                            loading="lazy"
                            className="h-8 w-auto max-w-28 object-contain"
                          />
                        ) : (
                          <span className="font-medium">{b.name}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          case "rich_text":
            return (
              <section key={section.id} className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 sm:px-6">
                {section.title && <h2 className="text-2xl font-semibold">{section.title}</h2>}
                <Markdown>{section.markdown}</Markdown>
              </section>
            );
        }
      })}
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {href && (
        <Link href={href} className="text-sm font-medium text-primary hover:underline">
          Ver todo
        </Link>
      )}
    </div>
  );
}

function Banner({
  banner,
  priority,
  tall,
  rounded,
}: {
  banner: BannerData;
  priority: boolean;
  tall?: boolean;
  rounded?: boolean;
}) {
  const content = (
    <div
      className={`relative flex w-full overflow-hidden bg-surface ${tall ? "aspect-[4/5] sm:aspect-[21/9]" : "aspect-[16/9] sm:aspect-[21/7]"} ${rounded ? "rounded-[var(--sf-radius)]" : ""}`}
    >
      <picture>
        {banner.imageMobileUrl && <source media="(max-width: 640px)" srcSet={banner.imageMobileUrl} />}
        {}
        <img
          src={banner.imageUrl}
          srcSet={imageSrcSet(banner.imageUrl)}
          sizes="100vw"
          alt={banner.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      {(banner.title || banner.subtitle || banner.ctaLabel) && (
        <div className="relative mt-auto flex w-full flex-col items-start gap-2 bg-gradient-to-t from-black/60 to-transparent p-6 text-white sm:p-10">
          {banner.title && <p className="sf-heading text-2xl font-semibold sm:text-4xl">{banner.title}</p>}
          {banner.subtitle && <p className="max-w-xl text-sm sm:text-base">{banner.subtitle}</p>}
          {banner.ctaLabel && banner.href && (
            <span className="mt-2 rounded-[var(--sf-radius)] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              {banner.ctaLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
  return banner.href ? (
    <Link href={banner.href} className="block" aria-label={banner.title ?? banner.alt ?? undefined}>
      {content}
    </Link>
  ) : (
    content
  );
}
