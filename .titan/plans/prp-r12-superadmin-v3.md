# PRP R12: Panel del superadmin v3 (menú de cada tienda, lista de tiendas y accesos directos)

> **Estado**: PREGUNTAS RESPONDIDAS (2026-10-28; ver «Respuestas de Roberto»), pendiente del «adelante» para
> implementar. Texto de la marca: «Gestionado por admin».
> **Fecha**: 2026-10-28
> **Proyecto**: Kshop
> **Sigue a**: `prp-r8-superadmin-y-realtime.md` (panel v2) y `prp-r11-rendimiento-admin.md` («Pendiente tras R11»:
> «Revisar el panel del superadmin (Roberto lo ve "pobre"); p. ej. "Enviar acceso" visible desde la lista»).
> Memoria: `project/decisiones.md` (n.º 25: la apariencia la configura la plataforma), `project/modulos-y-planes.md`,
> `reference/correo-fullkod-resend.md`.

---

## Objetivo

Que el superadmin decida, tienda por tienda, cómo ve el personal cada sección del menú del admin (**Visible**,
**Gestionado por Fullkod** = la ve pero solo Fullkod la cambia, **Oculto** = no aparece), con la API rechazando las
escrituras del personal en lo gestionado u oculto; y que Superadmin › Tiendas y la ficha de cada tienda sirvan para
trabajar: buscar, filtrar, ver lo importante de un vistazo y saltar directo a cualquier sección del admin de la tienda.

## Por Qué

| Problema | Solución |
|----------|----------|
| Hoy solo «Apariencia» puede quedar en manos de la plataforma, y está cableado a mano (`admin-context.ts`, `requireContentAccess`, `themes/layout.tsx`) | Una regla general por sección y tienda, con «Apariencia» como un caso más |
| Hay dueños a los que conviene montarles algo (catálogo inicial, entregas, monedas) sin que lo desarmen, o quitarles secciones que no usan y que solo confunden | «Gestionado por Fullkod» (lo ven, no lo tocan) y «Oculto» (no lo ven) |
| Ocultar en el menú no protege nada: una llamada a `/api/v1` seguiría escribiendo | Bloqueo en la API, en el mismo guard de las tiendas suspendidas (`assertStoreWritable`), sin consultas extra |
| La lista de tiendas solo dice nombre, dueño, plan, estado y alta; sin búsqueda ni filtros; «Enviar acceso» solo está en la ficha | Búsqueda, filtros, columnas útiles (por cobrar, vencimiento, actividad) y acciones por fila |
| La ficha solo enlaza a la tienda y a «Personalizar la apariencia» | Accesos directos a cada sección del admin de la tienda, con su estado (plan y visibilidad) |
| `listPlatformStores` llama a `auth.admin.listUsers({ perPage: 1000 })` en cada carga para sacar el email del dueño | Una función SQL que devuelve la lista entera (con emails y métricas) en una consulta |

**Valor de negocio**: Fullkod puede vender «te lo montamos nosotros» y mantener el control de lo delicado sin
depender de que el dueño no lo toque; menos soporte por secciones que el cliente no entiende; el superadmin cobra y
atiende más rápido (ve quién debe y quién vence sin abrir cada ficha).

## Qué

### Criterios de Éxito
- [ ] En la ficha de una tienda, el superadmin pone cualquier sección configurable en Visible / Gestionado por Fullkod
      / Oculto; el cambio se guarda y el admin abierto de esa tienda lo refleja solo (Realtime) o al recargar.
- [ ] Sección **gestionada**: el personal la ve en el menú con la marca «Kshop», entra, consulta, y cualquier escritura
      de su rol devuelve **403 `section_managed`** con un mensaje claro; el superadmin escribe sin problema.
- [ ] Sección **oculta**: no sale en el menú (web ni Kshop Admin), su ruta muestra «Esta sección no está disponible»
      y sus escrituras devuelven **403 `section_hidden`**; el superadmin la ve y la usa (con una marca «Oculta al
      personal»).
- [ ] Ninguna escritura de otra sección, ni las públicas (carrito, checkout, cuenta del cliente), cambia de
      comportamiento; el guard no añade ninguna consulta por petición (sigue siendo una llamada a `api_guard`).
