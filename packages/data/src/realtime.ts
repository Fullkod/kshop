import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime signals (migration 20261106100100_realtime_signals.sql): the database broadcasts a bare «change» on
 *   store:{storeId}      (private) orders, order events and WhatsApp notices of a store
 *   platform             (private) stores, platform invoices and every WhatsApp notice (superadmin)
 *   order:{publicToken}  (public)  the status of one order
 * The signal carries no data: `onChange` reads again through the API. Bursts (a checkout touches several rows) are
 * merged, and a reconnection (phone back online, tab back from sleep) also calls `onChange`, since signals sent
 * meanwhile are lost. Several screens on the same topic share one channel (supabase-js keeps one per topic).
 * Returns the unsubscribe function.
 */
export function subscribeToChanges(
  client: SupabaseClient,
  topic: string,
  onChange: () => void,
  { isPrivate = true, delayMs = 400 }: { isPrivate?: boolean; delayMs?: number } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listener = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, delayMs);
  };
  const shared = join(client, topic, isPrivate);
  shared.listeners.add(listener);
  return () => {
    clearTimeout(timer);
    shared.listeners.delete(listener);
    if (shared.listeners.size) return;
    channels.get(client)?.delete(topic);
    if (shared.channel) void client.removeChannel(shared.channel);
    shared.closed = true;
  };
}

type Shared = { channel: RealtimeChannel | null; listeners: Set<() => void>; closed: boolean };
const channels = new WeakMap<SupabaseClient, Map<string, Shared>>();

function join(client: SupabaseClient, topic: string, isPrivate: boolean): Shared {
  let byTopic = channels.get(client);
  if (!byTopic) channels.set(client, (byTopic = new Map()));
  const existing = byTopic.get(topic);
  if (existing) return existing;
  const shared: Shared = { channel: null, listeners: new Set(), closed: false };
  byTopic.set(topic, shared);
  let joined = false;
  const notify = () => shared.listeners.forEach((l) => l());
  // Private channels authorize with the user's token (RLS on realtime.messages).
  void (isPrivate ? client.realtime.setAuth() : Promise.resolve()).then(() => {
    if (shared.closed) return;
    shared.channel = client
      .channel(topic, { config: { private: isPrivate } })
      .on("broadcast", { event: "change" }, notify)
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (joined) notify();
        joined = true;
      });
  });
  return shared;
}
