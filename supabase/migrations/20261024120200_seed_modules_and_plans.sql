-- Phase 0b: module catalog and plans (reference data, needed in every environment).
-- Module codes must match MODULE_CODES in @kshop/core (checked by a test).
-- Plan prices are provisional (0) until Roberto sets them; max_products is still undecided.

insert into public.modules (code, name, description, depends_on, is_core, sort_order) values
  ('catalog', 'Catálogo', 'Productos, variantes, categorías y colecciones', '{}', true, 10),
  ('orders', 'Pedidos', 'Carrito, checkout por WhatsApp y estados de pedido', '{catalog}', true, 20),
  ('shipping', 'Entregas', 'Zonas, métodos y precios de entrega', '{orders}', false, 30),
  ('discounts', 'Descuentos y cupones', 'Promociones y cupones', '{catalog}', false, 40),
  ('themes', 'Temas', 'Colores, logo, secciones de portada, menús y páginas', '{}', false, 50),
  ('excel_import', 'Importar desde Excel', 'Importar y exportar productos en Excel', '{catalog}', false, 60),
  ('mobile_app', 'App móvil', 'App de la tienda para Android', '{catalog}', false, 70),
  ('sales_today', 'Ventas de hoy', 'Resumen de las ventas del día', '{orders}', false, 80),
  ('finance', 'Finanzas', 'Ingresos, costos y ganancias por moneda', '{orders}', false, 90),
  ('multi_warehouse', 'Multi-almacén', 'Stock en varios almacenes', '{catalog}', false, 100),
  ('multi_currency', 'Multimoneda', 'Vender en varias monedas con tasa propia', '{catalog}', false, 110),
  ('whatsapp_notifications', 'Avisos por WhatsApp', 'Avisos de pedidos desde el WhatsApp de la plataforma', '{orders}', false, 120),
  ('custom_domain', 'Dominio propio', 'Usar un dominio propio para la tienda', '{}', false, 130)
on conflict (code) do nothing;

insert into public.plans (code, name, price, currency, billing_interval, is_public, sort_order) values
  ('base', 'Base', 0, 'USD', 'month', true, 10),
  ('pro', 'Pro', 0, 'USD', 'month', true, 20)
on conflict (code) do nothing;

insert into public.plan_modules (plan_id, module_code)
select p.id, m.code
from public.plans p
cross join public.modules m
where (p.code = 'base' and m.code in (
        'catalog', 'orders', 'shipping', 'discounts', 'themes', 'excel_import', 'mobile_app', 'sales_today'))
   or p.code = 'pro'
on conflict do nothing;

-- Decision 20: Base plan has 2 staff users. Pro staff limit is still open (no row = unlimited).
insert into public.plan_limits (plan_id, key, value)
select p.id, 'max_staff', 2 from public.plans p where p.code = 'base'
on conflict do nothing;
