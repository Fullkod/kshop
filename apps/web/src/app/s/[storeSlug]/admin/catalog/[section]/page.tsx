"use client";

import { Badge } from "@kshop/ui";
import { notFound, useParams } from "next/navigation";
import { AttributesPage } from "@/features/catalog/components/AttributesPage";
import { CategoriesPage } from "@/features/catalog/components/CategoriesPage";
import { CurrenciesPage } from "@/features/catalog/components/CurrenciesPage";
import { ProductTypesPage } from "@/features/catalog/components/ProductTypesPage";
import { categoryOptions } from "@/features/catalog/use-catalog";
import {
  SimpleEntitiesPage,
  type SimpleEntityConfig,
} from "@/features/catalog/components/SimpleEntitiesPage";

const text = (v: string | boolean | undefined) => (typeof v === "string" ? v : "");

const brands: SimpleEntityConfig<"brands"> = {
  resource: "brands",
  title: "Marcas",
  singular: "marca",
  description: "Marcas de los productos; se pueden mostrar y filtrar en la tienda.",
  fields: [
    { key: "name", label: "Nombre", type: "text" },
    { key: "description", label: "Descripción (opcional)", type: "textarea" },
    {
      key: "logoUrl",
      label: "Logo (opcional)",
      type: "image",
      folder: "brands",
      hint: "Sale en la sección «Marcas» de la portada; sin logo se muestra el nombre.",
    },
    { key: "isPublished", label: "Visible en la tienda", type: "checkbox" },
  ],
  rows: (d) => d.brands,
  toInput: (v) => ({
    name: text(v.name),
    description: text(v.description),
    logoUrl: text(v.logoUrl) || undefined,
    isPublished: v.isPublished === true,
  }),
  badges: (r) => (r.isPublished ? null : <Badge variant="muted">Oculta</Badge>),
};

// Automatic collections (phase 2, D8): rules flattened into form fields.
type Rules = {
  categoryId?: string;
  brandId?: string;
  tags?: string[];
  onSale?: boolean;
  newerThanDays?: number;
  featured?: boolean;
  inStock?: boolean;
};
const parseRules = (raw: unknown): Rules | null => {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw) as Rules;
  } catch {
    return null;
  }
};

const collections: SimpleEntityConfig<"collections"> = {
  resource: "collections",
  title: "Colecciones",
  singular: "colección",
  description:
    "Grupos de productos: manuales (Novedades, Ofertas… se asignan desde cada producto) o automáticas, que se llenan solas según unas reglas.",
  fields: [
    { key: "name", label: "Nombre", type: "text" },
    { key: "description", label: "Descripción (opcional)", type: "textarea" },
    {
      key: "imageUrl",
      label: "Foto de portada (opcional)",
      type: "image",
      folder: "collections",
      hint: "Vertical (4:5). Sale en la sección «Colecciones» de la portada.",
    },
    { key: "isPublished", label: "Visible en la tienda", type: "checkbox" },
    {
      key: "auto",
      label: "Automática: incluye los productos que cumplan todas las reglas de abajo",
      type: "checkbox",
      newDefault: false,
      group: "Colección automática",
    },
    {
      key: "ruleCategoryId",
      label: "De la categoría (incluye subcategorías)",
      type: "select",
      options: (d) => categoryOptions(d.categories).map((c) => ({ value: c.id, label: c.label })),
    },
    {
      key: "ruleBrandId",
      label: "De la marca",
      type: "select",
      options: (d) => d.brands.map((b) => ({ value: b.id, label: b.name })),
    },
    { key: "ruleTags", label: "Con alguna de estas etiquetas (separadas por comas)", type: "text" },
    { key: "ruleNewerThanDays", label: "Publicados en los últimos N días", type: "text", placeholder: "30" },
    { key: "ruleOnSale", label: "En oferta (con precio anterior)", type: "checkbox", newDefault: false },
    { key: "ruleFeatured", label: "Destacados", type: "checkbox", newDefault: false },
    { key: "ruleInStock", label: "Con stock disponible", type: "checkbox", newDefault: false },
  ],
  rows: (d) =>
    d.collections.map((c) => {
      const rules = parseRules((c as { rules?: unknown }).rules);
      return {
        ...c,
        auto: rules !== null,
        ruleCategoryId: rules?.categoryId ?? "",
        ruleBrandId: rules?.brandId ?? "",
        ruleTags: rules?.tags?.join(", ") ?? "",
        ruleNewerThanDays: rules?.newerThanDays ? String(rules.newerThanDays) : "",
        ruleOnSale: rules?.onSale ?? false,
        ruleFeatured: rules?.featured ?? false,
        ruleInStock: rules?.inStock ?? false,
      };
    }),
  toInput: (v) => {
    const days = Number.parseInt(text(v.ruleNewerThanDays), 10);
    const tags = text(v.ruleTags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      name: text(v.name),
      description: text(v.description),
      imageUrl: text(v.imageUrl) || undefined,
      isPublished: v.isPublished === true,
      rules:
        v.auto === true
          ? {
              ...(text(v.ruleCategoryId) && { categoryId: text(v.ruleCategoryId) }),
              ...(text(v.ruleBrandId) && { brandId: text(v.ruleBrandId) }),
              ...(tags.length && { tags }),
              ...(Number.isFinite(days) && days > 0 && { newerThanDays: days }),
              ...(v.ruleOnSale === true && { onSale: true }),
              ...(v.ruleFeatured === true && { featured: true }),
              ...(v.ruleInStock === true && { inStock: true }),
            }
          : null,
    };
  },
  badges: (r) => (
    <>
      {r.auto ? <Badge>Automática</Badge> : null}
      {r.isPublished ? null : <Badge variant="muted">Oculta</Badge>}
    </>
  ),
};

const warehouses: SimpleEntityConfig<"warehouses"> = {
  resource: "warehouses",
  title: "Almacenes",
  singular: "almacén",
  description: "Dónde está tu mercancía. Con varios almacenes (plan Pro) el stock se lleva por almacén.",
  fields: [
    { key: "name", label: "Nombre", type: "text" },
    { key: "address", label: "Dirección (opcional)", type: "text" },
    { key: "phone", label: "Teléfono (opcional)", type: "text" },
    { key: "isPickupPoint", label: "Punto de recogida para clientes", type: "checkbox" },
    { key: "isActive", label: "Activo (su stock cuenta para la venta)", type: "checkbox" },
  ],
  rows: (d) => d.warehouses,
  toInput: (v) => ({
    name: text(v.name),
    address: text(v.address),
    phone: text(v.phone),
    isPickupPoint: v.isPickupPoint === true,
    isActive: v.isActive === true,
  }),
  badges: (r) => (
    <>
      {r.isDefault ? <Badge>Principal</Badge> : null}
      {r.isActive ? null : <Badge variant="muted">Inactivo</Badge>}
    </>
  ),
  createBlocked: (d, has) =>
    d.warehouses.length >= 1 && !has("multi_warehouse") ? "Más almacenes: plan Pro" : null,
  canDelete: (r) => !r.isDefault,
};

export default function CatalogSectionPage() {
  const { section } = useParams<{ section: string }>();
  switch (section) {
    case "categories":
      return <CategoriesPage />;
    case "attributes":
      return <AttributesPage />;
    case "product-types":
      return <ProductTypesPage />;
    case "currencies":
      return <CurrenciesPage />;
    case "brands":
      return <SimpleEntitiesPage config={brands} />;
    case "collections":
      return <SimpleEntitiesPage config={collections} />;
    case "warehouses":
      return <SimpleEntitiesPage config={warehouses} />;
    default:
      notFound();
  }
}
