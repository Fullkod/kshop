# PRP-7: Apps — app de tienda y app de administración con Capacitor

> **Estado**: APROBADO (2026-10-26) con las respuestas de Roberto (ver «Decisiones de Roberto»)
> **Fecha**: 2026-10-26
> **Proyecto**: Kshop
> **Fase**: 7 (ver `arranque-y-fases.md`). Código de partida: commit `805f83e` (Fase 6 cerrada)

---

## Objetivo

Dos apps Android hechas con Capacitor sobre el mismo monorepo: la **app de tienda** (marca blanca, un APK por tienda,
con el nombre, icono y colores de la tienda: catálogo, carrito, pedido por WhatsApp y cuenta del cliente) y la **app
de administración** (una sola app para dueños y empleados: elige la tienda y gestiona pedidos y stock desde el
móvil). Al final de la fase hay un APK instalable de la Tienda Demo y otro del admin, y un camino repetible para
generar el APK de cualquier tienda.

## Por Qué

| Problema | Solución |
|----------|----------|
| La «App móvil» está en el plan **Base** como gancho (decisión 16, `modulos-y-planes.md`), pero hoy el módulo `mobile_app` solo es un enlace «próximamente» | App de tienda generada por tienda, con su página de descarga y su pantalla en Admin › App móvil |
| En Cuba la conexión es lenta y cara: la web descarga la página entera cada vez | La app trae su código dentro (solo baja datos JSON e imágenes) y guarda el último catálogo para verlo sin conexión |
| Google Play no está disponible en Cuba (`app-movil.md`) | APK directo desde la propia tienda (`/app`) y preparado para Apklis; Google Play queda para más adelante |
| Los dueños atienden la tienda desde el móvil: el admin web funciona a 390 px pero hay que entrar por el navegador y la sesión se pierde | App de administración con sesión guardada, selector de tienda, pedidos y stock a mano, cámara para fotos de producto |

**Valor de negocio**: es lo que la competencia (Plaza Cubana, VendeYa) vende como diferencia, y un argumento para
el Base de 5 USD. klauShop (tienda nº 1 en la Fase 8) tendrá su app.

## Qué

### Criterios de Éxito
- [ ] **APK de la Tienda Demo instalable** (criterio de la fase en `arranque-y-fases.md`): se instala en un Android
  (emulador o el teléfono de Roberto), abre con el icono, el nombre y los colores de la tienda, navega el catálogo,
  añade al carrito, hace un pedido que llega por WhatsApp y al admin, y el cliente inicia sesión y ve sus pedidos.
- [ ] **APK del admin instalable**: el dueño entra, elige la tienda (si tiene varias), ve los pedidos nuevos, cambia
  un estado, ajusta el stock de una variante y sube una foto de producto con la cámara; el empleado ve solo lo que
  le deja su rol y no ve costos; el superadmin entra a cualquier tienda.
- [ ] Las apps usan **solo** `/api/v1` (Bearer) y pg_graphql/RPC con las mismas reglas que la web: tests de RLS y de
  módulos siguen en verde; la API responde con CORS solo a los orígenes de las apps y de la web.
- [ ] **Módulos y estado**: sin el módulo `mobile_app` o con la tienda suspendida/archivada, la app de tienda lo dice
  y no deja comprar; el admin respeta los módulos igual que la web (UI, API, BD).
- [ ] **Sin conexión**: la app de tienda abre y muestra el último catálogo visto con el aviso «Sin conexión»; el pedido
  exige conexión y no se pierde el carrito.
- [ ] **Versión nueva**: si hay un APK más nuevo publicado, la app avisa «Hay una versión nueva» con el enlace.
- [ ] Generar el APK de otra tienda es un comando (o un botón, según la pregunta 3) con su config, icono y splash;
  ningún secreto (keystore, contraseñas) entra en git.
- [ ] `pnpm typecheck`, `lint`, `test`, `build` pasan (también las apps); `pnpm qa:apps` prueba los dos bundles en
  Chromium a 390 px (capturas en `.titan/qa/fase-7/`); suites de las fases 0b–6 siguen en verde.

