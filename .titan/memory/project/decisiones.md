> Sembrado el 2026-10-24 desde `_materiales/kshop/01-decisiones.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Decisiones

## Tomadas (2026-10-24, Roberto)
0. **Nombre: Kshop** (definitivo; antes Fullshop). **Dominio: `kshop.fullkod.com`**, tiendas en
   `{slug}.kshop.fullkod.com`. Repo `Fullkod/kshop` (ya renombrado desde `fullshop`). Logo y
   marca se definen en esta carpeta (`brand/`) en paralelo a la implementación.
   **Primer paso del repo: Titan Factory lista para Claude Code y para Codex** (skills `tf-*`,
   subagentes, `tf-primer` en ambos, memoria compartida `.titan/`), como en klauShop — ver `09-arranque-repo.md`.
1. **Sitio completamente nuevo**, no convertir klauShop ni rehabilitar dcabellos.
2. **Catálogo con el modelo de Saleor/dcabellos**: tipos de producto, atributos, variantes con
   SKU/precio/stock propios, categorías, colecciones. Es lo que más interesa.
3. **Carritos y órdenes**: adaptar el flujo de klauShop (WhatsApp, reserva blanda, estados) pero
   con estructura de e-commerce grande (snapshots, eventos, pagos, fulfillment).
4. **Multimoneda a decisión del dueño de la tienda**: elige qué monedas usa; la **tasa de cambio
   la gestiona el admin de la tienda** (manual).
5. **Dominio de la plataforma: `kshop.fullkod.com`.** Tiendas en subdominio (`klaushop.kshop.fullkod.com`),
   alta lo más automática posible desde el superadmin.
6. **Usuarios finales: una cuenta por tienda, aislamiento total.** No se acepta contraseña compartida
   entre tiendas. Solo el superadmin accede a todas; crea la tienda y su usuario inicial (dueño).
7. **Lecturas con Supabase + pg_graphql**, seguridad con **RLS**. Prioridad: velocidad y peticiones ligeras.
8. **Cobro a tiendas por suscripción**, con trials variables y socios fundadores. **Pago manual al inicio.**
9. **App móvil nativa con Capacitor**: app por tienda + app de administración. Se diseña desde el día 1
   (ver `07-app-movil.md`).
10. **MVP incluye: descuentos y temas por tienda.** Traducciones: no por ahora. **B2B descartado**
    (fue una confusión); idea de **"gestores"** para después del MVP, por definir.
    Temas = tokens visuales + contenido dinámico estilo Saleor/apululu: colecciones (manuales o
    automáticas), marcas, secciones de home, banners, menús y páginas estáticas opcionales.
11. **Cuentas de cliente con email sintético por tienda** (aislamiento total). **Sin login con
    Google/OAuth** para clientes por ahora (no se quiere). Verificación y recuperación de contraseña
    las enviamos nosotros: WhatsApp (OpenWA) como canal principal y email como alternativa.
12. **Android: hay cuenta de Google Play** (a nombre de un familiar en Chile). **iOS: más adelante**,
    pero la arquitectura debe dejarlo posible sin rehacer nada.
13. **Entregas por tienda**: cada tienda define zonas, métodos (mensajería, recogida, a convenir) y precios.
14. **WhatsApp por tienda**: la compra se cierra al número de la tienda y los avisos van a los
    contactos que la tienda configure (ver `03` §12).
15. **Un solo WhatsApp de la plataforma** (OpenWA) para los avisos de todas las tiendas, **solo salida**
    (orden nueva, cambios de estado…); nunca se reciben respuestas. WhatsApp propio por tienda según
    plan: anotado para pensarlo luego.
16. **Módulos por plan desde el día 1** (ver `08-modulos-y-planes.md`): planes **Base** y **Pro**, y
    además **módulos sueltos con precio cada uno** sobre el Base. En el Base: descuentos/cupones y app
    móvil (enganchan), **límite de productos**, "ventas de hoy" gratis. En Pro/sueltos: Finanzas,
    multi-almacén, multimoneda, avisos WhatsApp, dominio propio.
17. **Monedas**: el **MLC ya no existe**; monedas típicas CUP, USD, EUR.
18. **Cada producto/variante tiene precio de costo y precio de venta** (el costo puede ir en otra moneda).
19. **Importar (y exportar) productos desde Excel** en el MVP (ver `03` §13) — aprobado tal cual.
20. Aprobado (2026-10-24): detalle de precios/costos (costo en otra moneda, costo privado, snapshot en la
    orden, overrides opcionales por moneda), multi-almacén (esquema siempre, funcionalidad en Pro/suelto),
    multimoneda en Pro, propuesta del módulo Finanzas. **Plan Base: 2 usuarios de staff.** El límite de
    productos se decide más adelante.

## Recomendaciones de Claude (pendientes de confirmar)
- Next (App Router) + Supabase + Tailwind/shadcn, deploy en Vercel (wildcard de subdominios).
  Reutilizar componentes y flujos de klauShop.
- Monorepo con paquetes compartidos (UI, core, data) para web y apps Capacitor.
- **Sin Server Actions para lógica de negocio**: API `/api/v1` con Bearer o funciones SQL (la app las necesita).
- Lecturas pg_graphql (+ funciones SQL para filtros). Escrituras críticas: servidor + transacción.
- `store_id` en todas las tablas de tienda + tests de RLS automatizados.
- Cuentas por tienda con **email sintético por tienda** en Supabase Auth (ver `04`).
- Stock por variante y por almacén (un almacén por defecto por tienda).
- Temas por **tokens** (colores, fuentes, logo, secciones de home), no código por tienda.

## Preguntas abiertas
- [ ] DNS: delegar la subzona `kshop.fullkod.com` a Vercel para el wildcard (ver 04).
- [ ] ¿Dominio propio por tienda (`klaushop.com`)? ¿En qué plan?
- [ ] Proveedor de email para la alternativa de recuperación (Resend u otro).
- [ ] ¿Checkout solo por WhatsApp o también pago online por tienda en el futuro?
- [ ] Límite de productos por plan, staff del Pro, y precios de planes y módulos sueltos (más adelante).
- [ ] "Gestores": definir la idea (post-MVP).
- [ ] Apps por tienda en Google Play: ¿todas bajo la cuenta de la plataforma o cada tienda con la suya? (ver riesgos en 07)
- [ ] iOS (cuando toque): cuenta de cada tienda vs app contenedor de la plataforma.
- [ ] Logo, paleta y capitalización del logotipo (Kshop / kshop / KShop).
