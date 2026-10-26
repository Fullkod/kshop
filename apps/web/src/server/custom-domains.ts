import "server-only";
import type { CustomDomainInput, CustomDomainStatus, DnsRecord } from "@kshop/core";
import type { CustomDomain, CustomDomainResponse, PlatformDomain } from "@kshop/data";
import { revalidateTag } from "next/cache";
import { publicEnv } from "@/env";
import { serverEnv } from "./env";
import { HttpError, notFound } from "./http";
import { storeCacheTag } from "./stores";
import { getServiceClient } from "./supabase";
import { addVercelDomain, checkVercelDomain, removeVercelDomain, vercelDomainsMode } from "./vercel-domains";

// Phase 6.4 (PRP-6 D20–D23): the owner asks for their domain in Admin › Dominio propio; Kshop adds it to Vercel,
// shows the DNS records and «Comprobar» marks it verified. The superadmin sees every domain. The proxy picks it up
// within a minute; turning the module off keeps the row and the storefront goes back to the subdomain.

const COLUMNS = "id, store_id, domain, status, dns_records, verified_at, checked_at, last_error, created_at";

type DomainRow = {
  id: string;
  store_id: string;
  domain: string;
  status: CustomDomainStatus;
  dns_records: DnsRecord[];
  verified_at: string | null;
  checked_at: string | null;
  last_error: string | null;
  created_at: string;
};

