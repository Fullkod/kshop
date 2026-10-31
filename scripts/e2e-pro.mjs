// Phase 6 API checks (Pro modules: warehouses, currencies, finance, custom domain) against the running app
// (pnpm dev) and the online Supabase project. Creates temporary stores pro-e2e-a (Pro) and pro-e2e-b (Base) with
// @e2e.kshop.test accounts and removes everything at the end (also on failure).
//
//   node scripts/e2e-pro.mjs

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)
  : []) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].trim();
}

const APP = env.E2E_APP_URL ?? "http://localhost:3000";
const PASSWORD = randomBytes(12).toString("base64url");
const USERS = {
  ownerA: "pro-owner-a@e2e.kshop.test",
  staffA: "pro-staff-a@e2e.kshop.test",
  ownerB: "pro-owner-b@e2e.kshop.test",
  root: "pro-root@e2e.kshop.test",
};
const SLUGS = ["pro-e2e-a", "pro-e2e-b"];

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(
    `${ok ? "ok" : "not ok"} - ${name}${ok || detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 300)})`}`,
  );
}

async function cleanup() {
  await service.from("stores").delete().in("slug", SLUGS);
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (Object.values(USERS).includes(u.email)) await service.auth.admin.deleteUser(u.id);
  }
}

async function token(email) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return data.session.access_token;
}

function api(tokenValue) {
  return async (method, path, body) => {
    const res = await fetch(`${APP}/api/v1${path}`, {
      method,
      headers: {
        ...(tokenValue && { Authorization: `Bearer ${tokenValue}` }),
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
}

async function createStore(name, slug, ownerId, prefix, plan) {
  const { data, error } = await service
    .rpc("create_store", {
      p_name: name,
      p_slug: slug,
      p_owner_id: ownerId,
      p_base_currency: "CUP",
      p_order_prefix: prefix,
      p_whatsapp_phone: "5350000000",
      p_plan_code: plan,
      p_trial_days: 0,
      p_platform_domain: "kshop.fullkod.com",
      p_created_by: null,
    })
    .single();
  if (error) throw error;
  return data;
}

// GET through the proxy with a given Host (custom domains need no DNS). No redirects are followed.
function hostGet(host, path) {
  const { hostname, port } = new URL(APP);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path, headers: { Host: host } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? null, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Havana" }).format(new Date());

const spanish = (r) =>
  typeof r.body?.error?.message === "string" && /[a-záéíóúñ]/i.test(r.body.error.message);

/** Simple product type + one published product per SKU, stock in the default warehouse. */
async function seedProducts(storeId, ownerId) {
  const { data: type, error } = await service
    .from("product_types")
    .insert({ store_id: storeId, name: "Simple", slug: "simple" })
    .select("id")
    .single();
  if (error) throw error;
  const variants = {};
  for (const [sku, name, price, stock] of [
    ["GOR-1", "Gorra", 1000, 4],
    ["BOL-1", "Bolso", 3000, 2],
  ]) {
    const { error: saveError } = await service.rpc("save_product", {
      p_store_id: storeId,
      p_input: {
        product_type_id: type.id,
        name,
        slug: name.toLowerCase(),
        status: "published",
        variants: [{ sku, price, stock, cost: { price: 2, currency: "USD" } }],
      },
      p_user_id: ownerId,
    });
    if (saveError) throw saveError;
    const { data: v } = await service
      .from("product_variants")
      .select("id")
      .eq("store_id", storeId)
      .eq("sku", sku)
      .single();
    variants[sku] = v.id;
  }
  return { typeId: type.id, variants };
}

async function run() {
  await cleanup();
  const ids = {};
  for (const [k, email] of Object.entries(USERS)) {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      ...(k === "root" && { app_metadata: { role: "superadmin" } }),
    });
    if (error) throw error;
    ids[k] = data.user.id;
  }
  const storeA = await createStore("Pro E2E A", SLUGS[0], ids.ownerA, "PA", "pro");
  const storeB = await createStore("Pro E2E B", SLUGS[1], ids.ownerB, "PB", "base");
  await service.from("store_members").insert({ store_id: storeA.id, user_id: ids.staffA, role: "staff" });
  const ownerA = api(await token(USERS.ownerA));
  const staffA = api(await token(USERS.staffA));
  const ownerB = api(await token(USERS.ownerB));
  const A = `/stores/${storeA.id}`;
  const B = `/stores/${storeB.id}`;
  const { typeId, variants } = await seedProducts(storeA.id, ids.ownerA);
  const { data: whMain } = await service
    .from("warehouses")
    .select("id")
    .eq("store_id", storeA.id)
    .eq("is_default", true)
    .single();

  // ---- Warehouses (multi_warehouse) ----
  let r = await ownerA("POST", `${A}/catalog/warehouses`, { name: "Norte", address: "Calle 5" });
  check("warehouses: a Pro store creates a second warehouse -> 201", r.status === 201, r);
  const whNorth = r.body?.id;
  r = await ownerB("POST", `${B}/catalog/warehouses`, { name: "Otro" });
  check("warehouses: a Base store cannot add warehouses -> 403", r.status === 403, r);
  r = await ownerB("GET", `${B}/warehouses`);
  check(
    "warehouses: Base store -> 403 module_not_enabled",
    r.status === 403 && r.body?.error?.code === "module_not_enabled",
    r,
  );
  r = await ownerB("GET", `${A}/warehouses`);
  check("warehouses: owner of B on A -> 403", r.status === 403, r);

  r = await ownerA("PUT", `${A}/catalog/stock`, {
    variantId: variants["GOR-1"],
    warehouseId: whNorth,
    quantity: 5,
  });
  check("stock: 5 units in Norte", r.status === 200 && r.body?.quantity === 5, r);
  r = await staffA("GET", `${A}/warehouses`);
  const north = r.body?.warehouses?.find((w) => w.id === whNorth);
  const main = r.body?.warehouses?.find((w) => w.isDefault);
  check(
    "overview: staff sees units per warehouse (Principal 6, Norte 5)",
    r.status === 200 && north?.units === 5 && main?.units === 6,
    r.body,
  );

  // Zones served by each warehouse.
  const { data: zone } = await service
    .from("shipping_zones")
    .insert({ store_id: storeA.id, name: "Norte" })
    .select("id")
    .single();
  r = await staffA("PUT", `${A}/warehouses/zones/${zone.id}`, { warehouseIds: [whNorth] });
  check("zones: staff cannot change them -> 403", r.status === 403, r);
  r = await ownerA("PUT", `${A}/warehouses/zones/${zone.id}`, { warehouseIds: [whNorth, whMain.id] });
  check("zones: owner sets Norte then Principal -> 200", r.status === 200, r);
  r = await ownerA("GET", `${A}/warehouses`);
  check(
    "zones: the order is kept",
    JSON.stringify(r.body?.zones?.find((z) => z.id === zone.id)?.warehouseIds) ===
      JSON.stringify([whNorth, whMain.id]),
    r.body?.zones,
  );
  const { data: whB } = await service.from("warehouses").select("id").eq("store_id", storeB.id).single();
  r = await ownerA("PUT", `${A}/warehouses/zones/${zone.id}`, { warehouseIds: [whB.id] });
  check("zones: a warehouse of another store -> 400 in Spanish", r.status === 400 && spanish(r), r);

  // Transfers.
  r = await staffA("GET", `${A}/warehouses/${whNorth}/stock?q=gorra`);
  check(
    "transfer form: Norte has 5 free caps",
    r.status === 200 && r.body?.rows?.[0]?.sku === "GOR-1" && r.body.rows[0].quantity === 5,
    r.body,
  );
  r = await staffA("POST", `${A}/warehouses/transfers`, {
    fromWarehouseId: whNorth,
    toWarehouseId: whMain.id,
    lines: [{ variantId: variants["GOR-1"], quantity: 3 }],
    note: "Reponer tienda",
  });
  check("transfer: 3 caps Norte -> Principal -> 201", r.status === 201 && r.body?.units === 3, r);
  const transferId = r.body?.transferId;
  r = await staffA("POST", `${A}/warehouses/transfers`, {
    fromWarehouseId: whNorth,
    toWarehouseId: whMain.id,
    lines: [{ variantId: variants["GOR-1"], quantity: 3 }],
  });
  check(
    "transfer: more than the free units -> 409 with the free units",
    r.status === 409 &&
      r.body?.error?.code === "insufficient_stock" &&
      /2 unidades libres/.test(r.body.error.message),
    r,
  );
  r = await staffA("POST", `${A}/warehouses/transfers`, {
    fromWarehouseId: whNorth,
    toWarehouseId: whNorth,
    lines: [{ variantId: variants["GOR-1"], quantity: 1 }],
  });
  check("transfer: same warehouse -> 400", r.status === 400, r);
  r = await staffA("GET", `${A}/warehouses/movements?type=transfer_in`);
  check(
    "movements: the transfer is listed with its note and user",
    r.status === 200 &&
      r.body?.movements?.length === 1 &&
      r.body.movements[0].transferId === transferId &&
      r.body.movements[0].quantity === 3 &&
      r.body.movements[0].note === "Reponer tienda" &&
      r.body.movements[0].userEmail === USERS.staffA,
    r.body,
  );
  r = await staffA("GET", `${A}/warehouses/movements?warehouseId=${whNorth}`);
  check(
    "movements: filter by warehouse (adjustment +5, transfer -3)",
    r.body?.movements
      ?.map((m) => m.quantity)
      .sort()
      .join() === "-3,5",
    r.body,
  );

  // Two transfers of the last free unit at the same time: one wins.
  r = await ownerA("PUT", `${A}/catalog/stock`, {
    variantId: variants["BOL-1"],
    warehouseId: whNorth,
    quantity: 1,
  });
  const race = await Promise.all(
    [0, 1].map(() =>
      staffA("POST", `${A}/warehouses/transfers`, {
        fromWarehouseId: whNorth,
        toWarehouseId: whMain.id,
        lines: [{ variantId: variants["BOL-1"], quantity: 1 }],
      }),
    ),
  );
  check(
    "transfer race: the last unit moves once (201 + 409)",
    race
      .map((x) => x.status)
      .sort()
      .join() === "201,409",
    race.map((x) => x.status),
  );
  const { data: bagStock } = await service
    .from("stocks")
    .select("quantity")
    .eq("variant_id", variants["BOL-1"]);
  check(
    "transfer race: no stock lost nor duplicated (3 bags in total)",
    bagStock.reduce((s, x) => s + x.quantity, 0) === 3,
    bagStock,
  );

  // ---- Currencies (multi_currency) ----
  const priceIn = async (currency) => {
    const { data } = await service.rpc("price_lines", {
      p_store_id: storeA.id,
      p_input: { currency, lines: [{ variant_id: variants["GOR-1"], quantity: 1 }] },
    });
    return Number(data?.subtotal);
  };
  r = await ownerA("PUT", `${A}/catalog/currencies`, { currency: "USD", rateToBase: 250, sells: true });
  check("currencies: sell in USD at 250", r.status === 200, r);
  const usdAt250 = await priceIn("USD");
  r = await ownerA("PUT", `${A}/catalog/currencies`, { currency: "USD", rateToBase: 500, sells: true });
  const usdAt500 = await priceIn("USD");
  check("rates: the converted price follows the rate (4 USD -> 2 USD)", usdAt250 === 4 && usdAt500 === 2, {
    usdAt250,
    usdAt500,
  });
  r = await staffA("GET", `${A}/currencies/rates`);
  check("rates: staff -> 403", r.status === 403, r);
  r = await ownerB("GET", `${B}/currencies/rates`);
  check(
    "rates: Base store -> 403 module_not_enabled",
    r.status === 403 && r.body?.error?.code === "module_not_enabled",
    r,
  );
  r = await ownerA("GET", `${A}/currencies/rates`);
  const usd = r.body?.currencies?.find((c) => c.currency === "USD");
  check(
    "rates: USD with its history (500, 250) and who set it",
    r.status === 200 &&
      usd?.rateToBase === 500 &&
      usd.history.map((h) => h.rate).join() === "500,250" &&
      usd.history[0].setBy === USERS.ownerA,
    usd,
  );
  check(
    "rates: elTOQUE suggestion only with a token",
    env.ELTOQUE_API_TOKEN
      ? typeof usd?.suggested === "number"
      : usd?.suggested === null || typeof usd?.suggested === "number",
    { suggested: usd?.suggested, reference: r.body?.reference },
  );

  // ---- Excel: «Precio USD» and «Stock Norte» columns ----
  const auth = { Authorization: `Bearer ${await token(USERS.ownerA)}` };
  const exportRes = await fetch(`${APP}/api/v1${A}/catalog/excel/export?productTypeId=${typeId}`, {
    headers: auth,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await exportRes.arrayBuffer());
  const sheet = wb.getWorksheet("Productos");
  const headers = sheet.getRow(1).values.filter(Boolean);
  check(
    "excel: export has «Precio USD» and «Stock Norte»",
    headers.includes("Precio USD") && headers.includes("Stock Norte"),
    headers,
  );
  const col = Object.fromEntries(headers.map((h) => [h, sheet.getRow(1).values.indexOf(h)]));
  let capRow;
  sheet.eachRow((row, n) => {
    if (n > 1 && row.getCell(col["SKU"]).text === "GOR-1") capRow = row;
  });
  check("excel: Norte stock exported (2)", capRow?.getCell(col["Stock Norte"]).text === "2", capRow?.values);
  capRow.getCell(col["Precio USD"]).value = 3;
  capRow.getCell(col["Stock Norte"]).value = 7;
  const key = `stores/${storeA.id}/imports/${crypto.randomUUID()}-pro.xlsx`;
  const { error: uploadError } = await createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false },
      global: { headers: auth },
    },
  )
    .storage.from("store-imports")
    .upload(key, Buffer.from(await wb.xlsx.writeBuffer()), {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  if (uploadError) throw uploadError;
  r = await ownerA("POST", `${A}/catalog/imports`, {
    fileKey: key,
    fileName: "pro.xlsx",
    productTypeId: typeId,
    mode: "upsert",
    createMissing: false,
  });
  check("excel: import preview", r.status === 201 || r.status === 200, r);
  let done;
  for (let i = 0; i < 20 && !done?.done; i++)
    done = (await ownerA("POST", `${A}/catalog/imports/${r.body?.jobId}/run`)).body;
  const { data: fixed } = await service
    .from("variant_prices")
    .select("price")
    .eq("variant_id", variants["GOR-1"])
    .eq("currency", "USD");
  const { data: northStock } = await service
    .from("stocks")
    .select("quantity")
    .eq("variant_id", variants["GOR-1"])
    .eq("warehouse_id", whNorth)
    .single();
  check(
    "excel: import sets the fixed USD price (3) and Norte stock (7)",
    done?.done && Number(fixed?.[0]?.price) === 3 && northStock?.quantity === 7,
    { done, fixed, northStock },
  );
  check("rates: a fixed price does not follow the rate", (await priceIn("USD")) === 3);
  r = await ownerA("GET", `${A}/currencies/rates`);
  check(
    "rates: one product with a fixed USD price",
    r.body?.currencies?.find((c) => c.currency === "USD")?.fixedPrices === 1,
    r.body,
  );

  // ---- Finance: the reports add up to the orders made through the real API ----
  const order = async (currency, lines, key) => {
    const res = await ownerA("POST", `${A}/orders`, {
      idempotencyKey: `pro-e2e-${key}`,
      currency,
      customer: { name: "Cliente E2E", phone: "+5353123456" },
      lines,
      notifyCustomer: false,
    });
    if (res.status !== 201) throw new Error(`order ${key}: ${JSON.stringify(res)}`);
    return res.body.orderId;
  };
  const o1 = await order("CUP", [{ variantId: variants["GOR-1"], quantity: 2 }], "o1");
  await ownerA("POST", `${A}/orders/${o1}/shipping`, { amount: 100 });
  await ownerA("POST", `${A}/orders/${o1}/payments`, { amount: 1000 });
  const o2 = await order("USD", [{ variantId: variants["BOL-1"], quantity: 1 }], "o2");
  await ownerA("POST", `${A}/orders/${o2}/shipping`, { amount: 0 });
  const { data: o2row } = await service.from("orders").select("total").eq("id", o2).single();
  await ownerA("POST", `${A}/orders/${o2}/payments`, { amount: Number(o2row.total) });
  const o3 = await order("CUP", [{ variantId: variants["BOL-1"], quantity: 1 }], "o3");
  r = await ownerA("POST", `${A}/orders/${o3}/cancel`, { reason: "Prueba" });
  check("finance setup: two orders paid, one cancelled", r.status === 200, r);
  r = await ownerA("POST", `${A}/finance/expenses`, {
    spentOn: today(),
    category: "Mensajería",
    amount: 250,
    currency: "CUP",
  });
  check("expenses: owner adds one -> 201", r.status === 201 && r.body?.amount === 250, r);
  const expenseId = r.body?.id;

  const period = `from=${today()}&to=${today()}&currency=CUP`;
  r = await staffA("GET", `${A}/finance/summary?${period}`);
  check("finance: staff -> 403", r.status === 403, r);
  r = await ownerB("GET", `${B}/finance/summary?${period}`);
  check(
    "finance: Base store -> 403 module_not_enabled",
    r.status === 403 && r.body?.error?.code === "module_not_enabled",
    r,
  );
  r = await ownerA("GET", `${A}/finance/summary?from=${today()}&to=2020-01-01&currency=CUP`);
  check("finance: a period that ends before it starts -> 400", r.status === 400 && spanish(r), r);

  // Expected values straight from the database.
  const { data: orders } = await service
    .from("orders")
    .select("id, currency, exchange_rate, status, subtotal, total, discount_total")
    .eq("store_id", storeA.id);
  const live = orders.filter((o) => o.status !== "cancelled");
  const soldBy = {};
  for (const o of live) soldBy[o.currency] = (soldBy[o.currency] ?? 0) + Number(o.total ?? o.subtotal);
  const soldEq = live.reduce((s, o) => s + Number(o.total ?? o.subtotal) * Number(o.exchange_rate), 0);
  const { data: lines } = await service
    .from("order_lines")
    .select("order_id, quantity, line_total, order_line_costs(unit_cost, cost_rate_to_base)")
    .eq("store_id", storeA.id);
  let margin = 0;
  for (const l of lines) {
    const o = live.find((x) => x.id === l.order_id);
    const c = Array.isArray(l.order_line_costs) ? l.order_line_costs[0] : l.order_line_costs;
    if (!o || !c) continue;
    const share =
      Number(o.subtotal) > 0 ? (Number(o.discount_total) * Number(l.line_total)) / Number(o.subtotal) : 0;
    margin +=
      (Number(l.line_total) - share) * Number(o.exchange_rate) -
      Number(c.unit_cost) * l.quantity * Number(c.cost_rate_to_base);
  }
  const { data: pays } = await service.from("payments").select("amount, currency").eq("store_id", storeA.id);
  const { data: refunds } = await service
    .from("refunds")
    .select("amount, currency")
    .eq("store_id", storeA.id);
  const collectedBy = {};
  for (const p of pays) collectedBy[p.currency] = (collectedBy[p.currency] ?? 0) + Number(p.amount);
  for (const p of refunds) collectedBy[p.currency] = (collectedBy[p.currency] ?? 0) - Number(p.amount);
  const round = (v) => Math.round(v * 100) / 100;

  r = await ownerA("GET", `${A}/finance/summary?${period}`);
  const s = r.body;
  check(
    "summary: sold per currency equals the orders (cancelled left out)",
    r.status === 200 &&
      s.sold.length === Object.keys(soldBy).length &&
      s.sold.every((x) => round(soldBy[x.currency]) === x.amount),
    { api: s?.sold, db: soldBy },
  );
  check(
    "summary: collected per currency equals payments − refunds",
    s.collected.every((x) => round(collectedBy[x.currency] ?? 0) === x.amount),
    { api: s?.collected, db: collectedBy },
  );
  check("summary: equivalent in CUP with each order's rate", s.totals.sold === round(soldEq), {
    api: s.totals.sold,
    db: soldEq,
  });
  check(
    "summary: margin and net (margin − 250 of expenses)",
    s.totals.margin === round(margin) && s.totals.net === round(margin - 250),
    {
      api: s.totals,
      margin,
    },
  );
  check("summary: 2 orders", s.totals.orders === 2, s.totals);

  r = await ownerA("GET", `${A}/finance/daily?${period}`);
  check(
    "daily close: today with every currency",
    r.status === 200 &&
      r.body.days.length === 1 &&
      r.body.days[0].orders === 2 &&
      r.body.days[0].expenses[0]?.amount === 250,
    r.body,
  );
  r = await ownerA("GET", `${A}/finance/margin?${period}&group=product`);
  check(
    "margin by product adds up to the summary margin",
    r.status === 200 && round(r.body.rows.reduce((t, x) => t + x.margin, 0)) === round(margin),
    r.body,
  );
  r = await ownerA("GET", `${A}/finance/breakdown?${period}`);
  check(
    "breakdown: channel admin, two currencies",
    r.status === 200 && r.body.channels[0]?.name === "admin" && r.body.currencies.length === 2,
    r.body,
  );
  r = await ownerA("GET", `${A}/finance/inventory?currency=CUP&filter=all`);
  check(
    "inventory: valued with today's rates (every product has a cost)",
    r.status === 200 &&
      r.body.totals.costValue > 0 &&
      r.body.totals.withoutCost === 0 &&
      r.body.rows.length === 2,
    r.body?.totals,
  );
  r = await ownerA("PUT", `${A}/finance/expenses/${expenseId}`, {
    spentOn: today(),
    category: "Mensajería",
    amount: 300,
    currency: "CUP",
  });
  check("expenses: edit -> 300", r.status === 200 && r.body.amount === 300, r);
  r = await ownerB("DELETE", `${A}/finance/expenses/${expenseId}`);
  check("expenses: owner of B cannot delete one of A -> 403", r.status === 403, r);
  r = await ownerA("GET", `${A}/finance/summary?${period}`);
  check(
    "summary: the net follows the edited expense",
    r.body?.totals?.net === round(margin - 300),
    r.body?.totals,
  );
  r = await ownerA("DELETE", `${A}/finance/expenses/${expenseId}`);
  check("expenses: delete -> 204", r.status === 204, r);

  // KSH0002: the till per currency as received, the equivalent at the rate agreed on each payment (not the store's).
  const collectedOf = (summary, currency) => summary.collected.find((x) => x.currency === currency)?.amount ?? 0;
  const before = (await ownerA("GET", `${A}/finance/summary?${period}`)).body;
  const o4 = await order("CUP", [{ variantId: variants["BOL-1"], quantity: 1 }], "o4");
  await ownerA("POST", `${A}/orders/${o4}/shipping`, { amount: 0 });
  const { data: o4row } = await service.from("orders").select("total").eq("id", o4).single();
  const t4 = Number(o4row.total);
  await ownerA("POST", `${A}/orders/${o4}/payments`, { amount: 2, currency: "USD", rate: t4 / 4 });
  r = await ownerA("POST", `${A}/orders/${o4}/payments`, {
    amount: 1,
    currency: "USD",
    rate: t4,
    changeAmount: round(t4 / 2),
    changeCurrency: "CUP",
  });
  const { data: o4paid } = await service.from("orders").select("paid_total, payment_status").eq("id", o4).single();
  check("mixed: 3 USD with change in CUP settle the order", o4paid.payment_status === "paid", o4paid);
  const after = (await ownerA("GET", `${A}/finance/summary?${period}`)).body;
  check("mixed: the dollars count as dollars", round(collectedOf(after, "USD") - collectedOf(before, "USD")) === 3, after.collected);
  check(
    "mixed: the change leaves the CUP of the till",
    Math.abs(collectedOf(after, "CUP") - collectedOf(before, "CUP") + t4 / 2) < 0.02,
    after.collected,
  );
  check(
    "mixed: the equivalent is what was applied at the agreed rate",
    Math.abs(after.totals.collected - before.totals.collected - t4) < 0.02,
    { before: before.totals.collected, after: after.totals.collected, t4 },
  );
  r = await ownerA("GET", `${A}/finance/daily?${period}`);
  const dailyCollected = r.body.days.reduce((sum, d) => sum + d.collectedEq, 0);
  check("mixed: the daily close adds up to the summary", Math.abs(dailyCollected - after.totals.collected) < 0.02, {
    dailyCollected,
    summary: after.totals.collected,
  });

  const exp = await fetch(`${APP}/api/v1${A}/finance/export?${period}`, { headers: auth });
  const xwb = new ExcelJS.Workbook();
  await xwb.xlsx.load(await exp.arrayBuffer());
  check(
    "export: one sheet per view",
    exp.status === 200 &&
      ["Resumen", "Cierre diario", "Margen por producto", "Desglose", "Inventario", "Gastos"].every((n) =>
        xwb.getWorksheet(n),
      ),
    xwb.worksheets.map((w) => w.name),
  );

  // ---- Custom domain (phase 6.4), dry_run. The proxy caches lookups for a minute: no host of A is requested
  // before the domain is verified. Local hosts take the dev port.
  const port = new URL(APP).port;
  const DOMAIN = `pro-e2e-${randomBytes(3).toString("hex")}.localhost`;
  const SUB = `${SLUGS[0]}.kshop.localhost:${port}`;
  const root = api(await token(USERS.root));
  r = await ownerB("GET", `${B}/custom-domain`);
  check(
    "domain: Base store -> 403 module_not_enabled",
    r.status === 403 && r.body?.error?.code === "module_not_enabled",
    r,
  );
  r = await staffA("GET", `${A}/custom-domain`);
  check("domain: staff -> 403", r.status === 403, r);
  r = await ownerA("GET", `${A}/custom-domain`);
  check(
    "domain: none yet, dry_run",
    r.status === 200 && r.body.domain === null && r.body.mode === "dry_run",
    r,
  );
  r = await ownerA("POST", `${A}/custom-domain`, { domain: "mitienda" });
  check("domain: not a domain -> 400 in Spanish", r.status === 400 && spanish(r), r);
  r = await ownerA("POST", `${A}/custom-domain`, { domain: "otra.kshop.fullkod.com" });
  check("domain: a Kshop domain -> 422", r.status === 422 && spanish(r), r);
  r = await ownerA("POST", `${A}/custom-domain`, { domain: `https://WWW.${DOMAIN}/inicio` });
  check(
    "domain: requested, normalized, pending with DNS records",
    r.status === 201 &&
      r.body.domain.domain === DOMAIN &&
      r.body.domain.status === "pending" &&
      r.body.domain.dnsRecords.length > 0 &&
      !r.body.domain.live,
    r,
  );
  r = await ownerA("POST", `${A}/custom-domain`, { domain: "segundo.example.com" });
  check("domain: one per store -> 409", r.status === 409, r);
  let { data: resolved } = await service.rpc("resolve_store_domain", { p_host: DOMAIN });
  check("domain: pending is not resolved", resolved?.length === 0, resolved);
  r = await ownerA("POST", `${A}/custom-domain/check`);
  check(
    "domain: check -> verified and live",
    r.status === 200 && r.body.domain.status === "verified" && r.body.domain.live,
    r,
  );

  let page = await hostGet(`${DOMAIN}:${port}`, "/");
  check(
    "proxy: the store is served on its domain",
    page.status === 200 && page.body.includes("Pro E2E A"),
    page.status,
  );
  check(
    "proxy: canonical uses the domain",
    page.body.includes(`rel="canonical" href="http://${DOMAIN}:${port}`),
    page.body.match(/rel="canonical"[^>]*>/)?.[0],
  );
  page = await hostGet(SUB, "/search?q=gorra");
  check(
    "proxy: the subdomain storefront -> 308 to the domain, same path",
    page.status === 308 && page.location === `http://${DOMAIN}:${port}/search?q=gorra`,
    page,
  );
  page = await hostGet(SUB, "/admin");
  check("proxy: the admin stays on the subdomain", page.status === 200, page.status);
  page = await hostGet(`${DOMAIN}:${port}`, "/admin/orders");
  check(
    "proxy: /admin on the domain -> 307 to the subdomain",
    page.status === 307 && page.location === `http://${SUB}/admin/orders`,
    page,
  );
  page = await hostGet(`www.${DOMAIN}:${port}`, "/products?x=1");
  check(
    "proxy: www -> 308 to the domain",
    page.status === 308 && page.location === `http://${DOMAIN}:${port}/products?x=1`,
    page,
  );
  page = await hostGet(`${DOMAIN}:${port}`, "/robots.txt");
  check(
    "proxy: robots points to the sitemap on the domain",
    page.body.includes(`Sitemap: http://${DOMAIN}:${port}/sitemap.xml`),
    page.body,
  );
  page = await hostGet(`${DOMAIN}:${port}`, "/sitemap.xml");
  check(
    "proxy: sitemap urls on the domain",
    page.status === 200 && page.body.includes(`<loc>http://${DOMAIN}:${port}/`),
    page.body.slice(0, 200),
  );
  page = await hostGet(`desconocido-${randomBytes(3).toString("hex")}.localhost:${port}`, "/");
  check("proxy: an unknown host -> 404", page.status === 404, page.status);

  r = await root("GET", "/platform/domains");
  check(
    "superadmin: sees the domain with its store",
    r.status === 200 && r.body.domains.some((d) => d.domain === DOMAIN && d.storeSlug === SLUGS[0] && d.live),
    r.status,
  );
  r = await ownerA("GET", "/platform/domains");
  check("superadmin list: an owner -> 403", r.status === 403, r);

  // Module off (D23), with store B: a verified domain without the module goes to the subdomain.
  const DOMAIN_B = `pro-e2e-b-${randomBytes(3).toString("hex")}.localhost`;
  await service.from("store_domains").insert({
    store_id: storeB.id,
    domain: DOMAIN_B,
    type: "custom",
    status: "verified",
    verified_at: new Date().toISOString(),
  });
  page = await hostGet(`${DOMAIN_B}:${port}`, "/products");
  check(
    "module off: the domain sends to the subdomain (307), the row is kept",
    page.status === 307 && page.location === `http://${SLUGS[1]}.kshop.localhost:${port}/products`,
    page,
  );
  await service.rpc("change_plan", {
    p_store_id: storeA.id,
    p_plan_code: "base",
    p_interval: "month",
    p_user_id: ids.ownerA,
  });
  ({ data: resolved } = await service.rpc("resolve_store_domain", { p_host: DOMAIN }));
  r = await ownerA("GET", `${A}/custom-domain`);
  check(
    "module off on A: not live, admin screen locked, row kept",
    resolved?.[0]?.live === false && r.status === 403,
    { resolved, r },
  );
  await service.rpc("change_plan", {
    p_store_id: storeA.id,
    p_plan_code: "pro",
    p_interval: "month",
    p_user_id: ids.ownerA,
  });
  ({ data: resolved } = await service.rpc("resolve_store_domain", { p_host: DOMAIN }));
  check("module back: live again", resolved?.[0]?.live === true, resolved);

  r = await ownerA("DELETE", `${A}/custom-domain`);
  check("domain: remove -> 204", r.status === 204, r);
  r = await ownerA("GET", `${A}/custom-domain`);
  check("domain: gone", r.body?.domain === null, r);
}

try {
  await run();
} catch (error) {
  console.error(error);
  results.push(false);
} finally {
  await cleanup();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
