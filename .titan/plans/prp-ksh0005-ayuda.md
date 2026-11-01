# PRP KSH0005: ayuda en la app, como la de Tasknic

> **Estado**: APROBADO por Roberto (2026-11-01). **Fase 1 hecha** (2026-11-01): modelo, Zod, generadores, 9 guías,
> primer día, glosario y FAQ en `packages/admin/src/help/`, 10 tests. **Fase 2 hecha**: «?» en admin, superadmin y
> Kshop Admin, páginas Ayuda, `pnpm qa:help`. **Fase 3 hecha**: `help:shots` (11 capturas), Markdown por ruta
> estática, `/help/print` + `help:pdf`, descargas en la página. Sigue la fase 4 (contenido completo). Decisiones ya tomadas por Roberto: admin de tienda (web y
> Kshop Admin) **y** superadmin; **todas** las piezas de Tasknic (guías por tarea con capturas reales, «Tu primer día»,
> glosario, preguntas frecuentes, buscador, PDF y Markdown); audiencias **dueño/admin** y **empleado** con filtro.
> **Proyecto**: Kshop · Tarea: Tasknic **KSH0005** («quiero una ayuda como mismo la tiene el tasknic, cada vista que
> tenga lo suyo, o cada tabs y una ayuda general»). Referencia: `…/Titanic Factory/src/tasknic/src/features/help/`
> (PRP-009 de Tasknic) · Memoria: `project/2026-10-28-admin-formularios-en-dialogo.md` (R13), `reference/web-en-el-telefono.md`.

---

## Objetivo

Que cualquier dueño, empleado o superadmin pueda resolver «¿cómo hago X?» sin preguntar: un botón **«?»** en cada
pantalla y pestaña abre las guías de esa vista; una página **Ayuda** reúne todo (primer día, guías, glosario,
preguntas frecuentes, buscador) y se descarga en PDF o Markdown. Mismo contenido en la web y en Kshop Admin. Una sola
fuente de verdad en el código, validada, con capturas reales de la Tienda Demo generadas por script.

## Por qué

| Problema | Solución |
|----------|----------|
| Cada dueño nuevo pregunta lo mismo por WhatsApp (subir productos, variantes, Excel, pedidos, la caja, el plan) | Guías por tarea («quiero…»), no por pantalla, con los textos reales de los botones y una captura por paso |
| El admin tiene 37 vistas y pestañas; el empleado se pierde | «?» contextual en cada una: solo las guías de donde está |
| Un manual aparte se queda viejo | El contenido vive en `packages/admin/src/help/content/`, se valida en el build (referencias, capturas que faltan) y se regenera con un comando |
| Kshop Admin (app) no tiene dónde mirar | Comparte componentes y contenido; las capturas se sirven desde la plataforma |

## Qué

### Modelo (calcado de Tasknic, en `packages/admin/src/help/`)
- `types.ts`: `HelpAudience = 'owner' | 'staff' | 'superadmin'`; `HelpContext` = una clave por vista/pestaña (abajo);
  `ScreenshotSpec`, `HelpStep`, `HelpArticle` (slug, título por tarea, resumen, audiencias, keywords, contexts, steps,
  tips, related), `FirstDayStep`, `GlossaryEntry`, `FaqEntry`, `HelpContent` (version + todo).
- `content/{screenshots,first-day,articles,glossary,faq,raw}.ts` + `index.ts` validado con Zod (`schemas/help.ts`):
  slugs kebab-case, ≥ 2 pasos por guía, referencias cruzadas (related, screenshot) existentes, sin voseo, ≥ 20 guías.
- `generators/markdown.ts` (una guía → Markdown; todo → `kshop-ayuda.md`, `kshop-ayuda-{dueno,empleado,superadmin}.md`)
  y `generators/search-index.ts` (buscador de la página; sin Nic en Kshop).
- `lib/help-utils.ts` (`HELP_CONTEXT_LABEL`, `matchesAudience`, `screenshotUrl(base, slug)` — en la app la base es la URL
  de la plataforma), `lib/first-day-progress.ts` (progreso del primer día en `localStorage`).

