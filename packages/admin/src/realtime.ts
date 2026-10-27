"use client";

import { subscribeToChanges } from "@kshop/data";
import { useEffect, useState } from "react";
import { useSession } from "./session";

/**
 * A counter that goes up whenever the database signals a change on `topic` (see subscribeToChanges). Screens add it
 * to the dependencies of their read, so they read again on their own: new orders, status changes, WhatsApp notices.
 * Private topics need the staff session; null subscribes to nothing.
 */
export function useRealtimeVersion(topic: string | null): number {
  const { supabase, session } = useSession();
  const userId = session?.user.id;
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!topic || !userId) return;
    return subscribeToChanges(supabase, topic, () => setVersion((v) => v + 1));
  }, [supabase, topic, userId]);
  return version;
}

/** Changes of a store: its orders, order events and WhatsApp notices. */
export const useStoreVersion = (storeId: string | null | undefined) =>
  useRealtimeVersion(storeId ? `store:${storeId}` : null);
