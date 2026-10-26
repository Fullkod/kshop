"use client";

import {
  formatPhone,
  hasMinRole,
  NOTIFICATION_EVENTS,
  NOTIFICATION_STATUS_LABELS,
  orderCode,
  TEMPLATE_VARIABLES,
  whatsappLink,
  type NotificationAudience,
  type NotificationContactInput,
  type NotificationStatus,
} from "@kshop/core";
import { NotificationLogQuery, NotificationSettingsQuery } from "@kshop/data";
import { Alert, Badge, Button, Card, cn, FieldError, Input, Label } from "@kshop/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAdmin } from "@/app/s/[storeSlug]/admin/admin-context";
import { useApiAction } from "@/features/catalog/use-catalog";
import { useCheckoutSettings } from "@/features/orders/use-orders";
import { useSession } from "@/lib/session";
import { useStore } from "@kshop/storefront";

// Admin screens of the WhatsApp notices (module whatsapp_notifications, PRP-4): who receives the store notices,
// the texts (store override of the platform default, with a preview rendered by the same SQL) and the log of
// every notice with «Reintentar» and «Abrir en WhatsApp» in case the automatic send fails.

type Contact = NotificationContactInput & { id: string };
type Template = {
  id: string;
  storeId: string | null;
  event: string;
  audience: NotificationAudience;
  body: string;
  isActive: boolean;
};
type LogRow = {
  id: string;
  orderId: string | null;
  orderNumber: number | null;
  audience: NotificationAudience;
  event: string;
  recipient: string;
  message: string;
  status: NotificationStatus;
  attempts: number;
  error: string | null;
  createdAt: string;
};

const nodes = <T,>(c: { edges: { node: T }[] } | null | undefined): T[] =>
  (c?.edges ?? []).map((e) => e.node);
const eventLabel = (event: string, audience: string) =>
  NOTIFICATION_EVENTS.find((e) => e.event === event && e.audience === audience)?.label ?? event;
const STATUS_VARIANT: Record<NotificationStatus, "default" | "muted" | "success" | "destructive" | "gold"> = {
  pending: "gold",
  sending: "gold",
  sent: "success",
  simulated: "muted",
  failed: "destructive",
  skipped: "muted",
};

function useCanEdit() {
  const admin = useAdmin();
  return admin.role === null || hasMinRole(admin.role, "admin");
}

const SECTIONS = [
  { href: "/admin/whatsapp-notifications", label: "Contactos" },
  { href: "/admin/whatsapp-notifications/templates", label: "Mensajes" },
  { href: "/admin/whatsapp-notifications/log", label: "Historial" },
] as const;

