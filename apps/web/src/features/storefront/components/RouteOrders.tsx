"use client";

import { MyOrder, OrderView } from "@kshop/storefront";
import { useParams } from "next/navigation";

// The order pages are static shells: the token / order id is read in the browser, so one prerendered page serves all.

export function OrderFromRoute() {
  return <OrderView token={useParams<{ token: string }>().token} />;
}

export function MyOrderFromRoute() {
  return <MyOrder orderId={useParams<{ orderId: string }>().orderId} />;
}
