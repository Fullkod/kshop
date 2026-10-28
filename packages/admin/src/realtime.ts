"use client";

import { subscribeToChanges } from "@kshop/data";
import { useEffect, useState } from "react";
import { useSession } from "./session";

/**
 * A counter that goes up whenever the database signals a change on `topic` (see subscribeToChanges). Screens add it
 * to the dependencies of their read, so they read again on their own: new orders, status changes, WhatsApp notices.
 * Private topics need the staff session; null subscribes to nothing. With `tables`, only changes of those tables
 * count (and reconnections, when anything may have changed).
 */
export function useRealtimeVersion(topic: string | null, tables?: readonly string[]): number {
  const { supabase, session } = useSession();
  const userId = session?.user.id;
  const [version, setVersion] = useState(0);
  const tableKey = tables?.join(",") ?? "";
  useEffect(() => {
    if (!topic || !userId) return;
    const wanted = tableKey ? new Set(tableKey.split(",")) : null;
    return subscribeToChanges(supabase, topic, (changed) => {
      if (!wanted || !changed || [...changed].some((t) => wanted.has(t))) setVersion((v) => v + 1);
    });
  }, [supabase, topic, userId, tableKey]);
  return version;
}

/** The order tables: lists, order pages and the bell ignore the WhatsApp notices of the store (R11). */
export const ORDER_TABLES = ["orders", "order_events"] as const;

/** Changes of a store: its orders, order events and WhatsApp notices (or only `tables`). */
export const useStoreVersion = (storeId: string | null | undefined, tables?: readonly string[]) =>
  useRealtimeVersion(storeId ? `store:${storeId}` : null, tables);