### Comportamiento Esperado (Happy Path)

**App de tienda (Tienda Demo)**
1. La clienta descarga el APK desde `demo.kshop.fullkod.com/app` (botón y QR en la tienda), lo instala y abre «Tienda
   Demo» (icono y splash de la tienda).
2. Ve la portada por secciones, categorías, buscador, ficha con variantes y precios en su moneda (CUP/USD), ofertas.
3. Añade al carrito; en el checkout elige entrega y pago y pulsa «Pedir por WhatsApp»: se crea el pedido (canal
   `app`) y se abre WhatsApp con el mensaje, igual que en la web.
4. Entra con su teléfono y contraseña (cuenta de esa tienda, email sintético) y ve «Mis pedidos»; la sesión queda
   guardada en el teléfono.
5. Sin conexión: ve lo último que cargó con el aviso; al volver la conexión se actualiza sola.

**App de administración**
1. El dueño instala «Kshop Admin», entra con su email y contraseña y elige la tienda.
2. Inicio: ventas de hoy y pedidos nuevos. Pedidos: lista con filtros, detalle, cambiar estado, registrar pago,
   enviar el aviso al cliente por WhatsApp.
3. Productos: buscar, cambiar stock y precio de una variante, publicar/ocultar, foto nueva con la cámara o la galería.
4. Para lo demás (temas, Excel, finanzas, configuración) un botón «Abrir el panel completo» lleva al admin web.

---

## Contexto

### Referencias
- `.titan/memory/project/app-movil.md` — reglas 1–5 desde el día 1, estructura `apps/store-app` y `apps/admin-app`,
  distribución (Play, APK, Apklis), riesgos de Google Play y Apple, push en Cuba.
- `.titan/memory/project/modulos-y-planes.md` — `mobile_app` en el Base; los entitlements viajan a la app.
- `.titan/memory/project/decisiones.md` — 9 (Capacitor, app por tienda + admin), preguntas abiertas (cuenta de Play,
  iOS).
- `AGENTS.md` — `packages/*` sin `next/*`, auth por token, la tienda viene de la config del build, appId
  `com.fullkod.kshop.<slug>` y `com.fullkod.kshop.admin`.
- Código actual (commit `805f83e`):
  - `packages/data` — `createApiClient` (Bearer, `baseUrl` configurable), `createGraphqlClient`, documentos GraphQL
    de la tienda pública (`StorefrontHomeQuery`, `StorefrontProductsQuery`, `StorefrontProductQuery`, …) y del admin.
  - `apps/web/src/server/storefront/{catalog,data}.ts` — lecturas **anónimas** de pg_graphql de la tienda pública
    y su mapeo a tarjetas/fichas; hoy son `server-only` con `use cache`, la lógica de mapeo se puede mover a
    `packages/data` sin cambios de fondo.
  - `apps/web/src/features/{cart,customer-account}` — carrito, checkout y cuenta del cliente ya son componentes de
    cliente que hablan con la API (`CustomerSession` con su propia clave de storage, D6 de la Fase 3).
  - `apps/web/src/features/orders`, `features/catalog`, `app/s/[storeSlug]/admin/*` — el admin ya es todo de
    cliente (datos por `useSession().api` y pg_graphql); dependen de Next solo por `next/link` (29) y
    `next/navigation` (29); `next/image` se usa una vez.
  - `apps/web/src/lib/images.ts` — compresión WebP en el navegador y subida directa a `store-media` con el token
    (comentario: «same code path for the Capacitor app»).
  - `apps/web/src/server/http.ts` — `apiHandler` sin cabeceras CORS (hoy todo es del mismo origen).
  - `apps/web/src/features/mobile-app/module.ts` — solo el registro (`availableInPhase: 7`).
  - `orders.channel` ya admite `app` (desglose de Finanzas por canal).
