"use client";

import { CUSTOM_DOMAIN_STATUS_LABELS, storePublicOrigin } from "@kshop/core";
import { ApiError, type CustomDomain, type CustomDomainResponse } from "@kshop/data";
import { Alert, Badge, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { platformProtocol, publicEnv } from "@/env";
import { formatDate, storeUrl } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useStore } from "@/lib/store-context";

// Admin › Dominio propio (module custom_domain, PRP-6 D20–D23). The owner buys the domain, types it here, sets the
// DNS records at their registrar and presses «Comprobar». The admin always stays on the subdomain.

export function statusBadge(domain: CustomDomain) {
  if (domain.live) return <Badge variant="success">Activo</Badge>;
  if (domain.verifiedAt) return <Badge variant="muted">Verificado, sin el módulo</Badge>;
  return (
    <Badge
      variant={domain.status === "error" || domain.status === "misconfigured" ? "destructive" : "default"}
    >
      {CUSTOM_DOMAIN_STATUS_LABELS[domain.status]}
    </Badge>
  );
}

export function DnsRecords({ domain }: { domain: CustomDomain }) {
  if (!domain.dnsRecords.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="dns-records">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-4 font-medium">Tipo</th>
            <th className="py-1 pr-4 font-medium">Nombre</th>
            <th className="py-1 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {domain.dnsRecords.map((r) => (
            <tr key={`${r.type}-${r.name}-${r.value}`} className="border-t">
              <td className="py-1 pr-4 font-mono">{r.type}</td>
              <td className="py-1 pr-4 font-mono">{r.name}</td>
              <td className="break-all py-1 font-mono">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CustomDomainPage() {
  const store = useStore();
  const admin = useAdmin();
  const { api } = useSession();
  const [data, setData] = useState<CustomDomainResponse | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(
    () =>
      api
        .customDomain(store.id)
        .get()
        .then(setData, (e: unknown) =>
          setError(e instanceof ApiError ? e.message : "No se pudo cargar el dominio."),
        ),
    [api, store.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<string | null>) {
    setPending(true);
    setError(null);
    setFieldError(null);
    setNotice(null);
    try {
      const message = await action();
      await load();
      setNotice(message);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFieldError(e.fields?.domain?.[0] ?? null);
      } else setError("No se pudo completar la acción.");
    } finally {
      setPending(false);
    }
  }

  const onRequest = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api.customDomain(store.id).request({ domain: input });
      setInput("");
      return "Dominio añadido. Pon estos registros en tu proveedor de dominio y pulsa «Comprobar».";
    });
  };
  const onCheck = () =>
    run(async () => {
      const { domain } = await api.customDomain(store.id).check();
      return domain.live
        ? "¡Listo! Tu tienda ya se ve en tu dominio (puede tardar un minuto)."
        : domain.status === "verified"
          ? "El dominio está verificado."
          : "Todavía no vemos los registros DNS. Pueden tardar hasta unas horas en propagarse.";
    });
  const onRemove = () => {
    if (!window.confirm("¿Quitar el dominio? La tienda volverá a verse solo en su dirección de Kshop."))
      return;
    void run(async () => {
      await api.customDomain(store.id).remove();
      return "Dominio quitado.";
    });
  };

  if (admin.role === "staff") {
    return <Alert variant="destructive">Solo el dueño y los administradores gestionan el dominio.</Alert>;
  }
  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  const domain = data.domain;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dominio propio</h1>
        <p className="text-sm text-muted-foreground">
          Tu tienda se ve en <span className="font-medium">{storeUrl(store.slug)}</span>. Con un dominio
          propio (que compras tú, por ejemplo mitienda.com) los clientes la verán ahí y la dirección de Kshop
          les llevará a él. El panel de administración sigue en la dirección de Kshop.
        </p>
        {data.mode === "dry_run" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Modo de prueba: la conexión con el alojamiento está simulada y el dominio se verifica al
            comprobarlo.
          </p>
        )}
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {!domain ? (
        <Card>
          <form onSubmit={onRequest} className="flex flex-col gap-3">
            <Label htmlFor="domain">Tu dominio</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="domain"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="mitienda.com"
                autoComplete="off"
                required
              />
              <Button type="submit" disabled={pending || !input.trim()}>
                Conectar dominio
              </Button>
            </div>
            <FieldError>{fieldError}</FieldError>
            <p className="text-xs text-muted-foreground">
              Escribe el dominio sin «www»: lo añadimos también y lleva al principal.
            </p>
          </form>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4" data-testid="custom-domain">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{domain.domain}</span>
              {statusBadge(domain)}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void onCheck()} disabled={pending}>
                Comprobar
              </Button>
              <Button variant="ghost" onClick={onRemove} disabled={pending}>
                Quitar
              </Button>
            </div>
          </div>

          {domain.live ? (
            <p className="text-sm">
              Tu tienda se ve en{" "}
              <a
                href={storePublicOrigin(
                  { slug: store.slug, customDomain: domain.domain },
                  publicEnv.platformDomain,
                  platformProtocol,
                )}
                target="_blank"
                className="text-primary hover:underline"
              >
                {domain.domain}
              </a>
              .
            </p>
          ) : domain.verifiedAt ? (
            <Alert>
              El dominio está verificado pero tu plan ya no incluye «Dominio propio» (o la tienda no está
              activa): la tienda se ve en la dirección de Kshop. Vuelve a verse en tu dominio al reactivarlo.
            </Alert>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                En el panel de tu proveedor de dominio crea estos registros DNS y después pulsa «Comprobar».
                Los cambios de DNS pueden tardar desde minutos hasta unas horas.
              </p>
              <DnsRecords domain={domain} />
            </>
          )}

          {domain.lastError && <p className="text-xs text-destructive">Último error: {domain.lastError}</p>}
          <p className="text-xs text-muted-foreground">
            Pedido el {formatDate(domain.createdAt)}
            {domain.checkedAt && ` · Comprobado el ${formatDate(domain.checkedAt)}`}
          </p>
        </Card>
      )}
    </div>
  );
}
