"use client";

import { formatUsd, type ModuleCode } from "@kshop/core";
import { ApiError, type BillingModule, type BillingPlan } from "@kshop/data";
import { Alert, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "@/lib/session";

// Superadmin › Planes: price (USD/month and yearly), limits and modules of each plan, and the price of every module
// sold alone. New prices apply to the next invoices; frozen founder prices and bought add-ons keep theirs.

type Catalog = { plans: BillingPlan[]; modules: BillingModule[] };

export default function SuperadminPlansPage() {
  const { api } = useSession();
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.platform
      .plans()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("No se pudieron cargar los planes."));
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function run(action: () => Promise<Catalog>, done: string) {
    setPending(true);
    setError(null);
    setFields({});
    setNotice(null);
    try {
      setData(await action());
      setNotice(done);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Algo salió mal.");
      if (e instanceof ApiError) {
        setFields(Object.fromEntries(Object.entries(e.fields ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
      }
    } finally {
      setPending(false);
    }
  }

  if (!data)
    return error ? (
      <Alert variant="destructive">{error}</Alert>
    ) : (
      <p className="text-muted-foreground">Cargando…</p>
    );

  const decimal = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));
  const optional = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : decimal(v));

  function onPlan(plan: BillingPlan, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        api.platform.updatePlan(plan.code, {
          price: decimal(form.get("price")),
          yearlyPrice: optional(form.get("yearlyPrice")),
          isPublic: form.get("isPublic") === "on",
          modules: form.getAll("modules").map(String) as ModuleCode[],
          limits: {
            maxProducts: optional(form.get("maxProducts")),
            maxStaff: optional(form.get("maxStaff")),
          },
        }),
      `Plan ${plan.name} guardado. Sus tiendas ya tienen los módulos nuevos.`,
    );
  }

  function onAddons(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changed = data!.modules.filter((m) => optional(form.get(`addon-${m.code}`)) !== m.addonPrice);
    void run(
      async () => {
        let latest = data!;
        for (const m of changed)
          latest = await api.platform.setAddonPrice(m.code, optional(form.get(`addon-${m.code}`)));
        return latest;
      },
      changed.length ? "Precios de los módulos guardados." : "Sin cambios.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Planes y módulos</h1>
        <p className="text-sm text-muted-foreground">
          Precios en USD. Los cambios valen para las próximas facturas; los precios congelados de fundador y
          los módulos ya contratados no cambian.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        {data.plans.map((plan) => (
          <Card key={plan.code} data-testid={`plan-${plan.code}`}>
            <form
              onSubmit={(e) => onPlan(plan, e)}
              className="flex flex-col gap-3"
              key={JSON.stringify(plan)}
            >
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`price-${plan.code}`}>USD al mes</Label>
                  <Input
                    id={`price-${plan.code}`}
                    name="price"
                    inputMode="decimal"
                    defaultValue={plan.price}
                    required
                  />
                  <FieldError>{fields.price}</FieldError>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`yearly-${plan.code}`}>USD al año (vacío = sin anual)</Label>
                  <Input
                    id={`yearly-${plan.code}`}
                    name="yearlyPrice"
                    inputMode="decimal"
                    defaultValue={plan.yearlyPrice ?? ""}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`products-${plan.code}`}>Productos (vacío = sin límite)</Label>
                  <Input
                    id={`products-${plan.code}`}
                    name="maxProducts"
                    inputMode="numeric"
                    defaultValue={plan.limits.maxProducts ?? ""}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`staff-${plan.code}`}>Equipo, sin contar al dueño</Label>
                  <Input
                    id={`staff-${plan.code}`}
                    name="maxStaff"
                    inputMode="numeric"
                    defaultValue={plan.limits.maxStaff ?? ""}
                  />
                </div>
              </div>
              <fieldset className="grid gap-1 sm:grid-cols-2">
                <legend className="mb-1 text-sm font-medium">Módulos incluidos</legend>
                {data.modules.map((m) => (
                  <label key={m.code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="modules"
                      value={m.code}
                      defaultChecked={plan.modules.includes(m.code)}
                      disabled={m.code === "catalog"}
                    />
                    {m.name}
                    {m.code === "catalog" && <input type="hidden" name="modules" value="catalog" />}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isPublic" defaultChecked={plan.isPublic} /> Visible para las
                tiendas
              </label>
              <Button type="submit" className="self-start" disabled={pending}>
                Guardar {plan.name}
              </Button>
            </form>
          </Card>
        ))}
      </div>

      <Card>
        <form onSubmit={onAddons} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Módulos sueltos (USD al mes)</h2>
          <p className="text-sm text-muted-foreground">
            Vacío = solo dentro de un plan. En el pago anual cuentan 10 meses.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.modules
              .filter((m) => m.code !== "catalog")
              .map((m) => (
                <div key={m.code} className="flex flex-col gap-1">
                  <Label htmlFor={`addon-${m.code}`}>
                    {m.name}
                    {m.addonPrice != null && (
                      <span className="text-muted-foreground"> · {formatUsd(m.addonPrice)}</span>
                    )}
                  </Label>
                  <Input
                    id={`addon-${m.code}`}
                    name={`addon-${m.code}`}
                    inputMode="decimal"
                    defaultValue={m.addonPrice ?? ""}
                  />
                </div>
              ))}
          </div>
          <Button type="submit" className="self-start" disabled={pending}>
            Guardar precios
          </Button>
        </form>
      </Card>
    </div>
  );
}
