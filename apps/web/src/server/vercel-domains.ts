import "server-only";
import type { DnsRecord } from "@kshop/core";
import { serverEnv } from "./env";

// Phase 6.4 (PRP-6 D20, D24): custom domains on the Vercel project through the Domains API.
// Without VERCEL_DOMAINS_TOKEN it runs in dry_run: nothing leaves the server, a domain is "added" with the usual records and
// "verified" on the first check (local dev and E2E). The live mode is prepared but NOT tested yet (Roberto, answer
// 10): try it with a real domain, with permission, before selling the module (the Hobby account cannot be used).

const API = "https://api.vercel.com";
const APEX_IP = "76.76.21.21";
const CNAME_TARGET = "cname.vercel-dns.com";

export type VercelDomainState = {
  /** verified on Vercel and the DNS points to it. */
  status: "pending" | "misconfigured" | "verified";
  records: DnsRecord[];
};

export const vercelDomainsMode = (): "dry_run" | "live" => (serverEnv.vercel ? "live" : "dry_run");

type VercelProjectDomain = {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string }[];
};

async function vercel<T>(method: string, path: string, body?: unknown): Promise<T> {
  const config = serverEnv.vercel!;
  const url = new URL(path, API);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new VercelError(
      json.error?.code ?? `http_${res.status}`,
      json.error?.message ?? `Vercel ${res.status}`,
    );
  }
  return json;
}

export class VercelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const relativeName = (domain: string, apex: string) =>
  domain === apex ? "@" : domain.slice(0, -apex.length - 1);

/** What the owner must set at their registrar: the domain and its www, plus Vercel's ownership TXT if asked. */
function recordsFor(domain: VercelProjectDomain): DnsRecord[] {
  const apex = domain.apexName;
  const records: DnsRecord[] =
    domain.name === apex
      ? [
          { type: "A", name: "@", value: APEX_IP },
          { type: "CNAME", name: "www", value: CNAME_TARGET },
        ]
      : [{ type: "CNAME", name: relativeName(domain.name, apex), value: CNAME_TARGET }];
  for (const v of domain.verification ?? []) {
    records.push({ type: v.type, name: relativeName(v.domain, apex), value: v.value });
  }
  return records;
}

const dryRunRecords = (domain: string): DnsRecord[] =>
  recordsFor({ name: domain, apexName: domain.split(".").slice(-2).join("."), verified: true });

/** Adds the domain (and www., redirecting to it) to the project and returns the records to configure. */
export async function addVercelDomain(domain: string): Promise<VercelDomainState> {
  if (vercelDomainsMode() === "dry_run") return { status: "pending", records: dryRunRecords(domain) };
  const projectId = serverEnv.vercel!.projectId;
  const added = await vercel<VercelProjectDomain>("POST", `/v10/projects/${projectId}/domains`, {
    name: domain,
  });
  if (added.name === added.apexName) {
    await vercel("POST", `/v10/projects/${projectId}/domains`, {
      name: `www.${domain}`,
      redirect: domain,
      redirectStatusCode: 308,
    }).catch((error: unknown) => {
      // www is a convenience: the domain works without it.
      console.error("Vercel www redirect failed.", { domain, message: (error as Error).message });
    });
  }
  return { status: added.verified ? "misconfigured" : "pending", records: recordsFor(added) };
}

/** Asks Vercel whether the domain is verified and its DNS points to the project. */
export async function checkVercelDomain(domain: string): Promise<VercelDomainState> {
  if (vercelDomainsMode() === "dry_run") return { status: "verified", records: dryRunRecords(domain) };
  const projectId = serverEnv.vercel!.projectId;
  let project = await vercel<VercelProjectDomain>("GET", `/v9/projects/${projectId}/domains/${domain}`);
  if (!project.verified) {
    project = await vercel<VercelProjectDomain>(
      "POST",
      `/v9/projects/${projectId}/domains/${domain}/verify`,
    ).catch(() => project);
  }
  const config = await vercel<{ misconfigured: boolean }>("GET", `/v6/domains/${domain}/config`);
  const status = !project.verified ? "pending" : config.misconfigured ? "misconfigured" : "verified";
  return { status, records: recordsFor(project) };
}

/** Removes the domain and its www. from the project (a domain that is not there is fine). */
export async function removeVercelDomain(domain: string): Promise<void> {
  if (vercelDomainsMode() === "dry_run") return;
  const projectId = serverEnv.vercel!.projectId;
  for (const name of [`www.${domain}`, domain]) {
    await vercel("DELETE", `/v9/projects/${projectId}/domains/${name}`).catch((error: unknown) => {
      if (!(error instanceof VercelError && error.code === "not_found")) throw error;
    });
  }
}
