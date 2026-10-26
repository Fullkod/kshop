"use client";

import type { CurrencyCode, ShippingType } from "@kshop/core";
import { CheckoutSettingsQuery } from "@kshop/data";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

export type ShippingZone = { id: string; name: string; description: string | null; isActive: boolean };
export type ShippingMethod = {
  id: string;
  zoneId: string | null;
  type: ShippingType;
  name: string;
  price: number;
  freeOverSubtotal: number | null;
  warehouseId: string | null;
  minDays: number | null;
  maxDays: number | null;
  isActive: boolean;
};
export type PaymentMethod = {
  id: string;
  name: string;
  currencies: CurrencyCode[];
  instructions: string | null;
  isActive: boolean;
};
export type CheckoutSettings = {
  orderPrefix: string;
  whatsappPhone: string | null;
  baseCurrency: CurrencyCode;
  zones: ShippingZone[];
  methods: ShippingMethod[];
  paymentMethods: PaymentMethod[];
  warehouses: { id: string; name: string; address: string | null; isPickupPoint: boolean; isActive: boolean }[];
};

const nodes = <T>(c: { edges: { node: T }[] } | null | undefined): T[] => (c?.edges ?? []).map((e) => e.node);
const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

/** Store order prefix, shipping and payment settings (pg_graphql as the staff; inactive rows included). */
export function useCheckoutSettings() {
  const store = useStore();
  const { graphql } = useSession();
  const [data, setData] = useState<CheckoutSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    graphql
      .query(CheckoutSettingsQuery, { storeId: store.id })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const d = result.data;
        const storeRow = nodes(d?.storesCollection)[0];
        if (result.error || !d || !storeRow) {
          setError("No se pudieron cargar los ajustes de pedidos.");
          return;
        }
        setData({
          orderPrefix: storeRow.orderPrefix,
          whatsappPhone: storeRow.whatsappPhone ?? null,
          baseCurrency: storeRow.baseCurrency as CurrencyCode,
          zones: nodes(d.shippingZonesCollection).map((z) => ({ ...z, description: z.description ?? null })),
          methods: nodes(d.shippingMethodsCollection).map((m) => ({
            id: m.id,
            zoneId: m.zoneId ?? null,
            type: m.type as ShippingType,
            name: m.name,
            price: Number(m.price),
            freeOverSubtotal: num(m.freeOverSubtotal),
            warehouseId: m.warehouseId ?? null,
            minDays: m.minDays ?? null,
            maxDays: m.maxDays ?? null,
            isActive: m.isActive,
          })),
          paymentMethods: nodes(d.paymentMethodsCollection).map((p) => ({
            id: p.id,
            name: p.name,
            currencies: (p.currencies ?? []).filter((c): c is CurrencyCode => !!c) as CurrencyCode[],
            instructions: p.instructions ?? null,
            isActive: p.isActive,
          })),
          warehouses: nodes(d.warehousesCollection).map((w) => ({ ...w, address: w.address ?? null })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [graphql, store.id, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}
