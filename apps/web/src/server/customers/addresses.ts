import "server-only";
import type { CustomerAddressInput } from "@kshop/core";
import type { CustomerAddress } from "@kshop/data";
import { mapDbError } from "../db-errors";
import { notFound } from "../http";
import { getServiceClient } from "../supabase";

type AddressRow = {
  id: string;
  label: string | null;
  recipient: string;
  phone: string | null;
  shipping_zone_id: string | null;
  address: string;
  reference: string | null;
  is_default: boolean;
};

const toAddress = (row: AddressRow): CustomerAddress => ({
  id: row.id,
  label: row.label,
  recipient: row.recipient,
  phone: row.phone,
  shippingZoneId: row.shipping_zone_id,
  address: row.address,
  reference: row.reference,
  isDefault: row.is_default,
});

const toRow = (input: CustomerAddressInput) => ({
  label: input.label ?? null,
  recipient: input.recipient,
  phone: input.phone ?? null,
  shipping_zone_id: input.shippingZoneId ?? null,
  address: input.address,
  reference: input.reference ?? null,
  is_default: input.isDefault,
});

export async function listAddresses(storeId: string, customerId: string): Promise<CustomerAddress[]> {
  const { data, error } = await getServiceClient()
    .from("customer_addresses")
    .select("*")
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .order("is_default", { ascending: false })
    .order("created_at")
    .returns<AddressRow[]>();
  if (error) throw error;
  return data.map(toAddress);
}

// Only one default address per customer (unique partial index): clear it before setting another.
async function clearDefault(storeId: string, customerId: string) {
  const { error } = await getServiceClient()
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .eq("is_default", true);
  if (error) throw error;
}

export async function saveAddress(
  storeId: string,
  customerId: string,
  input: CustomerAddressInput,
  addressId?: string,
): Promise<CustomerAddress> {
  if (input.isDefault) await clearDefault(storeId, customerId);
  const service = getServiceClient();
  const query = addressId
    ? service
        .from("customer_addresses")
        .update(toRow(input))
        .eq("id", addressId)
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
    : service
        .from("customer_addresses")
        .insert({ ...toRow(input), store_id: storeId, customer_id: customerId });
  const { data, error } = await query.select("*").maybeSingle<AddressRow>();
  if (error) mapDbError(error, "La dirección");
  if (!data) throw notFound("Dirección");
  return toAddress(data);
}

export async function deleteAddress(storeId: string, customerId: string, addressId: string): Promise<void> {
  const { data, error } = await getServiceClient()
    .from("customer_addresses")
    .delete()
    .eq("id", addressId)
    .eq("store_id", storeId)
    .eq("customer_id", customerId)
    .select("id");
  if (error) throw error;
  if (!data.length) throw notFound("Dirección");
}