### Contextos («cada vista que tenga lo suyo, o cada tab»)
Admin de tienda: `home`, `orders`, `order` (ficha), `order-new`, `customers`, `payment-methods`, `shipping`, `discounts`,
`vouchers`, `whatsapp` (+ `whatsapp-templates`, `whatsapp-log`), `pos` (+ `pos-sell`, `pos-summary`), `products`,
`product` (editor), `categories`, `brands`, `collections`, `attributes`, `product-types`, `warehouses`, `currencies`,
`excel-import`, `multi-warehouse` (+ movimientos, traslados), `multi-currency`, `themes` (+ portada, banners, menús,
páginas, tema), `custom-domain`, `mobile-app`, `sales-today`, `finance` (+ desglose, gastos, inventario, margen),
`billing`, `team`. Superadmin: `stores`, `store` (ficha), `store-new`, `plans`, `billing`, `domains`, `apps`, `whatsapp`.
El contexto sale de la ruta (y de la pestaña activa de `AdminSubNav`/`[tab]`), sin tocar cada página: `AdminShell` y
`SuperadminShell` lo deducen; Kshop Admin pasa el suyo en cada `Screen`.

### Piezas de interfaz
- **`HelpButton`** («?», 40 px en táctil) en la barra superior del admin (junto a «Ver tienda»), en la del superadmin y
  en la cabecera de cada pantalla de Kshop Admin. Abre un `Dialog` (R13: hoja en el móvil) «Ayuda · <vista>» con las
  guías del contexto como tarjetas plegables (la primera abierta, o la que indique `initial`), «Toda la ayuda» y, si no hay
  guía para esa vista, «Aún no hay guías para esta pantalla» + enlace a la general.
- **Página Ayuda** (`/admin/help`, `/superadmin/help`, pantalla «Ayuda» en Más de Kshop Admin): buscador, filtro de
  audiencia (`Segmented`: Todo · Dueño · Empleado; en superadmin solo su contenido), «Tu primer día» (lista con casillas
  que se recuerdan), guías con índice, glosario, preguntas frecuentes, descargas PDF y Markdown. Entrada **«Ayuda»** en
  la barra lateral (abajo, junto al tema) y en Más.
- **Vista de impresión** `/help/print` (plataforma, pública, sin sesión: solo texto y capturas) para generar el PDF.

### Capturas y exportación (scripts del repo)
- `scripts/help-shots.mjs`: playwright-core, entra en la Tienda Demo como dueño (y como superadmin temporal para las
  suyas), recorre `screenshots.ts` (ruta, viewport, pasos de `setup`) y guarda `apps/web/public/help/screens/<slug>.png`.
  Por defecto contra `pnpm dev` y la base de **prueba** (`db-env`); `HELP_SHOTS_BASE_URL` para producción. Falla si
  falta alguna.
- `scripts/help-export.ts` (`pnpm help:export`, también `prebuild` de `apps/web`): valida el contenido, exige el PNG de
  cada captura declarada, escribe `public/help/kshop-ayuda*.md`, `index.json`, `screenshots.json`.
- `scripts/help-pdf.mjs` (`pnpm help:pdf`): imprime `/help/print` a `public/help/kshop-ayuda.pdf`.
- Regla nueva en `AGENTS.md`: si una tarea cambia la interfaz, revisar las guías que la describen, regenerar capturas y
  PDF y commitearlos (como en Tasknic).

### Contenido inicial (≈ 24 guías del admin + ≈ 8 del superadmin)
Primer día (dueño): logo y WhatsApp de la tienda, primer producto, compartir el enlace, instalar Kshop Admin, invitar al
equipo. Guías: «Quiero subir mi primer producto» (tipos, variantes, fotos, precio y costo, la calculadora), «Tengo el
catálogo en Excel», «Me llegó un pedido» (estados, WhatsApp, cobro), «Quiero crear un pedido a mano», «Cobrar en otra
moneda», «Vender en el mostrador» (web, app sin conexión, anotaciones, anular), «Organizar las entregas», «Hacer una
oferta / un cupón», «Avisar a mis clientes por WhatsApp», «Ver cuánto gané» (ventas de hoy, finanzas), «Varios
almacenes», «Vender en USD y CUP», «Cambiar la apariencia» (portada, banners, menús, páginas), «Mi dominio propio»,
«La app de mi tienda», «Mi equipo y sus permisos», «Mi plan y cómo pago», «No encuentro una sección» (candados BASE/PRO y
secciones gestionadas por Kshop). Superadmin: crear tienda y planes, cobrar y suspender, menú de la tienda (R12),
dominios, apps y APK, WhatsApp real/simulado, importar Excel a cualquier tienda. Glosario: estados de pedido, canales,
Mostrador, reserva, stock disponible, candados, «Gestionado por admin», socio fundador, cortesía… Preguntas frecuentes:
las de WhatsApp del día a día.

