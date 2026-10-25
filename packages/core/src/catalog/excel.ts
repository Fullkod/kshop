import { z } from "zod";
import { CURRENCY_CODES } from "../currency";
import type { ProductStatus } from "./schemas";

// Excel layout shared by the template, the export and the import (decision 19, D1).
// One row per variant; rows with the same "Código producto" form one product.

export const EXCEL_SHEET = "Productos";
export const EXCEL_LISTS_SHEET = "Listas";
export const EXCEL_HELP_SHEET = "Instrucciones";
export const EXCEL_MAX_ROWS = 5000;
/** Product groups applied per /run call (each one is its own transaction). */
export const IMPORT_BATCH_SIZE = 25;

export const PRODUCT_COLUMNS = [
  { key: "productCode", header: "Código producto", width: 18 },
  { key: "name", header: "Nombre", width: 30 },
  { key: "description", header: "Descripción", width: 40 },
  { key: "category", header: "Categoría", width: 26 },
  { key: "brand", header: "Marca", width: 16 },
  { key: "collections", header: "Colecciones", width: 20 },
  { key: "tags", header: "Etiquetas", width: 20 },
  { key: "status", header: "Estado", width: 12 },
] as const;

export const VARIANT_COLUMNS = [
  { key: "sku", header: "SKU", width: 22 },
  { key: "price", header: "Precio", width: 12 },
  { key: "compareAtPrice", header: "Precio anterior", width: 14 },
  { key: "cost", header: "Costo", width: 10 },
  { key: "costCurrency", header: "Moneda costo", width: 12 },
  { key: "stock", header: "Stock", width: 10 },
] as const;

export type ExcelColumnKey =
  (typeof PRODUCT_COLUMNS)[number]["key"] | (typeof VARIANT_COLUMNS)[number]["key"];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

const statusFromLabel = (value: string): ProductStatus | undefined => {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  return (Object.entries(STATUS_LABEL) as [ProductStatus, string][]).find(
    ([key, label]) => label.toLowerCase() === v || key === v,
  )?.[0];
};

/** Category path in a cell: "Mujer > Vestidos" (also accepts › and /). */
export function splitCategoryPath(value: string): string[] {
  return value
    .split(/\s*(?:>|›|\/)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const splitList = (value: string): string[] =>
  value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

const optionalNumber = (label: string, opts: { int?: boolean } = {}) =>
  z.string().transform((v, ctx) => {
    const clean = v.trim().replace(/\s/g, "").replace(",", ".");
    if (clean === "") return undefined;
    const n = Number(clean);
    if (!Number.isFinite(n) || n < 0 || (opts.int && !Number.isInteger(n))) {
      ctx.addIssue({ code: "custom", message: `${label}: «${v}» no es un número válido.` });
      return z.NEVER;
    }
    return opts.int ? n : Math.round(n * 100) / 100;
  });

/** Raw cell texts of one row (all values read as text to keep leading zeros in SKUs). */
export const excelRowSchema = z
  .object({
    productCode: z.string().trim().max(60),
    name: z.string().trim().max(200),
    description: z.string().max(20_000),
    category: z.string().trim().max(300),
    brand: z.string().trim().max(80),
    collections: z.string().trim().max(500),
    tags: z.string().trim().max(500),
    status: z.string().transform((v, ctx) => {
      if (!v.trim()) return undefined;
      const s = statusFromLabel(v);
      if (!s)
        ctx.addIssue({
          code: "custom",
          message: `Estado «${v}» no válido (Borrador, Publicado o Archivado).`,
        });
      return s;
    }),
    sku: z
      .string()
      .trim()
      .min(1, "Falta el SKU.")
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/, "SKU no válido (letras, números, . _ / -; máx. 64)."),
    price: optionalNumber("Precio"),
    compareAtPrice: optionalNumber("Precio anterior"),
    cost: optionalNumber("Costo"),
    costCurrency: z.string().transform((v, ctx) => {
      const c = v.trim().toUpperCase();
      if (!c) return undefined;
      if (!(CURRENCY_CODES as readonly string[]).includes(c)) {
        ctx.addIssue({ code: "custom", message: `Moneda «${v}» no válida (CUP, USD o EUR).` });
      }
      return c as (typeof CURRENCY_CODES)[number];
    }),
    stock: optionalNumber("Stock", { int: true }),
    /** Attribute name -> cell text. */
    attributes: z.record(z.string(), z.string()),
  })
  .superRefine((row, ctx) => {
    if (row.cost !== undefined && !row.costCurrency) {
      ctx.addIssue({ code: "custom", path: ["costCurrency"], message: "Indica la moneda del costo." });
    }
  });

export type ExcelRow = z.infer<typeof excelRowSchema>;
export type ExcelRowInput = z.input<typeof excelRowSchema>;

/** Key that groups rows into one product: the product code, or the name when there is no code. */
export function productKey(row: Pick<ExcelRow, "productCode" | "name">): string {
  return (row.productCode || row.name).trim().toUpperCase();
}

export type ImportPreview = {
  jobId: string;
  totalRows: number;
  products: { create: number; update: number; skip: number };
  errorRows: { row: number; productKey: string; errors: string[] }[];
  /** Structure the import will create (when createMissing is on). */
  toCreate: { categories: string[]; brands: string[]; collections: string[]; values: string[] };
  limit: { max: number | null; current: number; newProducts: number; exceeded: boolean };
};
