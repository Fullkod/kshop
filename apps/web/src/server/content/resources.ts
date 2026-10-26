import "server-only";
import {
  bannerInputSchema,
  homeSectionInputSchema,
  pageInputSchema,
  type BannerInput,
  type HomeSectionInput,
  type Link,
  type PageInput,
} from "@kshop/core";
import { revalidateTag } from "next/cache";
import type { ZodType } from "zod";
import { publicEnv } from "@/env";
import { getUserFromBearer } from "../auth";
import { requireCatalogAccess, type CatalogContext } from "../catalog/access";
import { storeMediaPrefix } from "../catalog/products";
import { mapDbError } from "../db-errors";
import { HttpError, uuidParam } from "../http";
import { contentCacheTag } from "../storefront/data";
import { getServiceClient } from "../supabase";

// Storefront content written by /api/v1/stores/{storeId}/content/* (D14): store admins with the themes module.
// store_id comes from the route; rows are written with the service client.

// Roberto (phase 5): the look is set up by the platform. The superadmin edits it in every store; the store's own
// admins only with the themes module (Pro or a grant).
export async function requireContentAccess(request: Request, rawStoreId: string): Promise<CatalogContext> {
  const storeId = uuidParam.parse(rawStoreId);
  const user = await getUserFromBearer(request);
  if (user.isSuperadmin) return { user, storeId };
  return requireCatalogAccess(request, storeId, "admin", "themes");
}

/** Every content write expires the storefront cache of the store now. */
export function invalidateContent(storeId: string): void {
  revalidateTag(contentCacheTag(storeId), { expire: 0 });
}

export type ContentResource<TInput> = {
  table: string;
  entity: string;
  schema: ZodType<TInput>;
  toRow: (input: TInput, storeId: string) => Record<string, unknown>;
  saveChildren?: (storeId: string, id: string, input: TInput) => Promise<void>;
};

const linkColumns = (link: Link | null | undefined) =>
  !link
    ? { link_type: null, link_target_id: null, link_url: null }
    : link.type === "url"
      ? { link_type: "url", link_target_id: null, link_url: link.url }
      : { link_type: link.type, link_target_id: link.targetId, link_url: null };

/** Banner images must be files of this store in store-media (uploaded by the admin). */
function assertStoreImage(storeId: string, url: string | null | undefined) {
  if (url && !url.startsWith(storeMediaPrefix(publicEnv.supabaseUrl, storeId))) {
    throw new HttpError(400, "invalid_media", "La imagen no pertenece a esta tienda.");
  }
}

async function saveSectionBanners(storeId: string, sectionId: string, input: HomeSectionInput) {
  const db = getServiceClient();
  const removed = await db
    .from("home_section_banners")
    .delete()
    .eq("store_id", storeId)
    .eq("section_id", sectionId);
  if (removed.error) mapDbError(removed.error, "La sección");
  const bannerIds = "bannerIds" in input ? input.bannerIds : [];
  if (!bannerIds.length) return;
  const { error } = await db.from("home_section_banners").insert(
    bannerIds.map((bannerId, index) => ({
      store_id: storeId,
      section_id: sectionId,
      banner_id: bannerId,
      sort_order: index,
    })),
  );
  if (error) mapDbError(error, "El banner");
}

const schedule = (i: { isVisible: boolean; startsAt?: string | null; endsAt?: string | null }) => ({
  is_visible: i.isVisible,
  starts_at: i.startsAt ?? null,
  ends_at: i.endsAt ?? null,
});

const resources = {
  banners: {
    table: "banners",
    entity: "El banner",
    schema: bannerInputSchema,
    toRow: (i, storeId) => {
      assertStoreImage(storeId, i.imageUrl);
      assertStoreImage(storeId, i.imageMobileUrl);
      return {
        title: i.title ?? null,
        subtitle: i.subtitle ?? null,
        cta_label: i.ctaLabel ?? null,
        image_url: i.imageUrl,
        image_mobile_url: i.imageMobileUrl ?? null,
        alt: i.alt ?? null,
        ...linkColumns(i.link),
        ...schedule(i),
      };
    },
  } satisfies ContentResource<BannerInput>,
  sections: {
    table: "home_sections",
    entity: "La sección",
    schema: homeSectionInputSchema,
    toRow: (i) => {
      const source = i.type === "product_carousel" ? i.source : null;
      return {
        type: i.type,
        title: i.title ?? null,
        settings: i.settings,
        source_collection_id: source?.kind === "collection" ? source.id : null,
        source_category_id: source?.kind === "category" ? source.id : null,
        source_brand_id: source?.kind === "brand" ? source.id : null,
        ...schedule(i),
      };
    },
    saveChildren: saveSectionBanners,
  } satisfies ContentResource<HomeSectionInput>,
  pages: {
    table: "pages",
    entity: "La página",
    schema: pageInputSchema,
    toRow: (i) => ({
      title: i.title,
      slug: i.slug,
      content: i.content,
      is_published: i.isPublished,
      seo_title: i.seoTitle ?? null,
      seo_description: i.seoDescription ?? null,
    }),
  } satisfies ContentResource<PageInput>,
};

export type ContentResourceName = keyof typeof resources;

export function getContentResource(name: string): ContentResource<unknown> | null {
  return (resources as Record<string, ContentResource<unknown>>)[name] ?? null;
}

/** Tables whose rows can be reordered from the admin. */
export const REORDERABLE_CONTENT = { banners: "banners", sections: "home_sections" } as const;
