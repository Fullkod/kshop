# Realtime donde se pueda (pedido de Roberto, 2026-10-27) — primera tanda HECHA

Roberto quiere **Supabase Realtime en todos los sitios donde se pueda**, para que los datos estén siempre al día sin
recargar. **Hecho (2026-10-27, `prp-r8-superadmin-y-realtime.md`)**: señales sin datos por `realtime.send` (temas
`store:{id}`, `platform`, `order:{token}`) en pedidos (lista, detalle, Inicio, contador, campana), avisos, cola de
WhatsApp, Cobros y Tiendas del superadmin y la página del pedido del cliente. Para una pantalla nueva: añadir el
contador de `useStoreVersion`/`useRealtimeVersion` a las dependencias de su lectura y, si la tabla no emite, su
trigger `private.realtime_signal()`. Falta (si Roberto lo quiere): catálogo/stock, «Mis pedidos» del cliente.

Candidatos iniciales:
- Admin web y Kshop Admin: lista e Inicio de pedidos (nuevos pedidos, cambios de estado, contador «por confirmar» y la
  campana), stock bajo, registro de avisos de WhatsApp.
- Superadmin: cola de WhatsApp (hoy se refresca cada 15 s por sondeo), solicitudes de app, cobros.
- Tienda del cliente: estado de «Mi pedido» y «Mis pedidos».

A tener en cuenta: Realtime respeta la RLS (`postgres_changes` solo emite filas que el usuario puede leer); hace falta
publicar las tablas (`supabase_realtime`), tests de aislamiento entre tiendas también para los canales, y en la app
Capacitor reconectar al volver del segundo plano. Las páginas públicas cacheadas (Cache Components) no se vuelven en
vivo: solo las vistas con sesión.
