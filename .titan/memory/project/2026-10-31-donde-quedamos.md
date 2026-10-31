# Dónde quedamos (2026-10-31)

Supera a `2026-10-30-donde-quedamos.md`.

## Estado
- **En producción:** cobro en varias monedas y POS fases 1 a 6, con venta desde la web (Admin › Caja › Vender) y elTOQUE funcionando.
- **APK publicados:** Kshop Admin 1.0.9, Minimercado 1.0.10, Tienda Demo 1.0.11, Klau's Shop 1.0.12 (primera vez visible en su `/app`; se oculta en Superadmin › Apps).
- `qa:pos-offline` 36/36, `qa:pos` 35/35 y `qa:apps` 28/28 en navegador. **No probado en un iPhone real ni en un Android real:** archivos nativos, red nativa, matar la app, reiniciar.

## Qué sigue
1. **Fase 7:** Roberto prueba los APK en un Android en modo avión (matar la app, reiniciar, subir al volver la red).
2. Comprobar si `?q=` de `OrderList` falla al llegar desde la búsqueda global (ver PRP, fase 6).
3. Lo de `2026-10-29-donde-quedamos.md` (8.6, 8.7, logs de R11) y `credito-fullkod.md`.

## Para retomar
- WhatsApp: «Real» en producción, `dry_run` en prueba. `e2e:*` y `qa:*` van a prueba.
- Local: web en 3210 (`NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210`); Kshop Admin en 5174 con `KSHOP_API_URL=http://localhost:3210 node ../../scripts/db-env.mjs npx vite --port 5174`. Sin `db-env`, Vite coge la base de producción.
- `copy-demo-to-test.mjs` deja la Tienda Demo con un plan inexistente: corregirlo si se vuelve a copiar.
