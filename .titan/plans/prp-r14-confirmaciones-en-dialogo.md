# PRP R14: confirmaciones en diálogo

> **Estado**: PENDIENTE de aprobación de Roberto (2026-10-28). No se ha tocado código.
> **Proyecto**: Kshop · **Sigue a**: R13 (`prp-r13-formularios-en-dialogo.md`, el `Dialog` de `@kshop/ui`).
> Memoria: `project/2026-10-28-admin-formularios-en-dialogo.md`.

---

## Objetivo

Que ninguna confirmación del admin, del superadmin ni de Kshop Admin use las ventanas del navegador (`window.confirm`,
`window.prompt`): todas pasan a un diálogo de confirmación con la marca de Kshop, el mismo en web y en la app. De paso,
las acciones destructivas que hoy se ejecutan **sin preguntar** pasan a confirmarse, y los dos formularios de
confirmación en línea (cancelar pedido, anular factura) se abren en diálogo como el resto desde R13.

## Por qué

| Problema | Solución |
|----------|----------|
| `window.confirm` es una caja gris del navegador: no sigue la marca ni el tema oscuro, en Android (Capacitor) sale como alerta del sistema y bloquea la página entera (y los QA automáticos) | `ConfirmDialog` sobre el `Dialog` de R13, con título, explicación y botón rojo para lo destructivo |
| Borrar una promoción, un cupón, una zona, un método de entrega o de pago o un contacto de WhatsApp se ejecuta al primer clic, sin preguntar | Confirmación como en el resto de borrados |
| Suspender una tienda, quitarle un regalo o un módulo suelto desde el superadmin se ejecuta al instante (afecta a la tienda y a su factura) | Confirmación con lo que va a pasar |
| «¿Hasta qué fecha?» de los regalos de módulo es un `window.prompt` que pide escribir AAAA-MM-DD a mano | Diálogo con un campo de fecha |
| Cancelar pedido y anular factura abren su confirmación dentro de la página | Mismo diálogo, con su campo de motivo |

## Qué

### Criterios de éxito
- [ ] `ConfirmDialog` + `useConfirm()` en `@kshop/ui`: `await confirm({ title, description, confirmLabel, tone })`
      devuelve `true`/`false`; un proveedor por aplicación (admin de tienda, superadmin, Kshop Admin). Foco en
      «Cancelar» al abrir en lo destructivo, Esc = cancelar, botón rojo si `tone: "destructive"`, hoja en móvil.
- [ ] 0 llamadas a `window.confirm`/`window.prompt`/`window.alert` en `apps/` y `packages/` (regla de ESLint
      `no-restricted-globals`/`no-alert` para que no vuelvan).
- [ ] Las 13 llamadas de hoy (12 `confirm`, 1 `prompt`) pasan al diálogo con el mismo texto (inventario abajo).
- [ ] Ganan confirmación (P1–P3, si Roberto las aprueba): borrar promoción, cupón, zona, método de entrega, método de
      pago y contacto de WhatsApp; suspender tienda; quitar regalo y quitar módulo suelto.
- [ ] Cancelar pedido y anular factura se abren en diálogo con su motivo (P4); la fecha de un regalo, en un diálogo
      con `<input type="date">`.
- [ ] Cancelar el diálogo no hace nada (ninguna petición); confirmar hace exactamente lo de hoy.
- [ ] `typecheck`, `lint`, `test`, `build` en verde; QA en navegador (`qa:confirms`) con capturas en
      `.titan/qa/r14-confirmaciones/` (1280 y 390, claro y oscuro); los QA que hoy aceptan `window.confirm`
      (`page.on("dialog")`) se adaptan y siguen en verde.

### Inventario (código actual, 2026-10-28)

**Hoy con `window.confirm`/`window.prompt` (13):**

| Dónde | Acción |
|-------|--------|
| `features/catalog/components/SimpleEntitiesPage.tsx:79` | Borrar marca / colección / almacén |
| `features/catalog/components/CategoriesPage.tsx:47` | Borrar categoría |
| `features/catalog/components/AttributesPage.tsx:98` | Borrar atributo y sus valores |
| `features/catalog/components/ProductTypesPage.tsx:74` | Borrar tipo de producto |
| `packages/admin/src/catalog/ProductEditor.tsx:454` | Borrar producto para siempre (también en Kshop Admin) |
| `features/finance/components/FinancePages.tsx:935` | Borrar gasto |
| `features/themes/components/SectionsEditor.tsx:318` | Borrar sección de portada |
| `features/themes/components/BannersEditor.tsx:91` | Borrar banner |
| `features/themes/components/PagesEditor.tsx:34` | Borrar página |
| `features/custom-domain/components/CustomDomainPage.tsx:116` | Quitar dominio propio |
| `app/s/[storeSlug]/admin/team/page.tsx:202` | Quitar a alguien del equipo |
| `app/(platform)/superadmin/domains/page.tsx:89` | Quitar un dominio (superadmin) |
| `app/(platform)/superadmin/stores/[storeId]/page.tsx:134` | `window.prompt`: fecha final de un regalo de módulo |

**Hoy sin confirmar (propuesta P1–P3):**

| Dónde | Acción |
|-------|--------|
| `features/discounts/components/DiscountsPages.tsx` (~503, ~747) | Borrar promoción; borrar/desactivar cupón |
| `features/orders/components/CheckoutSettingsPages.tsx` (84, 541) | Borrar zona, método de entrega, método de pago |
| `features/whatsapp-notifications/components/NotificationsPages.tsx` (~214) | Borrar contacto de avisos |
| `app/(platform)/superadmin/page.tsx` (menú de fila) y `stores/[storeId]/page.tsx` («Suspender a mano») | Suspender tienda (reactivar no pregunta) |
| `app/(platform)/superadmin/stores/[storeId]/page.tsx` (tabla de módulos) | Quitar regalo, quitar módulo suelto |