- En este PC: Node 24, pnpm 9; **no hay Android SDK** y el JDK es el 14 (Capacitor necesita JDK 21) → ver pregunta 3.
- Skills: `tf-add-mobile` (solo referencia: es PWA + web push, no Capacitor), `tf-playwright-cli`, `tf-supabase`.

### Decisiones técnicas propuestas (Roberto confirma o cambia)

**Cómo se construyen**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **App de tienda** | **Empaquetada**: `apps/store-app` (Vite + React + react-router + Capacitor). El código va dentro del APK; los datos por pg_graphql anónimo y `/api/v1`, como la web. Las pantallas se reescriben para cliente reutilizando `@kshop/ui`, `@kshop/core` y las lecturas movidas a `@kshop/data`. **Ver pregunta 1** | **Web remota**: Capacitor abre `https://{slug}.kshop.fullkod.com` dentro de la app (todo funciona ya, pero sin conexión no abre, cada visita baja la página entera y Google Play/Apple rechazan «webs envueltas») |
| D2 | **App de administración** | **Empaquetada con lo esencial del móvil**: login, selector de tienda, inicio (ventas de hoy), pedidos (lista, detalle, estados, pagos, aviso WhatsApp) y productos (stock, precio, publicar, fotos). Las pantallas de pedidos y productos se mueven de `apps/web/src/features` a un paquete `@kshop/admin` con un adaptador de navegación (Link/router) para que **web y app usen el mismo código**. El resto, «Abrir el panel completo» (navegador). **Ver pregunta 2** | Admin completo empaquetado (mover las ~15 000 líneas del admin, mucho más trabajo) o admin web remoto |
| D3 | **Lecturas compartidas** | Mover el mapeo de `server/storefront/catalog.ts` (tarjetas, ficha, facetas, portada) a `packages/data/src/storefront/` sin `server-only`; la web lo sigue llamando dentro de `use cache` y la app desde el cliente. Mismas consultas → mismos precios, ofertas y stock en web y app | Duplicar las consultas en la app (se desincronizan) |
| D4 | **Configuración del build** | `apps/store-app/stores/{slug}.json` (generado, no editado a mano): `storeId`, `slug`, nombre, `appId com.fullkod.kshop.{slug}`, versión, colores del tema, URL de la API (`https://kshop.fullkod.com`), URL de Supabase y clave publicable. Icono y splash generados del logo y el color de la tienda con `@capacitor/assets` (o subidos por el superadmin) | Un solo APK que pregunta la tienda al abrir (no es «la app de mi tienda») |
| D5 | **API desde la app** | CORS en `/api/v1` para los orígenes de Capacitor (`https://localhost`, `capacitor://localhost`) y los de la web; preflight `OPTIONS` en `apiHandler`; sin cookies (ya es Bearer). Canal `app` en el checkout (`X-Kshop-Channel: app`) | Proxy propio para la app |
| D6 | **Sesiones** | Cliente: la misma `CustomerSession` (email sintético por tienda) con el storage de Capacitor Preferences. Staff: sesión de Supabase en Preferences; el selector usa `api.me().stores`. La app de tienda rechaza un token de otra tienda (como la web) | Secure Storage nativo (más seguro, plugin extra; se puede cambiar luego sin tocar la lógica) |

**Funciones nativas y sin conexión**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D7 | **Sin conexión** | Caché de las últimas respuestas (portada, listados vistos, fichas) en IndexedDB/Preferences con fecha; al abrir se muestra la caché y se refresca; aviso «Sin conexión». El carrito ya vive en el servidor por token: sin conexión se ve el último guardado y no se puede pedir | Sin modo offline (con la conexión de Cuba la app se queda en blanco) |
| D8 | **Nativo en v1** | Botón atrás de Android, splash, barra de estado con el color de la tienda, compartir producto (`@capacitor/share`), abrir WhatsApp (`App`/`Browser`), cámara y galería en el admin (`@capacitor/camera`, la misma compresión WebP), aviso de red (`@capacitor/network`) | Solo envolver la web |
| D9 | **Avisos push** | **Sin push en v1**: los avisos siguen por WhatsApp (ya funciona); el admin refresca los pedidos al abrir y cada minuto con la app abierta. Push con Firebase (FCM) en otra fase si Roberto quiere (servicio externo, dudoso en Cuba). **Ver pregunta 6** | FCM ahora (cuenta de Firebase, permisos y pruebas en Cuba) |
| D10 | **Actualizaciones** | Tabla `store_app_builds` con la última versión publicada por app; la app consulta `/api/v1/apps/{appId}/latest` al abrir y, si hay una más nueva, muestra «Actualizar» con el enlace al APK. Sin live updates (Capgo/Appflow) en v1 | Live updates (servicio externo, de pago) |

