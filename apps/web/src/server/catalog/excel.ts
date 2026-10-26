import "server-only";
import {
  catalogSlug,
  CURRENCY_CODES,
  EXCEL_HELP_SHEET,
  EXCEL_LISTS_SHEET,
  EXCEL_MAX_ROWS,
  EXCEL_SHEET,
  excelRowSchema,
  IMPORT_BATCH_SIZE,
  PRODUCT_COLUMNS,
  productKey,
  splitCategoryPath,
  splitList,
  STATUS_LABEL,
  VALUE_LIST_TYPES,
  VARIANT_COLUMNS,
  type AttributeInputType,
  type ExcelRow,
  type ImportPreview,
  type ImportProgress,
} from "@kshop/core";
import ExcelJS from "exceljs";
import { hasModule } from "../auth";
import { mapDbError } from "../db-errors";
import { HttpError } from "../http";
import { getServiceClient } from "../supabase";
import { importImageFromUrl } from "./remote-images";

// ---------------------------------------------------------------------------
// Store structure (service client; the caller already passed requireCatalogAccess)
// ---------------------------------------------------------------------------

type Attr = {
  id: string;
  name: string;
  inputType: AttributeInputType;
  values: { id: string; name: string }[];
};
type TypeAttr = Attr & { scope: "product" | "variant"; variantSelection: boolean };
type Structure = {
  type: { id: string; name: string; hasVariants: boolean };
  productAttrs: TypeAttr[];
  variantAttrs: TypeAttr[];
  categories: { id: string; name: string; parentId: string | null }[];
  brands: { id: string; name: string }[];
  collections: { id: string; name: string }[];
  baseCurrency: string;
  /** Phase 6: «Precio {moneda}» per extra sale currency (multi_currency). */
  saleCurrencies: string[];
  /** Phase 6: «Stock {almacén}» per other active warehouse (multi_warehouse). */
  extraWarehouses: { id: string; name: string }[];
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

async function loadStructure(storeId: string, productTypeId: string): Promise<Structure> {
  const db = getServiceClient();
  const [type, typeAttrs, categories, brands, collections, currencies, sale, warehouses, multiCurrency, multiWarehouse] =
    await Promise.all([
    db
      .from("product_types")
      .select("id, name, has_variants")
      .eq("store_id", storeId)
      .eq("id", productTypeId)
      .maybeSingle(),
    db
      .from("product_type_attributes")
      .select("attribute_id, scope, variant_selection, sort_order")
      .eq("store_id", storeId)
      .eq("product_type_id", productTypeId)
      .order("sort_order"),
    db.from("categories").select("id, name, parent_id").eq("store_id", storeId),
    db.from("brands").select("id, name").eq("store_id", storeId),
    db.from("collections").select("id, name").eq("store_id", storeId),
    db.from("store_currencies").select("currency").eq("store_id", storeId).eq("is_base", true).single(),
    db.from("store_currencies").select("currency").eq("store_id", storeId).eq("is_base", false).eq("sells", true),
    db
      .from("warehouses")
      .select("id, name")
      .eq("store_id", storeId)
      .eq("is_default", false)
      .eq("is_active", true)
      .order("name"),
    hasModule(storeId, "multi_currency"),
    hasModule(storeId, "multi_warehouse"),
  ]);
  if (!type.data)
    throw new HttpError(400, "invalid_reference", "El tipo de producto no existe en esta tienda.");

  const attrIds = (typeAttrs.data ?? []).map((a) => a.attribute_id);
  const attrs = attrIds.length
    ? ((
        await db
          .from("attributes")
          .select("id, name, input_type, attribute_values(id, name, sort_order)")
          .eq("store_id", storeId)
          .in("id", attrIds)
      ).data ?? [])
    : [];
  const byId = new Map(
    attrs.map((a) => [
      a.id,
      {
        id: a.id,
        name: a.name,
        inputType: a.input_type as AttributeInputType,
        values: [...(a.attribute_values ?? [])]
          .sort((x, y) => x.sort_order - y.sort_order)
          .map((v) => ({ id: v.id, name: v.name })),
      },
    ]),
  );
  const typed: TypeAttr[] = (typeAttrs.data ?? []).flatMap((t) => {
    const a = byId.get(t.attribute_id);
    return a
      ? [{ ...a, scope: t.scope as "product" | "variant", variantSelection: t.variant_selection }]
      : [];
  });

  return {
    type: { id: type.data.id, name: type.data.name, hasVariants: type.data.has_variants },
    productAttrs: typed.filter((a) => a.scope === "product"),
    variantAttrs: typed.filter((a) => a.scope === "variant"),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id })),
    brands: brands.data ?? [],
    collections: collections.data ?? [],
    baseCurrency: currencies.data?.currency ?? "CUP",
    saleCurrencies: multiCurrency ? (sale.data ?? []).map((c) => c.currency as string).sort() : [],
    extraWarehouses: multiWarehouse ? (warehouses.data ?? []) : [],
  };
}

