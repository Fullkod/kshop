"use client";

import {
  CURRENCY_CODES,
  formatMoney,
  hasMinRole,
  SHIPPING_TYPE_LABELS,
  SHIPPING_TYPES,
  type CurrencyCode,
  type ShippingType,
} from "@kshop/core";
import { Alert, Badge, Button, Card, Dialog, FieldError, Input, Label, Select, useConfirm } from "@kshop/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";
import {
  useCheckoutSettings,
  type PaymentMethod,
  type ShippingMethod,
  type ShippingZone,
} from "../use-orders";

// Admin screens of the checkout settings: shipping zones and methods (module shipping) and payment methods.
// Only admins and owners edit them; the staff sees them read-only.

function useCanEdit() {
  const admin = useAdmin();
  return admin.role === null || hasMinRole(admin.role, "admin");
}

function Row({
  title,
  detail,
  badges,
  onEdit,
  onDelete,
}: {
  title: string;
  detail?: ReactNode;
  badges?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {title} {badges}
        </span>
        {detail && <span className="text-muted-foreground">{detail}</span>}
      </span>
      {onEdit && (
        <Button size="sm" variant="outline" onClick={onEdit}>
          Editar
        </Button>
      )}
      {onDelete && (
        <Button size="sm" variant="ghost" onClick={onDelete}>
          Borrar
        </Button>
      )}
    </li>
  );
}

export function ShippingPage() {
  const store = useStore();
  const { api } = useSession();
  const { data, error, reload } = useCheckoutSettings();
  const action = useApiAction();
  const { confirm } = useConfirm();
  const canEdit = useCanEdit();
  const [editingZone, setEditingZone] = useState<ShippingZone | "new" | null>(null);
  const [editingMethod, setEditingMethod] = useState<ShippingMethod | "new" | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const settings = api.checkoutSettings(store.id);
  const zoneName = (id: string | null) =>
    id ? (data.zones.find((z) => z.id === id)?.name ?? "—") : "Todas las zonas";
  const pickupPoints = data.warehouses.filter((w) => w.isPickupPoint);

  async function remove(resource: "zones" | "methods", id: string, name: string) {
    const what = resource === "zones" ? "la zona" : "el método de entrega";
    if (
      !(await confirm({ title: `¿Borrar ${what} «${name}»?`, confirmLabel: "Borrar", tone: "destructive" }))
    )
      return;
    if (await action.run(() => settings.remove(resource, id))) reload();
  }

  return (
    <div className="flex flex-col gap-8">
      {action.error && !editingZone && !editingMethod && <Alert variant="destructive">{action.error}</Alert>}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Zonas</h2>
            <p className="text-sm text-muted-foreground">
              Municipios o áreas donde entregas. El cliente elige la suya.
            </p>
          </div>
          {canEdit && <Button onClick={() => setEditingZone("new")}>Nueva zona</Button>}
        </div>
        <Dialog
          open={Boolean(editingZone)}
          onClose={() => setEditingZone(null)}
          title={editingZone === "new" ? "Nueva zona" : `Editar «${editingZone ? editingZone.name : ""}»`}
        >
          {action.error && (
            <Alert variant="destructive" className="mb-4">
              {action.error}
            </Alert>
          )}
          {editingZone && (
            <ZoneForm
              zone={editingZone === "new" ? null : editingZone}
              onCancel={() => setEditingZone(null)}
              onSave={async (input, id) => {
                const ok = await action.run(() =>
                  id ? settings.update("zones", id, input) : settings.create("zones", input),
                );
                if (ok) {
                  setEditingZone(null);
                  reload();
                }
              }}
              fieldErrors={action.fieldErrors}
            />
          )}
        </Dialog>
        <Card className="p-0">
          <ul className="divide-y">
            {data.zones.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">Sin zonas.</li>
            )}
            {data.zones.map((z) => (
              <Row
                key={z.id}
                title={z.name}
                detail={z.description}
                badges={!z.isActive && <Badge variant="muted">Inactiva</Badge>}
                onEdit={canEdit ? () => setEditingZone(z) : undefined}
                onDelete={canEdit ? () => remove("zones", z.id, z.name) : undefined}
              />
            ))}
          </ul>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Métodos de entrega</h2>
            <p className="text-sm text-muted-foreground">
              Mensajería con precio, recogida en un punto o «a convenir» (el precio se fija en cada pedido).
            </p>
          </div>
          {canEdit && <Button onClick={() => setEditingMethod("new")}>Nuevo método</Button>}
        </div>
        <Dialog
          open={Boolean(editingMethod)}
          onClose={() => setEditingMethod(null)}
          title={
            editingMethod === "new"
              ? "Nuevo método de entrega"
              : `Editar «${editingMethod ? editingMethod.name : ""}»`
          }
        >
          {action.error && (
            <Alert variant="destructive" className="mb-4">
              {action.error}
            </Alert>
          )}
          {editingMethod && (
            <MethodForm
              method={editingMethod === "new" ? null : editingMethod}
              zones={data.zones}
              pickupPoints={pickupPoints}
              currency={data.baseCurrency}
              fieldErrors={action.fieldErrors}
              onCancel={() => setEditingMethod(null)}
              onSave={async (input, id) => {
                const ok = await action.run(() =>
                  id ? settings.update("methods", id, input) : settings.create("methods", input),
                );
                if (ok) {
                  setEditingMethod(null);
                  reload();
                }
              }}
            />
          )}
        </Dialog>
        <Card className="p-0">
          <ul className="divide-y">
            {data.methods.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">Sin métodos.</li>
            )}
            {data.methods.map((m) => (
              <Row
                key={m.id}
                title={m.name}
                detail={[
                  SHIPPING_TYPE_LABELS[m.type],
                  zoneName(m.zoneId),
                  m.type === "to_agree"
                    ? null
                    : m.price === 0
                      ? "Gratis"
                      : formatMoney(m.price, data.baseCurrency),
                  m.freeOverSubtotal !== null
                    ? `gratis desde ${formatMoney(m.freeOverSubtotal, data.baseCurrency)}`
                    : null,
                  m.type === "pickup" ? data.warehouses.find((w) => w.id === m.warehouseId)?.name : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                badges={!m.isActive && <Badge variant="muted">Inactivo</Badge>}
                onEdit={canEdit ? () => setEditingMethod(m) : undefined}
                onDelete={canEdit ? () => remove("methods", m.id, m.name) : undefined}
              />
            ))}
          </ul>
        </Card>
        {pickupPoints.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Para ofrecer recogida, marca un almacén como punto de recogida en Catálogo › Almacenes.
          </p>
        )}
      </section>
    </div>
  );
}

