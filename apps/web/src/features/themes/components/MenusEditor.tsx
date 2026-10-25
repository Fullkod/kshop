"use client";

import type { Link, MenuLocation } from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Button, Card, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction, type CatalogStructure } from "@/features/catalog/use-catalog";
import type { AdminContent, AdminMenuItem } from "../use-content";
import { LinkPicker } from "./LinkPicker";

const LOCATIONS: { key: MenuLocation; label: string; help: string }[] = [
  {
    key: "header",
    label: "Menú principal",
    help: "Arriba en la tienda. Sin enlaces se muestran las categorías.",
  },
  { key: "footer", label: "Menú del pie", help: "Abajo: envíos, contacto, sobre nosotros…" },
];

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
          location={l.key}
          label={l.label}
          help={l.help}
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

function MenuCard({
  location,
  label,
  help,
  initial,
  content,
  structure,
  api,
  reload,
}: {
  location: MenuLocation;
  label: string;
  help: string;
  initial: AdminMenuItem[];
  content: AdminContent;
  structure: CatalogStructure;
  api: ReturnType<ApiClient["content"]>;
  reload: () => void;
}) {
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
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(index + delta, 0, it!);
    change(next);
  };

  return (
    <Card className="flex flex-col gap-4" data-testid={`menu-${location}`}>
      <div>
        <h2 className="font-semibold">{label}</h2>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor={`${location}-${i}-label`}>Texto</Label>
              <Input
                id={`${location}-${i}-label`}
                value={item.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label="Subir"
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label="Bajar"
            >
              ↓
            </Button>
            <Button variant="ghost" size="sm" onClick={() => change(items.filter((_, j) => j !== i))}>
              Quitar
            </Button>
          </div>
          <LinkPicker
            id={`${location}-${i}`}
            value={item.link}
            onChange={(link) => link && updateItem(i, { link })}
            structure={structure}
            content={content}
          />
          {location === "header" && (
            <div className="flex flex-col gap-2 border-l-2 pl-3">
              {item.children.map((child, c) => (
                <div key={c} className="flex flex-col gap-2">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor={`${location}-${i}-${c}-label`}>Submenú</Label>
                      <Input
                        id={`${location}-${i}-${c}-label`}
                        value={child.label}
                        onChange={(e) =>
                          updateItem(i, {
                            children: item.children.map((x, k) =>
                              k === c ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateItem(i, { children: item.children.filter((_, k) => k !== c) })}
                    >
                      Quitar
                    </Button>
                  </div>
                  <LinkPicker
                    id={`${location}-${i}-${c}`}
                    value={child.link}
                    onChange={(link) =>
                      link &&
                      updateItem(i, { children: item.children.map((x, k) => (k === c ? { ...x, link } : x)) })
                    }
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
                Añadir submenú
              </Button>
            </div>
          )}
        </div>
      ))}
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {saved && <Alert variant="success">Menú guardado.</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => change([...items, { label: "", link: defaultLink, children: [] }])}
        >
          Añadir enlace
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
