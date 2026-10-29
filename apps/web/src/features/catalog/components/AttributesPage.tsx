"use client";

import { ATTRIBUTE_INPUT_TYPES, VALUE_LIST_TYPES, type AttributeInputType } from "@kshop/core";
import { Alert, Badge, Button, Card, Dialog, FieldError, Input, Label, Select, useConfirm } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, useCatalogApi, useCatalogStructure, type Attribute } from "../use-catalog";

export const INPUT_TYPE_LABELS: Record<AttributeInputType, string> = {
  dropdown: "Lista (una opción)",
  multiselect: "Lista (varias opciones)",
  swatch: "Colores / muestras",
  boolean: "Sí / No",
  numeric: "Número",
  text: "Texto libre",
  date: "Fecha",
};

type Draft = {
  id?: string;
  name: string;
  inputType: AttributeInputType;
  unit: string;
  filterableInStorefront: boolean;
  values: { id?: string; name: string; value?: string }[];
};

const emptyDraft: Draft = {
  name: "",
  inputType: "dropdown",
  unit: "",
  filterableInStorefront: true,
  values: [],
};

export function AttributesPage() {
  const { data, error, reload } = useCatalogStructure();
  const { catalog, canManageStructure } = useCatalogApi();
  const action = useApiAction();
  const { confirm } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newValue, setNewValue] = useState("");

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const edit = (a: Attribute) =>
    setDraft({
      id: a.id,
      name: a.name,
      inputType: a.inputType,
      unit: a.unit ?? "",
      filterableInStorefront: a.filterableInStorefront,
      values: a.values.map((v) => ({ id: v.id, name: v.name, value: v.value ?? undefined })),
    });

  function addValue() {
    const names = newValue
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!draft || names.length === 0) return;
    setDraft({
      ...draft,
      values: [
        ...draft.values,
        ...names.map((name) => ({ name, value: draft.inputType === "swatch" ? "#000000" : undefined })),
      ],
    });
    setNewValue("");
  }

  async function save() {
    if (!draft) return;
    const input = {
      name: draft.name,
      inputType: draft.inputType,
      unit: draft.unit,
      valueRequired: false,
      visibleInStorefront: true,
      filterableInStorefront: draft.filterableInStorefront,
      values: VALUE_LIST_TYPES.includes(draft.inputType)
        ? draft.values.map((v) => ({
            id: v.id,
            name: v.name,
            value: draft.inputType === "swatch" ? v.value : undefined,
          }))
        : [],
    };
    const ok = await action.run(() =>
      draft.id ? catalog.update("attributes", draft.id, input) : catalog.create("attributes", input),
    );
    if (ok) {
      setDraft(null);
      reload();
    }
  }

  async function onDelete(a: Attribute) {
    if (
      !(await confirm({
        title: `¿Borrar el atributo «${a.name}» y sus valores?`,
        confirmLabel: "Borrar",
        tone: "destructive",
      }))
    )
      return;
    if ((await action.run(() => catalog.remove("attributes", a.id))) !== undefined) reload();
  }

  const usesValues = draft ? VALUE_LIST_TYPES.includes(draft.inputType) : false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Atributos</h2>
          <p className="text-sm text-muted-foreground">Características como Talla, Color o Material.</p>
        </div>
        {canManageStructure && <Button onClick={() => setDraft({ ...emptyDraft })}>Nuevo atributo</Button>}
      </div>

      {action.error && !draft && <Alert variant="destructive">{action.error}</Alert>}

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Editar atributo" : "Nuevo atributo"}
        size="lg"
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="attr-name">Nombre</Label>
                <Input
                  id="attr-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <FieldError>{action.fieldErrors.name ?? action.fieldErrors.slug}</FieldError>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="attr-type">Tipo</Label>
                <Select
                  id="attr-type"
                  value={draft.inputType}
                  onChange={(e) => setDraft({ ...draft, inputType: e.target.value as AttributeInputType })}
                >
                  {ATTRIBUTE_INPUT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {INPUT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              {draft.inputType === "numeric" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="attr-unit">Unidad (opcional)</Label>
                  <Input
                    id="attr-unit"
                    value={draft.unit}
                    placeholder="cm, kg, ml…"
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.filterableInStorefront}
                  onChange={(e) => setDraft({ ...draft, filterableInStorefront: e.target.checked })}
                />
                Usar como filtro en la tienda
              </label>
            </div>

            {usesValues && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="attr-new-value">Valores</Label>
                <div className="flex flex-wrap gap-2" data-testid="attribute-values">
                  {draft.values.map((v, i) => (
                    <span
                      key={v.id ?? `new-${i}`}
                      className="flex items-center gap-1 rounded-full border px-2 py-1 text-sm"
                    >
                      {draft.inputType === "swatch" && (
                        <input
                          type="color"
                          aria-label={`Color de ${v.name}`}
                          value={v.value ?? "#000000"}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              values: draft.values.map((x, j) =>
                                j === i ? { ...x, value: e.target.value } : x,
                              ),
                            })
                          }
                          className="h-5 w-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
                        />
                      )}
                      {v.name}
                      <button
                        type="button"
                        aria-label={`Quitar ${v.name}`}
                        className="px-1 text-muted-foreground hover:text-destructive"
                        onClick={() => setDraft({ ...draft, values: draft.values.filter((_, j) => j !== i) })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    id="attr-new-value"
                    value={newValue}
                    placeholder="Escribe un valor o varios separados por comas (S, M, L)"
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addValue();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addValue}>
                    Añadir
                  </Button>
                </div>
              </div>
            )}

            {action.error && <Alert variant="destructive">{action.error}</Alert>}
            <div className="flex gap-2">
              <Button onClick={save} disabled={action.pending}>
                {action.pending ? "Guardando…" : "Guardar"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {data.attributes.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay atributos.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {data.attributes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {a.name} <Badge variant="muted">{INPUT_TYPE_LABELS[a.inputType]}</Badge>
                  </span>
                  {a.values.length > 0 && (
                    <span className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                      {a.values.map((v) => (
                        <span key={v.id} className="flex items-center gap-1">
                          {v.value && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border"
                              style={{ background: v.value }}
                            />
                          )}
                          {v.name}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {canManageStructure && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => edit(a)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(a)}>
                      Borrar
                    </Button>
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
