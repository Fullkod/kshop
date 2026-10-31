import type { PosSaleInput } from "@kshop/core";
import type { ApiClient, PaymentRates, PosCatalogItem, PosCatalogPage } from "@kshop/data";

// What the phone keeps for the counter (PRP pos-offline D7). The catalog can always be downloaded again; a sale is money
// that exists nowhere else until it is uploaded, so the app keeps sales in native files and the web in IndexedDB.

export type PosCatalogSnapshot = {
  storeId: string;
  currency: PosCatalogPage["currency"];
  paymentMethods: { id: string; name: string }[];
  items: PosCatalogItem[];
  /** The suggestion for a payment in another currency, as of the last download. */
  rates: PaymentRates | null;
  savedAt: string;
};

export type QueuedSale = {
  sale: PosSaleInput;
  /** Why the server refused it: it stays on the phone until that is solved (D10). */
  held?: { code: string; message: string; at: string };
};

export type PosStorage = {
  readCatalog: (storeId: string) => Promise<PosCatalogSnapshot | null>;
  writeCatalog: (snapshot: PosCatalogSnapshot) => Promise<void>;
  listSales: (storeId: string) => Promise<QueuedSale[]>;
  /** Resolves only when the sale is safe: the screen closes after this. */
  putSale: (storeId: string, sale: QueuedSale) => Promise<void>;
  /** Only with the server's confirmation. */
  removeSale: (storeId: string, saleId: string) => Promise<void>;
  /** Identifies this phone in the sales it uploads. */
  deviceId: () => Promise<string>;
  /** The number on the receipt until the server gives the real one: a part of the device and a counter. */
  nextLocalNumber: () => Promise<string>;
};

const DB_NAME = "kshop-pos";
const CATALOG = "catalog";
const SALES = "sales";
const META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(CATALOG);
      db.createObjectStore(SALES);
      db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open"));
  });
}

async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (objects: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      // Written only when the transaction commits, not when the request succeeds.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_write"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_abort"));
    });
  } finally {
    db.close();
  }
}

const saleKey = (storeId: string, saleId: string) => `${storeId}/${saleId}`;

/** Two phones of a store never repeat a number. */
export const localNumber = (deviceId: string, counter: number) =>
  `${deviceId.slice(0, 4).toUpperCase()}-${counter}`;

export function createIndexedDbPosStorage(): PosStorage {
  return {
    readCatalog: async (storeId) =>
      ((await transact(CATALOG, "readonly", (s) => s.get(storeId))) as PosCatalogSnapshot | undefined) ??
      null,
    writeCatalog: async (snapshot) => {
      await transact(CATALOG, "readwrite", (s) => s.put(snapshot, snapshot.storeId));
    },
    listSales: async (storeId) =>
      (await transact(SALES, "readonly", (s) =>
        s.getAll(IDBKeyRange.bound(`${storeId}/`, `${storeId}/￿`)),
      )) as QueuedSale[],
    putSale: async (storeId, sale) => {
      await transact(SALES, "readwrite", (s) => s.put(sale, saleKey(storeId, sale.sale.id)));
    },
    removeSale: async (storeId, saleId) => {
      await transact(SALES, "readwrite", (s) => s.delete(saleKey(storeId, saleId)));
    },
    deviceId: async () => {
      const saved = (await transact(META, "readonly", (s) => s.get("deviceId"))) as string | undefined;
      if (saved) return saved;
      const id = crypto.randomUUID();
      await transact(META, "readwrite", (s) => s.put(id, "deviceId"));
      return id;
    },
    nextLocalNumber: async function () {
      const last =
        ((await transact(META, "readonly", (s) => s.get("lastNumber"))) as number | undefined) ?? 0;
      await transact(META, "readwrite", (s) => s.put(last + 1, "lastNumber"));
      return localNumber(await this.deviceId(), last + 1);
    },
  };
}

/** The whole catalog, one page after another: the database is a Nano. Nothing is saved until the last page arrives. */
export async function downloadPosCatalog(api: ApiClient, storeId: string): Promise<PosCatalogSnapshot> {
  const [first, rates] = await Promise.all([
    api.pos(storeId).catalog(),
    // Without a suggestion the cashier types the rate: it never stops the download.
    api
      .orders(storeId)
      .paymentRates()
      .catch(() => null),
  ]);
  const items = [...first.items];
  let next = first.next;
  while (next) {
    const page = await api.pos(storeId).catalog(next);
    items.push(...page.items);
    next = page.next;
  }
  return {
    storeId,
    currency: first.currency,
    paymentMethods: first.paymentMethods ?? [],
    items,
    rates,
    savedAt: new Date().toISOString(),
  };
}
