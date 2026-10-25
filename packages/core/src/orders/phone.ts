import { z } from "zod";

// Customer phones are stored in E.164 (+5351234567). Cuba (+53) is the default country (decision 23:
// the phone is the login identifier, not verified).

export const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalizes what people type: "5123 4567", "+53 5 123-4567", "0053 51234567", "53 51234567".
 * 8 digits are a Cuban number. Returns null when it cannot be a valid E.164 number.
 */
export function normalizePhone(input: string, defaultCountryCode = "53"): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let phone: string;
  if (trimmed.startsWith("+")) phone = `+${digits}`;
  else if (digits.startsWith("00")) phone = `+${digits.slice(2)}`;
  else if (digits.length === 8) phone = `+${defaultCountryCode}${digits}`;
  else if (digits.startsWith(defaultCountryCode) && digits.length === defaultCountryCode.length + 8)
    phone = `+${digits}`;
  else {
    digits = digits.replace(/^0+/, "");
    phone = digits.length === 8 ? `+${defaultCountryCode}${digits}` : `+${digits}`;
  }
  return E164_PATTERN.test(phone) ? phone : null;
}

/** "+5351234567" -> "+53 5123 4567" (other countries: just the E.164 number). */
export function formatPhone(phone: string): string {
  const cuba = /^\+53(\d{4})(\d{4})$/.exec(phone);
  return cuba ? `+53 ${cuba[1]} ${cuba[2]}` : phone;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Escribe tu teléfono.")
  .transform((value, ctx) => {
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Teléfono no válido." });
      return z.NEVER;
    }
    return phone;
  });
