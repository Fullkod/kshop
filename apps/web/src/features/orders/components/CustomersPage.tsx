"use client";

import { formatPhone, hasMinRole, whatsappLink } from "@kshop/core";
import { AdminCustomersQuery, type RecoveryCodeResponse, type VariablesOf } from "@kshop/data";
import { Alert, Badge, Button, Card, Input } from "@kshop/ui";
import { useEffect, useState } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

type Row = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isBlocked: boolean;
  orders: number;
  lastOrderAt: string | null;
  createdAt: string;
};

/** Customers with an account in the store: search, block, and the recovery code sent over WhatsApp (D5). */
export function CustomersPage() {
  const store = useStore();
  const admin = useAdmin();
  const { graphql, api } = useSession();
  const action = useApiAction();
  const isAdmin = admin.role === null || hasMinRole(admin.role, "admin");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);
  const [code, setCode] = useState<(RecoveryCodeResponse & { name: string }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const q = query.trim();
      const digits = q.replace(/\D/g, "");
      const filter: VariablesOf<typeof AdminCustomersQuery>["filter"] = {
        storeId: { eq: store.id },
        ...(q && {
          or: [
            { firstName: { ilike: `%${q}%` } },
            { lastName: { ilike: `%${q}%` } },
            ...(digits.length >= 3 ? [{ phone: { ilike: `%${digits}%` } }] : []),
          ],
        }),
      };
      const r = await graphql.query(AdminCustomersQuery, { filter, first: 50 }).toPromise();
      if (cancelled) return;
      setTotal(r.data?.customersCollection?.totalCount ?? 0);
      setRows(
        (r.data?.customersCollection?.edges ?? []).map(({ node: c }) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
          phone: c.phone,
          email: c.email ?? null,
          isBlocked: c.isBlocked,
          orders: c.ordersCollection?.totalCount ?? 0,
          lastOrderAt: c.lastOrderAt ?? null,
          createdAt: c.createdAt,
        })),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [graphql, store.id, query, version]);

  async function toggleBlock(row: Row) {
    const ok = await action.run(() => api.customers(store.id).setBlocked(row.id, !row.isBlocked));
    if (ok) setVersion((v) => v + 1);
  }

  async function recovery(row: Row) {
    const result = await action.run(() => api.customers(store.id).recoveryCode(row.id));
    if (result) setCode({ ...result, name: row.name });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Clientes con cuenta en {store.name}. Cada cuenta es solo de esta tienda y se entra con el teléfono.
      </p>
      <Input
        type="search"
        placeholder="Buscar por nombre o teléfono"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
        aria-label="Buscar clientes"
      />
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {code && (
        <Alert variant="success" className="flex flex-col gap-2">
          <span>
            Código para {code.name}:{" "}
            <strong className="font-mono text-lg tracking-widest">{code.code}</strong> (vale 60 minutos y una
            sola vez).
            {code.sentByWhatsapp && " Ya se lo enviamos por el WhatsApp de Kshop."}
          </span>
          <a
            href={whatsappLink(
              code.phone,
              `Hola, ${code.name}. Tu código para cambiar la contraseña en ${store.name} es ${code.code}. Entra en «Olvidé mi contraseña» y escríbelo.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline"
          >
            {code.sentByWhatsapp ? "Enviarlo también desde tu WhatsApp" : "Enviar por WhatsApp"}
          </a>
        </Alert>
      )}
      {rows === null ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <Card className="text-muted-foreground">Todavía no hay clientes con cuenta.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {row.name} {row.isBlocked && <Badge variant="destructive">Bloqueado</Badge>}
                  </span>
                  <span className="text-muted-foreground">
                    {formatPhone(row.phone)}
                    {row.email && ` · ${row.email}`} · {row.orders} {row.orders === 1 ? "pedido" : "pedidos"}
                  </span>
                </span>
                {isAdmin && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.pending}
                      onClick={() => recovery(row)}
                    >
                      Código de recuperación
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.pending}
                      onClick={() => toggleBlock(row)}
                    >
                      {row.isBlocked ? "Desbloquear" : "Bloquear"}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {rows && <p className="text-sm text-muted-foreground">{total} clientes</p>}
    </div>
  );
}