**Generar y distribuir**

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D11 | **Dónde se compila** | **GitHub Actions** (Roberto, respuesta 3): workflow `android-app.yml` con el slug → config, iconos, `npx cap sync android`, `gradlew assembleRelease`, firma, artefacto; `pnpm app:publish <slug>` lo publica desde aquí. Ver «Decisiones de Roberto» | GitHub Actions (botón «Generar app» del superadmin → workflow → APK subido): más cómodo, pero toca GitHub (secretos, keystore) y necesita permiso |
| D12 | **Firma** | Un keystore **por app** (tienda), guardado **fuera del repo** (`%USERPROFILE%\.kshop\keystores\{slug}.jks`) con su contraseña en `.env.local`/gestor de Roberto; copia de seguridad obligatoria (sin él no se puede actualizar la app). Así una tienda grande puede pasar luego a su propia cuenta de Play. **Ver pregunta 4** | Un keystore de la plataforma para todas (más simple; pero todas quedan atadas a la misma clave) |
| D13 | **Dónde se publica el APK** | Bucket `store-media` en `stores/{store_id}/app/{appId}-{version}.apk` (público, como los logos) + fila en `store_app_builds`. La tienda tiene la página `/app` (botón «Descargar para Android», QR, cómo instalar un APK) y un aviso discreto en Android. Listo para subir a Apklis a mano. Google Play **no** en esta fase | Google Play ya (riesgo de cuenta del familiar, `app-movil.md`) |
| D14 | **Quién la pide** | El dueño ve Admin › App móvil (estado, versión, enlace, QR, «Pedir mi app»); el superadmin ve Superadmin › Apps (pendientes, generar/registrar versión, subir APK). En v1 el superadmin genera con el script y registra el APK desde su pantalla. **Ver pregunta 5** | Solo el superadmin, sin que el dueño pida nada |
| D15 | **Módulo apagado o tienda suspendida** | La app de tienda consulta al abrir el estado público (`stores.status` + `store_has_module('mobile_app')`): sin módulo → pantalla «La app de esta tienda no está disponible» con enlace a la web; suspendida → el mismo aviso que la web. La página `/app` deja de ofrecer la descarga. No se borra ningún build | Bloquear solo la descarga (las apps instaladas seguirían comprando sin módulo) |
| D16 | **iOS** | Fuera de esta fase (decisión 9 y `app-movil.md`: cuenta de Apple, 4.2.6). El código no se cierra a iOS: Capacitor lo genera del mismo bundle | — |

### Arquitectura Propuesta

