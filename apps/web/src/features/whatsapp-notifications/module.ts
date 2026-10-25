import type { AdminModule } from "../types";

export const whatsappNotificationsModule: AdminModule = {
  code: "whatsapp_notifications",
  label: "Avisos WhatsApp",
  adminPath: "/admin/whatsapp-notifications",
  availableInPhase: 4,
};
