"use client";

import { Alert, cn } from "@kshop/ui";
import Link from "next/link";
import { useCatalogStructure } from "@/features/catalog/use-catalog";
import { useContent } from "../use-content";
import { BannersEditor } from "./BannersEditor";
import { MenusEditor } from "./MenusEditor";
import { PagesEditor } from "./PagesEditor";
import { SectionsEditor } from "./SectionsEditor";
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
      <nav
        className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b pb-2"
        aria-label="Secciones de apariencia"
      >
        {APPEARANCE_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-surface",
              t.key === tab && "bg-accent-soft font-medium text-primary",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error || structureError ? (
        <Alert variant="destructive">{error ?? structureError}</Alert>
      ) : !content || !structure ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : tab === "theme" ? (
        <ThemeEditor content={content} save={(theme) => api.saveTheme(theme)} />
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