function categoryPaths(categories: Structure["categories"]): Map<string, string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (id: string): string[] => {
    const c = byId.get(id);
    return c ? [...(c.parentId ? path(c.parentId) : []), c.name] : [];
  };
  return new Map(categories.map((c) => [c.id, path(c.id).join(" > ")]));
}

// ---------------------------------------------------------------------------
// Template / export
// ---------------------------------------------------------------------------

type Extra = { kind: "prices" | "stocks"; id: string };

function columnsFor(s: Structure) {
  const plain = { attr: undefined as TypeAttr | undefined, extra: undefined as Extra | undefined };
  return [
    ...PRODUCT_COLUMNS.map((c) => ({ ...c, ...plain })),
    ...s.productAttrs.map((a) => ({ key: `attr:${a.id}`, header: a.name, width: 16, ...plain, attr: a })),
    ...VARIANT_COLUMNS.slice(0, 1).map((c) => ({ ...c, ...plain })),
    ...s.variantAttrs.map((a) => ({ key: `attr:${a.id}`, header: a.name, width: 12, ...plain, attr: a })),
    ...VARIANT_COLUMNS.slice(1).map((c) => ({ ...c, ...plain })),
    ...s.saleCurrencies.map((c) => ({
      key: `price:${c}`,
      header: `Precio ${c}`,
      width: 12,
      ...plain,
      extra: { kind: "prices", id: c } as Extra,
    })),
    ...s.extraWarehouses.map((w) => ({
      key: `stock:${w.id}`,
      header: `Stock ${w.name}`,
      width: 12,
      ...plain,
      extra: { kind: "stocks", id: w.id } as Extra,
    })),
  ];
}

export type ExportRow = Record<string, string | number | null>;

