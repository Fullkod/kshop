# Dónde quedamos (2026-10-31)

Supera a `2026-10-30-donde-quedamos.md`. `main` y `origin/main` están al día (`b5a51b7`), deploy de Vercel correcto.

## Estado
- **En producción:** cobro en varias monedas (KSH0002) y POS fases 1 a 6: venta sin conexión en Kshop Admin, venta
  también desde la web (Admin › Caja › Vender, para quien no tiene app), lo que ve el dueño (pestaña Mostrador,
  Admin › Caja › Resumen, anotaciones, cancelar una venta entregada), elTOQUE sugiriendo la tasa del día.
- **APK publicados** (2026-10-31, generados por el workflow «Android app» y publicados desde la base): Kshop Admin
  1.0.9, Minimercado 1.0.10, Tienda Demo 1.0.11, Klau's Shop 1.0.12 (la de Klau nunca había estado visible; se
  oculta en Superadmin › Apps si hace falta).
- **La web en el teléfono (iPhone/Android sin app):** medida con `pnpm qa:mobile` y corregida en común
  (`reference/web-en-el-telefono.md`): variante `touch:`, campos a 16 px, «Volver» en la barra, `AdminSubNav`,
  `FilterBar`, barras fijas en editor de producto y pedido manual. Segunda ronda con lo que Roberto vio en su
  teléfono: variantes en tarjetas (generar solo las que faltan, quitar con «×»), avisos de WhatsApp sin desbordar,
  cantidad escrita en la caja, selector de tema claro/oscuro/sistema y miniatura en categorías.
- **Medido en navegador:** `qa:mobile` 61 páginas (0 campos que hacen zoom, 0 desbordes), `qa:pos` 35/35,
  `qa:pos-offline` 36/36, `qa:apps` 28/28, `qa:sections` 31/31, `qa:dialogs` 41/41, `qa:confirms` 32/32,
  `test:rls` en prueba y producción.
- **No probado en teléfonos reales:** ni el APK en un Android (archivos nativos, modo avión, matar la app,
  reiniciar, subida al volver la red) ni la web en Safari de iPhone (zoom de campos, teclado, tema).

- **KSH0003** (misma noche): calculadora de costo unitario y margen en el editor de producto y teléfonos con la
  separación cubana (`2026-10-31-ksh0003-calculadora-precio.md`); `qa:price-calculator` 23/23.

- **KSH0004** («ajustar planes»): plan «Caja» hecho (`2026-11-01-ksh0004-plan-caja.md`): migraciones en prueba y
  producción, `e2e:plan-caja` 23/23, `qa:plan-caja` 30/30. En producción el plan queda **oculto hasta el deploy**; luego
  marcarlo «Visible» en Superadmin › Planes.

- **Deploy hecho (2026-11-01, Roberto por push):** KSH0003 y KSH0004 en producción (`b30ce02`, registrado en Tasknic);
  el plan Caja ya está **visible** en la landing de producción.
- **KSH0005 (ayuda)**: Roberto respondió las preguntas (admin + Kshop Admin + superadmin, todo como Tasknic, dueño/
  empleado con filtro, antes que KSH0006/7) y el PRP está escrito (`prp-ksh0005-ayuda.md`, commit `58eb4d6`), pero
  **pidió esperar para limpiar el contexto** antes de arrancar: la próxima sesión empieza pidiéndole el «ok» y va a la
  fase 1. Quedan KSH0006 (páginas estáticas) y KSH0007 (enlaces de las columnas del pie, bien definida) en Por hacer.

## Qué sigue
0. **KSH0005**: «ok» de Roberto al PRP → fase 1 (modelo, validación y 8 guías).
1. **Roberto prueba los APK** (Kshop Admin en modo avión: vender, cerrar a la fuerza, reiniciar, subir al volver la
   red) y la web desde su iPhone. Lo que salga se corrige antes de dar por cerrada la fase 7 del PRP del POS.
2. **KSH0002 en Tasknic** sigue «En revisión»; cerrarla cuando Roberto dé el visto bueno al cobro.
3. Comprobar si `?q=` de `OrderList` falla al llegar desde la búsqueda global (ver PRP del POS, fase 6).
4. Inventario desde la caja (etapa 2 del POS), cuando Roberto lo pida.
5. Lo de `2026-10-29-donde-quedamos.md` (8.6, 8.7 de klauShop, logs de R11) y `credito-fullkod.md`.

## Para retomar
- WhatsApp: «Real» en producción, `dry_run` en prueba. `e2e:*` y `qa:*` van a prueba.
- Local: web en 3210 (`NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210`); Kshop Admin en 5174 con
  `KSHOP_API_URL=http://localhost:3210 node ../../scripts/db-env.mjs npx vite --port 5174`; la app de tienda en 5173
  con `KSHOP_STORE=demo`. Sin `db-env`, Vite coge la base de producción. Los `qa:*` que tocan la plataforma
  necesitan `QA_PLATFORM_URL=http://kshop.localhost:3210`.
- `qa:apps` necesita los tres servidores; `qa:confirms` escoge un pedido que no sea de mostrador.
- `copy-demo-to-test.mjs` deja la Tienda Demo con un plan inexistente: corregirlo si se vuelve a copiar.
- El tema elegido es por navegador (`localStorage`): en el mismo navegador afecta a la tienda pública.
