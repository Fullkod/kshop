"use client";

import { Alert, Button, cn } from "@kshop/ui";
import Link from "next/link";
import { useCatalogStructure } from "@/features/catalog/use-catalog";
import { useContent } from "../use-content";
import { BannersEditor } from "./BannersEditor";
import { MenusEditor } from "./MenusEditor";
import { PagesEditor } from "./PagesEditor";
import { SectionsEditor } from "./SectionsEditor";
import { StoreDescriptionCard } from "./StoreDescriptionCard";
import { StoreLogoCard } from "./StoreLogoCard";
import { ThemeEditor } from "./ThemeEditor";

export const APPEARANCE_TABS = [
  { key: "theme", href: "/admin/themes", label: "Tema" },
  { key: "home", href: "/admin/themes/home", label: "Portada" },
  { key: "banners", href: "/admin/themes/banners", label: "Banners" },
  { key: "menus", href: "/admin/themes/menus", label: "Menús" },
  { key: "pages", href: "/admin/themes/pages", label: "Páginas" },
] as const;
export type AppearanceTab = (typeof APPEARANCE_TABS)[number]["key"];

/** Admin «Apariencia» (module themes): theme, home sections, banners, menus and static pages. */
export function AppearancePage({ tab }: { tab: AppearanceTab }) {
  const { data: content, error, reload, content: api } = useContent();
  const { data: structure, error: structureError } = useCatalogStructure();

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Apariencia</h1>
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver la tienda ↗
        </a>
      </div>
      <nav className="mb-6 flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none]" aria-label="Secciones de apariencia">
        {APPEARANCE_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 border-transparent pt-1 pb-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              t.key === tab && "border-primary font-bold text-primary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error || structureError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive">{error ?? structureError}</Alert>
          <Button
            variant="outline"
            // The catalog structure has no reload of its own: a full reload covers both reads.
            onClick={() => (structureError ? window.location.reload() : reload())}
          >
            Reintentar
          </Button>
        </div>
      ) : !content || !structure ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : tab === "theme" ? (
        <div className="flex flex-col gap-6">
          <ThemeEditor content={content} save={(theme) => api.saveTheme(theme)} />
          <StoreLogoCard initial={content.logoUrl} save={(logoUrl) => api.saveLogo({ logoUrl })} />
          <StoreDescriptionCard
            initial={content.description}
            save={(description) => api.saveDescription({ description })}
          />
        </div>
      ) : tab === "home" ? (
        <SectionsEditor content={content} structure={structure} api={api} reload={reload} />
      ) : tab === "banners" ? (
        <BannersEditor content={content} structure={structure} api={api} reload={reload} />
      ) : tab === "menus" ? (
        <MenusEditor
          key={JSON.stringify(content.menus)}
          content={content}
          structure={structure}
          api={api}
          reload={reload}
        />
      ) : (
        <PagesEditor content={content} api={api} reload={reload} />
      )}
    </div>
  );
}
