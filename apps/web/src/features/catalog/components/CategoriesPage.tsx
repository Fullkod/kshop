"use client";

import { Alert, Button, Card, Dialog, FieldError, Input, Label, Select, useConfirm } from "@kshop/ui";
import { useState, type FormEvent } from "react";
import {
  categoryOptions,
  useApiAction,
  useCatalogApi,
  useCatalogStructure,
  type Category,
} from "../use-catalog";
import { ImageField } from "./ImageField";

export function CategoriesPage() {
  const { data, error, reload } = useCatalogStructure();
  const { catalog, canManageStructure } = useCatalogApi();
  const action = useApiAction();
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState<Category | "new" | null>(null);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;

  const options = categoryOptions(data.categories);
  const byId = new Map(data.categories.map((c) => [c.id, c]));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name") ?? ""),
      parentId: String(form.get("parentId") ?? "") || null,
      description: String(form.get("description") ?? ""),
      imageUrl: String(form.get("imageUrl") ?? "") || undefined,
    };
    const ok = await action.run(() =>
      editing && editing !== "new"
        ? catalog.update("categories", editing.id, input)
        : catalog.create("categories", input),
    );
    if (ok) {
      setEditing(null);
      reload();
    }
  }

  async function onDelete(category: Category) {
    if (
      !(await confirm({
        title: `¿Borrar la categoría «${category.name}»?`,
        confirmLabel: "Borrar",
        tone: "destructive",
      }))
    )
      return;
    if ((await action.run(() => catalog.remove("categories", category.id))) !== undefined) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Categorías</h2>
          <p className="text-sm text-muted-foreground">
            Hasta 3 niveles, por ejemplo Mujer › Vestidos › Largos.
          </p>
        </div>
        {canManageStructure && <Button onClick={() => setEditing("new")}>Nueva categoría</Button>}
      </div>

      {action.error && !editing && <Alert variant="destructive">{action.error}</Alert>}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nueva categoría" : `Editar «${editing?.name ?? ""}»`}
      >
        {editing && (
          <form
            onSubmit={onSubmit}
            className="grid gap-4 sm:grid-cols-2"
            key={editing === "new" ? "new" : editing.id}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={editing === "new" ? "" : editing.name} />
              <FieldError>{action.fieldErrors.name ?? action.fieldErrors.slug}</FieldError>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="parentId">Dentro de</Label>
              <Select
                id="parentId"
                name="parentId"
                defaultValue={editing === "new" ? "" : (editing.parentId ?? "")}
              >
                <option value="">— Categoría principal —</option>
                {options
                  .filter((o) => o.depth < 3 && (editing === "new" || o.id !== editing.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={editing === "new" ? "" : (editing.description ?? "")}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <ImageField
              name="imageUrl"
              label="Foto (opcional)"
              folder="categories"
              defaultValue={editing === "new" ? null : editing.imageUrl}
              hint="Cuadrada. Sale en la sección «Categorías» de la portada."
            />
            {action.error && (
              <Alert variant="destructive" className="sm:col-span-2">
                {action.error}
              </Alert>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={action.pending}>
                Guardar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {options.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay categorías.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y" data-testid="category-tree">
            {options.map((o) => {
              const category = byId.get(o.id)!;
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span style={{ paddingLeft: `${(o.depth - 1) * 1.25}rem` }}>
                    {o.depth > 1 && <span className="text-muted-foreground">└ </span>}
                    {category.name}
                  </span>
                  {canManageStructure && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(category)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onDelete(category)}>
                        Borrar
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
