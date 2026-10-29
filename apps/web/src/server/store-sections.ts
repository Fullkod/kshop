import "server-only";
import type { SectionSettings, SectionVisibilityInput } from "@kshop/core";
import { notFound } from "./http";
import { getServiceClient } from "./supabase";

// R12: visibility of the admin menu sections of a store (public.store_section_settings; no row = visible). Only the
// superadmin's API writes it. The open admin of the store hears the change through Realtime (store:{id}).

export async function getStoreSections(storeId: string): Promise<SectionSettings> {
  const { data, error } = await getServiceClient()
    .from("store_section_settings")
    .select("section, visibility")
    .eq("store_id", storeId);
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.section, r.visibility])) as SectionSettings;
}

export async function setStoreSection(
  storeId: string,
  { section, visibility }: SectionVisibilityInput,
  actor: string,
): Promise<void> {
  const db = getServiceClient();
  const { error } =
    visibility === "visible"
      ? await db.from("store_section_settings").delete().eq("store_id", storeId).eq("section", section)
      : await db
          .from("store_section_settings")
          .upsert({
            store_id: storeId,
            section,
            visibility,
            updated_by: actor,
            updated_at: new Date().toISOString(),
          });
  // 23503: the store does not exist.
  if (error?.code === "23503") throw notFound("Tienda");
  if (error) throw error;
}
