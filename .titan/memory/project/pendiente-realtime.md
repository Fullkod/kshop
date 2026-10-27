# Pendiente: realtime donde se pueda (pedido de Roberto, 2026-10-27)

Roberto quiere **Supabase Realtime en todos los sitios donde se pueda**, para que los datos estén siempre al día sin
recargar. Aún no planificado: hacerle un PRP antes de tocarlo.

Candidatos obvios (a confirmar con Roberto):
- Admin web y Kshop Admin: lista e Inicio de pedidos (nuevos pedidos, cambios de estado, contador «por confirmar» y la
  campana), stock bajo, registro de avisos de WhatsApp.
- Superadmin: cola de WhatsApp (hoy se refresca cada 15 s por sondeo), solicitudes de app, cobros.
- Tienda del cliente: estado de «Mi pedido» y «Mis pedidos».

A tener en cuenta: Realtime respeta la RLS (`postgres_changes` solo emite filas que el usuario puede leer); hace falta
publicar las tablas (`supabase_realtime`), tests de aislamiento entre tiendas también para los canales, y en la app
Capacitor reconectar al volver del segundo plano. Las páginas públicas cacheadas (Cache Components) no se vuelven en
vivo: solo las vistas con sesión.
