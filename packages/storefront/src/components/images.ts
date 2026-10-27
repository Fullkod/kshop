/** srcset for an image stored in the two Phase 1 sizes (…-480.webp / …-1600.webp). */
export function imageSrcSet(url: string): string | undefined {
  // Banners: …-768.webp / …-1920.webp.
  if (url.endsWith("-1920.webp")) return `${url.replace(/-1920\.webp$/, "-768.webp")} 768w, ${url} 1920w`;
  if (url.endsWith("-1600.webp")) return `${url.replace(/-1600\.webp$/, "-480.webp")} 480w, ${url} 1600w`;
  if (url.endsWith("-480.webp")) return `${url} 480w, ${url.replace(/-480\.webp$/, "-1600.webp")} 1600w`;
  return undefined;
}
