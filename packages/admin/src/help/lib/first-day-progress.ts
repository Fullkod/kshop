/**
 * «Tu primer día» progress and the audience filter live in this browser only (no table, no sync). Read them with
 * useSyncExternalStore(subscribeHelpStorage, …): the server renders the defaults, the browser its own values.
 */
const FIRST_DAY_KEY = "kshop:help-first-day";
const AUDIENCE_KEY = "kshop:help-audience";

const listeners = new Set<() => void>();

export function subscribeHelpStorage(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice lasts until the page closes (the component keeps it).
  }
  for (const l of listeners) l();
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Raw JSON (a string, so the snapshot is stable between renders). */
export function readFirstDayRaw(): string {
  return read(FIRST_DAY_KEY) ?? "[]";
}

export function parseFirstDay(raw: string): Set<string> {
  try {
    const ids = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveFirstDayDone(ids: Set<string>): void {
  write(FIRST_DAY_KEY, JSON.stringify([...ids]));
}

export function loadHelpAudience(): string | null {
  return read(AUDIENCE_KEY);
}

export function saveHelpAudience(value: string): void {
  write(AUDIENCE_KEY, value);
}
