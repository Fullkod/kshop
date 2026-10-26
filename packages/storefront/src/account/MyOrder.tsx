"use client";

import { ApiError } from "@kshop/data";
import { Link } from "../navigation";
import { useEffect, useState } from "react";
import { useStore } from "../store-context";
import { OrderView } from "../cart/OrderView";
import { RequireCustomer } from "./AccountView";
import { useCustomerSession } from "./CustomerSession";

// /account/orders/{id}: the order of a customer with an account, inside its profile (link of the WhatsApp
// notices, decision 24). Asks to sign in first; another customer's order is simply not found.
export function MyOrder({ orderId }: { orderId: string }) {
  return (
    <RequireCustomer path={`/account/orders/${orderId}`}>
      <MyOrderBody orderId={orderId} />
    </RequireCustomer>
  );
}

function MyOrderBody({ orderId }: { orderId: string }) {
  const store = useStore();
  const { api } = useCustomerSession();
  const [token, setToken] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .customer(store.id)
      .order(orderId)
      .then(
        (r) => !cancelled && setToken(r.publicToken),
        (e: unknown) => !cancelled && e instanceof ApiError && setMissing(true),
      );
    return () => {
      cancelled = true;
    };
  }, [api, store.id, orderId]);

  if (missing) {
    return (
      <p className="py-12 text-center">
        No encontramos este pedido en tu cuenta.{" "}
        <Link href="/account" className="underline">
          Ver mis pedidos
        </Link>
      </p>
    );
  }
  if (!token) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/account" className="text-sm underline">
        ← Mis pedidos
      </Link>
      <OrderView token={token} />
    </div>
  );
}
