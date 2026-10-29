# Admin: crear y editar en diálogo (decisión de Roberto, 2026-10-28)

Roberto no quiere que los formularios de crear/editar del admin salgan en la misma vista empujando las tablas.

## Decisión
- **Formularios cortos → diálogo (modal).** Casos vistos en el código (2026-10-28), que hoy abren el formulario
  encima de la tabla: marcas/colecciones (`SimpleEntitiesPage`), categorías, monedas y tasas, almacenes, zonas de
  envío y métodos de pago (`CheckoutSettingsPages`), descuentos y cupones, gastos de Finanzas, plantillas de avisos
  WhatsApp, invitar al equipo.
- **Formularios largos → página propia, como hoy:** producto (variantes, imágenes, stock) y nuevo pedido. Se abren
  desde la lista y al guardar vuelven a ella.
- **Móvil:** el diálogo es una hoja a pantalla completa desde abajo (también en Kshop Admin).
- Hace falta un `Dialog` accesible en `@kshop/ui` (hoy no existe): foco atrapado, Esc, `aria-modal`, sin romper
  el tema oscuro. Se migra pantalla por pantalla sin tocar su lógica.

## Estado
- **Hecho (R13, 2026-10-28)**, sin desplegar. `Dialog` en `packages/ui/src/dialog.tsx` (`<dialog>` nativo, `showModal`,
  hoja a pantalla completa < 640 px, no se cierra al pulsar fuera para no perder un formulario a medias). 17 pantallas;
  QA `pnpm qa:dialogs` (capturas en `.titan/qa/r13-dialogos/`). PRP: `.titan/plans/prp-r13-formularios-en-dialogo.md`.
- **Regla para pantallas nuevas del admin:** crear/editar corto → `Dialog` de `@kshop/ui`; largo (producto, pedido) → página.
- **Siguiente (Roberto, 2026-10-28): las confirmaciones también en diálogo** → PRP R14
  (`.titan/plans/prp-r14-confirmaciones-en-dialogo.md`); P1–P4 respondidas el 2026-10-29 (confirmar también los borrados
  que hoy no preguntan, suspender tienda, quitar regalo/suelto; cancelar pedido y anular factura en diálogo).
