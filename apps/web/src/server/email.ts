import "server-only";
import { serverEnv } from "./env";

// Transactional email through the Resend API (fullkod.com). The quota (100/day, 3 000/month) is shared with every
// Fullkod project, so only staff access links go by email; customers have no real email (synthetic per store).

export type Email = { to: string; subject: string; html: string; text: string };

export const emailEnabled = () => Boolean(serverEnv.resend);

export async function sendEmail(email: Email): Promise<void> {
  const resend = serverEnv.resend;
  if (!resend) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resend.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: resend.from, ...email }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Email with the one-time link to /admin/set-password (password reset or access sent by the superadmin). */
export function accessLinkEmail(input: {
  to: string;
  storeName: string;
  link: string;
  reason: "reset" | "access";
}): Email {
  const intro =
    input.reason === "reset"
      ? `Pediste cambiar la contraseña del panel de ${input.storeName} en Kshop.`
      : `Fullkod te envía el acceso al panel de ${input.storeName} en Kshop.`;
  const action = "Abre este enlace para crear tu contraseña nueva. Sirve una sola vez y caduca en una hora.";
  const ignore =
    input.reason === "reset" ? "Si no lo pediste tú, ignora este correo: tu contraseña no cambia." : "";
  const store = escapeHtml(input.storeName);
  const link = escapeHtml(input.link);
  return {
    to: input.to,
    subject: `Tu acceso a ${input.storeName} · Kshop`,
    text: [intro, action, input.link, ignore].filter(Boolean).join("\n\n"),
    html: `<div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;color:#24104F">
  <p style="font-size:20px;font-weight:600;margin:0 0 16px">${store}</p>
  <p>${escapeHtml(intro)}</p>
  <p>${escapeHtml(action)}</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#5B21B6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Crear contraseña</a></p>
  ${ignore ? `<p style="color:#6b6880;font-size:14px">${escapeHtml(ignore)}</p>` : ""}
  <p style="color:#6b6880;font-size:12px">Kshop · Fullkod</p>
</div>`,
  };
}
