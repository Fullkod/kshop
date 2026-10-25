import { z } from "zod";
import { phoneSchema } from "../orders/phone";

// WhatsApp notices of the platform number (PRP-4 D12–D22): events, audiences and the closed list of template
// variables. The message itself is rendered in SQL (private.render_whatsapp_template); this is for the editor.

export const NOTIFICATION_AUDIENCES = ["store", "customer"] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
export const NOTIFICATION_STATUSES = ["pending", "sending", "sent", "simulated", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export const WHATSAPP_MODES = ["off", "dry_run", "live"] as const;
export type WhatsappMode = (typeof WHATSAPP_MODES)[number];

export const NOTIFICATION_EVENTS = [
  { event: "order_created", audience: "store", label: "Pedido nuevo (a la tienda)" },
  { event: "payment_recorded", audience: "store", label: "Pago registrado (a la tienda)" },
  { event: "order_created", audience: "customer", label: "Pedido recibido" },
  { event: "pending_payment", audience: "customer", label: "Pedido confirmado, pendiente de pago" },
  { event: "paid", audience: "customer", label: "Pago recibido" },
  { event: "processing", audience: "customer", label: "En preparación" },
  { event: "shipped", audience: "customer", label: "Enviado" },
  { event: "delivered", audience: "customer", label: "Entregado" },
  { event: "cancelled", audience: "customer", label: "Cancelado" },
  { event: "shipping_set", audience: "customer", label: "Costo de entrega fijado" },
  { event: "recovery_code", audience: "customer", label: "Código para cambiar la contraseña" },
] as const satisfies readonly { event: string; audience: NotificationAudience; label: string }[];

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  simulated: "Simulado",
  failed: "Fallido",
  skipped: "Omitido",
};
export const WHATSAPP_MODE_LABELS: Record<WhatsappMode, string> = {
  off: "Apagado (no se generan avisos)",
  dry_run: "Simulado (se generan, no se envían)",
  live: "Real (se envían por OpenWA)",
};

/** Variables a template may use ({{numero}}…). */
export const TEMPLATE_VARIABLES = {
  tienda: "Nombre de la tienda",
  numero: "Número del pedido",
  cliente: "Nombre del cliente",
  telefono: "Teléfono del cliente",
  lineas: "Productos del pedido",
  subtotal: "Subtotal",
  descuento: "Descuento",
  envio: "Costo de entrega",
  total: "Total",
  pagado: "Pagado",
  entrega: "Método y zona de entrega",
  zona: "Zona",
  direccion: "Dirección o punto de recogida",
  metodo_pago: "Método de pago",
  instrucciones_pago: "Instrucciones de pago",
  motivo: "Motivo de la cancelación",
  enlace_pedido: "Enlace al pedido (cliente)",
  enlace_admin: "Enlace al pedido en el admin",
  codigo: "Código de recuperación",
} as const;

const knownVariables = (body: string) =>
  [...body.matchAll(/\{\{([^}]*)\}\}/g)].every((m) => Object.hasOwn(TEMPLATE_VARIABLES, m[1]!));

export const whatsappTemplateSchema = z
  .object({
    event: z.string().regex(/^[a-z_]{3,40}$/),
    audience: z.enum(NOTIFICATION_AUDIENCES),
    body: z.string().trim().min(1, "Obligatorio.").max(1500, "Máximo 1500 caracteres."),
    isActive: z.boolean().default(true),
  })
  .refine((v) => NOTIFICATION_EVENTS.some((e) => e.event === v.event && e.audience === v.audience), {
    path: ["event"],
    message: "Aviso desconocido.",
  })
  .refine((v) => knownVariables(v.body), { path: ["body"], message: "Hay una variable que no existe." });
export type WhatsappTemplateInput = z.infer<typeof whatsappTemplateSchema>;

export const notificationContactSchema = z.object({
  name: z.string().trim().min(1, "Obligatorio.").max(80),
  phone: phoneSchema,
  notifyNewOrder: z.boolean().default(true),
  notifyPaymentRecorded: z.boolean().default(false),
  showToCustomer: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type NotificationContactInput = z.infer<typeof notificationContactSchema>;

export const templatePreviewSchema = z.object({
  body: z.string().max(1500),
  audience: z.enum(NOTIFICATION_AUDIENCES),
  orderId: z.uuid().optional(),
});

/** Superadmin: the platform WhatsApp (OpenWA). The API key is write-only. */
export const platformWhatsappSchema = z.object({
  mode: z.enum(WHATSAPP_MODES),
  url: z.url("URL no válida.").nullable().default(null),
  session: z.string().trim().max(100).nullable().default(null),
  apiKey: z.string().trim().min(8).max(500).optional(),
  ratePerMinute: z.coerce.number().int().min(1).max(120).default(20),
  storeRatePerMinute: z.coerce.number().int().min(1).max(120).default(10),
});
export type PlatformWhatsappInput = z.infer<typeof platformWhatsappSchema>;

export const whatsappTestSchema = z.object({
  phone: phoneSchema,
  text: z.string().trim().min(1).max(500),
});
