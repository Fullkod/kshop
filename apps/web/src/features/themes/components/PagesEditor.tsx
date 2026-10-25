"use client";

import { catalogSlug, type PageInput } from "@kshop/core";
import type { ApiClient } from "@kshop/data";
import { Alert, Badge, Button, Card, FieldError, Input, Label } from "@kshop/ui";
import { useState } from "react";
import { useApiAction } from "@/features/catalog/use-catalog";
import type { AdminContent, AdminPage } from "../use-content";

type Draft = PageInput & { id?: string; slugEdited: boolean };

export function PagesEditor({
  content,
  api,
  reload,
}: {
  content: AdminContent;
  api: ReturnType<ApiClient["content"]>;
  reload: () => void;
}) {
  const action = useApiAction();
  const [draft, setDraft] = useState<Draft | null>(null);

  async function save() {
    if (!draft) return;
    const { id, slugEdited: _, ...input } = draft;
    const ok = await action.run(() => (id ? api.update("pages", id, input) : api.create("pages", input)));
    if (ok) {
      setDraft(null);
      reload();
    }
  }
  async function remove(page: AdminPage) {
    if (!window.confirm(`¿Borrar la página «${page.title}»?`)) return;
    if ((await action.run(() => api.remove("pages", page.id))) !== undefined) reload();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Páginas fijas como «Envíos», «Cómo comprar» o «Sobre nosotros». Añádelas al menú del pie para que se
          vean.
        </p>
        <Button
          onClick={() =>
            setDraft({
              title: "",
              slug: "",
              content: "",
              isPublished: true,
              seoTitle: null,
              seoDescription: null,
              slugEdited: false,
            })
          }
        >
          Nueva página
        </Button>
      </div>
      {action.error && !draft && <Alert variant="destructive">{action.error}</Alert>}

      {draft && (
        <Card className="grid gap-4 sm:grid-cols-2" data-testid="page-form">
          <h3 className="font-semibold sm:col-span-2">
            {draft.id ? `Editar «${draft.title}»` : "Nueva página"}
          </h3>
          <div className="flex flex-col gap-1">
            <Label htmlFor="page-title">Título</Label>
            <Input
              id="page-title"
              value={draft.title}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  title: e.target.value,
                  slug: draft.slugEdited ? draft.slug : catalogSlug(e.target.value),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="page-slug">Dirección: /page/…</Label>
            <Input
              id="page-slug"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value, slugEdited: true })}
            />
            <FieldError>{action.fieldErrors.slug}</FieldError>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="page-content">Contenido</Label>
            <textarea
              id="page-content"
              rows={12}
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              className="rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              **negrita**, *cursiva*, ## Título, - listas y [enlaces](https://…).
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="page-seo-title">Título para Google (opcional)</Label>
            <Input
              id="page-seo-title"
              maxLength={70}
              value={draft.seoTitle ?? ""}
              onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="page-seo-description">Descripción para Google (opcional)</Label>
            <Input
              id="page-seo-description"
              maxLength={160}
              value={draft.seoDescription ?? ""}
              onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value || null })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })}
            />
            Publicada
          </label>
          {action.error && (
            <Alert variant="destructive" className="sm:col-span-2">
              {action.error}
            </Alert>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={save} disabled={action.pending || !draft.title || !draft.slug}>
              {action.pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {content.pages.length === 0 ? (
        <Card className="text-center text-muted-foreground">Todavía no hay páginas.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y">
            {content.pages.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex-1">
                  <span className="font-medium">{p.title}</span>{" "}
                  <span className="text-sm text-muted-foreground">/page/{p.slug}</span>
                </span>
                {!p.isPublished && <Badge variant="muted">Borrador</Badge>}
                <Button variant="outline" size="sm" onClick={() => setDraft({ ...p, slugEdited: true })}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(p)}>
                  Borrar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
