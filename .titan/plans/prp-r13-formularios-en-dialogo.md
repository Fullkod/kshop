# PRP R13: crear y editar en diálogo en el admin

> **Estado**: HECHO (2026-10-28), subido a `main` por Roberto (2026-10-29). Criterio aprobado por Roberto el 2026-10-28 («me parece bien lo de los modal»,
> memoria `project/2026-10-28-admin-formularios-en-dialogo.md`) y «continúa con r13».
> **Proyecto**: Kshop · **Sigue a**: R12 (`prp-r12-superadmin-v3.md`).

## Objetivo
Que los formularios cortos de crear/editar del admin se abran en un diálogo (modal) en vez de aparecer encima de la
lista empujándola; los largos (producto, nuevo pedido) siguen en su página. En móvil el diálogo es una hoja a pantalla
completa desde abajo. Sin cambiar la lógica de ninguna pantalla.

## Criterios de éxito
- [x] `Dialog` en `@kshop/ui` sobre `<dialog>` nativo (`showModal`): foco atrapado y devuelto, Esc y «Cancelar» cierran,
      fondo inerte, `aria-labelledby` con el título, scroll interno si no cabe, tema claro y oscuro; en < 640 px hoja
      a pantalla completa.
- [x] Pasan a diálogo: marcas/colecciones/almacenes (`SimpleEntitiesPage`), categorías, atributos, tipos de producto,
      zonas y métodos de entrega, métodos de pago, promociones, cupones, gastos de Finanzas, contactos de avisos
      WhatsApp, invitar al equipo y, en Apariencia, secciones de portada, banners y páginas (17 pantallas).
- [x] Se quedan como están: producto y nuevo pedido (página), y los formularios de ajustes de una sola pieza (monedas,
      dominio propio, apariencia, Excel).
- [x] Al guardar bien se cierra y la lista se recarga; un error de la API (incluido el 403 de R12) se ve dentro del
      diálogo, sin cerrarlo.
- [x] `typecheck`, `lint`, `test`, `build` en verde; QA en navegador (`qa:dialogs`) con capturas en
      `.titan/qa/r13-dialogos/` (1280 y 390, claro y oscuro, sin errores de consola).

## Decisiones técnicas
| # | Decisión | Por qué |
|---|----------|---------|
| T1 | `<dialog>` nativo, sin librería | Ya lo usa el carrito (`CartDrawer`); el navegador da foco, Esc y top layer |
| T2 | El diálogo envuelve el `<form>` que ya existe; el estado `editing` de cada pantalla decide si está abierto | Cambio mínimo por pantalla |
| T3 | Kshop Admin no cambia: sus módulos abren el admin web en el navegador | Ya hereda los diálogos |

## Fases
1. `Dialog` en `@kshop/ui` + `SimpleEntitiesPage` y categorías.
2. Entregas y métodos de pago (`CheckoutSettingsPages`).
3. Promociones y cupones.
4. Gastos de Finanzas, contactos de avisos, invitar al equipo.
5. Validación: QA en navegador, memoria y commit.

## Aprendizajes (Self-Annealing)

- **2026-10-28 · el diálogo ocupaba toda la altura en escritorio.** `sm:h-auto` anula el `height: fit-content` que el
  navegador da al `<dialog>` modal, y con `inset: 0` se estira. **Fix**: `sm:h-fit`. Vale para cualquier `<dialog>`.
- **Errores de la API:** las pantallas que mostraban `action.error` fuera del formulario (entregas, métodos de pago,
  promociones, cupones, contactos, banners, secciones) lo muestran ahora dentro del diálogo mientras está abierto.
- **Gastos e invitar al equipo** tenían el formulario siempre a la vista: ahora un botón («Añadir gasto», «Invitar
  persona») abre el diálogo; en ambos el botón de enviar se llama igual que el que abre (los QA lo buscan dentro de
  `getByRole("dialog")`).
- **Los QA de fases anteriores** (`qa:billing`, `qa:pro`, `qa:discounts`, `qa:notifications`) se adaptaron y admiten
  otro puerto (`QA_PORT` / `QA_STORE_URL`); al relanzarlos sobrescriben las capturas de su fase: restaurarlas con
  `git checkout` si solo se querían verificar.
- `qa:billing` esperaba «Apariencia» con PRO en el plan Base: tras R12 (D6) sale como «Admin».

## Gotchas
- `showModal()` lanza si el `<dialog>` ya está abierto o no está en el DOM: abrir/cerrar en un efecto según `open`.
- Cerrar con Esc dispara `cancel`/`close`: sincronizar con el estado de la pantalla (`onClose`).
- `window.confirm` de «Borrar» queda fuera del diálogo (no se toca en R13) → **R14** (`prp-r14-confirmaciones-en-dialogo.md`).
