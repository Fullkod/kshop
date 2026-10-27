"use client";

import type { CurrencyCode, OrderStatus, PaymentStatus, ShippingType } from "@kshop/core";
import { AdminOrdersQuery, type HomeSummary, type SalesToday } from "@kshop/data";
import { useStore } from "@kshop/storefront";
import { useEffect, useState } from "react";
import { useStoreVersion } from "./realtime";
import { useSession } from "./session";

export type RecentOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: CurrencyCode;
  total: number | null;
  subtotal: number;
  customerName: string;
  customerPhone: string;
  shippingType: ShippingType | null;
  createdAt: string;
  items: number;
};

export type AdminHome = {
  summary: HomeSummary | null;
  /** «Ventas de hoy» (module sales_today): what was received today, per currency. */
  today: SalesToday | null;
  recent: RecentOrder[] | null;
};

/** Data of the admin home (web and Kshop Admin): to do, week, owed, received today and the latest orders. */
export function useAdminHome({
  salesToday,
  recent = 6,
}: {
  salesToday: boolean;
  recent?: number;
}): AdminHome {
  const store = useStore();
  const { api, graphql } = useSession();
  const [data, setData] = useState<AdminHome>({ summary: null, today: null, recent: null });
  // Read again on every order or payment of the store (Realtime).
  const version = useStoreVersion(store.id);

  useEffect(() => {
    let cancelled = false;
    const orders = api.orders(store.id);
    void Promise.all([
      orders.summary().catch(() => null),
      salesToday ? orders.salesToday().catch(() => null) : null,
      graphql
        .query(AdminOrdersQuery, { filter: { storeId: { eq: store.id } }, first: recent })
        .toPromise()
        .then((r) =>
          (r.data?.ordersCollection.edges ?? []).map(({ node: o }) => ({
            id: o.id,
            number: o.number,
            status: o.status as OrderStatus,
            paymentStatus: o.paymentStatus as PaymentStatus,
            currency: String(o.currency) as CurrencyCode,
            total: o.total == null ? null : Number(o.total),
            subtotal: Number(o.subtotal),
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            shippingType: (o.shippingType as ShippingType | null) ?? null,
            createdAt: o.createdAt,
            items: (o.orderLinesCollection?.edges ?? []).reduce((sum, e) => sum + e.node.quantity, 0),
          })),
        ),
    ]).then(([summary, today, list]) => {
      if (!cancelled) setData({ summary, today, recent: list });
    });
    return () => {
      cancelled = true;
    };
  }, [api, graphql, store.id, salesToday, recent, version]);

  return data;
}

/** Change against yesterday in whole percent (null when yesterday had nothing). */
export function dayChange(
  week: HomeSummary["week"],
  pick: (d: { orders: number; amount: number }) => number,
) {
  if (!week || week.length < 2) return null;
  const today = pick(week[week.length - 1]!);
  const yesterday = pick(week[week.length - 2]!);
  return yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null;
}

/** Change against the previous period in whole percent (null when the previous one had nothing). */
export function periodChange(current: number, previous: number): number | null {
  return previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
}

/** «Buenos días / tardes / noches» by the local hour. */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}