- [ ] Tests de aislamiento: el personal de A no lee la configuración de B; nadie salvo `service_role` la escribe;
      `pnpm test:rls` en verde (prueba y producción).
- [ ] Superadmin › Tiendas: búsqueda (nombre, slug, email del dueño), filtros (estado, plan, suscripción, «debe
      dinero», «vence en ≤ 7 días»), columnas «Por cobrar», «Vence», «Pedidos 30 d» y «Último pedido», y por fila:
      Abrir ficha, Abrir admin, Ver tienda, Enviar acceso al dueño, Suspender/Activar. En 390 px se ve en tarjetas sin
      scroll horizontal.
- [ ] La lista carga con una sola lectura SQL (sin `auth.admin.listUsers`).
- [ ] Ficha de la tienda: bloque «Accesos directos» con todas las secciones del admin agrupadas como en su menú
      (Ventas · Catálogo · Tienda · Negocio), cada una abre `{tienda}/admin/<sección>` y muestra si está en el plan y
      su visibilidad.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` pasan; QA en navegador con capturas en
      `.titan/qa/r12-superadmin-v3/` (1280 y 390, claro y oscuro, sin errores de consola).

### Comportamiento Esperado (happy path)
1. Roberto entra en Superadmin › Tiendas, escribe «demo» en la búsqueda, ve la Tienda Demo con lo que debe, cuándo
   vence y sus pedidos de los últimos 30 días, y desde el menú de la fila abre la ficha.
2. En la ficha, el bloque **Menú de la tienda** lista las secciones por grupo. Pone «Entregas» en **Gestionado por
   Fullkod** y «Finanzas» en **Oculto**. Se guarda al momento (aviso «Guardado»).
3. El dueño, con el admin abierto, ve que «Finanzas» desaparece del menú y que «Entregas» lleva la marca «Kshop». Entra
   en Entregas: ve sus zonas y precios con un aviso arriba («Esta sección la gestiona el equipo de Kshop. Escríbenos
   para cualquier cambio.»). Si intenta guardar algo, la API responde 403 y el formulario muestra ese mismo mensaje.
4. Roberto pulsa «Entregas» en **Accesos directos**: se abre `demo.kshop.fullkod.com/admin/shipping` en otra pestaña
   (la primera vez en ese subdominio le pide entrar; ver Gotchas), cambia una zona y se guarda.
5. Vuelve a poner «Finanzas» en Visible: reaparece en el menú del dueño con sus datos intactos (ocultar nunca borra).

---

## Contexto

### Referencias (código actual)
- `apps/web/src/features/registry.ts` + `features/types.ts`: registro de los 14 módulos (`ADMIN_MODULES`, grupos
  `ADMIN_GROUPS`); `packages/core/src/modules.ts` (`MODULE_CODES`).
- `apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx` (l. ~180–220): arma el menú con módulos + «Clientes»,
  «Plan y facturación» y «Equipo»; ítems bloqueados con badge PRO.
- `apps/admin-app/src/App.tsx`: pestañas y `MoreScreen` de Kshop Admin (lista propia de secciones, l. ~930).
- `packages/admin/src/admin-context.ts`: `loadAdminState` (desde `/api/v1/me?storeId=` → `admin_bootstrap`), caché
  local de 24 h, y el caso especial del superadmin con `themes`.
- `apps/web/src/server/http.ts` (`apiHandler` → `assertStoreWritable`), `server/store-writable.ts` (regex de rutas
  de escritura de tienda y bloqueo de suspendidas; superadmin pasa), `server/auth.ts` (`getStoreGuard` →
  `public.api_guard`, memo por petición).
- `supabase/migrations/20261108100000_admin_bootstrap.sql`, `20261108100100_api_guard.sql`,
  `20261106100100_realtime_signals.sql` (señales sin datos por tema `store:{id}`).
- `apps/web/src/server/content/resources.ts` (`requireContentAccess`: el superadmin siempre edita la apariencia).
- `apps/web/src/server/platform-stores.ts` (`listPlatformStores` con `listUsers`), `app/(platform)/superadmin/page.tsx`
  (lista), `app/(platform)/superadmin/stores/[storeId]/page.tsx` (ficha, 565 líneas, con `OwnerAccess`).
- Suites `supabase/tests/07_billing_isolation`, `14_admin_bootstrap_isolation`; scripts `qa:billing`, `e2e:billing`.

### Decisiones propuestas (Roberto decide las de producto)

| # | Decisión | Propuesta | Alternativa |
|---|----------|-----------|-------------|
| D1 | **Qué secciones se configuran** | Las 14 de módulo + «Clientes» y «Equipo». **Siempre visibles**: «Inicio» y «Plan y facturación» (el dueño tiene que poder pagar, también suspendido) | Solo los 14 módulos |
| D2 | **Oculto ≠ apagado** | Visibilidad y plan son independientes: ocultar no apaga el módulo (la tienda pública sigue usándolo: p. ej. entregas o monedas en el checkout) ni borra datos. Una sección oculta y fuera del plan tampoco sale como «PRO» (deja de anunciarse) | Ocultar = desactivar el módulo |
| D3 | **Lecturas** | Gestionado y Oculto bloquean solo **escrituras** del personal; las lecturas siguen (otras pantallas las necesitan: «Nuevo pedido» lee productos y zonas, Inicio lee ventas) | Bloquear también las lecturas de lo oculto (rompería pantallas cruzadas) |
| D4 | **Roles** | La regla aplica a todo el personal (owner, admin, staff); el superadmin nunca queda bloqueado. Los permisos de rol de hoy siguen igual por debajo | Que el owner pueda saltársela |
| D5 | **Superadmin y plan** | «Gestionado» no regala el módulo: si la tienda no lo tiene en el plan, sigue cerrado también para el superadmin, **salvo «Apariencia»**, que conserva la regla de la decisión 25. La regla especial de `themes` se reescribe como «el superadmin siempre puede con `themes`» dentro del mecanismo nuevo | Que «Gestionado» habilite el módulo al superadmin |
| D6 | **Valor por defecto de «Apariencia»** | Sin plan Pro, «Apariencia» se muestra como **Gestionado por Fullkod** automáticamente (es lo que ya pasa, con otro texto); el superadmin puede ocultarla | Dejar su aviso actual aparte |
| D7 | **Dónde vive** | Tabla `public.store_section_settings` (solo filas distintas de «Visible»), no un jsonb en `stores.settings`: `store_id` primero, RLS y tests como el resto | `stores.settings.sections` |
| D8 | **Capa de BD** | Sin chequeo dentro de cada función SQL: el personal solo escribe por `/api/v1` (con `service_role`), así que el guard de la API cubre todas las vías; la BD guarda la configuración y la entrega en `admin_bootstrap`/`api_guard` | Chequear en cada RPC (mucha superficie, poco riesgo real) |
| D9 | **UI de lo gestionado** | Aviso fijo arriba de la sección + el 403 de la API se muestra donde ya se muestran los errores (como con las tiendas suspendidas). Sin desactivar botón por botón en esta fase | Desactivar todos los controles de escritura (mucho más código por pantalla) |
| D10 | **Texto de la marca** | «Gestionado por Kshop» en la UI del cliente (la marca que ve es Kshop; Fullkod es la empresa) | «Gestionado por Fullkod» |

### Arquitectura Propuesta

```
packages/core/src/admin-sections.ts        # ADMIN_SECTIONS (código, módulo asociado o null, configurable),
                                           # SectionVisibility = 'visible' | 'managed' | 'hidden', Zod del PUT
