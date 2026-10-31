# Dónde quedamos (2026-10-31)

Supera a `2026-10-30-donde-quedamos.md`.

## Estado
- **En producción:** cobro en varias monedas y POS fases 1 y 2 (módulo y servidor).
- **En `main`, sin subir:** POS fases 3, 4, 5 y 6 (la migración de la 6 ya está en producción; es compatible con la web desplegada): Kshop Admin arranca sin red, pantalla de Caja con búsqueda por trozos, cobro mixto, cola de subida automática, ventas retenidas, anulación, resumen del día. En la web: pestaña «Mostrador», cancelar una venta entregada, anotaciones y tasas, Admin › Caja. Lo del teléfono no llega a nadie hasta generar un APK.
- `qa:pos-offline` 36/36 en navegador. **No probado en un Android real:** archivos nativos, red nativa, matar la app, reiniciar.
- **Caja en la web:** Admin › Caja › Vender, para quien no tiene app (iPhone). Sin probar en un iPhone real.

## Qué sigue
1. **Fase 7:** APK en GitHub Actions y prueba en Android en modo avión. Necesita permiso de Roberto para subir y generar, y saber en qué teléfono.
2. **Roberto:** elTOQUE. El token está en Vercel, pero al 2026-10-31 producción seguía sugiriendo la tasa de la tienda y `private.market_rates` estaba vacía: falta un redeploy, que sale al subir `main`. En local ya funciona.
3. Comprobar si `?q=` de `OrderList` falla al llegar desde la búsqueda global (ver PRP, fase 6).
4. Lo de `2026-10-29-donde-quedamos.md` (8.6, 8.7, logs de R11) y `credito-fullkod.md`.

## Para retomar
- WhatsApp: «Real» en producción, `dry_run` en prueba. `e2e:*` y `qa:*` van a prueba.
- Local: web en 3210 (`NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210`); Kshop Admin en 5174 con `KSHOP_API_URL=http://localhost:3210 node ../../scripts/db-env.mjs npx vite --port 5174`. Sin `db-env`, Vite coge la base de producción.
- `copy-demo-to-test.mjs` deja la Tienda Demo con un plan inexistente: corregirlo si se vuelve a copiar.
