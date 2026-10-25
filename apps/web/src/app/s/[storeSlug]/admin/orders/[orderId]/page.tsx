"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/features/orders/components/OrderDetail";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  return <OrderDetail key={orderId} orderId={orderId} />;
}
