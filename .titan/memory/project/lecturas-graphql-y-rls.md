> Sembrado el 2026-10-24 desde `_materiales/kshop/05-lecturas-graphql-y-rls.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Lecturas: pg_graphql vs Drizzle, y seguridad con RLS (opinión Claude, 2026-10-24)

> **Superado en parte (R11, 2026-10-28):** las lecturas ya no usan pg_graphql: admin por `public.admin_*` y tienda por
> `public.sf_<operación>(p_vars)` (funciones SQL `security invoker` por PostgREST), y la extensión se quitó de
> producción. Los documentos GraphQL quedan solo como forma y tipos. Ver `2026-10-28-diagnostico-rendimiento.md` y
> `AGENTS.md` (Stack › Lecturas). Las reglas de RLS de abajo siguen vigentes.

## Resumen
De acuerdo con usar **Supabase + pg_graphql para las lecturas**. No es más lento que Drizzle; lo que
de verdad da velocidad es otra cosa (abajo). Pero **no** lo usaría para todo:

| Operación | Herramienta | Por qué |
|-----------|-------------|---------|
| Catálogo, categorías, ficha de producto, pedidos del cliente, listados del admin | **pg_graphql** (urql) | Una sola petición con datos anidados, pide solo los campos que usa, tipos generados con codegen. Ya lo dominamos en klauShop |
| Búsqueda y filtros facetados (talla, color, rango de precio) | **Función SQL** (expuesta por pg_graphql o RPC) | Con atributos de Saleor, filtrar por varios valores es incómodo en pg_graphql; una función con índices es más rápida y simple |
| Checkout, marcar pagada, cancelar, reembolsar, ajustar stock, crear tienda | **Servidor + transacción** (Drizzle o función SQL) | Necesitan `for update`, varias tablas a la vez y validar precios/stock en servidor; nunca desde el cliente |

Drizzle aportaría sobre todo: esquema y migraciones en TypeScript (como klauShop) y transacciones cómodas.
No hace las lecturas más rápidas. Se puede quedar solo como fuente del esquema + escrituras.

## Qué da velocidad de verdad
1. **Server Components + caché por tienda** (`revalidateTag('store:{id}:catalog')` al editar productos).
   El catálogo cambia poco: la mayoría de visitas no deberían tocar la BD.
2. Columnas desnormalizadas para listados (`min_price`, imagen principal, `in_stock`) — evitar joins
   grandes en la grilla.
3. Índices compuestos empezando por `store_id` (`(store_id, status, published_at)`, `(store_id, slug)`).
4. Imágenes optimizadas (tamaños fijos, webp) — en Cuba la red pesa más que la BD.
5. Región de Supabase y Vercel iguales (us-east), como klauShop.

## RLS: funciona, con estas reglas
- **Datos públicos de catálogo** (productos publicados, categorías…): política `select` pública
  `using (status = 'published')`. No son secretos; el `store_id` lo filtra la query. Que una tienda pueda
  "ver" el catálogo público de otra vía API no es una fuga.
- **Datos privados** (órdenes, clientes, carritos, pagos, config): política por pertenencia:
  - staff: `store_id in (select private.my_store_ids())`
  - cliente: `customer_id in (select id from customers where user_id = auth.uid())`
  - superadmin: `(select private.is_superadmin())`
- Funciones helper `security definer` en schema `private`, envueltas en `(select …)` para que Postgres
  las evalúe una vez por query (clave de rendimiento en RLS) + índices en las columnas de las políticas.
- **Escrituras críticas fuera de RLS**: servidor con service role + validación Zod + comprobación explícita
  de rol/tienda (patrón `requireAdmin` de klauShop → `requireStoreRole(storeId, 'admin')`).
- **Tests de RLS desde el día 1**: script que crea dos tiendas y comprueba que un usuario de A no lee
  ni escribe nada de B (órdenes, clientes, carritos, storage). En multi-tenant un fallo de RLS = fuga entre clientes.
- Ojo pg_graphql: expone todas las tablas del schema `public` con RLS aplicado. Tablas internas
  (config, suscripciones) en otro schema o con RLS sin políticas + `revoke` (como `private_config` de klauShop).
