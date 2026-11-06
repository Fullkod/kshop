import type { StoreRole } from "@kshop/core";
import type { HelpAudience, HelpContext } from "../types";

/** Owners and administrators read the owner's help; a superadmin inside a store too. */
export function helpViewerForRole(role: StoreRole | null | undefined): HelpAudience {
  return role === "staff" ? "staff" : "owner";
}

/** Filter value on the Ayuda page: everything or one audience. */
export type HelpAudienceFilter = "all" | HelpAudience;

/** Title of the «?» dialog: «Ayuda · <vista>». */
export const HELP_CONTEXT_LABEL: Record<HelpContext, string> = {
  home: "Inicio",
  orders: "Pedidos",
  order: "Pedido",
  "order-new": "Nuevo pedido",
  customers: "Clientes",
  "payment-methods": "Métodos de pago",
  shipping: "Entregas",
  discounts: "Ofertas",
  vouchers: "Cupones",
  whatsapp: "Avisos WhatsApp",
  "whatsapp-templates": "Mensajes de WhatsApp",
  "whatsapp-log": "Historial de WhatsApp",
  pos: "Caja",
  "pos-closings": "Cierres de caja",
  products: "Productos",
  product: "Producto",
  categories: "Categorías",
  attributes: "Atributos",
  "product-types": "Tipos de producto",
  brands: "Marcas",
  collections: "Colecciones",
  warehouses: "Almacenes",
  currencies: "Monedas",
  "excel-import": "Importar Excel",
  "multi-warehouse": "Almacenes",
  "multi-warehouse-movements": "Movimientos de stock",
  "multi-warehouse-transfer": "Traspasar stock",
  "multi-currency": "Monedas",
  themes: "Apariencia",
  "themes-home": "Portada",
  "themes-banners": "Banners",
  "themes-menus": "Menús",
  "themes-pages": "Páginas",
  "custom-domain": "Dominio propio",
  "mobile-app": "App móvil",
  "sales-today": "Ventas de hoy",
  finance: "Finanzas",
  "finance-breakdown": "Desglose",
  "finance-expenses": "Gastos",
  "finance-inventory": "Inventario",
  "finance-margin": "Margen",
  billing: "Plan y facturación",
  team: "Equipo",
  "superadmin-stores": "Tiendas",
  "superadmin-store": "Ficha de la tienda",
  "superadmin-store-new": "Nueva tienda",
  "superadmin-plans": "Planes",
  "superadmin-billing": "Facturación",
  "superadmin-domains": "Dominios",
  "superadmin-apps": "Apps",
  "superadmin-whatsapp": "WhatsApp",
};

/** Screenshots live in `apps/web/public/help/screens/`; in Kshop Admin `base` is the platform URL. */
export function screenshotUrl(slug: string, base = ""): string {
  return `${base.replace(/\/$/, "")}/help/screens/${slug}.png`;
}

export function matchesAudience(audiences: HelpAudience[], filter: HelpAudienceFilter): boolean {
  return filter === "all" || audiences.includes(filter);
}

/** What a reader is shown by default: an owner also sees the staff's guides; the staff only theirs. */
export function visibleTo(audiences: HelpAudience[], viewer: HelpAudience): boolean {
  return viewer === "owner"
    ? audiences.includes("owner") || audiences.includes("staff")
    : audiences.includes(viewer);
}

/** Store admin help (owners and staff) or the superadmin's: each one only lists its own content. */
export type HelpScope = "store" | "superadmin";

export function inScope(audiences: HelpAudience[], scope: HelpScope): boolean {
  return scope === "superadmin"
    ? audiences.includes("superadmin")
    : audiences.includes("owner") || audiences.includes("staff");
}

/** Downloads served by the web under `/help/` (Markdown by a static route, the PDF by `help:pdf`). */
export const HELP_MARKDOWN_FILES: Record<
  string,
  { scope: HelpScope; audience?: HelpAudience; label: string }
> = {
  "kshop-ayuda.md": { scope: "store", label: "Markdown (todo)" },
  "kshop-ayuda-dueno.md": { scope: "store", audience: "owner", label: "Markdown (dueño)" },
  "kshop-ayuda-empleado.md": { scope: "store", audience: "staff", label: "Markdown (empleado)" },
  "kshop-ayuda-superadmin.md": { scope: "superadmin", label: "Markdown (superadmin)" },
};
export const HELP_PDF_FILE = "kshop-ayuda.pdf";

/** Section anchors shared by the page, the Markdown export and the search index. */
export const HELP_ANCHORS = {
  firstDay: "primer-dia",
  guides: "guias",
  glossary: "glosario",
  faq: "faq",
} as const;

export function articleAnchor(slug: string): string {
  return `guia-${slug}`;
}
