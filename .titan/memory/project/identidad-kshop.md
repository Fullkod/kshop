> Sembrado el 2026-10-24 desde `_materiales/kshop/README.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Kshop — SaaS de tiendas online de Fullkod

> Memoria inicial del proyecto. Las decisiones se toman aquí (Roberto + Claude) y el repo las implementa.
> Iniciado: 2026-10-24, a partir del estudio klauShop vs dcabellos.

## Identidad
| | |
|---|---|
| Nombre | **Kshop** (decidido 2026-10-24) |
| Escritura | `Kshop` en texto; `kshop` en código, paquetes, repo y subdominios. Capitalización final del logotipo: se define con el logo |
| Empresa | Fullkod |
| Repo | `C:\Local-Disc-D\Project\Fullkod\kshop` → `github.com/Fullkod/kshop` (ya renombrado desde `fullshop`; vacío, sin commits a 2026-10-24) |
| Dominio | **`kshop.fullkod.com`** (plataforma) y `{slug}.kshop.fullkod.com` (tiendas) — decidido 2026-10-24 |
| Nombres anteriores | FullkodShop → Fullshop → **Kshop** (definitivo, 2026-10-24) |
| Logo / marca | Pendiente: se trabaja aquí, en `brand/`, mientras avanza la implementación |

## Qué es
Plataforma multi-tienda: cada tienda tiene su subdominio (o dominio propio), su catálogo, sus
clientes, sus monedas y su panel de admin. Un **superadmin** crea tiendas y cobra suscripciones.
klauShop será la tienda nº 1 (migración de datos), sin tocar su producción hasta entonces.

## Ficheros
| Fichero | Contenido |
|---------|-----------|
| [01-decisiones.md](decisiones.md) | Decisiones tomadas, recomendaciones y preguntas abiertas |
| [02-estudio-klaushop-vs-dcabellos.md](2026-10-24-estudio-klaushop-vs-dcabellos.md) | Por qué sitio nuevo; qué se reutiliza de cada uno |
| [03-modelo-de-datos.md](modelo-de-datos.md) | Esquema: plataforma, catálogo (Saleor), precios/costos, carritos, órdenes, monedas, entregas, WhatsApp, Excel |
| [04-tenancy-dominios-auth.md](tenancy-dominios-auth.md) | Subdominios, dominios propios, cuentas por tienda (email sintético), superadmin |
| [05-lecturas-graphql-y-rls.md](lecturas-graphql-y-rls.md) | pg_graphql vs Drizzle, rendimiento y seguridad |
| [06-suscripciones.md](suscripciones.md) | Planes, trials variables, socios fundadores (cobro manual al inicio) |
| [07-app-movil.md](app-movil.md) | Apps Capacitor por tienda + admin; reglas de arquitectura desde el día 1 |
| [08-modulos-y-planes.md](modulos-y-planes.md) | Planes Base/Pro + módulos sueltos, multi-almacén, módulo Finanzas |
| [09-arranque-repo.md](../../plans/arranque-y-fases.md) | Cómo arranca el repo: convenciones, fases y qué hace el agente allí |

## Fuentes
- klauShop: `C:\Local-Disc-D\Project\Fullkod\klauShop` (Next 14 + Supabase, en producción)
- dcabellos: `C:\Local-Disc-D\Project\Fullkod\dcabellos` (Django 4.2, modelo heredado de Saleor; rama `develop`)
- apululu (storefront Saleor: menús, páginas, colecciones): `C:\Local-Disc-D\Project\DSmart_Company\src\apululu\storefront-clean`
- Saleor (referencia del modelo original): `C:\Local-Disc-D\Project\saleor`