```
apps/
├── web/                         (sin cambios de fondo) CORS en /api/v1, página /app de la tienda, Admin › App móvil,
│                                Superadmin › Apps, pantallas de pedidos/productos importadas de @kshop/admin
├── store-app/                   Vite + React + react-router + Capacitor (com.fullkod.kshop.{slug})
│   ├── src/                     rutas: /, /category/:slug, /products, /product/:slug, /search, /cart, /checkout,
│   │                            /account, /order/:token, /page/:slug; caché offline; aviso de versión
│   ├── stores/{slug}.json       config generada por el script (sin secretos)
│   └── android/                 proyecto nativo (generado; en git sin builds ni keystores)
└── admin-app/                   Vite + React + react-router + Capacitor (com.fullkod.kshop.admin)
    └── src/                     login, selector de tienda, inicio, pedidos, productos, «Abrir el panel completo»
packages/
├── data/src/storefront/         lecturas y mapeo de la tienda pública (movidas desde apps/web/src/server/storefront)
├── admin/                       (nuevo) pantallas de pedidos y productos con un adaptador de navegación (D2)
├── core, ui                     sin cambios de fondo
scripts/app-build.mjs            pnpm app:build <slug> · pnpm app:build-admin (D11, D12)
scripts/qa-apps.mjs              pnpm qa:apps (bundles en Chromium a 390 px)
supabase/migrations/…_apps.sql   store_app_builds, RLS, función pública de la última versión
supabase/tests/09_apps_isolation.test.sql
```

### Modelo de Datos

```sql
create table public.store_app_builds (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores (id) on delete cascade,   -- null = app de administración
  app_id text not null check (app_id ~ '^com\.fullkod\.kshop\.[a-z0-9_]+$'),
  version_code integer not null check (version_code > 0),
  version_name text not null,
  apk_path text not null,                -- stores/{store_id}/app/… en store-media
  size_bytes bigint,
  sha256 text,
  notes text,
  published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (app_id, version_code)
);  -- índice (store_id, created_at desc)

-- Petición del dueño (D14): en stores.settings o una tabla pequeña store_app_requests (se decide al mapear).
```

| Tabla / función | anon / cliente | staff | owner/admin | superadmin |
|-----------------|----------------|-------|-------------|------------|
| `store_app_builds` | — | — | leer lo suyo | todo |
| `app_latest(app_id)` | última versión **publicada** de una tienda activa con `mobile_app` (versión, enlace, tamaño) | ídem | ídem | ídem |
| registrar/publicar build | — | — | — | por la API (`service_role`) |

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo se definen FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar).

### Fase 1: Cimientos compartidos
**Objetivo**: CORS y canal `app` en la API (D5); `store_app_builds` + `app_latest` + RLS + suite 09; lecturas de la
tienda pública movidas a `@kshop/data` (D3) sin cambiar lo que ve la web; paquete `@kshop/admin` con el adaptador de
navegación y las pantallas de pedidos y productos movidas (D2), usadas por la web.
**Validación**: `test:rls` (01–09) en verde; la web igual que antes (`e2e:{catalog,orders,discounts,pro}`,
`qa:{orders,pro}` en verde, Lighthouse de la tienda sin bajar); `OPTIONS` desde `https://localhost` → 204 con CORS y
desde un origen ajeno → sin cabeceras.

### Fase 2: App de tienda
**Objetivo**: `apps/store-app` con todas las rutas del happy path, tema de la tienda, sesión del cliente en
Preferences, checkout con canal `app` y WhatsApp, caché sin conexión (D7), nativo de D8, estado del módulo/tienda
(D15) y aviso de versión (D10).
**Validación**: `qa:apps` (bundle en Chromium a 390 px): navegar, carrito, pedido (llega al admin con canal `app`),
cuenta, «Sin conexión» con la red cortada, tienda sin módulo → aviso; capturas en `.titan/qa/fase-7/`.

### Fase 3: App de administración
**Objetivo**: `apps/admin-app` con login, selector de tienda, inicio, pedidos y productos desde `@kshop/admin`,
cámara/galería para fotos (D8), refresco de pedidos (D9) y «Abrir el panel completo».
**Validación**: `qa:apps` (admin): dueño cambia un estado y el stock y sube una foto (archivo simulado); empleado no
ve costos ni lo que su rol no permite; tienda sin un módulo → la sección no aparece y la API da 403.

### Fase 4: Generar y distribuir
**Objetivo**: `pnpm app:build <slug>` y `app:build-admin` (config, iconos/splash, sync, compilación, firma con
keystore fuera del repo) (D4, D11, D12); subida del APK y registro en `store_app_builds` (D13); Admin › App móvil y
Superadmin › Apps (D14); página `/app` de la tienda.
**Validación**: APK de la Tienda Demo y del admin compilados y firmados; instalados en un emulador o en el teléfono
de Roberto (criterios de éxito); `/app` ofrece la descarga y la quita sin el módulo; ningún secreto en `git status`.

