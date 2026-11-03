"use client";

import { MyOrder, OrderView } from "@kshop/storefront";
import { useRouteParam } from "@/lib/use-route-param";

// The order pages are static shells: the token / order id is read in the browser, so one prerendered page serves all.

export function OrderFromRoute() {
  return <OrderView token={useRouteParam("token")} />;
}

export function MyOrderFromRoute() {
  return <MyOrder orderId={useRouteParam("orderId")} />;
}
