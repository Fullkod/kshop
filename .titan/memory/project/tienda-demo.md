# Tienda de pruebas permanente: «Tienda Demo»

Decidido por Roberto (2026-10-25): una tienda que **siempre** se usa para probar, con su dueño y todo.
No se usa `klaushop` para pruebas (ese slug queda limpio para la migración real de la Fase 8).

- Slug `demo` → `http://demo.kshop.localhost:3000` (admin en `/admin`). Plan **Pro**, CUP, prefijo `DEMO`.
- Dueño `dueno@demo.kshop.test`, empleado `empleado@demo.kshop.test`. Contraseñas en `.env.local`
  (`DEMO_OWNER_PASSWORD`, `DEMO_STAFF_PASSWORD`) y en la nota de Tasknic «Tienda de pruebas: Tienda Demo»
  (Espacio de KShop). Nunca en el repo.
- `pnpm demo:seed` la recrea/repara (idempotente). `pnpm e2e:cleanup` no la toca (solo `@e2e.kshop.test`).
- Los tests que necesiten comparar planes siguen creando sus tiendas A (Base) / B (Pro) temporales.
