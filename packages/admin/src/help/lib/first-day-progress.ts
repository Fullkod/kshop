/** «Tu primer día» progress and the audience filter live in this browser only (no table, no sync). */
const FIRST_DAY_KEY = "kshop:help-first-day";
const AUDIENCE_KEY = "kshop:help-audience";

export function loadFirstDayDone(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRST_DAY_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveFirstDayDone(ids: Set<string>): void {
  try {
    localStorage.setItem(FIRST_DAY_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode or blocked storage: progress simply does not persist.
  }
}

export function loadHelpAudience(): string | null {
  try {
    return localStorage.getItem(AUDIENCE_KEY);
  } catch {
    return null;
  }
}

export function saveHelpAudience(value: string): void {
  try {
    localStorage.setItem(AUDIENCE_KEY, value);
  } catch {
    // Same as above.
  }
}