async function buildWorkbook(s: Structure, rows: ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kshop";
  const sheet = wb.addWorksheet(EXCEL_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  const lists = wb.addWorksheet(EXCEL_LISTS_SHEET, { state: "veryHidden" });
  const help = wb.addWorksheet(EXCEL_HELP_SHEET);
  const columns = columnsFor(s);

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B21B6" } };
  // SKUs and codes as text so Excel keeps leading zeros.
  for (const key of ["productCode", "sku"]) sheet.getColumn(key).numFmt = "@";
  for (const row of rows) sheet.addRow(row);

  // Dropdown lists (one column per list in the hidden sheet).
  const paths = [...categoryPaths(s.categories).values()].sort();
  const listColumns: [string, string[]][] = [
    ["category", paths],
    ["brand", s.brands.map((b) => b.name)],
    ["status", Object.values(STATUS_LABEL)],
    ["costCurrency", [...CURRENCY_CODES]],
    ...columns
      .filter((c) => c.attr && VALUE_LIST_TYPES.includes(c.attr.inputType))
      .map((c) => [c.key, c.attr!.values.map((v) => v.name)] as [string, string[]]),
  ];
  listColumns.forEach(([key, values], index) => {
    if (values.length === 0) return;
    const col = index + 1;
    values.forEach((v, i) => (lists.getCell(i + 1, col).value = v));
    const letter = lists.getColumn(col).letter;
    const target = sheet.getColumn(key).letter;
    // Validation on the first rows of the column; values outside the list show a warning, not an error,
    // so new categories/values can still be typed (they are created with the "create missing" option).
    for (let r = 2; r <= Math.max(rows.length + 200, 500); r++) {
      sheet.getCell(`${target}${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        formulae: [`'${EXCEL_LISTS_SHEET}'!$${letter}$1:$${letter}$${values.length}`],
      };
    }
  });

  help.getColumn(1).width = 110;
  [
    `Plantilla de productos de tipo «${s.type.name}» — Kshop`,
    "",
    "• Una fila por variante. Las filas con el mismo «Código producto» forman un producto (si está vacío se agrupa por Nombre).",
    "• Los datos del producto (nombre, descripción, categoría…) basta con ponerlos en la primera fila de cada producto.",
    "• Categoría: escribe la ruta separada por «>», por ejemplo «Mujer > Vestidos».",
    "• Colecciones y Etiquetas: varios valores separados por comas.",
    `• Precio y Precio anterior en ${s.baseCurrency}. Costo con su moneda (CUP, USD o EUR).`,
    "• Stock: unidades en el almacén principal.",
    ...(s.saleCurrencies.length
      ? [
          `• ${s.saleCurrencies.map((c) => `Precio ${c}`).join(", ")}: precio fijo en esa moneda. Vacío: se convierte con la tasa.`,
        ]
      : []),
    ...(s.extraWarehouses.length
      ? ["• Stock {almacén}: unidades en cada uno de los demás almacenes."]
      : []),
    "• Imágenes (URLs): enlaces públicos a las fotos del producto, separados por comas. Se descargan al importar; si ya se importaron antes no se repiten.",
    "• Al importar puedes crear automáticamente las categorías, marcas, colecciones y valores que falten.",
    "• Modo «actualizar»: si el SKU ya existe se actualizan sus datos; las celdas vacías no borran nada.",
  ].forEach((line, i) => (help.getCell(i + 1, 1).value = line));
  help.getCell(1, 1).font = { bold: true, size: 14 };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildTemplate(storeId: string, productTypeId: string): Promise<Buffer> {
  return buildWorkbook(await loadStructure(storeId, productTypeId), []);
}

type ExportProduct = {
  slug: string;
  name: string;
  description_plain: string;
  status: keyof typeof STATUS_LABEL;
  category_id: string | null;
  brand_id: string | null;
  product_tags: { tag: string }[];
  collection_products: { collection_id: string }[];
  product_attribute_values: {
    attribute_id: string;
    value_id: string | null;
    value_text: string | null;
    value_numeric: number | null;
  }[];
  product_media: { url: string; sort_order: number }[];
  product_variants: {
    sku: string;
    price: number;
    compare_at_price: number | null;
    sort_order: number;
    variant_costs:
      { cost_price: number; cost_currency: string } | { cost_price: number; cost_currency: string }[] | null;
    variant_prices: { currency: string; price: number }[];
    stocks: { quantity: number; warehouse_id: string }[];
    variant_attribute_values: { attribute_id: string; value_id: string }[];
  }[];
};

export async function buildExport(storeId: string, productTypeId: string): Promise<Buffer> {
  const s = await loadStructure(storeId, productTypeId);
  const db = getServiceClient();
  const { data: wh } = await db
    .from("warehouses")
    .select("id")
    .eq("store_id", storeId)
    .eq("is_default", true)
    .single();
  const paths = categoryPaths(s.categories);
  const brandName = new Map(s.brands.map((b) => [b.id, b.name]));
  const collectionName = new Map(s.collections.map((c) => [c.id, c.name]));
  const valueName = new Map(
    [...s.productAttrs, ...s.variantAttrs].flatMap((a) => a.values.map((v) => [v.id, v.name])),
  );

  const rows: ExportRow[] = [];
  const pageSize = 200;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("products")
      .select(
        `slug, name, description_plain, status, category_id, brand_id,
         product_tags(tag), collection_products(collection_id),
         product_attribute_values(attribute_id, value_id, value_text, value_numeric),
         product_media(url, sort_order),
         product_variants(sku, price, compare_at_price, sort_order, variant_costs(cost_price, cost_currency),
           variant_prices(currency, price), stocks(quantity, warehouse_id),
           variant_attribute_values(attribute_id, value_id))`,
      )
      .eq("store_id", storeId)
      .eq("product_type_id", productTypeId)
      .neq("status", "archived")
      .order("name")
      .range(from, from + pageSize - 1)
      .returns<ExportProduct[]>();
    if (error) mapDbError(error);
    for (const p of data) {
      const productAttr = (attrId: string) =>
        p.product_attribute_values
          .filter((v) => v.attribute_id === attrId)
          .map((v) =>
            v.value_id
              ? valueName.get(v.value_id)
              : (v.value_text ?? (v.value_numeric != null ? String(v.value_numeric) : "")),
          )
          .filter(Boolean)
          .join(", ");
      [...p.product_variants]
        .sort((a, b) => a.sort_order - b.sort_order)
        .forEach((v, i) => {
          // PostgREST may return the one-to-one embed as an object or as a list.
          const cost = Array.isArray(v.variant_costs) ? v.variant_costs[0] : v.variant_costs;
          const row: ExportRow = {
            productCode: p.slug,
            name: i === 0 ? p.name : null,
            description: i === 0 ? p.description_plain : null,
            category: i === 0 && p.category_id ? (paths.get(p.category_id) ?? null) : null,
            brand: i === 0 && p.brand_id ? (brandName.get(p.brand_id) ?? null) : null,
            collections:
              i === 0
                ? p.collection_products.map((c) => collectionName.get(c.collection_id)).join(", ")
                : null,
            tags: i === 0 ? p.product_tags.map((t) => t.tag).join(", ") : null,
            status: i === 0 ? STATUS_LABEL[p.status] : null,
            images:
              i === 0
                ? [...p.product_media]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((m) => m.url)
                    .join(", ")
                : null,
            sku: v.sku,
            price: Number(v.price),
            compareAtPrice: v.compare_at_price != null ? Number(v.compare_at_price) : null,
            cost: cost ? Number(cost.cost_price) : null,
            costCurrency: cost?.cost_currency ?? null,
            stock: v.stocks.find((st) => st.warehouse_id === wh?.id)?.quantity ?? 0,
          };
          for (const c of s.saleCurrencies) {
            const fixed = v.variant_prices.find((x) => x.currency === c);
            row[`price:${c}`] = fixed ? Number(fixed.price) : null;
          }
          for (const w of s.extraWarehouses) {
            row[`stock:${w.id}`] = v.stocks.find((st) => st.warehouse_id === w.id)?.quantity ?? 0;
          }
          for (const a of s.productAttrs) row[`attr:${a.id}`] = i === 0 ? productAttr(a.id) : null;
          for (const a of s.variantAttrs) {
            const value = v.variant_attribute_values.find((x) => x.attribute_id === a.id);
            row[`attr:${a.id}`] = value ? (valueName.get(value.value_id) ?? null) : null;
          }
          rows.push(row);
        });
    }
    if (data.length < pageSize) break;
  }
  return buildWorkbook(s, rows);
}

// ---------------------------------------------------------------------------
// Import: parse + validate -> job (preview) -> run in batches
// ---------------------------------------------------------------------------

type ParsedRow = { row: number; key: string; data: ExcelRow | null; errors: string[] };

async function parseWorkbook(buffer: ArrayBuffer, s: Structure): Promise<ParsedRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new HttpError(400, "invalid_file", "El archivo no es un Excel (.xlsx) válido.");
  }
  const sheet = wb.getWorksheet(EXCEL_SHEET) ?? wb.worksheets[0];
  if (!sheet) throw new HttpError(400, "invalid_file", "El Excel no tiene hojas.");

  const columns = columnsFor(s);
  const byHeader = new Map(columns.map((c) => [norm(c.header), c]));
  const colKey = new Map<number, (typeof columns)[number]>();
  sheet.getRow(1).eachCell((cell, col) => {
    const c = byHeader.get(norm(cell.text));
    if (c) colKey.set(col, c);
  });
  if (![...colKey.values()].some((c) => c.key === "sku")) {
    throw new HttpError(
      400,
      "invalid_file",
      "No encuentro la columna «SKU». Usa la plantilla de Kshop para este tipo de producto.",
    );
  }
  if (sheet.rowCount - 1 > EXCEL_MAX_ROWS) {
    throw new HttpError(
      400,
      "too_many_rows",
      `El archivo tiene más de ${EXCEL_MAX_ROWS} filas. Divídelo en varios.`,
    );
  }

  const parsed: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw: Record<string, string> = {};
    const attributes: Record<string, string> = {};
    const extras: Record<Extra["kind"], Record<string, string>> = { prices: {}, stocks: {} };
    let empty = true;
    for (const [col, c] of colKey) {
      const text = row.getCell(col).text?.trim() ?? "";
      if (text) empty = false;
      if (c.attr) attributes[c.attr.id] = text;
      else if (c.extra) extras[c.extra.kind][c.extra.id] = text;
      else raw[c.key] = text;
    }
    if (empty) return;
    const input = Object.fromEntries(
      [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS].map((c) => [c.key, raw[c.key] ?? ""]),
    );
    const result = excelRowSchema.safeParse({ ...input, attributes, ...extras });
    parsed.push({
      row: rowNumber,
      key: productKey({ productCode: raw.productCode ?? "", name: raw.name ?? "" }),
      data: result.success ? result.data : null,
      errors: result.success ? [] : result.error.issues.map((i) => i.message),
    });
  });
  return parsed;
}

type Missing = {
  categories: Set<string>;
  brands: Set<string>;
  collections: Set<string>;
  values: Map<string, Set<string>>;
};

/** Checks references against the structure; collects what is missing (created later if allowed). */
function resolveRow(
  row: ExcelRow,
  s: Structure,
  paths: Map<string, string>,
  missing: Missing,
  createMissing: boolean,
): string[] {
  const errors: string[] = [];
  const pathIndex = new Map([...paths].map(([id, p]) => [norm(p), id]));
  const miss = (msg: string, add: () => void) => (createMissing ? add() : errors.push(msg));

  if (row.category) {
    const path = splitCategoryPath(row.category).join(" > ");
    if (splitCategoryPath(row.category).length > 3) errors.push("La categoría tiene más de 3 niveles.");
    else if (!pathIndex.has(norm(path)))
      miss(`La categoría «${path}» no existe.`, () => missing.categories.add(path));
  }
  if (row.brand && !s.brands.some((b) => norm(b.name) === norm(row.brand))) {
    miss(`La marca «${row.brand}» no existe.`, () => missing.brands.add(row.brand));
  }
  for (const name of splitList(row.collections)) {
    if (!s.collections.some((c) => norm(c.name) === norm(name))) {
      miss(`La colección «${name}» no existe.`, () => missing.collections.add(name));
    }
  }
  for (const a of [...s.productAttrs, ...s.variantAttrs]) {
    const text = row.attributes[a.id] ?? "";
    if (!text) {
      if (a.scope === "variant" && a.variantSelection && s.type.hasVariants)
        errors.push(`Falta «${a.name}».`);
      continue;
    }
    if (!VALUE_LIST_TYPES.includes(a.inputType)) continue;
    const names = a.inputType === "multiselect" ? splitList(text) : [text];
    for (const name of names) {
      if (!a.values.some((v) => norm(v.name) === norm(name))) {
        miss(`«${name}» no es un valor de «${a.name}».`, () =>
          missing.values.set(a.id, (missing.values.get(a.id) ?? new Set()).add(name)),
        );
      }
    }
  }
  return errors;
}

export async function createImportJob(params: {
  storeId: string;
  userId: string;
  productTypeId: string;
  fileKey: string;
  fileName: string;
  mode: "create_only" | "upsert";
  createMissing: boolean;
}): Promise<ImportPreview> {
  const { storeId } = params;
  if (!params.fileKey.startsWith(`stores/${storeId}/imports/`)) {
    throw new HttpError(400, "invalid_file", "El archivo no pertenece a esta tienda.");
  }
  const db = getServiceClient();
  const download = await db.storage.from("store-imports").download(params.fileKey);
  if (download.error || !download.data)
    throw new HttpError(400, "invalid_file", "No se encontró el archivo subido.");

  const s = await loadStructure(storeId, params.productTypeId);
  const rows = await parseWorkbook(await download.data.arrayBuffer(), s);
  if (rows.length === 0) throw new HttpError(400, "empty_file", "El Excel no tiene filas de productos.");

  const paths = categoryPaths(s.categories);
  const missing: Missing = {
    categories: new Set(),
    brands: new Set(),
    collections: new Set(),
    values: new Map(),
  };
  for (const r of rows)
    if (r.data) r.errors.push(...resolveRow(r.data, s, paths, missing, params.createMissing));

  // SKUs: unique in the file, and existing ones decide create vs update.
  const skuCount = new Map<string, number>();
  for (const r of rows)
    if (r.data) skuCount.set(r.data.sku.toUpperCase(), (skuCount.get(r.data.sku.toUpperCase()) ?? 0) + 1);
  for (const r of rows)
    if (r.data && (skuCount.get(r.data.sku.toUpperCase()) ?? 0) > 1)
      r.errors.push(`SKU «${r.data.sku}» repetido en el archivo.`);

  const skus = rows.flatMap((r) => (r.data ? [r.data.sku] : []));
  const existing = new Map<string, string>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await db
      .from("product_variants")
      .select("sku, product_id")
      .eq("store_id", storeId)
      .in("sku", skus.slice(i, i + 300));
    for (const v of data ?? []) existing.set(v.sku.toUpperCase(), v.product_id);
  }

  const groups = new Map<string, ParsedRow[]>();
  for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);

  const actions = new Map<string, "create" | "update" | "skip">();
  for (const [key, group] of groups) {
    const products = new Set(
      group.flatMap((r) =>
        r.data && existing.has(r.data.sku.toUpperCase()) ? [existing.get(r.data.sku.toUpperCase())] : [],
      ),
    );
    const isUpdate = products.size > 0;
    if (products.size > 1)
      group[0]!.errors.push("Los SKU de este producto pertenecen a productos distintos de la tienda.");
    if (!isUpdate) {
      const first = group.find((r) => r.data?.name)?.data;
      if (!first) group[0]!.errors.push("Falta el nombre del producto.");
      for (const r of group) if (r.data && r.data.price === undefined) r.errors.push("Falta el precio.");
      if (!s.type.hasVariants && group.length > 1)
        group[0]!.errors.push(`«${s.type.name}» no tiene variantes: usa una fila por producto.`);
    }
    const hasErrors = group.some((r) => r.errors.length > 0);
    actions.set(
      key,
      hasErrors || (isUpdate && params.mode === "create_only") ? "skip" : isUpdate ? "update" : "create",
    );
  }

  const count = (a: string) => [...actions.values()].filter((x) => x === a).length;
  const [{ data: limits }, { count: current }] = await Promise.all([
    db.rpc("store_limits", { p_store_id: storeId }),
    db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .neq("status", "archived"),
  ]);
  const max = ((limits ?? {}) as Record<string, number>).max_products ?? null;
  const newProducts = count("create");

  const toCreate = {
    categories: [...missing.categories],
    brands: [...missing.brands],
    collections: [...missing.collections],
    values: [...missing.values].flatMap(([attrId, names]) => {
      const attr = [...s.productAttrs, ...s.variantAttrs].find((a) => a.id === attrId)!;
      return [...names].map((n) => `${attr.name}: ${n}`);
    }),
  };
  const errorRows = rows
    .filter((r) => r.errors.length)
    .map((r) => ({ row: r.row, productKey: r.key, errors: r.errors }));

  const { data: job, error } = await db
    .from("import_jobs")
    .insert({
      store_id: storeId,
      product_type_id: params.productTypeId,
      mode: params.mode,
      file_key: params.fileKey,
      file_name: params.fileName,
      total_rows: rows.length,
      total_products: groups.size,
      error_count: errorRows.length,
      options: {
        createMissing: params.createMissing,
        missing: {
          categories: toCreate.categories,
          brands: toCreate.brands,
          collections: toCreate.collections,
          values: Object.fromEntries([...missing.values].map(([k, v]) => [k, [...v]])),
        },
      },
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error) mapDbError(error);

  for (let i = 0; i < rows.length; i += 500) {
    const { error: rowsError } = await db.from("import_job_rows").insert(
      rows.slice(i, i + 500).map((r) => ({
        store_id: storeId,
        job_id: job.id,
        row_number: r.row,
        product_key: r.key,
        data: r.data ?? {},
        action: actions.get(r.key) ?? "skip",
        errors: r.errors,
      })),
    );
    if (rowsError) mapDbError(rowsError);
  }

  return {
    jobId: job.id,
    totalRows: rows.length,
    products: { create: newProducts, update: count("update"), skip: count("skip") },
    errorRows: errorRows.slice(0, 200),
    toCreate,
    limit: {
      max,
      current: current ?? 0,
      newProducts,
      exceeded: max != null && (current ?? 0) + newProducts > max,
    },
  };
}

/** Creates the categories, brands, collections and attribute values the preview reported as missing. */
async function createMissingStructure(storeId: string, missing: Record<string, unknown>) {
  const db = getServiceClient();
  const list = (k: string) => (Array.isArray(missing[k]) ? (missing[k] as string[]) : []);

  for (const name of list("brands")) {
    await db
      .from("brands")
      .upsert(
        { store_id: storeId, name, slug: catalogSlug(name) },
        { onConflict: "store_id,slug", ignoreDuplicates: true },
      );
  }
  for (const name of list("collections")) {
    await db
      .from("collections")
      .upsert(
        { store_id: storeId, name, slug: catalogSlug(name) },
        { onConflict: "store_id,slug", ignoreDuplicates: true },
      );
  }
  for (const path of list("categories")) {
    let parentId: string | null = null;
    const names = splitCategoryPath(path);
    for (let depth = 0; depth < names.length; depth++) {
      const name = names[depth]!;
      let query = db.from("categories").select("id, name").eq("store_id", storeId);
      query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
      const { data: siblings } = await query;
      const found = siblings?.find((c) => norm(c.name) === norm(name));
      if (found) {
        parentId = found.id;
        continue;
      }
      const slug = catalogSlug(names.slice(0, depth + 1).join(" "));
      const inserted: { data: { id: string } | null; error: unknown } = await db
        .from("categories")
        .insert({ store_id: storeId, parent_id: parentId, name, slug })
        .select("id")
        .single<{ id: string }>();
      if (inserted.error || !inserted.data) mapDbError(inserted.error, "La categoría");
      parentId = inserted.data.id;
    }
  }
  const values = (missing.values ?? {}) as Record<string, string[]>;
  for (const [attributeId, names] of Object.entries(values)) {
    const { data: existing } = await db
      .from("attribute_values")
      .select("sort_order")
      .eq("attribute_id", attributeId)
      .order("sort_order", { ascending: false })
      .limit(1);
    let sort = (existing?.[0]?.sort_order ?? -1) + 1;
    for (const name of names) {
      await db.from("attribute_values").upsert(
        {
          store_id: storeId,
          attribute_id: attributeId,
          name,
          slug: catalogSlug(name) || `v${sort}`,
          sort_order: sort++,
        },
        {
          onConflict: "store_id,attribute_id,slug",
          ignoreDuplicates: true,
        },
      );
    }
  }
}

function buildPayload(
  group: ExcelRow[],
  s: Structure,
  paths: Map<string, string>,
  slug: string,
  isUpdate: boolean,
) {
  const first = (k: keyof ExcelRow) =>
    group.map((r) => r[k]).find((v) => typeof v === "string" && v.trim() !== "") as string | undefined;
  const pathIndex = new Map([...paths].map(([id, p]) => [norm(p), id]));
  const categoryText = first("category");
  const brandText = first("brand");
  const collectionsText = first("collections");
  const tagsText = first("tags");
  const status = group.find((r) => r.status)?.status;
  const valueId = (a: TypeAttr, name: string) => a.values.find((v) => norm(v.name) === norm(name))?.id;

  const payload: Record<string, unknown> = { product_type_id: s.type.id };
  const name = first("name");
  if (name || !isUpdate) payload.name = name;
  if (!isUpdate) payload.slug = slug;
  const description = first("description");
  if (description !== undefined || !isUpdate) payload.description = description ?? "";
  if (categoryText)
    payload.category_id = pathIndex.get(norm(splitCategoryPath(categoryText).join(" > "))) ?? null;
  if (brandText) payload.brand_id = s.brands.find((b) => norm(b.name) === norm(brandText))?.id ?? null;
  if (status || !isUpdate) payload.status = status ?? "draft";
  if (tagsText || !isUpdate) payload.tags = tagsText ? splitList(tagsText) : [];
  payload.collection_ids = collectionsText
    ? splitList(collectionsText).flatMap((n) =>
        s.collections.filter((c) => norm(c.name) === norm(n)).map((c) => c.id),
      )
    : [];
  payload.attributes = s.productAttrs.flatMap((a): Record<string, unknown>[] => {
    const text = group.map((r) => r.attributes[a.id] ?? "").find((t) => t.trim() !== "");
    if (!text) return [];
    if (VALUE_LIST_TYPES.includes(a.inputType)) {
      const names = a.inputType === "multiselect" ? splitList(text) : [text];
      return [{ attribute_id: a.id, value_ids: names.flatMap((n) => valueId(a, n) ?? []) }];
    }
    return [{ attribute_id: a.id, value_text: text }];
  });
  payload.variants = group.map((r) => ({
    sku: r.sku,
    name: s.variantAttrs
      .map((a) => r.attributes[a.id])
      .filter(Boolean)
      .join(" / "),
    ...(r.price !== undefined && { price: r.price }),
    ...(r.compareAtPrice !== undefined && { compare_at_price: r.compareAtPrice }),
    ...(r.cost !== undefined && { cost: { price: r.cost, currency: r.costCurrency } }),
    ...(r.stock !== undefined && { stock: r.stock }),
    attribute_values: s.variantAttrs.flatMap((a) => {
      const id = r.attributes[a.id] ? valueId(a, r.attributes[a.id]!) : undefined;
      return id ? [{ attribute_id: a.id, value_id: id }] : [];
    }),
  }));
  return payload;
}

/** Products of a batch applied at the same time (round trips to the database dominate). */
const IMPORT_CONCURRENCY = 4;

/** Adds the image URLs a product does not have yet (by stored URL or source URL); returns the problems. */
async function importProductImages(storeId: string, productId: string, urls: string[]): Promise<string[]> {
  const db = getServiceClient();
  const { data: existing } = await db
    .from("product_media")
    .select("url, source_url, sort_order")
    .eq("store_id", storeId)
    .eq("product_id", productId);
  const known = new Set((existing ?? []).flatMap((m) => [m.url, m.source_url].filter(Boolean)));
  let sort = Math.max(-1, ...(existing ?? []).map((m) => m.sort_order)) + 1;
  const problems: string[] = [];
  for (const source of [...new Set(urls)].filter((u) => !known.has(u))) {
    try {
      const image = await importImageFromUrl(storeId, source);
      const { error } = await db.from("product_media").insert({
        store_id: storeId,
        product_id: productId,
        storage_key: image.storageKey,
        url: image.url,
        thumb_url: image.thumbUrl,
        source_url: source,
        sort_order: sort++,
      });
      if (error) {
        await db.storage
          .from("store-media")
          .remove([image.storageKey, image.storageKey.replace(/-1600\.webp$/, "-480.webp")]);
        problems.push(`No se pudo registrar la imagen ${source}.`);
      }
    } catch (e) {
      problems.push(e instanceof Error ? e.message : `No se pudo importar la imagen ${source}.`);
    }
  }
  return problems;
}

/** Applies the next batch of product groups (each one in its own transaction). */
export async function runImportBatch(
  storeId: string,
  jobId: string,
  userId: string,
): Promise<ImportProgress> {
  const db = getServiceClient();
  const { data: job } = await db
    .from("import_jobs")
    .select("*")
    .eq("store_id", storeId)
    .eq("id", jobId)
    .maybeSingle();
  if (!job) throw new HttpError(404, "not_found", "Importación no encontrada.");
  if (job.status === "done") return progress(job, [], true);

  if (job.status === "ready") {
    if (job.options?.createMissing) await createMissingStructure(storeId, job.options.missing ?? {});
    await db.from("import_jobs").update({ status: "importing" }).eq("id", jobId);
  }

  const s = await loadStructure(storeId, job.product_type_id);
  const paths = categoryPaths(s.categories);
  const { data: pending } = await db
    .from("import_job_rows")
    .select("row_number, product_key, data, action")
    .eq("job_id", jobId)
    .neq("action", "skip")
    .is("applied_at", null)
    .order("row_number")
    .limit(IMPORT_BATCH_SIZE * 50);

  const groups = new Map<string, { rows: number[]; data: ExcelRow[]; action: string }>();
  for (const r of pending ?? []) {
    if (!groups.has(r.product_key) && groups.size >= IMPORT_BATCH_SIZE) continue;
    const g: { rows: number[]; data: ExcelRow[]; action: string } = groups.get(r.product_key) ?? {
      rows: [],
      data: [],
      action: r.action,
    };
    g.rows.push(r.row_number);
    g.data.push(r.data as ExcelRow);
    groups.set(r.product_key, g);
  }

  const failed: ImportProgress["failed"] = [];
  const warnings: ImportProgress["warnings"] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Slugs of the new products, checked once per batch (also against each other).
  const slugs = new Map<string, string>();
  const wanted = [...groups]
    .filter(([, g]) => g.action === "create")
    .map(([key, g]) => [key, catalogSlug(g.data.find((d) => d.name)?.name ?? key)] as const);
  const { data: takenRows } = wanted.length
    ? await db
        .from("products")
        .select("slug")
        .eq("store_id", storeId)
        .in(
          "slug",
          wanted.map(([, slug]) => slug),
        )
    : { data: [] };
  const taken = new Set((takenRows ?? []).map((r) => r.slug));
  for (const [key, slug] of wanted) {
    const unique = taken.has(slug)
      ? `${slug}-${catalogSlug(key) || Math.random().toString(36).slice(2, 6)}`.slice(0, 80)
      : slug;
    taken.add(unique);
    slugs.set(key, unique);
  }

  // Each product is its own transaction and marks its rows when done, so a batch cut short can resume.
  const applyGroup = async (key: string, g: { rows: number[]; data: ExcelRow[]; action: string }) => {
    const slug = slugs.get(key) ?? catalogSlug(g.data.find((d) => d.name)?.name ?? key);
    const { data: result, error } = await db.rpc("import_product", {
      p_store_id: storeId,
      p_job_id: jobId,
      p_mode: job.mode,
      p_payload: buildPayload(g.data, s, paths, slug, g.action === "update"),
      p_user_id: userId,
    });
    let errors: string[] = [];
    if (error) {
      let message = error.message;
      try {
        mapDbError(error, "El producto");
      } catch (mapped) {
        message = mapped instanceof Error ? mapped.message : message;
      }
      failed.push({ productKey: key, error: message });
      errors = [message];
    } else {
      if (result === "created") created++;
      else if (result === "updated") updated++;
      else skipped++;
      // Phase 6: fixed prices per currency and stock in the other warehouses (rows saved before have none).
      const extras = g.data.filter((d) => Object.keys(d.prices ?? {}).length || Object.keys(d.stocks ?? {}).length);
      if (extras.length && result !== "skipped") {
        const { error: extrasError } = await db.rpc("import_variant_extras", {
          p_store_id: storeId,
          p_job_id: jobId,
          p_variants: extras.map((d) => ({ sku: d.sku, prices: d.prices ?? {}, stocks: d.stocks ?? {} })),
          p_user_id: userId,
        });
        if (extrasError) warnings.push({ productKey: key, error: extrasError.message });
      }
      // Rows saved before the images column existed have no "images".
      const images = g.data.find((d) => d.images?.length)?.images ?? [];
      if (images.length && result !== "skipped") {
        const { data: variant } = await db
          .from("product_variants")
          .select("product_id")
          .eq("store_id", storeId)
          .eq("sku", g.data[0]!.sku)
          .maybeSingle();
        if (variant) {
          for (const problem of await importProductImages(storeId, variant.product_id, images)) {
            warnings.push({ productKey: key, error: problem });
          }
        }
      }
    }
    await db
      .from("import_job_rows")
      .update({ applied_at: new Date().toISOString(), ...(errors.length && { errors, action: "skip" }) })
      .eq("job_id", jobId)
      .in("row_number", g.rows);
  };
  const queue = [...groups];
  await Promise.all(
    Array.from({ length: Math.min(IMPORT_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await applyGroup(...next);
    }),
  );

  const { count: remaining } = await db
    .from("import_job_rows")
    .select("row_number", { count: "exact", head: true })
    .eq("job_id", jobId)
    .neq("action", "skip")
    .is("applied_at", null);
  const done = (remaining ?? 0) === 0;
  const { data: updatedJob } = await db
    .from("import_jobs")
    .update({
      created_count: job.created_count + created,
      updated_count: job.updated_count + updated,
      skipped_count: job.skipped_count + skipped,
      error_count: job.error_count + failed.length,
      ...(done && { status: "done", finished_at: new Date().toISOString() }),
    })
    .eq("id", jobId)
    .select("*")
    .single();
  return progress(updatedJob ?? job, failed, done, warnings);
}

function progress(
  job: Record<string, unknown>,
  failed: ImportProgress["failed"],
  done: boolean,
  warnings: ImportProgress["warnings"] = [],
): ImportProgress {
  const created = Number(job.created_count ?? 0);
  const updated = Number(job.updated_count ?? 0);
  const skipped = Number(job.skipped_count ?? 0);
  return {
    status: String(job.status),
    processedProducts: created + updated + skipped + Number(job.error_count ?? 0),
    totalProducts: Number(job.total_products ?? 0),
    created,
    updated,
    skipped,
    failed,
    warnings,
    done,
  };
}
