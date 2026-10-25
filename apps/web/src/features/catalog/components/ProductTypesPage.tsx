"use client";

import { Alert, Badge, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, useCatalogApi, useCatalogStructure, type ProductType } from "../use-catalog";

type Role = "none" | "product" | "variant-selection" | "variant";
type Draft = {
  id?: string;
  name: string;
  hasVariants: boolean;
  isShippingRequired: boolean;
  roles: Record<string, Role>;
};

const ROLE_LABELS: Record<Role, string> = {
  none: "No se usa",
  product: "Del producto (ej. Material)",
  "variant-selection": "Elige el cliente (ej. Talla, Color)",
  variant: "De la variante, informativo",
};

export function ProductTypesPage() {
  const { data, error, reload } = useCatalogStructure();
  const { catalog, canManageStructure } = useCatalogApi();
  const action = useApiAction();
  const [draft, setDraft] = useState<Draft | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const attrName = new Map(data.attributes.map((a) => [a.id, a.name]));

  const edit = (t: ProductType) =>
    setDraft({
      id: t.id,
      name: t.name,
      hasVariants: t.hasVariants,
      isShippingRequired: t.isShippingRequired,
      roles: Object.fromEntries(
        t.attributes.map((a) => [
          a.attributeId,
          a.scope === "product" ? "product" : a.variantSelection ? "variant-selection" : "variant",
        ]),
      ),
    });

  async function save() {
    if (!draft) return;
    type TypeAttribute = { attributeId: string; scope: "product" | "variant"; variantSelection: boolean };
    const attributes = data!.attributes.flatMap((a): TypeAttribute[] => {
      const role = draft.roles[a.id] ?? "none";
      if (role === "none") return [];
      if (!draft.hasVariants || role === "product")
        return [{ attributeId: a.id, scope: "product", variantSelection: false }];
      return [{ attributeId: a.id, scope: "variant", variantSelection: role === "variant-selection" }];
    });
    const input = {
      name: draft.name,
      hasVariants: draft.hasVariants,
      isShippingRequired: draft.isShippingRequired,
      attributes,
    };
    const ok = await action.run(() =>
      draft.id ? catalog.update("product-types", draft.id, input) : catalog.create("product-types", input),
    );
    if (ok) {
      setDraft(null);
      reload();
    }
  }

  async function onDelete(t: ProductType) {
    if (!window.confirm(`¿Borrar el tipo «${t.name}»?`)) return;
    if ((await action.run(() => catalog.remove("product-types", t.id))) !== undefined) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tipos de producto</h2>
          <p className="text-sm text-muted-foreground">
            Definen qué atributos tiene cada producto y si se vende en variantes (talla, color…).
          </p>
        </div>
        {canManageStructure && (
          <Button
            onClick={() => setDraft({ name: "", hasVariants: true, isShippingRequired: true, roles: {} })}
          >
            Nuevo tipo
          </Button>
        )}
      </div>

      {action.error && !draft && <Alert variant="destructive">{action.error}</Alert>}

      {draft && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type-name">Nombre</Label>
            <Input
              id="type-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <FieldError>{action.fieldErrors.name ?? action.fieldErrors.slug}</FieldError>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.hasVariants}
              onChange={(e) => setDraft({ ...draft, hasVariants: e.target.checked })}
            />
            Se vende en variantes (cada combinación tiene su SKU, precio y stock)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isShippingRequired}
              onChange={(e) => setDraft({ ...draft, isShippingRequired: e.target.checked })}
            />
            Requiere entrega física
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Atributos</span>
            {data.attributes.length === 0 && (
              <p className="text-sm text-muted-foreground">Primero crea atributos en la pestaña Atributos.</p>
            )}
            {data.attributes.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="text-sm">{a.name}</span>
                <select
                  aria-label={`Uso de ${a.name}`}
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                  value={draft.roles[a.id] ?? "none"}
                  onChange={(e) =>
                    setDraft({ ...draft, roles: { ...draft.roles, [a.id]: e.target.value as Role } })
                  }
                >
                  {(draft.hasVariants
                    ? (["none", "product", "variant-selection", "variant"] as Role[])
                    : (["none", "product"] as Role[])
                  ).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {action.error && <Alert variant="destructive">{action.error}</Alert>}
          <div className="flex gap-2">
            <Button onClick={save} disabled={action.pending}>
              {action.pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {data.productTypes.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay tipos de producto.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {data.productTypes.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {t.name}{" "}
                    {t.hasVariants ? (
                      <Badge>Con variantes</Badge>
                    ) : (
                      <Badge variant="muted">Sin variantes</Badge>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.attributes
                      .map((a) => `${attrName.get(a.attributeId)}${a.variantSelection ? " (variante)" : ""}`)
                      .join(", ") || "Sin atributos"}
                  </span>
                </div>
                {canManageStructure && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => edit(t)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(t)}>
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
