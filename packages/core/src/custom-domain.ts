import { z } from "zod";

// Phase 6.4 (PRP-6 D20, D21): the owner types the domain they bought; "www." is added on Vercel as a redirect.

export const CUSTOM_DOMAIN_STATUSES = ["pending", "misconfigured", "verified", "error"] as const;
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number];

export const CUSTOM_DOMAIN_STATUS_LABELS: Record<CustomDomainStatus, string> = {
  pending: "Esperando DNS",
  misconfigured: "DNS mal configurado",
  verified: "Activo",
  error: "Error",
};

const HOSTNAME = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "https://WWW.MiTienda.com/" -> "mitienda.com". */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

export const customDomainInputSchema = z.object({
  domain: z
    .string()
    .max(300)
    .transform(normalizeDomain)
    .pipe(z.string().regex(HOSTNAME, { error: "Escribe un dominio válido, por ejemplo mitienda.com." })),
});
export type CustomDomainInput = z.infer<typeof customDomainInputSchema>;

/** DNS record the owner must create at their registrar (what Vercel asks for). */
export type DnsRecord = { type: string; name: string; value: string };
