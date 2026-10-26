import "server-only";
import type {
  NotificationAudience,
  NotificationContactInput,
  PlatformWhatsappInput,
  WhatsappTemplateInput,
} from "@kshop/core";
import { mapDbError } from "../db-errors";
import { HttpError, notFound } from "../http";
import { getServiceClient } from "../supabase";

// WhatsApp notices edited from the admin (module whatsapp_notifications) and the platform settings (superadmin).
// The messages are rendered and queued in SQL (supabase/migrations/20261030100200_notifications_engine.sql).

export type PlatformWhatsapp = {
  mode: "off" | "dry_run" | "live";
  url: string | null;
  session: string | null;
  ratePerMinute: number;
  storeRatePerMinute: number;
  hasApiKey: boolean;
  queue: { pending: number; failed24h: number; sent24h: number; simulated24h: number };
};

const contactRow = (i: NotificationContactInput) => ({
  name: i.name,
  phone: i.phone,
  notify_new_order: i.notifyNewOrder,
  notify_payment_recorded: i.notifyPaymentRecorded,
  show_to_customer: i.showToCustomer,
  is_active: i.isActive,
});

function contactError(error: unknown): never {
  if ((error as { code?: string }).code === "23505") {
    throw new HttpError(409, "conflict", "Ese teléfono ya es un contacto de la tienda.", {
      phone: ["Ese teléfono ya es un contacto de la tienda."],
    });
  }
  mapDbError(error, "El contacto");
}

export async function saveContact(
  storeId: string,
  id: string | null,
  input: NotificationContactInput,
): Promise<string> {
  const service = getServiceClient();
  const query = id
    ? service
        .from("store_notification_contacts")
        .update(contactRow(input))
        .eq("store_id", storeId)
        .eq("id", id)
    : service.from("store_notification_contacts").insert({ ...contactRow(input), store_id: storeId });
  const { data, error } = await query.select("id").maybeSingle<{ id: string }>();
  if (error) contactError(error);
  if (!data) throw notFound("Contacto");
  return data.id;
}

export async function deleteContact(storeId: string, id: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("store_notification_contacts")
    .delete()
    .eq("store_id", storeId)
    .eq("id", id)
    .select("id");
  if (error) mapDbError(error, "El contacto");
  if (!data?.length) throw notFound("Contacto");
}

/** The store's own template for an event (overrides the platform default). */
export async function saveTemplate(storeId: string, input: WhatsappTemplateInput): Promise<void> {
  const { error } = await getServiceClient()
    .from("whatsapp_templates")
    .upsert(
      {
        store_id: storeId,
        event: input.event,
        audience: input.audience,
        body: input.body,
        is_active: input.isActive,
      },
      { onConflict: "store_id,event,audience" },
    );
  if (error) mapDbError(error, "La plantilla");
}

/** Back to the platform default. */
export async function restoreTemplate(
  storeId: string,
  event: string,
  audience: NotificationAudience,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("whatsapp_templates")
    .delete()
    .eq("store_id", storeId)
    .eq("event", event)
    .eq("audience", audience);
  if (error) mapDbError(error, "La plantilla");
}

export async function previewTemplate(
  storeId: string,
  body: string,
  audience: NotificationAudience,
  orderId?: string,
): Promise<string> {
  const { data, error } = await getServiceClient().rpc("notification_preview", {
    p_store_id: storeId,
    p_body: body,
    p_audience: audience,
    p_order_id: orderId ?? null,
  });
  if (error) mapDbError(error);
  return String(data ?? "");
}

export async function retryNotification(storeId: string, logId: string): Promise<void> {
  const { error } = await getServiceClient().rpc("notification_retry", {
    p_store_id: storeId,
    p_log_id: logId,
  });
  if (error) mapDbError(error, "El aviso");
}

type PlatformRow = {
  mode: PlatformWhatsapp["mode"];
  url: string | null;
  session: string | null;
  rate_per_minute: number;
  store_rate_per_minute: number;
  has_api_key: boolean;
  queue: { pending: number; failed_24h: number; sent_24h: number; simulated_24h: number };
};

const toPlatform = (r: PlatformRow): PlatformWhatsapp => ({
  mode: r.mode,
  url: r.url,
  session: r.session,
  ratePerMinute: Number(r.rate_per_minute),
  storeRatePerMinute: Number(r.store_rate_per_minute),
  hasApiKey: r.has_api_key,
  queue: {
    pending: r.queue.pending,
    failed24h: r.queue.failed_24h,
    sent24h: r.queue.sent_24h,
    simulated24h: r.queue.simulated_24h,
  },
});

export async function getPlatformWhatsapp(): Promise<PlatformWhatsapp> {
  const { data, error } = await getServiceClient().rpc("platform_whatsapp_get");
  if (error) throw error;
  return toPlatform(data as PlatformRow);
}

export async function setPlatformWhatsapp(input: PlatformWhatsappInput): Promise<PlatformWhatsapp> {
  const { data, error } = await getServiceClient().rpc("platform_whatsapp_set", {
    p_input: {
      mode: input.mode,
      url: input.url,
      session: input.session,
      rate_per_minute: input.ratePerMinute,
      store_rate_per_minute: input.storeRatePerMinute,
      ...(input.apiKey && { api_key: input.apiKey }),
    },
  });
  if (error) mapDbError(error);
  return toPlatform(data as PlatformRow);
}

export async function sendTestMessage(phone: string, text: string): Promise<{ status: string }> {
  const { data, error } = await getServiceClient().rpc("notification_send_test", {
    p_phone: phone,
    p_text: text,
  });
  if (error) mapDbError(error);
  return { status: String((data as { status: string }).status) };
}