const toDomain = (row: DomainRow, live: boolean): CustomDomain => ({
  id: row.id,
  domain: row.domain,
  status: row.status,
  dnsRecords: row.dns_records,
  verifiedAt: row.verified_at,
  checkedAt: row.checked_at,
  lastError: row.last_error,
  createdAt: row.created_at,
  live,
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

async function storeSlug(storeId: string): Promise<string> {
  const { data, error } = await getServiceClient().from("stores").select("slug").eq("id", storeId).single();
  if (error) throw error;
  return data.slug;
}

/** The storefront card carries the live domain (canonical, sitemap): expire it on every change. */
async function expireStore(storeId: string) {
  revalidateTag(storeCacheTag(await storeSlug(storeId)), { expire: 0 });
}

async function isLive(storeId: string): Promise<boolean> {
  const { data } = await getServiceClient().rpc("resolve_store_custom_domain", {
    p_slug: await storeSlug(storeId),
  });
  return !!data;
}

async function findRow(storeId: string): Promise<DomainRow | null> {
  const { data, error } = await getServiceClient()
    .from("store_domains")
    .select(COLUMNS)
    .eq("store_id", storeId)
    .eq("type", "custom")
    .maybeSingle<DomainRow>();
  if (error) throw error;
  return data;
}

export async function getCustomDomain(storeId: string): Promise<CustomDomainResponse> {
  const row = await findRow(storeId);
  return {
    domain: row && toDomain(row, row.verified_at ? await isLive(storeId) : false),
    mode: vercelDomainsMode(),
  };
}

/** Domains of the platform itself and test hosts outside local dev are not allowed. */
function assertAllowed(domain: string) {
  const platform = serverEnv.canonicalPlatformDomain;
  if (
    domain === platform ||
    domain.endsWith(`.${platform}`) ||
    domain === "fullkod.com" ||
    domain.endsWith(".fullkod.com")
  ) {
    throw new HttpError(422, "invalid_input", "Ese dominio es de Kshop; escribe el dominio que compraste.", {
      domain: ["Ese dominio es de Kshop."],
    });
  }
  if (domain.endsWith(".localhost") && !publicEnv.platformDomain.includes("localhost")) {
    throw new HttpError(422, "invalid_input", "Escribe un dominio público, por ejemplo mitienda.com.", {
      domain: ["Dominio no válido."],
    });
  }
}

export async function requestCustomDomain(
  storeId: string,
  input: CustomDomainInput,
  userId: string,
): Promise<CustomDomain> {
  assertAllowed(input.domain);
  if (await findRow(storeId)) {
    throw new HttpError(409, "conflict", "La tienda ya tiene un dominio propio. Quítalo para poner otro.");
  }
  const db = getServiceClient();
  const { data, error } = await db
    .from("store_domains")
    .insert({
      store_id: storeId,
      domain: input.domain,
      type: "custom",
      status: "pending",
      requested_by: userId,
    })
    .select(COLUMNS)
    .single<DomainRow>();
  if (error) {
    if (error.code === "23505") {
      throw new HttpError(409, "conflict", "Ese dominio ya está conectado a otra tienda.", {
        domain: ["Ese dominio ya está en uso."],
      });
    }
    throw error;
  }
  let update: Partial<DomainRow>;
  try {
    const state = await addVercelDomain(input.domain);
    update = { status: state.status === "verified" ? "pending" : state.status, dns_records: state.records };
  } catch (e) {
    console.error("Vercel add domain failed.", { domain: input.domain, message: errorText(e) });
    update = { status: "error", last_error: errorText(e) };
  }
  const saved = await db
    .from("store_domains")
    .update(update)
    .eq("id", data.id)
    .select(COLUMNS)
    .single<DomainRow>();
  if (saved.error) throw saved.error;
  return toDomain(saved.data, false);
}

async function checkRow(row: DomainRow): Promise<DomainRow> {
  const now = new Date().toISOString();
  let update: Partial<DomainRow>;
  try {
    const state = await checkVercelDomain(row.domain);
    update = {
      status: state.status,
      dns_records: state.records,
      verified_at: state.status === "verified" ? (row.verified_at ?? now) : null,
      checked_at: now,
      last_error: null,
    };
  } catch (e) {
    // A Vercel hiccup keeps a working domain working.
    update = { checked_at: now, last_error: errorText(e) };
    if (!row.verified_at) update.status = "error";
  }
  const { data, error } = await getServiceClient()
    .from("store_domains")
    .update(update)
    .eq("id", row.id)
    .select(COLUMNS)
    .single<DomainRow>();
  if (error) throw error;
  await expireStore(row.store_id);
  return data;
}

export async function checkCustomDomain(storeId: string): Promise<CustomDomain> {
  const row = await findRow(storeId);
  if (!row) throw notFound("Dominio");
  const checked = await checkRow(row);
  return toDomain(checked, checked.verified_at ? await isLive(storeId) : false);
}

export async function removeCustomDomain(storeId: string): Promise<void> {
  const row = await findRow(storeId);
  if (!row) throw notFound("Dominio");
  await removeVercelDomain(row.domain);
  const { error } = await getServiceClient().from("store_domains").delete().eq("id", row.id);
  if (error) throw error;
  await expireStore(storeId);
}

// --- Superadmin -------------------------------------------------------------------------------------------------

export async function listPlatformDomains(): Promise<{
  domains: PlatformDomain[];
  mode: CustomDomainResponse["mode"];
}> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("store_domains")
    .select(`${COLUMNS}, stores (name, slug)`)
    .eq("type", "custom")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as (DomainRow & { stores: { name: string; slug: string } })[];
  const domains = await Promise.all(
    rows.map(async (row) => {
      const live = row.verified_at
        ? !!(await db.rpc("resolve_store_custom_domain", { p_slug: row.stores.slug })).data
        : false;
      return {
        ...toDomain(row, live),
        storeId: row.store_id,
        storeName: row.stores.name,
        storeSlug: row.stores.slug,
      };
    }),
  );
  return { domains, mode: vercelDomainsMode() };
}

async function rowById(id: string): Promise<DomainRow> {
  const { data, error } = await getServiceClient()
    .from("store_domains")
    .select(COLUMNS)
    .eq("id", id)
    .eq("type", "custom")
    .maybeSingle<DomainRow>();
  if (error) throw error;
  if (!data) throw notFound("Dominio");
  return data;
}

export async function checkPlatformDomain(id: string): Promise<void> {
  await checkRow(await rowById(id));
}

export async function removePlatformDomain(id: string): Promise<void> {
  await removeCustomDomain((await rowById(id)).store_id);
}
