"use client";

import { OrderList } from "@kshop/admin";
import { useSearchParams } from "next/navigation";

export default function OrdersPage() {
  // ?tab=counter opens the counter sales (Admin › Caja links here).
  const counter = useSearchParams().get("tab") === "counter";
  return <OrderList key={String(counter)} initialTab={counter ? "counter" : "pending"} />;
}