apps/web/src/features/registry.ts          # sin cambios de forma; las secciones fijas se describen en core
apps/web/src/server/section-guard.ts       # mapa ruta /api/v1/stores/{id}/<prefijo> → sección (tabla explícita,
                                           # con test que exige que toda carpeta de escritura esté mapeada o excluida)
apps/web/src/server/store-writable.ts      # + bloqueo section_managed / section_hidden (mismo api_guard)
apps/web/src/app/api/v1/platform/stores/[storeId]/sections/route.ts   # GET/PUT (requireSuperadmin)
packages/admin/src/admin-context.ts        # AdminState.sections; fuera el caso especial de themes
apps/web/src/app/s/[storeSlug]/admin/      # AdminShell (menú), aviso «gestionado», página «no disponible»
apps/admin-app/src/App.tsx                 # mismas reglas en pestañas y «Más»
apps/web/src/app/(platform)/superadmin/    # lista v3 + ficha con «Accesos directos» y «Menú de la tienda»
```

### Modelo de Datos

```sql
create type public.section_visibility as enum ('managed', 'hidden');   -- 'visible' = sin fila

create table public.store_section_settings (
  store_id   uuid not null references public.stores (id) on delete cascade,
  section    text not null check (section in (/* códigos de ADMIN_SECTIONS configurables */)),
  visibility public.section_visibility not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (store_id, section)
);
alter table public.store_section_settings enable row level security;
-- select: miembros de la tienda y superadmin ((select private.my_store_ids()), (select private.is_superadmin()))
-- sin políticas de escritura; grant select a authenticated; escribe solo service_role (API del superadmin)
-- trigger private.realtime_signal() → tema store:{id} (el admin abierto vuelve a leer su arranque)

