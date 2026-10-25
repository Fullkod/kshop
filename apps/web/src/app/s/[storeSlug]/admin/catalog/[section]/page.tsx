"use client";

import { Badge } from "@kshop/ui";
import { notFound, useParams } from "next/navigation";
import { AttributesPage } from "@/features/catalog/components/AttributesPage";
import { CategoriesPage } from "@/features/catalog/components/CategoriesPage";
import { CurrenciesPage } from "@/features/catalog/components/CurrenciesPage";
import { ProductTypesPage } from "@/features/catalog/components/ProductTypesPage";
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
    { key: "isPublished", label: "Visible en la tienda", type: "checkbox" },
  ],
  rows: (d) => d.brands,
  toInput: (v) => ({
    name: text(v.name),
    description: text(v.description),
    isPublished: v.isPublished === true,
  }),
  badges: (r) => (r.isPublished ? null : <Badge variant="muted">Oculta</Badge>),
};

const collections: SimpleEntityConfig<"collections"> = {
  resource: "collections",
  title: "Colecciones",
  singular: "colección",
  description: "Grupos de productos elegidos a mano (Novedades, Ofertas…). Se asignan desde cada producto.",
  fields: [
    { key: "name", label: "Nombre", type: "text" },
    { key: "description", label: "Descripción (opcional)", type: "textarea" },
    { key: "isPublished", label: "Visible en la tienda", type: "checkbox" },
  ],
  rows: (d) => d.collections,
  toInput: (v) => ({
    name: text(v.name),
    description: text(v.description),
    isPublished: v.isPublished === true,
  }),
  badges: (r) => (r.isPublished ? null : <Badge variant="muted">Oculta</Badge>),
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
