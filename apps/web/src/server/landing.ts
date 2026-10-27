import "server-only";
import type { BillingModule, BillingPlan } from "@kshop/data";
import { cacheLife, cacheTag } from "next/cache";
import { getBillingSettings, getPlans, LANDING_CACHE_TAG } from "./billing";
import { getStoreBySlug, type PublicStore } from "./stores";

// Platform landing (redesign R7): prices, limits and add-ons come from the plans tables and the CTAs open the
// superadmin's support WhatsApp (Superadmin › Facturación). Editing either expires this cache.

/** The permanent example store (pnpm demo:seed) drawn in the phone and the theme picker. */
const DEMO_SLUG = "demo";

export type LandingData = {
  plans: BillingPlan[];
  modules: BillingModule[];
  /** Cheapest add-on over the Base plan, null when no module is sold separately. */
  minAddonPrice: number | null;
  trialDays: number;
  supportWhatsapp: string | null;
};

export async function getLandingData(): Promise<LandingData> {
  "use cache";
  cacheTag(LANDING_CACHE_TAG);
  cacheLife("hours");
  const [{ plans, modules }, settings] = await Promise.all([getPlans(), getBillingSettings()]);
  const addons = modules.flatMap((m) => (m.addonPrice == null ? [] : [m.addonPrice]));
  return {
    plans: plans.filter((p) => p.isPublic),
    modules,
    minAddonPrice: addons.length ? Math.min(...addons) : null,
    trialDays: settings.defaultTrialDays,
    supportWhatsapp: settings.supportWhatsapp,
  };
}

/** The permanent demo store, or null where it does not exist or is closed (the landing then shows no store). */
export async function getLandingDemoStore(): Promise<PublicStore | null> {
  const store = await getStoreBySlug(DEMO_SLUG);
  return store && store.status !== "suspended" && store.status !== "archived" ? store : null;
}