### Criterios de éxito
- Cada ruta del admin y del superadmin tiene «?» con al menos una guía (un test recorre `ADMIN_MODULES` y las rutas de
  superadmin contra `contexts`); Kshop Admin lo mismo en sus pantallas.
- `pnpm help:export` falla si una guía referencia una captura sin PNG o un `related` inexistente; `pnpm test` valida el
  contenido; `pnpm build` ejecuta el export.
- `/admin/help` y `/superadmin/help` en el teléfono: sin desbordes, objetivos de 40 px, filtro y buscador usables
  (`qa:mobile` los incluye); el «?» abre una hoja a pantalla completa.
- Descargas: PDF con capturas y Markdown por audiencia en `public/help/`.
- `qa:help` nuevo (navegador): «?» en 10 vistas abre guías de esa vista, la página general busca y filtra, las
  descargas responden 200; capturas en `.titan/qa/ksh0005-ayuda/`.

## Decisiones para Roberto (ya respondidas aquí el 2026-11-01)

| # | Pregunta | Respuesta |
|---|----------|-----------|
| P1 | ¿Dónde? | Admin de tienda (web y Kshop Admin) y superadmin; la tienda pública no |
| P2 | ¿Qué piezas? | Todo como Tasknic: guías con capturas, primer día, glosario, FAQ, buscador, PDF y Markdown |
| P3 | ¿Audiencias? | Dueño/admin y empleado, con filtro que recuerda la elección y sigue el rol por defecto |
| P4 | ¿Orden? | Antes que KSH0006 y KSH0007 |

### Decisiones técnicas
- Todo lo compartido en `packages/admin/src/help/` (sin `next/*`); las páginas y el botón del superadmin en `apps/web`.
  Las capturas se sirven desde `apps/web/public/help/screens/`; Kshop Admin las carga por la URL de la plataforma.
- El contexto se deduce de la ruta en las shells (no una prop en cada página): menos puntos de olvido; las pestañas lo
  afinan con `AdminSubNav` (recibe `helpContext` opcional) y el segmento `[tab]`/`[section]`.
- Capturas a 1280 × 800 (escritorio) y 390 × 844 (teléfono) sobre la Tienda Demo del proyecto de **prueba**, con el
  WhatsApp en «Simulado»; nombres de archivo estables por slug.
- Sin Nic: el buscador es local (índice generado); la IA queda fuera de este PRP.

## Blueprint (fases)

1. **Modelo y validación**: tipos, esquema Zod, `raw.ts`, generadores Markdown e índice, tests de contenido; 8 guías
   iniciales + primer día + glosario + FAQ (lo justo para probar). → `pnpm test`.
2. **Interfaz**: `HelpButton` + `HelpCenter` en `packages/admin`, páginas `/admin/help` y `/superadmin/help`, pantalla en
   Kshop Admin, contexto por ruta en las shells, entradas «Ayuda» en menús. → navegador a 1280 y 390.
3. **Capturas y exportación**: `help-shots.mjs`, `help-export.ts` (prebuild), vista `/help/print`, `help-pdf.mjs`,
   descargas en la página. → `pnpm help:shots && pnpm help:export && pnpm help:pdf`.
4. **Contenido completo**: todas las guías del admin y del superadmin con sus capturas; test «cada vista tiene guía».
5. **Validación final**: `typecheck`, `lint`, `test`, `build`, `qa:help`, `qa:mobile` (ayuda incluida), regla en
   `AGENTS.md`, memoria, Tasknic («Cómo probarlo»).

## 🧠 Aprendizajes (Self-Annealing)

### 2026-11-01: el detector de voseo marcaba «Subí un producto…»
- **Error**: la lista de Tasknic incluye imperativos de -ir (`subí`, `elegí`, `abrí`), que también son el pretérito de
  «yo»; la pregunta frecuente «Subí un producto y no sale» rompía la validación.
- **Fix**: fuera de `VOSEO` las formas ambiguas; un test comprueba que «Subí un producto» pasa.
- **Aplicar en**: cualquier lista de voseo que se copie de Tasknic.

