"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@kshop/admin";
import { OrderNotices } from "@/features/whatsapp-notifications/components/NotificationsPages";

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  return <OrderDetail key={orderId} orderId={orderId} notices={(id) => <OrderNotices orderId={id} />} />;
}
