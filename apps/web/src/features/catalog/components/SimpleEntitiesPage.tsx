"use client";

import type { CatalogResourceInputs } from "@kshop/data";
import { Alert, Badge, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import { useApiAction, useCatalogApi, useCatalogStructure, type CatalogStructure } from "../use-catalog";

type Field = { key: string; label: string; type: "text" | "textarea" | "checkbox"; placeholder?: string };
type Row = { id: string; name: string } & Record<string, unknown>;

export type SimpleEntityConfig<R extends "brands" | "collections" | "warehouses"> = {
  resource: R;
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  rows: (data: CatalogStructure) => Row[];
  toInput: (values: Record<string, string | boolean>) => CatalogResourceInputs[R];
  badges?: (row: Row) => ReactNode;
  /** Message shown instead of the "new" button (e.g. module not in the plan). */
  createBlocked?: (data: CatalogStructure, has: (code: "multi_warehouse") => boolean) => string | null;
  canDelete?: (row: Row) => boolean;
};

/** List + inline form for flat catalog entities (brands, collections, warehouses). */
export function SimpleEntitiesPage<R extends "brands" | "collections" | "warehouses">({
  config,
}: {
  config: SimpleEntityConfig<R>;
}) {
  const { data, error, reload } = useCatalogStructure();
  const { catalog, canManageStructure, has } = useCatalogApi();
  const action = useApiAction();
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const rows = config.rows(data);
  const blocked = config.createBlocked?.(data, has as (code: "multi_warehouse") => boolean) ?? null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      config.fields.map((f) => [
        f.key,
        f.type === "checkbox" ? form.get(f.key) === "on" : String(form.get(f.key) ?? ""),
      ]),
    );
    const input = config.toInput(values);
    const ok = await action.run(() =>
      editing === "new" || editing === null
        ? catalog.create(config.resource, input)
        : catalog.update(config.resource, editing.id, input),
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  }

  async function onDelete(row: Row) {
    if (!window.confirm(`¿Borrar «${row.name}»?`)) return;
    const ok = await action.run(() => catalog.remove(config.resource, row.id));
    if (ok !== undefined) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{config.title}</h2>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        {canManageStructure &&
          (blocked ? (
            <Badge variant="gold">{blocked}</Badge>
          ) : (
            <Button onClick={() => setEditing("new")}>Nuevo</Button>
          ))}
      </div>

      {action.error && !editing && <Alert variant="destructive">{action.error}</Alert>}

      {editing && (
        <Card>
          <form
            onSubmit={onSubmit}
            className="grid gap-4 sm:grid-cols-2"
            key={editing === "new" ? "new" : editing.id}
          >
            <h3 className="font-semibold sm:col-span-2">
              {editing === "new" ? `Nuevo ${config.singular}` : `Editar «${editing.name}»`}
            </h3>
            {config.fields.map((f) =>
              f.type === "checkbox" ? (
                <label key={f.key} className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    name={f.key}
                    defaultChecked={editing === "new" ? true : Boolean(editing[f.key])}
                  />
                  {f.label}
                </label>
              ) : (
                <div
                  key={f.key}
                  className={
                    f.type === "textarea" ? "flex flex-col gap-2 sm:col-span-2" : "flex flex-col gap-2"
                  }
                >
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.key}
                      name={f.key}
                      rows={3}
                      placeholder={f.placeholder}
                      defaultValue={editing === "new" ? "" : String(editing[f.key] ?? "")}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                    />
                  ) : (
                    <Input
                      id={f.key}
                      name={f.key}
                      placeholder={f.placeholder}
                      defaultValue={editing === "new" ? "" : String(editing[f.key] ?? "")}
                      aria-invalid={!!action.fieldErrors[f.key]}
                    />
                  )}
                  <FieldError>{action.fieldErrors[f.key]}</FieldError>
                </div>
              ),
            )}
            {action.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                {action.error}
              </Alert>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={action.pending}>
                {action.pending ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay ninguno.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.name}</span>
                  {config.badges?.(row)}
                </div>
                {canManageStructure && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                      Editar
                    </Button>
                    {(config.canDelete?.(row) ?? true) && (
                      <Button variant="ghost" size="sm" onClick={() => onDelete(row)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
