import { useEffect, useState } from "react";
import { appConfig } from "./config";

// Device cache of the storefront reads (PRP-7 D7): the last answer of each read is shown at once (and offline) and
// refreshed in the background. Small JSON in localStorage, the newest MAX_ENTRIES reads per store.

const PREFIX = `kshop-cache:${appConfig.storeId}:`;
const INDEX = `${PREFIX}__index`;
const MAX_ENTRIES = 80;

type Entry<T> = { at: number; data: T };

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T) {
  try {
    const index = (JSON.parse(localStorage.getItem(INDEX) ?? "[]") as string[]).filter((k) => k !== key);
    index.unshift(key);
    for (const old of index.splice(MAX_ENTRIES)) localStorage.removeItem(PREFIX + old);
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies Entry<T>));
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Storage full or blocked: the app keeps working without the cache.
  }
}

export type Cached<T> = {
  data: T | undefined;
  /** Shown from the device cache because the fresh read failed (offline). */
  stale: boolean;
  error: unknown;
  loading: boolean;
};

/** Read-through cache: cached data first, then the network; an error keeps the cached data. */
export function useCached<T>(key: string, load: () => Promise<T>): Cached<T> {
  const [state, setState] = useState<{ key: string; value: Cached<T> } | null>(null);
  useEffect(() => {
    let active = true;
    const cached = read<T>(key);
    load().then(
      (data) => {
        write(key, data);
        if (active) setState({ key, value: { data, stale: false, error: null, loading: false } });
      },
      (error: unknown) => {
        if (active) setState({ key, value: { data: cached?.data, stale: !!cached, error, loading: false } });
      },
    );
    return () => {
      active = false;
    };
    // `load` is a new closure every render; the key says what is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (state?.key === key) return state.value;
  // Until the network answers: what the device has.
  return { data: read<T>(key)?.data, stale: false, error: null, loading: true };
}
