# Dónde quedamos (2026-10-30)

> Superado por `2026-10-31-donde-quedamos.md`.

## En producción y en `main` (`origin/main` al día; lo subió el agente con permiso de Roberto)
- **KSH0002, cobro en varias monedas:** tasa por pago, lo que falta, vuelto en cualquiera de las dos monedas, cancelar por moneda,
  Finanzas y Ventas de hoy por moneda. Sin total todavía (envío a convenir), calcula sobre el subtotal.
- **POS, fases 1 y 2 de `prp-pos-offline.md`:** módulo `pos` (Base y Pro) y servidor de la venta. **No hay pantalla de caja todavía**:
  nadie puede crear ventas de mostrador desde la interfaz.
- Superadmin importa Excel y edición de categorías (`pendiente-superadmin-importar-excel.md`, `pendiente-editar-categorias.md`).
- `test:rls` en producción: 739/740. El fallo era el propio test (esperaba la versión 7 de Kshop Admin y la real es la 8); arreglado y
  verificado en prueba, sin volver a correrlo en producción para no gastar CPU de la Nano.

## Qué sigue
1. **POS, fase 3:** arranque sin conexión de Kshop Admin y almacenamiento en el teléfono; luego las fases 4 a 7. Validarla exige un APK de
   prueba en un Android real en modo avión (permiso de Roberto para generarlo).
2. **Roberto:** poner `ELTOQUE_API_TOKEN` en Vercel. En producción `private.market_rates` está vacía y la tasa sugerida sale de la tienda, no
   de elTOQUE, que es lo que pedía KSH0002. Revisar KSH0002 en Tasknic.
3. Sigue pendiente lo de `2026-10-29-donde-quedamos.md` (8.6, 8.7, logs de R11) y `credito-fullkod.md` (ajuste para ocultar el crédito).

## Para retomar
- **WhatsApp está en «Real» en producción y en `dry_run` en prueba.** `e2e:*` y `qa:*` van a prueba por defecto: no cambiar eso.
- En local: `pnpm dev` en 3210 (`NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210`), con `E2E_APP_URL`/`QA_BASE_URL` a ese puerto.
- El proyecto de prueba tenía la suscripción de la Tienda Demo apuntando a un plan inexistente; se corrigió a mano. `copy-demo-to-test.mjs` debería
  resolver el plan por código: volverá a pasar al copiarla.
- El conector de Vercel disponible en la sesión es de otro equipo: el deploy se comprobó por HTTP, no con sus logs.
