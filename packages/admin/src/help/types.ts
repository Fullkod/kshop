/**
 * In-app help content model (KSH0005, after Tasknic's PRP-009). ONE source of truth: the «?» dialog, the Ayuda
 * page, the Markdown/PDF exports and the search index are all generated from `HelpContent`. Identifiers in
 * English, copy in Spanish with «tú».
 */

/** Who the piece of content is for. A reader can match several. */
export type HelpAudience = "owner" | "staff" | "superadmin";

/** Screens and tabs that carry a contextual «?» button (store admin, Kshop Admin and superadmin). */
export const HELP_CONTEXTS = [
  // Store admin
  "home",
  "orders",
  "order",
  "order-new",
  "customers",
  "payment-methods",
  "shipping",
  "discounts",
  "vouchers",
  "whatsapp",
  "whatsapp-templates",
  "whatsapp-log",
  "pos",
  "products",
  "product",
  "categories",
  "attributes",
  "product-types",
  "brands",
  "collections",
  "warehouses",
  "currencies",
  "excel-import",
  "multi-warehouse",
  "multi-warehouse-movements",
  "multi-warehouse-transfer",
  "multi-currency",
  "themes",
  "themes-home",
  "themes-banners",
  "themes-menus",
  "themes-pages",
  "custom-domain",
  "mobile-app",
  "sales-today",
  "finance",
  "finance-breakdown",
  "finance-expenses",
  "finance-inventory",
  "finance-margin",
  "billing",
  "team",
  // Superadmin
  "superadmin-stores",
  "superadmin-store",
  "superadmin-store-new",
  "superadmin-plans",
  "superadmin-billing",
  "superadmin-domains",
  "superadmin-apps",
  "superadmin-whatsapp",
] as const;
export type HelpContext = (typeof HELP_CONTEXTS)[number];

/** Where a screenshot must be taken from (contract for `scripts/help-shots.mjs`). */
export interface ScreenshotSpec {
  /** kebab-case, unique; file is `apps/web/public/help/screens/<slug>.png` */
  slug: string;
  /** What must be visible in the shot (for the person reviewing it). */
  description: string;
  /** Admin route of the Tienda Demo (`/admin/...`) or superadmin route (`/superadmin/...`). */
  route: string;
  viewport: "desktop" | "mobile";
  /** Extra steps the capture script performs before shooting (click, open a dialog…). */
  setup?: string[];
}

export interface HelpStep {
  text: string;
  /** Screenshot slug shown under this step. */
  screenshot?: string;
}

export interface HelpArticle {
  slug: string;
  /** Task-oriented title, e.g. «Me llegó un pedido». */
  title: string;
  summary: string;
  audiences: HelpAudience[];
  /** Words people would type when looking for this. */
  keywords: string[];
  /** Screens whose «?» opens this article. */
  contexts?: HelpContext[];
  steps: HelpStep[];
  tips?: string[];
  /** Slugs of related articles. */
  related?: string[];
}

export interface FirstDayStep {
  id: string;
  title: string;
  detail: string;
  audiences: HelpAudience[];
  /** Admin route the step points to. */
  link?: string;
  screenshot?: string;
}

export interface GlossaryEntry {
  term: string;
  /** Visual mark as shown in the app (chip text, badge). */
  badge?: string;
  definition: string;
  audiences: HelpAudience[];
  related?: string[];
  screenshot?: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
  audiences: HelpAudience[];
  related?: string[];
}

export interface HelpContent {
  /** Version label shown in the exports; bump when the guides change materially. */
  version: string;
  screenshots: ScreenshotSpec[];
  firstDay: FirstDayStep[];
  articles: HelpArticle[];
  glossary: GlossaryEntry[];
  faq: FaqEntry[];
}

export const HELP_AUDIENCE_LABEL: Record<HelpAudience, string> = {
  owner: "Dueño o administrador",
  staff: "Empleado",
  superadmin: "Superadmin",
};
