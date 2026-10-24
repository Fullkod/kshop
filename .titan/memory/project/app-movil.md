> Sembrado el 2026-10-24 desde `_materiales/kshop/07-app-movil.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# App móvil (Capacitor) — requisito desde el inicio

> 2026-10-24, Roberto: "muy muy importante lograr en algún momento" apps nativas con Capacitor,
> idealmente **una por tienda** y otra de **administración general**. Se decide la arquitectura
> desde el día 1 para no reescribir después.

## Apps previstas
| App | Para quién | Contenido |
|-----|-----------|-----------|
| App de tienda (marca blanca) | Clientes de una tienda | Catálogo, carrito, pedidos, cuenta. Nombre, icono, splash y colores de la tienda |
| App de administración | Dueños/staff (y superadmin) | Una sola app; al entrar elige la tienda a la que pertenece. Pedidos, productos, stock, avisos push |

## Qué condiciona del código web (reglas desde el día 1)
Capacitor empaqueta un bundle estático (HTML/JS) dentro de la app. Eso **no ejecuta** Server Components,
Server Actions ni middleware de Next. Por tanto:
1. **Nada de lógica de negocio en Server Actions.** Toda mutación va por una API (`/api/v1/...` con
   `Authorization: Bearer <token de Supabase>`) o por funciones SQL (RPC). La web usa la misma API.
2. **Auth por token, no solo cookies.** El cliente Supabase en la app guarda la sesión en storage nativo
   (Capacitor Preferences / Secure Storage).
3. **Lecturas por pg_graphql desde el cliente** → funcionan igual en web y app (otro punto a favor de pg_graphql).
4. **La tienda no se resuelve por host en la app**: el `store_id` va en la configuración del build.
5. **Código compartido sin dependencias de `next/*`**: UI, hooks de datos, queries GraphQL, Zod, dinero,
   lógica de carrito en paquetes comunes.

## Estructura propuesta (monorepo)
```
apps/
  web/            Next.js — tienda pública (SSR/SEO), panel admin web, superadmin, API /api/v1
  store-app/      Vite + React + Capacitor — app de tienda (un build por tienda)
  admin-app/      Vite + React + Capacitor — app de administración (un solo build)
packages/
  ui/             Componentes (shadcn/Tailwind), temas por tokens
  core/           Tipos, Zod, dinero/monedas, carrito, estados de orden
  data/           Cliente Supabase, documentos GraphQL + codegen, llamadas a la API
supabase/         Esquema, migraciones, RLS, funciones, tests de RLS
```
Alternativa más simple al inicio: solo `apps/web` + `packages/*`, y las apps se añaden después; lo
importante es respetar las reglas 1–5 desde el primer commit.

## Apps por tienda: automatización
- El superadmin pulsa "Generar app" → se crea una config (appId `com.fullkod.kshop.klaushop`, nombre,
  icono, splash, colores del tema, `store_id`, URL de la API) → GitHub Actions compila el APK/AAB firmado
  y lo deja descargable en el panel.
- Actualizaciones de contenido: no requieren nueva versión (los datos vienen de la API). Actualizaciones de
  código web: opcional live update (Capgo / Appflow) para no recompilar cada tienda.

## Distribución (actualizado 2026-10-24)
- **Publicar en Google Play: resuelto** — hay una cuenta de desarrollador a nombre de un familiar en Chile.
- **Descargar desde Cuba sigue siendo un problema**: Google Play no está disponible para usuarios en Cuba.
  Para los clientes cubanos hay que ofrecer igualmente **APK directo** (desde la web de la tienda) y
  **Apklis**. El mismo build sirve para los tres canales.
- **iOS: más adelante.** Capacitor genera el proyecto iOS desde el mismo código; con las reglas 1–5
  no habrá que rehacer nada, solo cuenta de Apple, firma y revisión.

## Riesgos que hay que asumir desde ya
- **Google Play, muchas apps casi iguales en una cuenta**: la política de spam/contenido repetitivo y la
  de apps que solo envuelven una web pueden rechazar o suspender la cuenta. Mitigación: que cada app tenga
  contenido y funciones nativas reales (push, cámara, offline), fichas distintas por tienda, y valorar que
  las tiendas grandes publiquen en su propia cuenta. Una suspensión afectaría a **todas** las apps de esa
  cuenta (y es la cuenta de un familiar): decidir antes de publicar muchas.
- **Apple, guideline 4.2.6**: rechaza apps "generadas desde plantilla" publicadas por la plataforma en
  nombre de muchos negocios; cada app de tienda tendría que publicarse en la cuenta de desarrollador de
  esa tienda. Alternativa: una app "contenedor" de la plataforma con todas las tiendas.
- **Apple 4.2 (funcionalidad mínima)**: una web envuelta sin nada nativo se rechaza → push, cámara
  (comprobante de pago, fotos de producto en admin), compartir, offline básico.
- **Push en Android**: FCM depende de Google Play Services; verificar funcionamiento en Cuba. Plan B:
  avisos por WhatsApp (ya existe) y polling al abrir la app.
