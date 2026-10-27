/**
 * v2 look for the pages inside the admin and superadmin shells (redesign R8, docs/design-v2/04-ADMIN.md): page titles
 * in Outfit 26 px, section titles in Outfit, table headers in small caps on the surface color and cards with the 14 px
 * radius. It targets the classes the pages already use (`h1.text-2xl`, `h2.text-lg`, `thead`, `.rounded-xl.border`),
 * so screens designed in v2 (Inicio, Tema) keep their own sizes.
 */
export const ADMIN_CONTENT_CLASS = [
  "[&_h1.text-2xl]:font-display [&_h1.text-2xl]:text-[26px] [&_h1.text-2xl]:leading-tight [&_h1.text-2xl]:font-bold",
  "[&_h1.text-2xl]:tracking-[-0.01em]",
  "[&_h2.text-lg]:font-display [&_h2.text-lg]:font-bold",
  "[&_thead_th]:text-[11.5px] [&_thead_th]:font-semibold [&_thead_th]:tracking-[.06em] [&_thead_th]:uppercase",
  "[&_.rounded-xl.border]:rounded-[14px]",
].join(" ");