### Fase 5: Validación final
**Objetivo**: sistema funcionando end-to-end.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (web y apps) pasan
- [ ] `pnpm test:rls` (01–09) y `pnpm e2e:{catalog,excel,orders,discounts,notifications,billing,pro}` en verde
- [ ] `pnpm qa:{orders,discounts,notifications,billing,pro,apps}` en verde; capturas en `.titan/qa/fase-7/`
- [ ] Pedido real hecho desde el APK de la Tienda Demo en un teléfono (Roberto) y gestionado desde el APK del admin
- [ ] Memoria, `arranque-y-fases.md` y este PRP actualizados; cómo generar el APK de una tienda documentado

---

## Decisiones de Roberto (2026-10-26)

1. **D1**: app de tienda **empaquetada** (el código dentro del teléfono).
2. **D2**: admin solo con lo esencial del móvil + «Abrir el panel completo».
3. **D11**: se compila en **GitHub Actions**. Flujo para no subir secretos de la plataforma a GitHub: el workflow
   (`workflow_dispatch` con el slug) lee la ficha **pública** de la tienda (clave publicable), genera config, icono y
   splash, compila y **firma** con el keystore de esa app guardado como secreto de Actions, y deja el APK como
   artefacto. Desde aquí `pnpm app:publish <slug>` lo descarga con `gh`, lo sube a `store-media` y lo registra en
   `store_app_builds`. La clave de servicio de Supabase **nunca** va a GitHub. Hace falta subir el código (push) para
   que el workflow exista: se pide permiso en la 7.4.
4. **D12**: un keystore **por app**; original y copia en una **carpeta local** de Roberto (fuera del repo); copia en
   los secretos de Actions (`ANDROID_KEYSTORE_{SLUG}` en base64 + contraseña) para firmar.
5. **D14**: el icono sale **solo del logo** de la tienda (sobre su color de fondo); si el logo es horizontal (logotipo
   con texto), la inicial de la tienda sobre su color. El dueño no sube icono.
6. **D9**: sin push en esta fase; para después.
7. **D13**: APK directo desde la tienda y listo para Apklis; Google Play más adelante.
8. «Kshop Admin» con el logo de Kshop. La **app de klauShop** se puede generar como prueba en esta fase.

## Preguntas para Roberto (respondidas arriba)

1. **App de tienda (D1)**: ¿empaquetada (propuesta: rápida con mala conexión, funciona sin conexión, menos riesgo en
   Google Play; hay que rehacer las pantallas de la tienda para la app) o la **web dentro de la app** (lista en días,
   pero sin conexión no abre y Play/Apple la pueden rechazar)?
2. **App de admin (D2)**: ¿solo lo esencial del móvil (pedidos, ventas de hoy, stock/precio/fotos) y «Abrir el panel
   completo» para lo demás (propuesta), o el admin completo dentro de la app?
3. **Dónde se compila (D11)**: ¿instalo en tu PC el JDK 21 y el Android SDK (solo herramientas de línea de comandos,
   ~3 GB) y compilamos aquí (propuesta para esta fase), o lo montamos en GitHub Actions (necesita tu permiso para
   tocar GitHub y guardar allí el keystore como secreto)? ¿Tienes un Android a mano para instalar el APK, o uso un
   emulador?
4. **Firma (D12)**: ¿un keystore por tienda (propuesta) o uno para todas? ¿Dónde guardas la copia de seguridad (si se
   pierde, esa app no se puede actualizar nunca más)?
5. **Quién la pide (D14)**: ¿el dueño pide su app desde Admin › App móvil y el superadmin la genera (propuesta), o
   solo el superadmin decide? ¿El dueño puede subir su propio icono (PNG 1024 px) o siempre sale del logo?
