# Guías en PDF para los clientes, por plan

Date: 2026-11-08

Fuente: pedido de Roberto del 2026-11-08. Pasos y botones sacados de `packages/admin/src/help/content/articles.ts` y del
código (`AdminShell`, `apps/admin-app/src/App.tsx`, `PosPage`, rutas de `/api/v1` para los permisos).

## Qué hay
Seis PDF en `C:\Local-Disc-D\Project\Fullkod\_materiales\kshop\guias\` (fuera del repo, sin git):
`caja/`, `base/` y `pro/`, cada uno con `kshop-<plan>-app.pdf` (Kshop Admin, A5, 11–12 págs.) y `kshop-<plan>-web.pdf`
(panel web, A4, 13–19 págs.). Lenguaje sencillo, para el dueño y los empleados.

## Cómo se cambian
Dos fuentes en `guias/_fuente/`: `app.html` y `web.html`, con `estilo.css`. Un elemento con `data-plans="caja base pro"`
solo sale en esos planes; `{{PLAN}}`, `{{EQUIPO}}` y `{{PRODUCTOS}}` los rellena `build.cjs` (los límites están ahí).
Se regeneran con `node build.cjs [plan…]`, que usa el `playwright-core` del repo y avisa si una página se desborda.

## Mantenimiento
- **No entran en la regla de `help:shots` / `help:pdf`:** si cambia la interfaz o un plan, hay que tocar la fuente y
  regenerar a mano. El número de soporte (+1 575 263 9686, `support_whatsapp`) también está escrito en las fuentes.

## Límites conocidos
- Las capturas son de la ayuda, de la Tienda Demo (Pro, ropa), recortadas sin el menú. La de la caja en el teléfono es
  anterior a la pestaña «Cierres». Falta rehacerlas con productos de mercado, con la web sin uso (regla de la Nano).
- El menú de cada plan está dibujado a partir del código; no se comprobó en una tienda real de cada plan.