**Formularios de confirmación en línea (P4):** `packages/admin/src/orders/OrderDetail.tsx` (`CancelForm`, «Cancelar
pedido» con motivo) y `features/billing/components/InvoiceActions.tsx` (modo «Anular» con motivo).

**Fuera de alcance:** archivar en lote en Productos (reversible), «Restablecer» colores del tema (no guarda nada),
la tienda pública (no tiene confirmaciones).

### Decisiones para Roberto

| # | Pregunta | Propuesta |
|---|----------|-----------|
| P1 | ¿Confirmar los borrados que hoy no preguntan (promociones, cupones, zonas, métodos de entrega/pago, contactos)? | Sí |
| P2 | ¿Confirmar «Suspender tienda» en el superadmin? | Sí («La tienda deja de vender y su admin queda en solo lectura»); reactivar no pregunta |
| P3 | ¿Confirmar «Quitar regalo» y «Quitar suelto»? | Sí (cambian la próxima factura) |
| P4 | ¿Cancelar pedido y anular factura en diálogo (con el motivo dentro)? | Sí, como los formularios de R13 |

### Decisiones técnicas
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | API por promesa: `if (!(await confirm({...}))) return;` | Cada sitio cambia una línea; el flujo sigue igual |
| T2 | Un `ConfirmProvider` por aplicación con un solo `ConfirmDialog`; `useConfirm` lanza error fuera del proveedor | Sin un diálogo por fila; falla en desarrollo si falta |
| T3 | Construido sobre `Dialog` (R13), sin librería | Mismo foco, Esc, hoja en móvil y tema |
| T4 | ESLint `no-alert` en `apps/` y `packages/` | Que no vuelvan las cajas del navegador |

### Arquitectura propuesta
```
packages/ui/src/confirm.tsx      # ConfirmProvider, useConfirm(), ConfirmDialog (sobre Dialog)
apps/web/src/app/s/[storeSlug]/admin/AdminShell.tsx       # <ConfirmProvider> alrededor del admin
apps/web/src/app/(platform)/superadmin/SuperadminShell.tsx  # <ConfirmProvider> alrededor del superadmin
apps/admin-app/src/App.tsx                                 # <ConfirmProvider> en la raíz de la app
eslint.config.*                                            # no-alert
scripts/qa-confirms.mjs                                    # QA en navegador (pnpm qa:confirms)
```
Sin cambios de base de datos ni de API.

---

## Blueprint (fases)

> Solo fases; las subtareas se generan al entrar en cada una (`tf-bucle-agentico`).

### Fase 1: `ConfirmDialog` y proveedores
**Objetivo**: `confirm.tsx` en `@kshop/ui`, proveedor en admin de tienda, superadmin y Kshop Admin, regla `no-alert`.
**Validación**: typecheck/lint; una pantalla de prueba confirma y cancela (foco, Esc, botón rojo, 390 px).

### Fase 2: las 13 confirmaciones de hoy
**Objetivo**: cada `window.confirm`/`window.prompt` del inventario pasa a `useConfirm` (la fecha del regalo, a un
diálogo con campo de fecha), mismo texto.
**Validación**: `grep` sin `window.confirm|prompt|alert`; QA que hoy aceptan el `dialog` del navegador adaptados.

### Fase 3: confirmaciones nuevas (P1–P3)
**Objetivo**: borrados sin confirmar, suspender tienda, quitar regalo/suelto.
**Validación**: cancelar no lanza ninguna petición (se comprueba en el QA por red); confirmar hace lo de hoy.

### Fase 4: cancelar pedido y anular factura (P4)
**Objetivo**: `CancelForm` e «Anular» en diálogo con el motivo dentro; en Kshop Admin también.
**Validación**: `qa:orders` y `qa:billing` en verde; captura del diálogo.

### Fase 5: validación final
- [ ] `typecheck`, `lint`, `test`, `build` (build contra el proyecto de prueba)
- [ ] `qa:confirms` + los QA afectados, en serie, contra el proyecto de prueba
- [ ] Capturas en `.titan/qa/r14-confirmaciones/`; memoria, `MEMORY.md`, `arranque-y-fases.md` y `AGENTS.md` al día; commit

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece durante la implementación.

---

## Gotchas
- [ ] Los QA viejos aceptan `window.confirm` con `page.on("dialog", d => d.accept())`: hoy `qa-billing.mjs` y
      `qa-pro.mjs`. Con el diálogo propio hay que pulsar su botón; volver a buscar `on("dialog"` en `scripts/` al cerrar.
- [ ] Al relanzar QA de otras fases se sobrescriben sus capturas: restaurarlas con `git checkout` si solo se verifica.
- [ ] El `Dialog` de R13 no se cierra al pulsar fuera; en una confirmación tampoco (cancelar es explícito).
- [ ] Un diálogo de confirmación abierto desde otro diálogo (p. ej. borrar dentro de un formulario) debe apilarse
      encima: `showModal` lo permite (top layer), comprobarlo en la fase 1.
- [ ] Tras R12, una sección «Gestionada por admin» devuelve 403 al confirmar: el error se ve donde ya se ve hoy.
- [ ] Puerto 3000 ocupado a veces por otros proyectos de Roberto: `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:<puerto>`
      y `QA_BASE_URL`/`QA_PORT`.

## Anti-patrones
- NO usar `window.confirm`, `window.prompt` ni `window.alert`.
- NO cambiar la lógica de lo que se confirma: solo cómo se pregunta.
- NO crear un diálogo por fila: un proveedor por aplicación.
- NO añadir una librería de modales.

---

*PRP pendiente de aprobación. No se ha modificado código.*
