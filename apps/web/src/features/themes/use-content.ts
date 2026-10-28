"use client";

import type { HomeSectionType, Link, LinkType, MenuLocation } from "@kshop/core";
import { AdminContentQuery } from "@kshop/data";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

export type AdminBanner = {
  id: string;
  eyebrow: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  imageUrl: string;
  imageMobileUrl: string | null;
  alt: string | null;
  productId: string | null;
  link: Link | null;
  isVisible: boolean;
  startsAt: string | null;
  endsAt: string | null;
};
export type AdminSection = {
  id: string;
  type: HomeSectionType;
  title: string | null;
  sourceCollectionId: string | null;
  sourceCategoryId: string | null;
  sourceBrandId: string | null;
  settings: Record<string, unknown>;
  bannerIds: string[];
  isVisible: boolean;
  startsAt: string | null;
  endsAt: string | null;
};
export type AdminMenuItem = { label: string; link: Link; children: { label: string; link: Link }[] };
export type AdminPage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
};
export type AdminContent = {
  theme: unknown;
  /** Footer text of the store. */
  description: string | null;
  /** Header logo (null = the store's name is shown). */
  logoUrl: string | null;
  banners: AdminBanner[];
  sections: AdminSection[];
  menus: Record<MenuLocation, AdminMenuItem[]>;
  pages: AdminPage[];
  products: { id: string; name: string }[];
};

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);

const toLink = (
  type: string | null | undefined,
  targetId?: string | null,
  url?: string | null,
): Link | null =>
  !type
    ? null
    : type === "url"
      ? { type: "url", url: url ?? "" }
      : { type: type as Exclude<LinkType, "url">, targetId: targetId ?? "" };

// pg_graphql returns jsonb as a JSON string.
const json = (raw: string | null | undefined): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Everything the Appearance screens edit, read as the signed-in admin (RLS: their store, hidden rows too). */
export function useContent() {
  const store = useStore();
  const { graphql, api } = useSession();
  const [data, setData] = useState<AdminContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    graphql
      .query(AdminContentQuery, { storeId: store.id })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error || !result.data) {
          setError("No se pudo cargar el contenido de la tienda.");
          return;
        }
        setError(null);
        const d = result.data;
        const menu = (location: MenuLocation): AdminMenuItem[] => {
          const items = nodes(
            nodes(d.menusCollection).find((m) => m.location === location)?.menuItemsCollection,
          );
          return items
            .filter((i) => !i.parentId)
            .map((p) => ({
              label: p.label,
              link: toLink(p.linkType, p.linkTargetId, p.linkUrl)!,
              children: items
                .filter((c) => c.parentId === p.id)
                .map((c) => ({ label: c.label, link: toLink(c.linkType, c.linkTargetId, c.linkUrl)! })),
            }));
        };
        setData({
          theme: json(nodes(d.storesCollection)[0]?.theme),
          description: nodes(d.storesCollection)[0]?.description ?? null,
          logoUrl: nodes(d.storesCollection)[0]?.logoUrl ?? null,
          banners: nodes(d.bannersCollection).map((b) => ({
            id: b.id,
            eyebrow: b.eyebrow ?? null,
            title: b.title ?? null,
            subtitle: b.subtitle ?? null,
            ctaLabel: b.ctaLabel ?? null,
            imageUrl: b.imageUrl,
            imageMobileUrl: b.imageMobileUrl ?? null,
            alt: b.alt ?? null,
            productId: b.productId ?? null,
            link: toLink(b.linkType, b.linkTargetId, b.linkUrl),
            isVisible: b.isVisible,
            startsAt: b.startsAt ?? null,
            endsAt: b.endsAt ?? null,
          })),
          sections: nodes(d.homeSectionsCollection).map((s) => ({
            id: s.id,
            type: s.type as HomeSectionType,
            title: s.title ?? null,
            sourceCollectionId: s.sourceCollectionId ?? null,
            sourceCategoryId: s.sourceCategoryId ?? null,
            sourceBrandId: s.sourceBrandId ?? null,
            settings: (json(s.settings) as Record<string, unknown>) ?? {},
            bannerIds: nodes(s.homeSectionBannersCollection).map((b) => b.bannerId),
            isVisible: s.isVisible,
            startsAt: s.startsAt ?? null,
            endsAt: s.endsAt ?? null,
          })),
          menus: { header: menu("header"), footer: menu("footer") },
          pages: nodes(d.pagesCollection).map((p) => ({
            ...p,
            seoTitle: p.seoTitle ?? null,
            seoDescription: p.seoDescription ?? null,
          })),
          products: nodes(d.productsCollection),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [graphql, store.id, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, content: api.content(store.id) };
}

/** "2026-11-01T10:00" (datetime-local) <-> ISO with offset. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
