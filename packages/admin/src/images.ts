"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Decision D3: images are compressed in the browser (WebP, 1600 px + 480 px thumbnail) and uploaded straight
// to store-media with the staff token; the API only registers them. Same code path for the Capacitor app.

export const IMAGE_SIZES = { full: 1600, thumb: 480 } as const;
const QUALITY = 0.82;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

async function toWebp(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("WebP encoding failed"))),
      "image/webp",
      QUALITY,
    ),
  );
}

export type UploadedImage = { storageKey: string; url: string; thumbUrl: string };

/** Banner sizes (decision D5): wide image for desktop, 768 px for phones. */
export const BANNER_SIZES = { full: 1920, small: 768 } as const;

/** Compresses and uploads a banner image (two sizes); returns the URL of the large one. */
export async function uploadBannerImage(
  supabase: SupabaseClient,
  storeId: string,
  file: File,
): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("La imagen pesa más de 15 MB.");
  const [full, small] = await Promise.all([
    toWebp(file, BANNER_SIZES.full),
    toWebp(file, BANNER_SIZES.small),
  ]);
  const base = `stores/${storeId}/banners/${crypto.randomUUID()}`;
  const bucket = supabase.storage.from("store-media");
  const options = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([
    bucket.upload(`${base}-${BANNER_SIZES.full}.webp`, full, options),
    bucket.upload(`${base}-${BANNER_SIZES.small}.webp`, small, options),
  ]);
  if (a.error || b.error) throw new Error("No se pudo subir la imagen.");
  return bucket.getPublicUrl(`${base}-${BANNER_SIZES.full}.webp`).data.publicUrl;
}

/** Compresses and uploads a product image; returns what POST .../media expects. */
export async function uploadProductImage(
  supabase: SupabaseClient,
  storeId: string,
  file: File,
): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("La imagen pesa más de 15 MB.");

  const [full, thumb] = await Promise.all([toWebp(file, IMAGE_SIZES.full), toWebp(file, IMAGE_SIZES.thumb)]);
  const base = `stores/${storeId}/products/${crypto.randomUUID()}`;
  const bucket = supabase.storage.from("store-media");

  const keys = { full: `${base}-${IMAGE_SIZES.full}.webp`, thumb: `${base}-${IMAGE_SIZES.thumb}.webp` };
  const options = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([
    bucket.upload(keys.full, full, options),
    bucket.upload(keys.thumb, thumb, options),
  ]);
  if (a.error || b.error) throw new Error("No se pudo subir la imagen.");

  return {
    storageKey: keys.full,
    url: bucket.getPublicUrl(keys.full).data.publicUrl,
    thumbUrl: bucket.getPublicUrl(keys.thumb).data.publicUrl,
  };
}
