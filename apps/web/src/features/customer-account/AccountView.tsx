"use client";

import { formatPhone } from "@kshop/core";
import { ApiError, type CustomerAddress } from "@kshop/data";
import { Alert, Button, Card, Input, Label } from "@kshop/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useStore } from "@/lib/store-context";
import { useCustomerSession } from "./CustomerSession";

/** Guard for customer-only pages: sends guests to the sign-in page and back here afterwards. */
export function RequireCustomer({ path, children }: { path: string; children: ReactNode }) {
  const { ready, session, customer } = useCustomerSession();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) router.replace(`/account/login?next=${encodeURIComponent(path)}`);
  }, [ready, session, router, path]);
  if (!customer) return <p className="py-12 text-center text-muted-foreground">Cargando…</p>;
  return children;
}

export function AccountView({ orders }: { orders?: ReactNode }) {
  return (
    <RequireCustomer path="/account">
      <div className="flex flex-col gap-6">
        {orders}
        <ProfileCard />
        <AddressesCard />
      </div>
    </RequireCustomer>
  );
}

function ProfileCard() {
  const store = useStore();
  const { customer, api, setCustomer, signOut } = useCustomerSession();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  if (!customer) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      const result = await api.customer(store.id).updateProfile({
        firstName: String(data.get("firstName") ?? ""),
        lastName: String(data.get("lastName") ?? "") || undefined,
        email: String(data.get("email") ?? "") || undefined,
        acceptsMarketing: data.get("acceptsMarketing") === "on",
      });
      setCustomer(result.customer);
      setMessage({ ok: true, text: "Datos guardados." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof ApiError ? error.message : "No se pudo guardar." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Mis datos</h2>
          <p className="text-sm text-muted-foreground">Teléfono: {formatPhone(customer.phone)}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            // Full navigation: a client transition would race with the guest redirect of RequireCustomer.
            window.location.replace("/");
          }}
        >
          Cerrar sesión
        </Button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" name="firstName" defaultValue={customer.firstName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Apellidos</Label>
          <Input id="lastName" name="lastName" defaultValue={customer.lastName ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="email">Email (opcional)</Label>
          <Input id="email" name="email" type="email" defaultValue={customer.email ?? ""} />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="acceptsMarketing" defaultChecked={customer.acceptsMarketing} className="mt-1" />
          Quiero recibir novedades y ofertas de {store.name}.
        </label>
        {message && (
          <Alert variant={message.ok ? "success" : "destructive"} className="sm:col-span-2">
            {message.text}
          </Alert>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddressesCard() {
  const store = useStore();
  const { api } = useCustomerSession();
  const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .customer(store.id)
      .addresses()
      .then((r) => setAddresses(r.addresses))
      .catch(() => setAddresses([]));
  }, [api, store.id]);

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const { address } = await api.customer(store.id).createAddress({
        recipient: String(data.get("recipient") ?? ""),
        address: String(data.get("address") ?? ""),
        reference: String(data.get("reference") ?? "") || undefined,
        isDefault: !addresses?.length,
      });
      setAddresses((list) => [...(list ?? []), address]);
      setAdding(false);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar.");
    }
  }

  async function onDelete(id: string) {
    await api.customer(store.id).deleteAddress(id);
    setAddresses((list) => list?.filter((a) => a.id !== id) ?? null);
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Mis direcciones</h2>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Añadir
          </Button>
        )}
      </div>
      {addresses === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : addresses.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">Aún no tienes direcciones guardadas.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-3">
              <div className="text-sm">
                <p className="font-medium">
                  {a.recipient} {a.isDefault && <span className="text-muted-foreground">(principal)</span>}
                </p>
                <p>{a.address}</p>
                {a.reference && <p className="text-muted-foreground">{a.reference}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onDelete(a.id)} aria-label={`Borrar dirección de ${a.recipient}`}>
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <form onSubmit={onAdd} className="mt-4 flex flex-col gap-3 border-t pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipient">Quién recibe</Label>
            <Input id="recipient" name="recipient" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" name="address" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Referencias (opcional)</Label>
            <Input id="reference" name="reference" />
          </div>
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit">Guardar dirección</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
