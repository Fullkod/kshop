import { z } from "zod";
import type { ModuleCode } from "./modules";

// R12: visibility of the admin menu sections, set by the superadmin store by store. A section is a non-core module;
// the basic ones (Inicio, Pedidos, Clientes, Catálogo, Plan y facturación, Equipo) are never configurable
// (Roberto, 2026-10-28). Must match the check of public.store_section_settings.section; a test checks both lists.
export const CONFIGURABLE_SECTIONS = [
  "shipping",
  "discounts",
  "vouchers",
  "whatsapp_notifications",
  "excel_import",
  "multi_warehouse",
  "multi_currency",
  "themes",
  "custom_domain",
  "mobile_app",
  "sales_today",
  "finance",
] as const satisfies readonly ModuleCode[];

export type ConfigurableSection = (typeof CONFIGURABLE_SECTIONS)[number];

export const SECTION_VISIBILITIES = ["visible", "managed", "hidden"] as const;
export type SectionVisibility = (typeof SECTION_VISIBILITIES)[number];

/** Sections that are not visible (no entry = visible), as admin_bootstrap and api_guard return them. */
export type SectionSettings = Partial<Record<ConfigurableSection, Exclude<SectionVisibility, "visible">>>;

export const SECTION_VISIBILITY_LABELS: Record<SectionVisibility, string> = {
  visible: "Visible",
  managed: "Gestionado por admin",
  hidden: "Oculto",
};

export const MANAGED_SECTION_MESSAGE =
  "Esta sección la gestiona el administrador. Escríbenos para cualquier cambio.";

export function isConfigurableSection(value: string): value is ConfigurableSection {
  return (CONFIGURABLE_SECTIONS as readonly string[]).includes(value);
}

export function sectionVisibility(settings: SectionSettings | undefined, code: string): SectionVisibility {
  return isConfigurableSection(code) ? (settings?.[code] ?? "visible") : "visible";
}

export const sectionVisibilityInputSchema = z.object({
  section: z.enum(CONFIGURABLE_SECTIONS),
  visibility: z.enum(SECTION_VISIBILITIES),
});
export type SectionVisibilityInput = z.infer<typeof sectionVisibilityInputSchema>;
