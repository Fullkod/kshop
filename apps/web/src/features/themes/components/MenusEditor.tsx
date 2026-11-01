"use client";

import type { Link, MenuLocation } from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Button, Card, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, type CatalogStructure } from "@/features/catalog/use-catalog";
import type { AdminContent, AdminMenuItem } from "../use-content";
import { LinkPicker } from "./LinkPicker";

type LocationCopy = {
  key: MenuLocation;
  label: string;
  help: string;
  /** Label of a second-level link ("Submenú" / "Enlace de la columna"). */
  child: string;
  addChild: string;
  addItem: string;
};

// The storefront footer shows the menu in columns: a first-level link with children is a column (its text is the
// title), the ones without children are grouped in a «Tienda» column (StoreFooter.footerColumns).
const LOCATIONS: LocationCopy[] = [
  {
    key: "header",
    label: "Menú principal",
    help: "Arriba en la tienda. Sin enlaces se muestran las categorías.",
    child: "Submenú",
    addChild: "Añadir submenú",
    addItem: "Añadir enlace",
  },
  {
    key: "footer",
    label: "Menú del pie",
    help: "Abajo, en columnas: cada enlace con enlaces debajo es una columna del pie y su texto es el título; los que no tienen ninguno van juntos en la columna «Tienda».",
    child: "Enlace de la columna",
    addChild: "Añadir enlace a la columna",
    addItem: "Añadir columna o enlace",
  },
];

/** The list with the item at `index` moved `delta` positions. */
function moved<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const [it] = next.splice(index, 1);
  next.splice(index + delta, 0, it!);
  return next;
}

export function MenusEditor({
  content,
  structure,
  api,
  reload,
}: {
  content: AdminContent;
  structure: CatalogStructure;
  api: ReturnType<ApiClient["content"]>;
  reload: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {LOCATIONS.map((l) => (
        <MenuCard
          key={l.key}
          copy={l}
          initial={content.menus[l.key]}
          content={content}
          structure={structure}
          api={api}
          reload={reload}
        />
      ))}
    </div>
  );
}

/** Up, down and remove for a menu row; one group, so on a phone the three wrap together under the field. */
function RowActions({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Subir">
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        aria-label="Bajar"
      >
        ↓
      </Button>
      <Button variant="ghost" size="sm" onClick={onRemove}>
        Quitar
      </Button>
    </div>
  );
}

function MenuCard({
  copy,
  initial,
  content,
  structure,
  api,
  reload,
}: {
  copy: LocationCopy;
  initial: AdminMenuItem[];
  content: AdminContent;
  structure: CatalogStructure;
  api: ReturnType<ApiClient["content"]>;
  reload: () => void;
}) {
  const location = copy.key;
  const action = useApiAction();
  const [items, setItems] = useState<AdminMenuItem[]>(initial);
  const [saved, setSaved] = useState(false);
  const defaultLink: Link = { type: "url", url: "/products" };

  const change = (next: AdminMenuItem[]) => {
    setItems(next);
    setSaved(false);
  };
  const updateItem = (index: number, patch: Partial<AdminMenuItem>) =>
    change(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const updateChild = (
    index: number,
    childIndex: number,
    patch: Partial<AdminMenuItem["children"][number]>,
  ) =>
    updateItem(index, {
      children: items[index]!.children.map((x, k) => (k === childIndex ? { ...x, ...patch } : x)),
    });

  return (
    <Card className="flex flex-col gap-4" data-testid={`menu-${location}`}>
      <div>
        <h2 className="font-semibold">{copy.label}</h2>
        <p className="text-sm text-muted-foreground">{copy.help}</p>
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border p-3"
          data-testid={`menu-${location}-item-${i}`}
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Label htmlFor={`${location}-${i}-label`}>
                {location === "footer" && item.children.length > 0 ? "Título de la columna" : "Texto"}
              </Label>
              <Input
                id={`${location}-${i}-label`}
                value={item.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
              />
            </div>
            <RowActions
              index={i}
              count={items.length}
              onMove={(delta) => change(moved(items, i, delta))}
              onRemove={() => change(items.filter((_, j) => j !== i))}
            />
          </div>
          {location === "footer" && (
            <p className="text-xs text-muted-foreground">
              {item.children.length > 0
                ? "Es el título de una columna del pie: su dirección no se muestra."
                : "Sin enlaces debajo sale como un enlace más en la columna «Tienda». Añade enlaces para convertirlo en una columna."}
            </p>
          )}
          <LinkPicker
            id={`${location}-${i}`}
            value={item.link}
            onChange={(link) => link && updateItem(i, { link })}
            structure={structure}
            content={content}
          />
          <div className="flex flex-col gap-2 border-l-2 pl-3">
            {item.children.map((child, c) => (
              <div
                key={c}
                className="flex flex-col gap-2"
                data-testid={`menu-${location}-item-${i}-child-${c}`}
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex min-w-48 flex-1 flex-col gap-1">
                    <Label htmlFor={`${location}-${i}-${c}-label`}>{copy.child}</Label>
                    <Input
                      id={`${location}-${i}-${c}-label`}
                      value={child.label}
                      onChange={(e) => updateChild(i, c, { label: e.target.value })}
                    />
                  </div>
                  <RowActions
                    index={c}
                    count={item.children.length}
                    onMove={(delta) => updateItem(i, { children: moved(item.children, c, delta) })}
                    onRemove={() => updateItem(i, { children: item.children.filter((_, k) => k !== c) })}
                  />
                </div>
                <LinkPicker
                  id={`${location}-${i}-${c}`}
                  value={child.link}
                  onChange={(link) => link && updateChild(i, c, { link })}
                  structure={structure}
                  content={content}
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                updateItem(i, { children: [...item.children, { label: "", link: defaultLink }] })
              }
            >
              {copy.addChild}
            </Button>
          </div>
        </div>
      ))}
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {saved && <Alert variant="success">Menú guardado.</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => change([...items, { label: "", link: defaultLink, children: [] }])}
        >
          {copy.addItem}
        </Button>
        <Button
          disabled={action.pending}
          onClick={async () => {
            const ok = await action.run(() => api.saveMenu(location, { items }));
            if (ok !== undefined) {
              setSaved(true);
              reload();
            }
          }}
        >
          {action.pending ? "Guardando…" : "Guardar menú"}
        </Button>
      </div>
    </Card>
  );
}