function ZoneForm({
  zone,
  onSave,
  onCancel,
  fieldErrors,
}: {
  zone: ShippingZone | null;
  onSave: (input: { name: string; description?: string; isActive: boolean }, id?: string) => void;
  onCancel: () => void;
  fieldErrors: Record<string, string>;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    onSave(
      {
        name: String(d.get("name") ?? ""),
        description: String(d.get("description") ?? ""),
        isActive: d.get("isActive") === "on",
      },
      zone?.id,
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="zone-name">Nombre</Label>
        <Input id="zone-name" name="name" defaultValue={zone?.name} required />
        <FieldError>{fieldErrors.name}</FieldError>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="zone-description">Descripción (opcional)</Label>
        <Input id="zone-description" name="description" defaultValue={zone?.description ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={zone?.isActive ?? true} /> Activa
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit">Guardar</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function MethodForm({
  method,
  zones,
  pickupPoints,
  currency,
  onSave,
  onCancel,
  fieldErrors,
}: {
  method: ShippingMethod | null;
  zones: ShippingZone[];
  pickupPoints: { id: string; name: string }[];
  currency: string;
  onSave: (
    input: {
      zoneId: string | null;
      type: ShippingType;
      name: string;
      price: number;
      freeOverSubtotal: number | null;
      warehouseId: string | null;
      minDays: number | null;
      maxDays: number | null;
      isActive: boolean;
    },
    id?: string,
  ) => void;
  onCancel: () => void;
  fieldErrors: Record<string, string>;
}) {
  const [type, setType] = useState<ShippingType>(method?.type ?? "delivery");
  const optionalNumber = (v: FormDataEntryValue | null) =>
    v === null || String(v).trim() === "" ? null : Number(v);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    onSave(
      {
        zoneId: String(d.get("zoneId") ?? "") || null,
        type,
        name: String(d.get("name") ?? ""),
        price: type === "to_agree" ? 0 : Number(d.get("price") || 0),
        freeOverSubtotal: type === "to_agree" ? null : optionalNumber(d.get("freeOverSubtotal")),
        warehouseId: type === "pickup" ? String(d.get("warehouseId") ?? "") || null : null,
        minDays: optionalNumber(d.get("minDays")),
        maxDays: optionalNumber(d.get("maxDays")),
        isActive: d.get("isActive") === "on",
      },
      method?.id,
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="m-type">Tipo</Label>
        <Select id="m-type" value={type} onChange={(e) => setType(e.target.value as ShippingType)}>
          {SHIPPING_TYPES.map((t) => (
            <option key={t} value={t}>
              {SHIPPING_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="m-name">Nombre</Label>
        <Input id="m-name" name="name" defaultValue={method?.name} required />
        <FieldError>{fieldErrors.name}</FieldError>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="m-zone">Zona</Label>
        <Select id="m-zone" name="zoneId" defaultValue={method?.zoneId ?? ""}>
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </div>
      {type === "pickup" && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-warehouse">Punto de recogida</Label>
          <Select id="m-warehouse" name="warehouseId" defaultValue={method?.warehouseId ?? ""}>
            <option value="">Elige…</option>
            {pickupPoints.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <FieldError>{fieldErrors.warehouseId}</FieldError>
        </div>
      )}
      {type !== "to_agree" && (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="m-price">Precio ({currency})</Label>
            <Input id="m-price" name="price" inputMode="decimal" defaultValue={method?.price ?? 0} />
            <FieldError>{fieldErrors.price}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="m-free">Gratis desde ({currency}, opcional)</Label>
            <Input
              id="m-free"
              name="freeOverSubtotal"
              inputMode="decimal"
              defaultValue={method?.freeOverSubtotal ?? ""}
            />
          </div>
        </>
      )}
      <div className="flex gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-min">Días mín.</Label>
          <Input
            id="m-min"
            name="minDays"
            inputMode="numeric"
            defaultValue={method?.minDays ?? ""}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="m-max">Días máx.</Label>
          <Input
            id="m-max"
            name="maxDays"
            inputMode="numeric"
            defaultValue={method?.maxDays ?? ""}
            className="w-24"
          />
          <FieldError>{fieldErrors.maxDays}</FieldError>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={method?.isActive ?? true} /> Activo
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit">Guardar</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function PaymentMethodsPage() {
  const store = useStore();
  const { api } = useSession();
  const { data, error, reload } = useCheckoutSettings();
  const action = useApiAction();
  const { confirm } = useConfirm();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  const settings = api.checkoutSettings(store.id);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const input = {
      name: String(d.get("name") ?? ""),
      currencies: CURRENCY_CODES.filter((c) => d.get(`currency-${c}`) === "on"),
      instructions: String(d.get("instructions") ?? ""),
      isActive: d.get("isActive") === "on",
    };
    const id = editing && editing !== "new" ? editing.id : undefined;
    void action
      .run(() =>
        id ? settings.update("payment-methods", id, input) : settings.create("payment-methods", input),
      )
      .then((ok) => {
        if (ok) {
          setEditing(null);
          reload();
        }
      });
  }

  const current = editing && editing !== "new" ? editing : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cómo te pueden pagar. Las instrucciones se muestran al cliente en el checkout y en su pedido.
        </p>
        {canEdit && <Button onClick={() => setEditing("new")}>Nuevo método</Button>}
      </div>
      {action.error && !editing && <Alert variant="destructive">{action.error}</Alert>}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={current ? `Editar «${current.name}»` : "Nuevo método de pago"}
      >
        {action.error && (
          <Alert variant="destructive" className="mb-4">
            {action.error}
          </Alert>
        )}
        {editing && (
          <form key={current?.id ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="p-name">Nombre</Label>
              <Input id="p-name" name="name" defaultValue={current?.name} required />
              <FieldError>{action.fieldErrors.name}</FieldError>
            </div>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 text-sm font-medium">Monedas (ninguna = todas)</legend>
              {CURRENCY_CODES.map((c: CurrencyCode) => (
                <label key={c} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`currency-${c}`}
                    defaultChecked={current?.currencies.includes(c)}
                  />{" "}
                  {c}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <Label htmlFor="p-instructions">Instrucciones (opcional)</Label>
              <textarea
                id="p-instructions"
                name="instructions"
                rows={3}
                defaultValue={current?.instructions ?? ""}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={current?.isActive ?? true} /> Activo
            </label>
            <div className="flex gap-2">
              <Button type="submit">Guardar</Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <Card className="p-0">
        <ul className="divide-y">
          {data.paymentMethods.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">Sin métodos de pago.</li>
          )}
          {data.paymentMethods.map((p) => (
            <Row
              key={p.id}
              title={p.name}
              detail={[p.currencies.length ? p.currencies.join(", ") : "Todas las monedas", p.instructions]
                .filter(Boolean)
                .join(" · ")}
              badges={!p.isActive && <Badge variant="muted">Inactivo</Badge>}
              onEdit={canEdit ? () => setEditing(p) : undefined}
              onDelete={
                canEdit
                  ? async () => {
                      if (
                        !(await confirm({
                          title: `¿Borrar el método de pago «${p.name}»?`,
                          confirmLabel: "Borrar",
                          tone: "destructive",
                        }))
                      )
                        return;
                      if (await action.run(() => settings.remove("payment-methods", p.id))) reload();
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
