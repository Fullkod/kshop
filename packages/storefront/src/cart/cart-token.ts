// Guest cart handle (D8), per store and per browser. The cart itself lives in the database.

const key = (storeId: string) => `kshop:cart:${storeId}`;

export function getCartToken(storeId: string): string | undefined {
  try {
    return window.localStorage.getItem(key(storeId)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setCartToken(storeId: string, token: string): void {
  try {
    window.localStorage.setItem(key(storeId), token);
  } catch {
    // Private mode without storage: the cart lives only for this page.
  }
}

export function clearCartToken(storeId: string): void {
  try {
    window.localStorage.removeItem(key(storeId));
  } catch {
    // Nothing to clear.
  }
}
