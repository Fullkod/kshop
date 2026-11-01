import type { HelpAudience, HelpContext } from "../types";

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
  discounts: "Promociones",
  vouchers: "Cupones",
  whatsapp: "Avisos por WhatsApp",
  "whatsapp-templates": "Plantillas de WhatsApp",
  "whatsapp-log": "Historial de WhatsApp",
  pos: "Caja",
  "pos-summary": "Resumen de la caja",
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
  "multi-warehouse": "Varios almacenes",
  "multi-warehouse-movements": "Movimientos de stock",
  "multi-warehouse-transfer": "Traslados",
  "multi-currency": "Tasas de cambio",
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