6. **Avisos push (D9)**: ¿sin push en esta fase (los avisos siguen por WhatsApp; propuesta) o montamos Firebase
   ahora (servicio externo; en Cuba puede no llegar)?
7. **Google Play (D13)**: ¿esta fase solo APK directo y listo para Apklis (propuesta), dejando Play para cuando
   decidas lo de la cuenta del familiar?
8. **Nombre de la app de admin**: ¿«Kshop Admin» con el logo de Kshop?
9. **¿La app de klauShop** se genera en la Fase 8 (tras migrar sus datos) o quieres probar con ella antes?

---

## Progreso

| Fase | Estado | Commit |
|------|--------|--------|
| 7.1 Cimientos compartidos | Hecha: `20261102100000_apps.sql` (`store_app_builds` + RLS, `app_info(store_id)` anon: disponible si la tienda está activa y con `mobile_app`, última versión publicada; null = app de admin), suite `09_apps_isolation` (`test:rls` 549/549). CORS de `/api/v1` en el proxy solo para `https://localhost`, `capacitor://localhost` (y Vite 5173/5174 en local), preflight 204; checkout con `X-Kshop-Channel: app` → canal `app`. Lecturas de la tienda pública movidas a `@kshop/data` (`storefront-reads.ts`: `fetchStorefrontShell/Products/Facets/Product/Page/Home/SitemapPaths`), la web las envuelve con `use cache` (D3). `e2e:{catalog,discounts,pro}` y `qa:{orders,discounts}` en verde. **El paquete `@kshop/admin` (D2) pasa a la 7.3**, donde se usa por primera vez | ver git |
| 7.2 App de tienda | Hecha: `@kshop/storefront` (tienda, carrito y cuenta movidos desde `apps/web` con `NavigationProvider`/`StoreProvider`; `loadListing` + `ListingView`, `headerLinks`, `defaultHome`, `categoryTrail`, `ProductDetails`; la web los usa con `next/link`). `apps/store-app` (Vite 8 + React 19 + react-router 8 + Capacitor 8): rutas de la web, tema y fuentes de la tienda, sesión del cliente en Preferences, canal `app`, caché en el teléfono con «Sin conexión», botón atrás, barra de estado, aviso «Actualizar» y tienda sin módulo/suspendida por `app_info`. **Cambio sobre D1/D3**: la app lee el catálogo por `GET /api/v1/stores/{id}/storefront?view=…` (las mismas funciones `use cache` de la web + `s-maxage=60`), no por pg_graphql directo: medido 0,5–1,8 s por lectura y *statement timeout* (3 s de anon) en paralelo; por la API, 17 ms con la caché caliente. `pnpm app:config <slug>` escribe `apps/store-app/stores/{slug}.json`. `qa:apps` 10/10; `qa:{orders,discounts,notifications,pro}` y `e2e:orders` en verde tras el movimiento | ver git |
| 7.3 App de administración | Hecha: paquete `@kshop/admin` (sesión del staff con `AdminConfig` inyectada —Supabase, URL de la API, dominio de la plataforma, storage, `takePhoto`—, `loadAdminState`, `useCatalogApi`/`useCheckoutSettings`, `OrderList` con `refreshEvery`, `OrderDetail` con hueco `notices`, `ProductList`, `ProductEditor` con «Tomar foto», `SalesTodayCard`, `StaffLoginForm`, subida de imágenes); la web lo usa con `next/link` por el `NavigationProvider` de `@kshop/storefront` y deja reexportaciones en sus rutas antiguas. `apps/admin-app` («Kshop Admin», `com.fullkod.kshop.admin`, Vite + react-router + Capacitor): login, selector de tienda (`api.me().stores`, se recuerda), inicio con ventas de hoy, pedidos (refresco cada minuto, D9), productos (stock, precio, estado, fotos con cámara/galería nativa, D8), pestañas según módulos, «Abrir el panel completo» y pantalla «Esto está en el panel completo» para lo demás; mismas rutas `/admin/...` que la web. Tienda suspendida: la ficha pública no responde y la app usa lo que el staff lee por pg_graphql. `qa:apps` 19/19 (dueño confirma un pedido, cambia stock y sube foto; empleado sin costos; sin módulo `catalog` no hay «Productos»); `qa:{orders,discounts,notifications,pro}` en verde | ver git |
| 7.4 Generar y distribuir | Pendiente | — |
| 7.5 Validación final | Pendiente | — |

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.