### 2026-11-01: prettier reescribe `[̀-ͯ]` como caracteres combinantes
- **Error**: tras `prettier --write`, el rango de acentos del buscador quedó con caracteres invisibles.
- **Fix**: `/\p{M}/gu` (marcas Unicode), que prettier deja igual.
- **Aplicar en**: cualquier regex con rangos `\u` en el repo.

### 2026-11-01: un script de QA se quedaba sin sesión a mitad
- **Error**: `addInitScript` vuelve a poner la sesión original en cada carga; la app ya había renovado el token y
  Supabase revoca el refresh token reutilizado → login a las ~10 páginas. Un segundo contexto con la misma sesión, igual.
- **Fix**: poner la sesión solo si no hay ninguna, e iniciar sesión de nuevo por cada contexto del navegador; reintento
  de 60 s ante «Request rate limit reached».
- **Aplicar en**: cualquier `qa:*` nuevo que recorra muchas páginas o abra varios contextos.

### 2026-11-01: Kshop Admin en 5174 daba 500 tras `pnpm install`
- **Error**: el Vite ya arrancado no reoptimiza dependencias si cambia el lockfile; otro puerto no vale porque el CORS de
  `/api/v1` solo admite 5173 y 5174 (`proxy.ts`).
- **Fix**: reiniciar el Vite de 5174 tras instalar dependencias.

### Notas de la fase 3 (cambios sobre el plan)
- **Sin `help-export.ts` ni `index.json`**: el repo no tiene `tsx`; el Markdown lo sirve una ruta estática
  (`(platform)/help/[file]/route.ts`, `generateStaticParams`) desde el contenido validado, así que un contenido inválido
  rompe el build y no hay archivos generados que commitear. El buscador arma su índice en memoria. Los `.md` llevan
  las capturas con URL absoluta de la plataforma. Las rutas con extensión se saltan el proxy: `/help/…` responde en la
  plataforma y en cada tienda.
- Capturas (`pnpm help:shots [slug…]`): Node 24 importa `screenshots.ts` quitando tipos. Rutas con `:product`/`:order`
  que el script resuelve en la Demo de **prueba**. La Demo de prueba solo tiene pedidos de scripts (clientes «test»,
  «Prueba WhatsApp Kshop» con el teléfono real de Roberto, direcciones «Calle QA»): el script los cambia en pantalla
  por «Laura Pérez», +53 5 123 4567 y «Calle 10 #45» antes de capturar, y elige productos sin «Excel/QA/e2e» en el
  nombre. Nunca publicar una captura con datos de prueba sin revisarla.
- El test `apps/web/src/help-assets.test.ts` exige el PNG de cada captura declarada y el PDF.
- «Solicitar» (Plan y facturación) solo aparece si la plataforma tiene WhatsApp de contacto; en prueba no sale.
- Windows no resuelve `*.localhost` fuera de Chromium: comprobar descargas con `fetch` desde la página o con la
  cabecera `Host` contra 127.0.0.1.
- No se corrió `pnpm build` (iría contra la base de producción y la regla R11 lo pide sin la web en uso).

### Notas de la fase 2
- La Caja guarda su pestaña en estado local: «Vender» y «Resumen» comparten el contexto `pos` (se quitó
  `pos-summary`). El contexto sale de la ruta con `helpContextForPath` (mismas rutas en la web y en Kshop Admin).
- Progreso del primer día, filtro y `#hash` por `useSyncExternalStore` (el lint prohíbe `setState` en efectos).
- Títulos del diálogo con las etiquetas del menú («Ofertas», «Avisos WhatsApp», «Monedas»).
- `pnpm qa:help`: 46/47 en la web (el fallo, 429 de Auth por repetir la QA); la parte de Kshop Admin queda pendiente
  de reiniciar su Vite.

### Notas de la fase 1
- Contextos: el PRP decía `pos-sell`; la pestaña «Vender» es la propia `/admin/pos`, así que el contexto es `pos` y
  la otra pestaña `pos-summary`. Los del superadmin llevan prefijo `superadmin-` (no chocan con `billing`, `whatsapp`).
- `@kshop/admin/help` no importa Zod (va en el bundle); `@kshop/admin/help/content` valida (tests y exportador).
- Cada afirmación de las guías se comprobó en el código (botones, cancelar devuelve stock solo antes de «Enviado»,
  solo el dueño invita administradores, campos de «Nueva tienda»).
