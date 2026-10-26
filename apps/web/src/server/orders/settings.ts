import "server-only";
import {
  paymentMethodSchema,
  shippingMethodSchema,
  shippingZoneSchema,
  type ModuleCode,
  type PaymentMethodInput,
  type ShippingMethodInput,
  type ShippingZoneInput,
} from "@kshop/core";
import type { z } from "zod";

// Checkout settings edited from the admin (/api/v1/stores/{storeId}/checkout-settings/{resource}): one config
// per table, like the simple catalog resources. Writes need admin+ and the module of the resource.

type ResourceConfig<S extends z.ZodType> = {
  table: string;
  module: ModuleCode;
  schema: S;
  entity: string;
  toRow: (input: z.infer<S>) => Record<string, unknown>;
};

const zones: ResourceConfig<typeof shippingZoneSchema> = {
  table: "shipping_zones",
  module: "shipping",
  schema: shippingZoneSchema,
  entity: "La zona",
  toRow: (i: ShippingZoneInput) => ({
    name: i.name,
    description: i.description ?? null,
    is_active: i.isActive,
  }),
};

const methods: ResourceConfig<typeof shippingMethodSchema> = {
  table: "shipping_methods",
  module: "shipping",
  schema: shippingMethodSchema,
  entity: "El método de entrega",
  toRow: (i: ShippingMethodInput) => ({
    zone_id: i.zoneId,
    type: i.type,
    name: i.name,
    price: i.type === "to_agree" ? 0 : i.price,
    free_over_subtotal: i.type === "to_agree" ? null : i.freeOverSubtotal,
    warehouse_id: i.type === "pickup" ? i.warehouseId : null,
    min_days: i.minDays,
    max_days: i.maxDays,
    is_active: i.isActive,
  }),
};

const paymentMethods: ResourceConfig<typeof paymentMethodSchema> = {
  table: "payment_methods",
  module: "orders",
  schema: paymentMethodSchema,
  entity: "El método de pago",
  toRow: (i: PaymentMethodInput) => ({
    name: i.name,
    currencies: i.currencies,
    instructions: i.instructions ?? null,
    is_active: i.isActive,
  }),
};

export const CHECKOUT_SETTINGS = {
  zones,
  methods,
  "payment-methods": paymentMethods,
} as const;

export type CheckoutSettingName = keyof typeof CHECKOUT_SETTINGS;

export function getCheckoutSetting(name: string) {
  return Object.hasOwn(CHECKOUT_SETTINGS, name)
    ? (CHECKOUT_SETTINGS[name as CheckoutSettingName] as ResourceConfig<z.ZodType>)
    : null;
}
