import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { IMPORT_IMAGE_MAX_BYTES } from "@kshop/core";
import sharp from "sharp";
import { getServiceClient } from "../supabase";

// Decision D3: image URLs from the Excel are downloaded by the server, converted with sharp to the same
// sizes as the browser upload (WebP 1600 px + 480 px thumbnail) and stored in store-media.

const SIZES = { full: 1600, thumb: 480 } as const;
const QUALITY = 82;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type ImportedImage = { storageKey: string; url: string; thumbUrl: string };

/** Loopback, private, link-local, CGNAT and other non-public ranges (SSRF guard). */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
  }
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("solo se admiten http y https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("la dirección no es pública");
  }
}

/** GET with redirects checked one by one, a timeout and a size limit. */
async function download(source: string): Promise<Buffer> {
  let url = new URL(source);
  for (let hop = 0; ; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new Error("demasiadas redirecciones");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`respondió ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > IMPORT_IMAGE_MAX_BYTES) {
      throw new Error("pesa más de 15 MB");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      size += part.value.byteLength;
      if (size > IMPORT_IMAGE_MAX_BYTES) {
        await reader.cancel();
        throw new Error("pesa más de 15 MB");
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  }
}

const toWebp = (input: Buffer, maxSide: number) =>
  sharp(input, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();

/** Downloads an image URL and stores it in store-media like a browser upload. Throws a Spanish reason. */
export async function importImageFromUrl(storeId: string, source: string): Promise<ImportedImage> {
  let input: Buffer;
  try {
    input = await download(source);
  } catch (e) {
    const reason = e instanceof Error && e.name !== "TimeoutError" ? e.message : "no respondió a tiempo";
    throw new Error(`No se pudo descargar la imagen ${source}: ${reason}.`);
  }
  let full: Buffer;
  let thumb: Buffer;
  try {
    [full, thumb] = await Promise.all([toWebp(input, SIZES.full), toWebp(input, SIZES.thumb)]);
  } catch {
    throw new Error(`El archivo ${source} no es una imagen válida.`);
  }

  const base = `stores/${storeId}/products/${crypto.randomUUID()}`;
  const bucket = getServiceClient().storage.from("store-media");
  const keys = { full: `${base}-${SIZES.full}.webp`, thumb: `${base}-${SIZES.thumb}.webp` };
  const options = { contentType: "image/webp", cacheControl: "31536000", upsert: false };
  const [a, b] = await Promise.all([
    bucket.upload(keys.full, full, options),
    bucket.upload(keys.thumb, thumb, options),
  ]);
  if (a.error || b.error) throw new Error(`No se pudo guardar la imagen ${source}.`);
  return {
    storageKey: keys.full,
    url: bucket.getPublicUrl(keys.full).data.publicUrl,
    thumbUrl: bucket.getPublicUrl(keys.thumb).data.publicUrl,
  };
}
