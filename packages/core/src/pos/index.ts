import { z } from "zod";
import { quantityValueSchema, saleUnitSchema } from "../catalog/units";
import { currencyCodeSchema } from "../currency";

export * from "./search";

// Counter sales (PRP pos-offline): what a phone uploads. The sale already happened, so prices come from the phone.

const money = z.coerce.number().min(0).max(9_999_999_999.99);
const uuid = z.uuid();

const posLineSchema = z.object({
  variantId: uuid,
  /** Whole for units; decimals for products sold by weight or measure (KSH0015). Old apps send whole numbers. */
  quantity: quantityValueSchema({ positive: true }),
  /** The unit the phone sold it in (KSH0015); old apps leave it out and the server takes the product's. */
  unit: saleUnitSchema.optional(),
  unitPrice: money,
  /** The name on the phone, in case the product no longer exists when the sale arrives. */
  productName: z.string().trim().min(1).max(300),
  variantName: z.string().trim().max(300).optional(),
  sku: z.string().trim().max(64).optional(),
  /** The cashier changed the price on purpose (KSH0011): the owner sees it noted, with the reason if any. */
  priceChanged: z.boolean().optional(),
  priceNote: z.string().trim().max(200).optional(),
});

const posPaymentSchema = z.object({
  amount: money.refine((v) => v > 0),
  currency: currencyCodeSchema.optional(),
  rate: z.number().positive().max(1_000_000).optional(),
  changeAmount: money.refine((v) => v > 0).optional(),
  changeCurrency: currencyCodeSchema.optional(),
  paymentMethodId: uuid.optional(),
  reference: z.string().trim().max(120).optional(),
});

export const posSaleSchema = z.object({
  /** Generated on the phone: repeating an upload returns the same order. */
  id: uuid,
  deviceId: uuid,
  localNumber: z.string().trim().min(1).max(40),
  soldAt: z.iso.datetime({ offset: true }),
  voided: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
  lines: z.array(posLineSchema).min(1).max(100),
  payments: z.array(posPaymentSchema).max(20),
});
export type PosSaleInput = z.infer<typeof posSaleSchema>;

/** Money per currency: {"CUP": 500}. */
const moneyByCurrency = z.partialRecord(currencyCodeSchema, money);

/** Closing the day at the counter (KSH0012): what was counted, the float of that day if it differs, a note. */
export const posClosingSchema = z.object({
  counted: moneyByCurrency,
  float: moneyByCurrency.optional(),
  note: z.string().trim().max(500).optional(),
});
export type PosClosingInput = z.infer<typeof posClosingSchema>;

/** The float the till opens with every day, set by owner or admin. */
export const posFloatSchema = z.object({ float: moneyByCurrency });

/** Small batches, one after another: the database is a Nano. */
export const POS_BATCH_SIZE = 20;
export const posSalesSchema = z.object({ sales: z.array(posSaleSchema).min(1).max(POS_BATCH_SIZE) });
export const posCatalogQuerySchema = z.object({
  after: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
