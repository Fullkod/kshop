import { z } from "zod";
import { currencyCodeSchema } from "../currency";
import { manualDiscountSchema, voucherCodeSchema } from "../discounts/schemas";
import { phoneSchema } from "./phone";
import { ORDER_STATUSES, SHIPPING_TYPES } from "./status";

// Inputs of the customer, cart, checkout and order endpoints of /api/v1. Shared by the web and the apps.

const text = (min: number, max: number, required = "Obligatorio.") =>
  z.string().trim().min(min, required).max(max, `Máximo ${max} caracteres.`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();
const uuid = z.uuid();
const money = z.coerce
  .number({ error: "Escribe un número." })
  .min(0, "No puede ser negativo.")
  .max(9_999_999_999.99)
  .transform((v) => Math.round(v * 100) / 100);

/** Supabase Auth password_min_length is 8 (supabase/auth-config.json). */
export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres.")
  .max(72, "Máximo 72 caracteres.");

// ---------------------------------------------------------------------------
// Customer accounts (D1–D5)
// ---------------------------------------------------------------------------

export const customerRegisterSchema = z.object({
  firstName: text(1, 80, "Escribe tu nombre."),
  lastName: optionalText(80),
  phone: phoneSchema,
  password: passwordSchema,
  acceptsMarketing: z.boolean().default(false),
  /** Guest cart to merge into the new account. */
  cartToken: uuid.optional(),
});
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;

export const customerLoginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Escribe tu contraseña.").max(72),
  cartToken: uuid.optional(),
});
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const RECOVERY_CODE_LENGTH = 6;

export const customerResetSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${RECOVERY_CODE_LENGTH}}$`), `El código tiene ${RECOVERY_CODE_LENGTH} dígitos.`),
  password: passwordSchema,
});
export type CustomerResetInput = z.infer<typeof customerResetSchema>;

export const customerProfileSchema = z.object({
  firstName: text(1, 80, "Escribe tu nombre."),
  lastName: optionalText(80),
  email: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.email("Email no válido.").optional())
    .optional(),
  acceptsMarketing: z.boolean().default(false),
});
export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

export const customerAddressSchema = z.object({
  label: optionalText(40),
  recipient: text(1, 120, "Escribe quién recibe."),
  phone: phoneSchema.optional(),
  shippingZoneId: uuid.optional(),
  address: text(1, 300, "Escribe la dirección."),
  reference: optionalText(300),
  isDefault: z.boolean().default(false),
});
export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;

// ---------------------------------------------------------------------------
// Cart and checkout (D8, D9)
// ---------------------------------------------------------------------------

export const MAX_LINE_QUANTITY = 999;

export const cartLineSchema = z.object({
  variantId: uuid,
  /** 0 removes the line. */
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
});
export type CartLineInput = z.infer<typeof cartLineSchema>;

export const cartUpdateSchema = z.object({
  /** Guest cart handle (ignored when a customer token is sent). */
  token: uuid.optional(),
  currency: currencyCodeSchema.optional(),
  lines: z.array(cartLineSchema).min(1).max(100),
  /** "set" replaces the quantity of each line, "add" adds to it. */
  mode: z.enum(["set", "add"]).default("set"),
});
export type CartUpdateInput = z.infer<typeof cartUpdateSchema>;

export const checkoutShippingSchema = z.object({
  zoneId: uuid.optional(),
  methodId: uuid.optional(),
  recipient: optionalText(120),
  address: optionalText(300),
  reference: optionalText(300),
});

export const checkoutSchema = z.object({
  /** Same key on a retry returns the same order (D9). */
  idempotencyKey: z.string().trim().min(8).max(100),
  cartToken: uuid.optional(),
  currency: currencyCodeSchema.optional(),
  customer: z.object({ name: text(1, 120, "Escribe tu nombre."), phone: phoneSchema }),
  shipping: checkoutShippingSchema.default({}),
  paymentMethodId: uuid.optional(),
  note: optionalText(1000),
  /** Optional account in the same step (D2): creates it with the checkout phone. */
  createAccountPassword: passwordSchema.optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Admin: shipping, payment methods, orders
// ---------------------------------------------------------------------------

export const shippingZoneSchema = z.object({
  name: text(1, 80),
  description: optionalText(300),
  isActive: z.boolean().default(true),
});
export type ShippingZoneInput = z.infer<typeof shippingZoneSchema>;

export const shippingMethodSchema = z
  .object({
    zoneId: uuid.nullable().default(null),
    type: z.enum(SHIPPING_TYPES),
    name: text(1, 80),
    price: money.default(0),
    freeOverSubtotal: money.nullable().default(null),
    warehouseId: uuid.nullable().default(null),
    minDays: z.coerce.number().int().min(0).max(365).nullable().default(null),
    maxDays: z.coerce.number().int().min(0).max(365).nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === "pickup" && !v.warehouseId)
      ctx.addIssue({ code: "custom", path: ["warehouseId"], message: "Elige el punto de recogida." });
    if (v.type === "to_agree" && (v.price > 0 || v.freeOverSubtotal !== null))
      ctx.addIssue({ code: "custom", path: ["price"], message: "«A convenir» no lleva precio." });
    if (v.minDays !== null && v.maxDays !== null && v.minDays > v.maxDays)
      ctx.addIssue({ code: "custom", path: ["maxDays"], message: "Debe ser mayor o igual que el mínimo." });
  });
export type ShippingMethodInput = z.infer<typeof shippingMethodSchema>;

export const paymentMethodSchema = z.object({
  name: text(1, 80),
  currencies: z.array(currencyCodeSchema).max(3).default([]),
  instructions: optionalText(1000),
  isActive: z.boolean().default(true),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

export const orderTransitionSchema = z.object({ to: z.enum(ORDER_STATUSES).exclude(["cancelled"]) });
export const orderShippingSchema = z.object({ amount: money });
export const orderPaymentSchema = z.object({
  amount: money.refine((v) => v > 0, "Debe ser mayor que 0."),
  paymentMethodId: uuid.optional(),
  reference: optionalText(120),
  /** Path in store-media: stores/{storeId}/payments/... */
  evidencePath: z.string().trim().max(300).optional(),
});
export type OrderPaymentInput = z.infer<typeof orderPaymentSchema>;
export const orderCancelSchema = z.object({ reason: optionalText(300) });
export const orderNoteSchema = z.object({ text: text(1, 1000) });

/** "Nuevo pedido" from the admin (channel admin, decision 23): same checkout, lines picked by the staff. */
export const adminOrderSchema = checkoutSchema
  .omit({ cartToken: true, createAccountPassword: true })
  .extend({
    customerId: uuid.optional(),
    voucherCode: voucherCodeSchema.optional(),
    manualDiscount: manualDiscountSchema.optional(),
    lines: z
      .array(z.object({ variantId: uuid, quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY) }))
      .min(1, "Añade al menos un producto.")
      .max(100),
  });
export type AdminOrderInput = z.infer<typeof adminOrderSchema>;
