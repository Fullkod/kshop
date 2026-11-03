"use client";

import { OrderDetail } from "@kshop/admin";
import { OrderNotices } from "@/features/whatsapp-notifications/components/NotificationsPages";
import { useRouteParam } from "@/lib/use-route-param";

export default function OrderPage() {
  const orderId = useRouteParam("orderId");
  return <OrderDetail key={orderId} orderId={orderId} notices={(id) => <OrderNotices orderId={id} />} />;
}
