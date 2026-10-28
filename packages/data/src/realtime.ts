import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime signals (migration 20261106100100_realtime_signals.sql): the database broadcasts a bare «change» on
 *   store:{storeId}      (private) orders, order events and WhatsApp notices of a store
 *   platform             (private) stores, platform invoices and every WhatsApp notice (superadmin)
 *   order:{publicToken}  (public)  the status of one order
 * The signal carries no row data, only { table, op }: `onChange` reads again through the API and gets the tables
 * that changed (R11: lists skip the WhatsApp notices). Bursts (a checkout touches several rows) are merged, and a
 * reconnection (phone back online, tab back from sleep) calls `onChange(null)` = anything may have changed, since
 * signals sent meanwhile are lost. Several screens on the same topic share one channel (supabase-js keeps one per topic).
 * Returns the unsubscribe function.
 */
export function subscribeToChanges(
  client: SupabaseClient,
  topic: string,
  onChange: (tables: ReadonlySet<string> | null) => void,
  { isPrivate = true, delayMs = 400 }: { isPrivate?: boolean; delayMs?: number } = {},
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Tables seen in the current burst; null once anything may have changed (reconnection, a signal without table).
  let tables: Set<string> | null = new Set();
  const listener = (table: string | null) => {
    if (table === null) tables = null;
    else tables?.add(table);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const changed = tables;
      tables = new Set();
      onChange(changed);
    }, delayMs);
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

type Listener = (table: string | null) => void;
type Shared = { channel: RealtimeChannel | null; listeners: Set<Listener>; closed: boolean };
const channels = new WeakMap<SupabaseClient, Map<string, Shared>>();

function join(client: SupabaseClient, topic: string, isPrivate: boolean): Shared {
  let byTopic = channels.get(client);
  if (!byTopic) channels.set(client, (byTopic = new Map()));
  const existing = byTopic.get(topic);
  if (existing) return existing;
  const shared: Shared = { channel: null, listeners: new Set(), closed: false };
  byTopic.set(topic, shared);
  let joined = false;
  const notify = (table: string | null) => shared.listeners.forEach((l) => l(table));
  // Private channels authorize with the user's token (RLS on realtime.messages).
  void (isPrivate ? client.realtime.setAuth() : Promise.resolve()).then(() => {
    if (shared.closed) return;
    shared.channel = client
      .channel(topic, { config: { private: isPrivate } })
      .on("broadcast", { event: "change" }, (message: { payload?: { table?: unknown } }) =>
        notify(typeof message.payload?.table === "string" ? message.payload.table : null),
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        if (joined) notify(null);
        joined = true;
      });
  });
  return shared;
}
