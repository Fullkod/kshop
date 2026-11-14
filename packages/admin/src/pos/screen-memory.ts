// What a closings screen had when the owner opened an order from it, so «atrás» finds the same list, filter and spot
// (Minimercado, 2026-11-14). In memory: it lasts while the app or the tab is open, which is what going back needs.

const states = new Map<string, unknown>();
const scrolls = new Map<string, number>();

export function rememberedState<T>(key: string): T | undefined {
  return states.get(key) as T | undefined;
}

export function rememberState(key: string, value: unknown) {
  states.set(key, value);
}

/** Called when leaving the screen for an order: the scroll to go back to. */
export function rememberScroll(key: string) {
  scrolls.set(key, window.scrollY);
}

/** After the list is drawn again: back to where it was (once). */
export function restoreScroll(key: string) {
  const y = scrolls.get(key);
  if (y === undefined) return;
  scrolls.delete(key);
  requestAnimationFrame(() => window.scrollTo(0, y));
}

/**
 * Writes a parameter into the address without navigating (typing must not reload the screen). Keeps the router's
 * history state, which both Next and react-router read on «atrás».
 */
export function setUrlParam(name: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/** The address of this screen to come back to from an order (its «Volver» on the web, see AdminShell). */
export function currentHref(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}
