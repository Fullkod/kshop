/* Kshop — propuesta de sistema de temas v2.
   Lo que guarda el admin (stores.theme): preset + overrides de cualquier campo editable.
   Lo que calcula themeStyle(): los tokens DERIVADOS (hover, suaves, estados, sombras, radios por pieza).
   Este archivo es la fuente única: la biblioteca, la portada, la ficha y el admin lo leen. */
(function () {
  if (window.KSHOP) return;
  const FONTS = {
    outfit: "'Outfit'", "dm-sans": "'DM Sans'", inter: "'Inter'",
    poppins: "'Poppins'", lora: "'Lora'", "playfair-display": "'Playfair Display'",
  };
  const FONT_LABELS = { outfit: "Outfit", "dm-sans": "DM Sans", inter: "Inter", poppins: "Poppins", lora: "Lora", "playfair-display": "Playfair Display" };
  const SERIF = ["lora", "playfair-display"];
  // radius -> radio por pieza (px). Antes había un solo --sf-radius para todo.
  const RADII = {
    none: { sm: 0, md: 0, lg: 0, btn: 0 },
    sm: { sm: 2, md: 4, lg: 6, btn: 4 },
    md: { sm: 4, md: 8, lg: 12, btn: 8 },
    lg: { sm: 8, md: 14, lg: 22, btn: 12 },
    full: { sm: 10, md: 20, lg: 28, btn: 999 },
  };
  const RADIUS_LABELS = { none: "Rectas", sm: "Suaves", md: "Redondeadas", lg: "Muy redondeadas", full: "Píldora" };

  // Campos editables (12 colores). sale, secondary e ink son nuevos respecto al tema v1.
  const PRESETS = {
    kshop: {
      label: "Kshop",
      colors: { accent: "#5B21B6", accentFg: "#FFFFFF", secondary: "#F2B705", secondaryFg: "#24104F", background: "#FFFFFF", surface: "#F7F5FC", foreground: "#24104F", muted: "#5E5873", line: "#E6E1F2", sale: "#C42350", ink: "#24104F", inkFg: "#FFFFFF" },
      headingFont: "outfit", bodyFont: "dm-sans", radius: "lg", buttonShape: "auto", elevation: "soft", headingCase: "normal",
    },
    classic: {
      label: "Clásico",
      colors: { accent: "#1F3A5F", accentFg: "#FFFFFF", secondary: "#B08D57", secondaryFg: "#1A1A1A", background: "#FFFFFF", surface: "#F4F4F2", foreground: "#1A1A1A", muted: "#5C5C5C", line: "#E2E2DE", sale: "#9E2B25", ink: "#1F3A5F", inkFg: "#FFFFFF" },
      headingFont: "playfair-display", bodyFont: "lora", radius: "sm", buttonShape: "auto", elevation: "flat", headingCase: "normal",
    },
    minimal: {
      label: "Minimal",
      colors: { accent: "#111111", accentFg: "#FFFFFF", secondary: "#E9E9E6", secondaryFg: "#111111", background: "#FFFFFF", surface: "#F5F5F5", foreground: "#111111", muted: "#5F5F5F", line: "#E5E5E5", sale: "#D11A1A", ink: "#111111", inkFg: "#FFFFFF" },
      headingFont: "inter", bodyFont: "inter", radius: "none", buttonShape: "auto", elevation: "flat", headingCase: "uppercase",
    },
    warm: {
      label: "Cálido",
      colors: { accent: "#B4441E", accentFg: "#FFFFFF", secondary: "#E8A33D", secondaryFg: "#3B2416", background: "#FFFBF5", surface: "#F8EEE2", foreground: "#3B2416", muted: "#6E5442", line: "#EBDCCB", sale: "#A3262E", ink: "#3B2416", inkFg: "#FFFBF5" },
      headingFont: "poppins", bodyFont: "dm-sans", radius: "md", buttonShape: "auto", elevation: "soft", headingCase: "normal",
    },
    fresh: {
      label: "Fresco",
      colors: { accent: "#0F7B4F", accentFg: "#FFFFFF", secondary: "#FF8A3D", secondaryFg: "#2A1A0A", background: "#FFFFFF", surface: "#F1F7F3", foreground: "#12261C", muted: "#4F6158", line: "#DCE7DF", sale: "#C93A1C", ink: "#0F3D2A", inkFg: "#FFFFFF" },
      headingFont: "poppins", bodyFont: "dm-sans", radius: "full", buttonShape: "pill", elevation: "soft", headingCase: "normal",
    },
    dark: {
      label: "Oscuro",
      colors: { accent: "#F2B705", accentFg: "#24104F", secondary: "#B79CFF", secondaryFg: "#14101F", background: "#14101F", surface: "#211A33", foreground: "#F5F3FA", muted: "#B8B0CC", line: "#332A4A", sale: "#FF7A93", ink: "#0B0814", inkFg: "#F5F3FA" },
      headingFont: "outfit", bodyFont: "dm-sans", radius: "lg", buttonShape: "auto", elevation: "lifted", headingCase: "normal",
    },
  };

  const TOKEN_DOCS = [
    { k: "accent", v: "--accent", label: "Acento", role: "Botones principales, enlaces, selección", group: "Marca" },
    { k: "accentFg", v: "--accent-fg", label: "Texto sobre acento", role: "Texto e iconos encima del acento", group: "Marca" },
    { k: "secondary", v: "--secondary", label: "Secundario", role: "Etiquetas «Nuevo», estrellas, contadores, detalles", group: "Marca", isNew: true },
    { k: "secondaryFg", v: "--secondary-fg", label: "Texto sobre secundario", role: "Texto encima del secundario", group: "Marca", isNew: true },
    { k: "background", v: "--bg", label: "Fondo", role: "Fondo de página", group: "Superficies" },
    { k: "surface", v: "--surface", label: "Superficie", role: "Tarjetas, bandas, campos", group: "Superficies" },
    { k: "ink", v: "--ink", label: "Banda de contraste", role: "Barra de anuncio, pie, bloques oscuros", group: "Superficies", isNew: true },
    { k: "inkFg", v: "--ink-fg", label: "Texto sobre banda", role: "Texto encima de la banda", group: "Superficies", isNew: true },
    { k: "foreground", v: "--fg", label: "Texto", role: "Títulos y texto principal", group: "Texto" },
    { k: "muted", v: "--muted", label: "Texto secundario", role: "Marcas, ayudas, metadatos", group: "Texto" },
    { k: "line", v: "--line", label: "Bordes", role: "Bordes y divisores", group: "Texto" },
    { k: "sale", v: "--sale", label: "Oferta", role: "Precio rebajado, % de descuento, cuenta atrás", group: "Texto", isNew: true },
  ];

  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => {
    const [r, g, b] = hexToRgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  const onColor = (h) => (contrast(h, "#FFFFFF") >= contrast(h, "#111111") ? "#FFFFFF" : "#111111");
  const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  const stack = (f) => `${FONTS[f]}, ${SERIF.includes(f) ? "ui-serif, Georgia, serif" : "ui-sans-serif, system-ui, sans-serif"}`;

  function resolve(key, overrides) {
    const p = PRESETS[key] || PRESETS.kshop;
    const o = overrides || {};
    return { key, ...p, ...o, colors: { ...p.colors, ...(o.colors || {}) } };
  }

  /** Equivalente propuesto de themeStyle(theme): editables + derivados como variables CSS. */
  function vars(t) {
    const c = t.colors;
    const dark = lum(c.background) < 0.2; // antes: preset === "dark"; ahora funciona con colores propios
    const r = RADII[t.radius];
    const sh = `color-mix(in srgb, ${dark ? "#000" : c.foreground} ${dark ? 60 : 18}%, transparent)`;
    const elev = {
      flat: ["none", `0 0 0 1px ${c.line}`],
      soft: [`0 1px 2px ${sh}, 0 8px 24px -14px ${sh}`, `0 24px 60px -24px ${sh}`],
      lifted: [`0 2px 4px ${sh}, 0 14px 32px -12px ${sh}`, `0 32px 80px -20px ${sh}`],
    }[t.elevation];
    return {
      "--bg": c.background, "--fg": c.foreground, "--surface": c.surface, "--muted": c.muted, "--line": c.line,
      "--accent": c.accent, "--accent-fg": c.accentFg, "--secondary": c.secondary, "--secondary-fg": c.secondaryFg,
      "--ink": c.ink, "--ink-fg": c.inkFg, "--sale": c.sale,
      "--accent-hover": mix(c.accent, dark ? "#fff" : "#000", 86),
      "--accent-soft": mix(c.accent, c.background, 12),
      "--secondary-soft": mix(c.secondary, c.background, 20),
      "--sale-soft": mix(c.sale, c.background, 12),
      "--sale-fg": onColor(c.sale),
      "--surface-2": mix(c.line, c.surface, 45),
      "--ink-muted": mix(c.inkFg, c.ink, 70),
      "--ring": mix(c.accent, "transparent", 45),
      "--scrim": mix(c.ink, "transparent", 72),
      "--ok": dark ? "#6FD39C" : "#1F7A4D", "--ok-bg": dark ? "#17321F" : "#E3F4EA",
      "--bad": dark ? "#FF8F95" : "#A3262E", "--bad-bg": dark ? "#3A1A1E" : "#FBE6E7",
      "--warn": dark ? "#F5C451" : "#8A5A00", "--warn-bg": dark ? "#3A2E12" : "#FFF3D6",
      "--wa": "#1FA855",
      "--sf-heading": stack(t.headingFont), "--sf-body": stack(t.bodyFont),
      "--sf-case": t.headingCase, "--sf-track": t.headingCase === "uppercase" ? "0.04em" : "-0.015em",
      "--sf-radius-sm": r.sm + "px", "--sf-radius": r.md + "px", "--sf-radius-lg": r.lg + "px",
      "--sf-btn-radius": t.buttonShape === "pill" ? "999px" : r.btn + "px",
      "--sf-shadow": elev[0], "--sf-shadow-lg": elev[1],
      "color-scheme": dark ? "dark" : "light",
    };
  }

  const GF = { outfit: "Outfit:wght@400..800", "dm-sans": "DM+Sans:opsz,wght@9..40,400..700", inter: "Inter:wght@400..700", poppins: "Poppins:wght@400;500;600;700;800", lora: "Lora:wght@400..700", "playfair-display": "Playfair+Display:wght@400..800" };
  function loadFont(f) {
    if (f === "outfit" || f === "dm-sans" || document.querySelector('link[data-kfont="' + f + '"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.dataset.kfont = f;
    l.href = "https://fonts.googleapis.com/css2?family=" + GF[f] + "&display=swap";
    document.head.appendChild(l);
  }
  function apply(key, overrides, el) {
    const t = resolve(key, overrides);
    loadFont(t.headingFont); loadFont(t.bodyFont);
    const target = el || document.documentElement;
    Object.entries(vars(t)).forEach(([k, v]) => target.style.setProperty(k, v));
    return t;
  }

  function issues(c) {
    return [
      ["Texto sobre fondo", c.foreground, c.background], ["Texto secundario sobre fondo", c.muted, c.background],
      ["Texto de los botones", c.accentFg, c.accent], ["Texto sobre secundario", c.secondaryFg, c.secondary],
      ["Texto sobre banda", c.inkFg, c.ink], ["Texto sobre tarjetas", c.foreground, c.surface],
    ].map(([pair, a, b]) => ({ pair, ratio: contrast(a, b) })).filter((x) => x.ratio < 4.5);
  }

  window.KSHOP = { PRESETS, TOKEN_DOCS, FONTS, FONT_LABELS, RADII, RADIUS_LABELS, resolve, vars, apply, contrast, onColor, issues };
  window.dispatchEvent(new Event("kshop-themes"));
})();
