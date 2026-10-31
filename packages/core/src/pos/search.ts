// Search of the counter (Roberto, P5): by name in pieces, the whole phrase and its longest consecutive pieces first, then
// the words scattered around the name. By SKU too: a barcode reader types the code as if it were a keyboard.

export type PosSearchable = { productName: string; variantName: string; sku: string };

export type PosSearchEntry<T extends PosSearchable> = { item: T; name: string; sku: string };

/** Lower case, without accents and with one space between words: "Café  (1 lb)" -> "cafe 1 lb". */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Prepared once per catalog: searching must not normalize every name on every key. */
export function posSearchIndex<T extends PosSearchable>(items: readonly T[]): PosSearchEntry<T>[] {
  return items.map((item) => ({
    item,
    name: normalizeSearch(`${item.productName} ${item.variantName}`),
    sku: item.sku.toLowerCase(),
  }));
}

/** How many consecutive words of the query appear together in the name, and where the longest piece starts. */
function longestRun(name: string, words: string[]): { run: number; position: number } {
  for (let size = words.length; size > 0; size--) {
    let best = -1;
    for (let start = 0; start + size <= words.length; start++) {
      const position = name.indexOf(words.slice(start, start + size).join(" "));
      if (position >= 0 && (best < 0 || position < best)) best = position;
    }
    if (best >= 0) return { run: size, position: best };
  }
  return { run: 0, position: 0 };
}

export function searchPosCatalog<T extends PosSearchable>(
  index: readonly PosSearchEntry<T>[],
  query: string,
  limit = 30,
): T[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const code = query.trim().toLowerCase();

  const found: {
    entry: PosSearchEntry<T>;
    sku: number;
    run: number;
    matched: number;
    ordered: number;
    position: number;
  }[] = [];
  for (const entry of index) {
    const sku = entry.sku === code ? 2 : entry.sku.includes(code) ? 1 : 0;
    const positions = words.map((w) => entry.name.indexOf(w));
    const matched = positions.filter((p) => p >= 0).length;
    if (!sku && !matched) continue;
    const { run, position } = matched ? longestRun(entry.name, words) : { run: 0, position: 0 };
    const present = positions.filter((p) => p >= 0);
    const ordered = present.every((p, i) => i === 0 || p > (present[i - 1] as number)) ? 1 : 0;
    found.push({ entry, sku, run, matched, ordered, position });
  }

  found.sort(
    (a, b) =>
      b.sku - a.sku ||
      b.run - a.run ||
      b.matched - a.matched ||
      b.ordered - a.ordered ||
      a.position - b.position ||
      a.entry.name.localeCompare(b.entry.name),
  );
  return found.slice(0, limit).map((f) => f.entry.item);
}

/** The price to charge now: a promotion that already ended on the phone no longer applies. */
export function posItemPrice(
  item: { price: number; promoPrice: number | null; promoEndsAt: string | null },
  at: number = Date.now(),
): number {
  if (item.promoPrice === null) return item.price;
  return item.promoEndsAt && new Date(item.promoEndsAt).getTime() <= at ? item.price : item.promoPrice;
}

/** A number typed on a phone: the Spanish keyboard may bring a comma. */
export function parseDecimal(text: string): number {
  return Number(text.trim().replace(",", "."));
}

/** What the phone sold today and what its till holds per currency, as charged and net of the change given. */
export function posDaySummary(
  sales: readonly {
    sale: {
      soldAt: string;
      voided?: boolean;
      payments: readonly {
        amount: number;
        currency?: string;
        changeAmount?: number;
        changeCurrency?: string;
      }[];
    };
  }[],
  baseCurrency: string,
  now: Date = new Date(),
): { count: number; cash: { currency: string; amount: number }[] } {
  const today = now.toDateString();
  const cents = new Map<string, number>();
  const add = (currency: string, amount: number) =>
    cents.set(currency, (cents.get(currency) ?? 0) + Math.round(amount * 100));
  let count = 0;
  for (const { sale } of sales) {
    if (sale.voided || new Date(sale.soldAt).toDateString() !== today) continue;
    count += 1;
    for (const p of sale.payments) {
      add(p.currency ?? baseCurrency, p.amount);
      if (p.changeAmount && p.changeCurrency) add(p.changeCurrency, -p.changeAmount);
    }
  }
  return {
    count,
    cash: [...cents]
      .filter(([, value]) => value !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => ({ currency, amount: value / 100 })),
  };
}

/** Sum of the lines in cents, to avoid floating point drift. */
export function posCartTotal(lines: readonly { unitPrice: number; quantity: number }[]): number {
  return lines.reduce((cents, l) => cents + Math.round(l.unitPrice * 100) * l.quantity, 0) / 100;
}