-- admin_bootstrap  + 'sections': { "<código>": "managed" | "hidden" }
-- api_guard        + 'sections': lo mismo (el guard de escritura no hace otra consulta)
-- public.platform_stores_overview() (security definer, solo service_role): tiendas + dueño (email desde auth.users)
--   + plan/suscripción/vencimiento + por cobrar (platform_invoices abiertas) + pedidos 30 d + último pedido
--   + nº de productos
```

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar en cada una (bucle agéntico: mapear contexto → subtareas → ejecutar).

### Fase 1: Esquema, lecturas y aislamiento
**Objetivo**: tabla `store_section_settings` con RLS, `admin_bootstrap` y `api_guard` devolviendo `sections`, señal
Realtime, y `platform_stores_overview()`; migración en el proyecto de prueba y luego en producción.
**Validación**: suite nueva `18_section_settings_isolation` (A no lee B, cliente/anon nada, nadie escribe salvo
`service_role`, bootstrap y guard devuelven lo esperado; contraprueba rompiendo la política) y `14_admin_bootstrap`
ajustada; `pnpm test:rls` en verde en prueba y una vez en producción.

### Fase 2: Guard de escrituras en la API
**Objetivo**: catálogo de secciones en `@kshop/core`, mapa ruta → sección en el servidor, bloqueo `section_managed` /
`section_hidden` en `assertStoreWritable` (superadmin exento, públicas intactas) y `GET/PUT
/api/v1/platform/stores/{id}/sections` con Zod; la regla especial de `themes` pasa al mecanismo nuevo (D5, D6).
**Validación**: test unitario del mapa (toda ruta de escritura de tienda mapeada o excluida a propósito); script e2e
(tiendas temporales) que comprueba 403 del personal y 200 del superadmin en una sección gestionada y otra oculta, y
200 en las demás; mismo número de llamadas a `api_guard` por petición.

### Fase 3: Admin de tienda y Kshop Admin
**Objetivo**: el menú (web y app) respeta la visibilidad; marca «Kshop» en lo gestionado y aviso fijo en su página;
página «no disponible» en lo oculto (y marca «Oculta al personal» para el superadmin); refresco por Realtime y caché de
arranque invalidada al cambiar.
**Validación**: en navegador con la Tienda Demo (dueño y superadmin): cambiar desde el superadmin y ver el menú
cambiar solo; capturas en `.titan/qa/r12-superadmin-v3/`.

### Fase 4: Lista de tiendas v3
**Objetivo**: `listPlatformStores` sobre `platform_stores_overview()`; búsqueda, filtros, columnas nuevas, menú de
acciones por fila (incluido «Enviar acceso al dueño», reutilizando `OwnerAccess`) y vista en tarjetas en móvil; KPIs
calculados de la misma lectura.
**Validación**: una sola petición SQL por carga (sin `listUsers`); capturas 1280/390 claro/oscuro sin scroll
horizontal; `qa:billing` sigue en verde.

### Fase 5: Ficha de la tienda: accesos directos y menú
**Objetivo**: bloque «Accesos directos» (todas las secciones por grupo, con plan y visibilidad, abriendo el admin de
la tienda en su sección) y bloque «Menú de la tienda» con el selector Visible / Gestionado / Oculto por sección
(guardado inmediato); «Personalizar la apariencia» pasa a ser uno de los accesos.
**Validación**: en navegador, cada acceso abre la URL correcta del subdominio; cambiar visibilidad desde la ficha se
refleja en el admin abierto de la Demo.

### Fase 6: Validación final
**Objetivo**: sistema funcionando end-to-end y documentado.
**Validación**:
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan (build sin nadie usando la web)
- [ ] `pnpm test:rls` en prueba y producción
- [ ] e2e de secciones y `qa:billing` con WhatsApp en «Simulado» (ya lo está), en serie, sin la web en uso
- [ ] Capturas en `.titan/qa/r12-superadmin-v3/` confirman la UI
- [ ] Criterios de éxito cumplidos; memoria (`project/`) y `MEMORY.md` actualizados; commit

---

## 🧠 Aprendizajes (Self-Annealing)

> Esta sección crece con cada error encontrado durante la implementación.

---

## Gotchas

- [ ] **Sesión por subdominio**: la sesión del admin vive en el `localStorage` de cada origen
      (`packages/admin/src/session.tsx`), así que el primer acceso directo a una tienda pide entrar otra vez en ese
      subdominio. Un enlace de entrada de un solo uso (superadmin → tienda) queda fuera de este PRP; ver Preguntas.
- [ ] **Rutas compartidas**: varias secciones escriben por la misma carpeta (`catalog/*` sirve a Catálogo y a
      Importar Excel; `currencies` vs `catalog/currencies`; `orders/*` y «Nuevo pedido»; `checkout-settings/*`). El
      mapa debe decidir sección por subruta, no por carpeta, y tener test.
- [ ] **Subidas directas a Storage**: el personal sube imágenes a `store-media` sin pasar por la API; en una sección
      gestionada podría subir un archivo, pero no enlazarlo a nada (la escritura que lo usa pasa por la API). Aceptable;
      no se toca la política de Storage.
- [ ] **Caché de arranque de 24 h** (`kshop.admin.*` en `localStorage`): una sección recién ocultada puede verse en el
      menú hasta que llega `/me` o la señal Realtime; la API ya la bloquea, así que no concede nada.
- [ ] **Nano a créditos**: `test:rls`, e2e, QA y `build` en serie y sin la web en uso; migración primero en «KShop Test»,
      luego producción.
- [ ] La ficha (`stores/[storeId]/page.tsx`) ya tiene 565 líneas: los bloques nuevos van en componentes propios.
- [ ] `section` es texto con `check`; añadir una sección futura obliga a una migración que amplíe el `check` (igual que
      `MODULE_CODES` ↔ `public.modules`): un test debe comparar ambas listas.

## Respuestas de Roberto (2026-10-28)
Estas respuestas **ganan** sobre lo escrito arriba (D1, D10, columnas y textos «Fullkod»/«Kshop» de las marcas).
1. **D1: las cosas básicas no se pueden ocultar.** Siempre visibles y no configurables: «Inicio», «Pedidos»,
   «Clientes», «Catálogo» (productos), «Plan y facturación» y «Equipo». El resto de módulos sí se configuran.
2. **D3: ok**, Gestionado y Oculto bloquean solo escrituras.
3. **D5: sí**, «Gestionado» no regala el módulo (salvo Apariencia).
4. **D10: el texto es «Gestionado por admin»** (selector del superadmin, marca en el menú y aviso de la sección:
   «Esta sección la gestiona el administrador. Escríbenos para cualquier cambio.»). Nada de «Kshop»/«Fullkod» en esa marca.
5. **Columnas: todas si caben**: «Por cobrar», «Vence», «Pedidos 30 d», «Último pedido», «Productos» y «Último acceso
   del dueño» (`auth.users.last_sign_in_at` dentro de `platform_stores_overview()`). En móvil, tarjetas con todo.
6. **Sí, en otra fase**: enlace de entrada de un solo uso superadmin → tienda (fuera de R12; anotado como pendiente).

## Anti-Patrones

- NO crear nuevos patrones si los existentes funcionan (reusar `assertStoreWritable`, `api_guard`, Realtime, `OwnerAccess`)
- NO ignorar errores de TypeScript ni introducir `any`
- NO bloquear solo en la UI: la API es la que protege
- NO borrar ni apagar datos al ocultar una sección
- NO omitir validación Zod en el PUT de secciones
- NO leer por pg_graphql (todo por funciones SQL / PostgREST)

---

*PRP pendiente de aprobación. No se ha modificado código.*
