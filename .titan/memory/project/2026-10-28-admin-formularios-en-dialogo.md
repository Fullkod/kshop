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
- Pendiente: PRP propio **R13** (después o aparte de R12, el panel del superadmin v3). Aún sin escribir.