### 2026-10-26: En este Chrome `window.scrollTo` devuelve una Promise
- **Error**: `useEffect(() => window.scrollTo(0, 0), [pathname])` → «destroy is not a function» al desmontar (React recibe la Promise como limpieza).
- **Fix**: cuerpo con llaves, sin devolver nada.
- **Aplicar en**: todo efecto escrito como expresión.

### 2026-10-26: Lecturas anónimas de pg_graphql desde muchos clientes
- **Error**: la app leyendo el catálogo directo de pg_graphql tardaba 0,5–1,8 s por consulta y en paralelo daba *statement timeout* (500 de `/graphql/v1`).
- **Fix**: las apps leen por `/api/v1/stores/{id}/storefront` (funciones `use cache` de la web + CDN). La web ya lo evitaba por su caché.
- **Aplicar en**: cualquier cliente nuevo (apps, widgets) que lea el catálogo.

### 2026-10-26: Turbopack sirve un módulo viejo tras añadir funciones a un archivo con `use cache`
- **Error**: `getStoreById is not a function` aunque estaba en `server/stores.ts`; tocar el archivo no bastó.
- **Fix**: reiniciar `pnpm dev`.
- **Aplicar en**: errores «X is not a function» de algo recién añadido en dev.

---

## Gotchas

- [ ] El WebView de Capacitor tiene origen `https://localhost` (Android) / `capacitor://localhost` (iOS): sin CORS en
      `/api/v1` todas las llamadas fallan; nunca abrir CORS a `*`.
- [ ] Supabase Auth en la app: sin `detectSessionInUrl` ni redirecciones; el storage por defecto (`localStorage`) se
      puede perder si Android limpia el WebView → Preferences.
- [ ] Mover `server/storefront/catalog.ts` a `@kshop/data` sin romper `use cache`/`cacheTag` de la web: la web
      envuelve las funciones compartidas, el paquete no importa `next/*` (regla del lint).
- [ ] `next/link` y `next/navigation` en las pantallas movidas a `@kshop/admin` → adaptador inyectado por contexto;
      el lint ya prohíbe `next/*` en `packages/*`.
- [ ] Capacitor necesita JDK 21 y Android SDK 35+; el JDK 14 de este PC no sirve. `gradlew` en Windows: rutas sin
      espacios para el SDK.
- [ ] El keystore y sus contraseñas **nunca** en git ni en la memoria; perderlo = no poder actualizar la app.
- [ ] Un APK no se actualiza solo fuera de Play: el aviso de versión (D10) es la única vía; `version_code` siempre
      creciente por app.
- [ ] Dev = prod en Supabase: los builds de prueba van a tiendas temporales o a la Tienda Demo; el APK de la Demo
      apunta a la API de producción (`kshop.fullkod.com`), que necesita el deploy de esta fase (permiso de Roberto).
- [ ] Imágenes: la app usa las URLs de `store-media` (ya en WebP 1600/480); no hay optimizador de Next.
- [ ] El botón atrás de Android debe navegar dentro de la app y solo salir desde la portada.

## Anti-Patrones

- NO poner lógica de negocio en la app: todo pasa por `/api/v1` y las funciones SQL, igual que la web.
- NO duplicar consultas ni reglas de precios entre web y app (D3).
- NO envolver la web sin más y llamarlo app (riesgo de rechazo y no funciona sin conexión), salvo que Roberto lo elija.
- NO publicar en Google Play sin decidir antes lo de la cuenta (`app-movil.md`).
