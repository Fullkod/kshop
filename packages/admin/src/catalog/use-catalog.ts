"use client";

import { hasMinRole, type AttributeInputType, type CurrencyCode } from "@kshop/core";
import { ApiError, asResult } from "@kshop/data";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../admin-context";
import { useSession } from "../session";
import { useStore } from "@kshop/storefront";

export type AttributeValue = { id: string; name: string; slug: string; value: string | null };
export type Attribute = {
  id: string;
  name: string;
  slug: string;
  inputType: AttributeInputType;
  unit: string | null;
  valueRequired: boolean;
  visibleInStorefront: boolean;
  filterableInStorefront: boolean;
  values: AttributeValue[];
};
export type ProductType = {
  id: string;
  name: string;
  slug: string;
  hasVariants: boolean;
  isShippingRequired: boolean;
  attributes: { attributeId: string; scope: "product" | "variant"; variantSelection: boolean }[];
};
export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  depth: number;
  description: string | null;
  /** Photo of the home category grid. */
  imageUrl: string | null;
};
export type Brand = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  isPublished: boolean;
};
export type Collection = Omit<Brand, "logoUrl"> & {
  /** Cover of the home collection cards. */
  imageUrl: string | null;
};
export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isPickupPoint: boolean;
  isActive: boolean;
};
export type StoreCurrency = {
  currency: CurrencyCode;
  isBase: boolean;
  sells: boolean;
  rateToBase: number;
  rounding: number | null;
};

export type CatalogStructure = {
  attributes: Attribute[];
  productTypes: ProductType[];
  categories: Category[];
  brands: Brand[];
  collections: Collection[];
  warehouses: Warehouse[];
  currencies: StoreCurrency[];
};

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);

/** Loads the store's catalog structure (attributes, types, categories…). */
export function useCatalogStructure() {
  const store = useStore();
  const { reads } = useSession();
  const [data, setData] = useState<CatalogStructure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    asResult(reads.catalogStructure(store.id)).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError("No se pudo cargar el catálogo.");
        return;
      }
      setError(null);
      const d = result.data;
      setData({
        attributes: nodes(d.attributesCollection).map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          inputType: a.inputType as AttributeInputType,
          unit: a.unit ?? null,
          valueRequired: a.valueRequired,
          visibleInStorefront: a.visibleInStorefront,
          filterableInStorefront: a.filterableInStorefront,
          values: nodes(a.attributeValuesCollection).map((v) => ({ ...v, value: v.value ?? null })),
        })),
        productTypes: nodes(d.productTypesCollection).map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          hasVariants: t.hasVariants,
          isShippingRequired: t.isShippingRequired,
          attributes: nodes(t.productTypeAttributesCollection).map((x) => ({
            attributeId: x.attributeId,
            scope: x.scope as "product" | "variant",
            variantSelection: x.variantSelection,
          })),
        })),
        categories: nodes(d.categoriesCollection).map((c) => ({
          ...c,
          parentId: c.parentId ?? null,
          description: c.description ?? null,
          imageUrl: c.imageUrl ?? null,
        })),
        brands: nodes(d.brandsCollection).map((b) => ({
          ...b,
          description: b.description ?? null,
          logoUrl: b.logoUrl ?? null,
        })),
        collections: nodes(d.collectionsCollection).map((c) => ({
          ...c,
          description: c.description ?? null,
          imageUrl: c.imageUrl ?? null,
        })),
        warehouses: nodes(d.warehousesCollection).map((w) => ({
          ...w,
          address: w.address ?? null,
          phone: w.phone ?? null,
        })),
        currencies: nodes(d.storeCurrenciesCollection).map((c) => ({
          currency: c.currency as CurrencyCode,
          isBase: c.isBase,
          sells: c.sells,
          rateToBase: Number(c.rateToBase),
          rounding: c.rounding == null ? null : Number(c.rounding),
        })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reads, store.id, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

/** Catalog API bound to the current store, plus the caller's permissions. */
export function useCatalogApi() {
  const store = useStore();
  const { api } = useSession();
  const admin = useAdmin();
  return {
    catalog: api.catalog(store.id),
    canManageStructure: admin.role === null || hasMinRole(admin.role, "admin"),
    canDelete: admin.role === null || hasMinRole(admin.role, "admin"),
    seesCosts: admin.role === null || hasMinRole(admin.role, "admin"),
    has: (code: Parameters<typeof admin.enabledModules.has>[0]) => admin.enabledModules.has(code),
  };
}

/** Runs an API call and keeps its error message (and field errors) for the form. */
export function useApiAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      return await action();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldErrors(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      } else {
        setError("Algo salió mal. Inténtalo de nuevo.");
      }
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, fieldErrors, setError };
}

/** Categories as "Mujer › Vestidos" labels, in tree order. */
export function categoryOptions(categories: Category[]): { id: string; label: string; depth: number }[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (parentId: string | null, prefix: string) => {
    for (const c of byParent.get(parentId) ?? []) {
      const label = prefix ? `${prefix} › ${c.name}` : c.name;
      out.push({ id: c.id, label, depth: c.depth });
      walk(c.id, label);
    }
  };
  walk(null, "");
  return out;
}
