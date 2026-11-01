# Dónde quedamos (2026-11-01)

Supera a `2026-10-31-donde-quedamos.md`. `origin/main` en `9f2779a` (desplegado en Vercel); en local solo queda el commit
de esta actualización de memoria.

## Hecho hoy
- KSH0004 (plan Caja) y KSH0005 (ayuda) desplegados; el plan Caja ya es visible.
- Corte de dominio de klauShop: `klaushop.fullkod.com` sirve la tienda `klau`, con sus páginas y su pie
  (`2026-11-01-dominio-klaushop.md`).
- KSH0007: columnas del pie editables (`2026-11-01-ksh0007-menu-pie.md`).
- KSH0006: páginas legibles, botones y preguntas plegables, barra y vista previa (`2026-11-01-ksh0006-paginas.md`).
- KSH0006 y KSH0007 subidos y desplegados juntos con permiso de Roberto (`47d862b`).
- SKU automático al dejarlo vacío (`2026-11-01-sku-automatico.md`), subido por Roberto y desplegado.
- Landing afinada contra `fullkod.com/es/projects/kshop`: 12 funciones con su plan (Caja de mostrador, Excel y calculadora,
  moneda del cliente en Pro, ofertas y cupones, ayuda «?» y Kshop Admin, app y marca), aviso de la app «desde el plan Base»
  y cierre «te la dejamos lista». Pendiente de push.
- El estado de cada tarea se consulta en Tasknic (KSH0002–KSH0007); aquí solo van los códigos.

## Qué sigue
1. **Reloj del PC una hora adelantado**: los `e2e:*` largos dan 401 en local hasta sincronizar la hora de Windows; luego
   correr `pnpm e2e:catalog` entero (tiene los casos nuevos de SKU).
2. klauShop: `--delta` de pedidos y clientes desde el 2026-10-28 y `klaushop:verify` final; 8.6.
3. Lo que seguía del 31: Roberto prueba los APK en un Android (modo avión) y la web en un iPhone; inventario desde la caja
   (etapa 2 del POS) cuando lo pida; `credito-fullkod.md`.

## Para retomar
- Servidor de desarrollo: lo arrancó Claude en 3210 contra la base de prueba
  (`NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210 node ../../scripts/db-env.mjs npx next dev --port 3210` desde
  `apps/web`). `next dev` solo admite uno por carpeta.
- QA nuevos: `pnpm qa:menus` y `pnpm qa:pages` (con `QA_BASE_URL=http://localhost:3210`).
- WhatsApp: «Real» en producción, `dry_run` en prueba.