export function NotificationsNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b pb-2" aria-label="Secciones de avisos">
      {SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-surface",
            pathname === s.href && "bg-accent-soft font-medium text-primary",
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

function useNotificationSettings() {
  const store = useStore();
  const { graphql } = useSession();
  const [data, setData] = useState<{ contacts: Contact[]; templates: Template[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    graphql
      .query(NotificationSettingsQuery, { storeId: store.id })
      .toPromise()
      .then((r) => {
        if (cancelled) return;
        if (r.error || !r.data) return setError("No se pudieron cargar los avisos.");
        setData({
          contacts: nodes(r.data.storeNotificationContactsCollection),
          templates: nodes(r.data.whatsappTemplatesCollection).map((t) => ({
            ...t,
            storeId: t.storeId ?? null,
            audience: String(t.audience) as NotificationAudience,
          })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [graphql, store.id, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export function ContactsPage() {
  const store = useStore();
  const { api } = useSession();
  const { data, error, reload } = useNotificationSettings();
  const action = useApiAction();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const notifications = api.notifications(store.id);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Los avisos salen del WhatsApp de Kshop (no del tuyo). Aquí eliges quién recibe los pedidos nuevos y
          qué teléfonos ve el cliente para consultas.
        </p>
        {canEdit && !editing && <Button onClick={() => setEditing("new")}>Nuevo contacto</Button>}
      </div>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      {editing && (
        <ContactForm
          contact={editing === "new" ? null : editing}
          errors={action.fieldErrors}
          pending={action.pending}
          onCancel={() => setEditing(null)}
          onSave={async (input, id) => {
            const ok = await action.run(() =>
              id ? notifications.updateContact(id, input) : notifications.createContact(input),
            );
            if (ok) {
              setEditing(null);
              reload();
            }
          }}
        />
      )}
      <Card className="p-0">
        <ul className="divide-y" data-testid="contacts-list">
          {data.contacts.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Sin contactos: nadie recibirá los pedidos nuevos por WhatsApp.
            </li>
          )}
          {data.contacts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {c.name} {!c.isActive && <Badge variant="muted">Inactivo</Badge>}
                </span>
                <span className="text-muted-foreground">
                  {formatPhone(c.phone)}
                  {c.notifyNewOrder && " · pedidos nuevos"}
                  {c.notifyPaymentRecorded && " · pagos"}
                  {c.showToCustomer && " · visible al cliente"}
                </span>
              </span>
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () =>
                      (await action.run(() => notifications.deleteContact(c.id))) !== undefined && reload()
                    }
                  >
                    Borrar
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ContactForm({
  contact,
  errors,
  pending,
  onCancel,
  onSave,
}: {
  contact: Contact | null;
  errors: Record<string, string>;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: NotificationContactInput, id: string | null) => Promise<void>;
}) {
  const [flags, setFlags] = useState({
    notifyNewOrder: contact?.notifyNewOrder ?? true,
    notifyPaymentRecorded: contact?.notifyPaymentRecorded ?? false,
    showToCustomer: contact?.showToCustomer ?? true,
    isActive: contact?.isActive ?? true,
  });
  const toggle = (key: keyof typeof flags, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={flags[key]}
        onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
      />
      {label}
    </label>
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSave(
      {
        name: String(data.get("name") ?? "").trim(),
        phone: String(data.get("phone") ?? "").trim(),
        ...flags,
      },
      contact?.id ?? null,
    );
  }
  return (
    <Card>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">{contact ? "Editar contacto" : "Nuevo contacto"}</h3>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-name">Nombre</Label>
          <Input
            id="contact-name"
            name="name"
            defaultValue={contact?.name ?? ""}
            placeholder="Dueña"
            required
          />
          <FieldError>{errors.name}</FieldError>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="contact-phone">Teléfono (WhatsApp)</Label>
          <Input
            id="contact-phone"
            name="phone"
            type="tel"
            defaultValue={contact ? formatPhone(contact.phone) : ""}
            required
          />
          <FieldError>{errors.phone}</FieldError>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          {toggle("notifyNewOrder", "Recibe los pedidos nuevos")}
          {toggle("notifyPaymentRecorded", "Recibe los pagos registrados")}
          {toggle("showToCustomer", "El cliente lo ve como contacto de la tienda")}
          {toggle("isActive", "Activo")}
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function TemplatesPage() {
  const { data, error, reload } = useNotificationSettings();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return <p className="text-muted-foreground">Cargando…</p>;
  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Cada aviso empieza con el nombre de tu tienda; a los clientes se les aclara que es un aviso automático
        y se les dan tus contactos. Puedes cambiar el texto de cada aviso o volver al de Kshop.
      </p>
      <Card className="p-0">
        <ul className="divide-y" data-testid="templates-list">
          {NOTIFICATION_EVENTS.map((e) => {
            const key = `${e.audience}:${e.event}`;
            const own = data.templates.find(
              (t) => t.storeId && t.event === e.event && t.audience === e.audience,
            );
            const platform = data.templates.find(
              (t) => !t.storeId && t.event === e.event && t.audience === e.audience,
            );
            return (
              <li key={key} className="flex flex-col gap-2 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">
                    {e.label} {own && <Badge variant="default">Personalizado</Badge>}
                    {own && !own.isActive && <Badge variant="muted">Desactivado</Badge>}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setOpen(open === key ? null : key)}>
                    {open === key ? "Cerrar" : canEdit ? "Editar" : "Ver"}
                  </Button>
                </div>
                {open === key && (
                  <TemplateEditor
                    event={e.event}
                    audience={e.audience}
                    own={own ?? null}
                    platform={platform?.body ?? ""}
                    canEdit={canEdit}
                    onSaved={reload}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

function TemplateEditor({
  event,
  audience,
  own,
  platform,
  canEdit,
  onSaved,
}: {
  event: string;
  audience: NotificationAudience;
  own: Template | null;
  platform: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const store = useStore();
  const { api } = useSession();
  const action = useApiAction();
  const [body, setBody] = useState(own?.body ?? platform);
  const [isActive, setIsActive] = useState(own?.isActive ?? true);
  const [preview, setPreview] = useState<string | null>(null);
  const notifications = api.notifications(store.id);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const r = await notifications.preview(body, audience);
        if (!cancelled) setPreview(r.text);
      } catch {
        if (!cancelled) setPreview(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notifications is rebuilt every render
  }, [body, audience, store.id]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={1500}
          readOnly={!canEdit}
          aria-label="Texto del aviso"
          className="rounded-md border bg-background px-3 py-2 font-mono text-sm"
        />
        <FieldError>{action.fieldErrors.body}</FieldError>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Variables disponibles</summary>
          <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
            {Object.entries(TEMPLATE_VARIABLES).map(([name, label]) => (
              <li key={name}>
                <code>{`{{${name}}}`}</code> {label}
              </li>
            ))}
          </ul>
        </details>
        {canEdit && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Enviar este aviso
            </label>
            {action.error && <Alert variant="destructive">{action.error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={action.pending}
                onClick={async () => {
                  if (await action.run(() => notifications.saveTemplate({ event, audience, body, isActive })))
                    onSaved();
                }}
              >
                Guardar
              </Button>
              {own && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      (await action.run(() => notifications.restoreTemplate(event, audience))) !== undefined
                    ) {
                      setBody(platform);
                      setIsActive(true);
                      onSaved();
                    }
                  }}
                >
                  Volver al texto de Kshop
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">Vista previa (con datos de ejemplo)</span>
        <pre className="whitespace-pre-wrap rounded-md bg-surface p-3 text-sm" data-testid="template-preview">
          {preview ?? "…"}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function useNotificationLog(orderId?: string) {
  const store = useStore();
  const { graphql } = useSession();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    graphql
      .query(NotificationLogQuery, {
        filter: { storeId: { eq: store.id }, ...(orderId && { orderId: { eq: orderId } }) },
        first: 50,
      })
      .toPromise()
      .then((r) => {
        if (cancelled) return;
        setRows(
          nodes(r.data?.notificationLogCollection).map((n) => ({
            id: n.id,
            orderId: n.orderId ?? null,
            orderNumber: n.orders?.number ?? null,
            audience: String(n.audience) as NotificationAudience,
            event: n.event,
            recipient: n.recipient,
            message: n.message,
            status: String(n.status) as NotificationStatus,
            attempts: n.attempts,
            error: n.error ?? null,
            createdAt: n.createdAt,
          })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [graphql, store.id, orderId, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { rows, reload };
}

function LogList({ rows, reload, showOrder }: { rows: LogRow[]; reload: () => void; showOrder: boolean }) {
  const store = useStore();
  const { api } = useSession();
  const { data: settings } = useCheckoutSettings();
  const action = useApiAction();
  return (
    <>
      {action.error && <Alert variant="destructive">{action.error}</Alert>}
      <ul className="divide-y" data-testid="notification-log">
        {rows.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted-foreground">Sin avisos todavía.</li>
        )}
        {rows.map((n) => (
          <li key={n.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[n.status]}>{NOTIFICATION_STATUS_LABELS[n.status]}</Badge>
              <span className="font-medium">{eventLabel(n.event, n.audience)}</span>
              <span className="text-muted-foreground">
                → {formatPhone(n.recipient)} ({n.audience === "store" ? "tienda" : "cliente"})
              </span>
              {showOrder && n.orderId && n.orderNumber !== null && (
                <Link href={`/admin/orders/${n.orderId}`} className="underline">
                  {settings ? orderCode(settings.orderPrefix, n.orderNumber) : `#${n.orderNumber}`}
                </Link>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(n.createdAt).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">Ver mensaje</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface p-2 text-xs">{n.message}</pre>
            </details>
            {n.error && <span className="text-xs text-destructive">{n.error}</span>}
            <div className="flex flex-wrap gap-3 text-xs">
              {n.message && (
                <a
                  href={whatsappLink(n.recipient, n.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Abrir en WhatsApp
                </a>
              )}
              {n.status === "failed" && (
                <button
                  type="button"
                  className="underline"
                  onClick={async () =>
                    (await action.run(() => api.notifications(store.id).retry(n.id))) && reload()
                  }
                >
                  Reintentar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LogPage() {
  const { rows, reload } = useNotificationLog();
  return (
    <section className="flex flex-col gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Los últimos 50 avisos. «Simulado»: el WhatsApp de Kshop aún no está conectado, el aviso se generó pero
        no se envió (puedes mandarlo tú con «Abrir en WhatsApp»).
      </p>
      <Card className="p-0">
        {rows === null ? (
          <p className="p-4 text-muted-foreground">Cargando…</p>
        ) : (
          <LogList rows={rows} reload={reload} showOrder />
        )}
      </Card>
    </section>
  );
}

/** Notices of one order (order detail in the admin). */
export function OrderNotices({ orderId }: { orderId: string }) {
  const admin = useAdmin();
  const { rows, reload } = useNotificationLog(orderId);
  if (!admin.enabledModules.has("whatsapp_notifications") || !rows) return null;
  return (
    <Card className="p-0">
      <h3 className="px-4 pt-4 font-semibold">Avisos por WhatsApp</h3>
      <LogList rows={rows} reload={reload} showOrder={false} />
    </Card>
  );
}
