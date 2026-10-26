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

## Tomadas (2026-10-25, Roberto)
21. **Fase 1 (catálogo)**: PRP aprobado tal cual (D1–D13). Límite de productos del plan Base = **300**
    (provisional); Pro sin límite. Tienda de pruebas permanente «Tienda Demo» (ver `tienda-demo.md`).
    «Cierra la fase 1»: se hicieron también las imágenes por URL del Excel y la prueba de 1 000 filas.
22. **Fase 2 (tienda pública)**: PRP aprobado con estos cambios:
    - **Código y URLs en inglés**; solo el texto que ve el usuario va en español
      (`/products`, `/category/x`, `/product/x`, `/search`, `/page/x`, `?page=2&sort=price-asc`).
    - **Cache Components** de Next 16 activado (también afecta al admin).
    - Botón **«Pedir por WhatsApp»** en la ficha ya, aunque todavía no se puede probar de punta a punta.
    - Rendimiento: **«mientras más, mejor»** (los umbrales del PRP son el mínimo).
23. **Fase 3 (clientes y compra)**: PRP aprobado: cliente entra con **teléfono** + contraseña, **sin verificar
    el teléfono**; se compra **sin cuenta** (invitado); reservas **sin caducidad** (aviso > 48 h); **«Nuevo
    pedido» desde el admin entra en la Fase 3**. Aún no hay instancia de OpenWA → el staff ve el código de
    recuperación y lo manda por `wa.me`.
24. **Fase 4 (avisos y descuentos)**: PRP aprobado. Avisos de pedidos solo con el módulo
    `whatsapp_notifications`; el código de recuperación por WhatsApp para **todas** las tiendas. OpenWA: la
    **misma instancia de klauShop con otra sesión y otro número**. El cupón cuenta su uso **al crear** la orden
    (se libera al cancelar). «Nuevo pedido» del admin admite **descuento manual libre**. Los avisos al cliente
    llevan enlace: si la orden es de una cuenta → su pedido en el perfil (`/account/orders/{id}`); si es de
    invitado o del admin sin cuenta → página pública por token. Casilla «Recibir avisos por WhatsApp» en el
    checkout, marcada por defecto.
25. **Fase 5 (suscripciones y módulos)**: precios en **USD siempre**, cobro **en persona y en efectivo, sin
    comprobantes**; sin prorrateo; equipo en esta fase; avisos de cobro al WhatsApp de la tienda y número de soporte
    configurable; dominio propio vendible ya (configurado a mano). Precios del estudio
    `2026-10-25-estudio-precios-cuba.md` («que entren clientes antes que todo»): Base 5, Pro 12.
    **Base sin cupones**: en Base solo las **ofertas visibles** (badge «-20 %» y precio tachado, «eso gana
    mercado»); cupones y descuento manual = módulo `vouchers` (Pro o suelto).
    **Apariencia (tema, portada, banners, menús, páginas) la configura la plataforma**: fuera del Base («para que
    necesiten del admin y no tengan tanta libertad ni responsabilidad»), incluida en Pro, no se vende suelta (el
    superadmin puede regalarla a una tienda) y el **superadmin siempre puede editarla en cualquier tienda**.

## Recomendaciones de Claude (confirmadas en la Fase 0b, ver `AGENTS.md`)
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
- [x] DNS: `kshop.fullkod.com` y `*.kshop.fullkod.com` funcionan en Vercel (Roberto, 2026-10-26: configurado y probado).
- [x] Dominio propio por tienda: módulo `custom_domain` (Pro o suelto); lo pide el dueño y la tienda paga su dominio (Fase 6).
- [ ] Proveedor de email para la alternativa de recuperación (Resend u otro).
- [ ] ¿Checkout solo por WhatsApp o también pago online por tienda en el futuro?
- [ ] Límite de productos por plan, staff del Pro, y precios de planes y módulos sueltos (más adelante).
- [ ] "Gestores": definir la idea (post-MVP).
- [ ] Apps por tienda en Google Play: ¿todas bajo la cuenta de la plataforma o cada tienda con la suya? (ver riesgos en 07)
- [ ] iOS (cuando toque): cuenta de cada tienda vs app contenedor de la plataforma.
- [ ] Logo, paleta y capitalización del logotipo (Kshop / kshop / KShop).
- [ ] Permiso para desplegar en Vercel y medir Lighthouse de la tienda pública (Fase 2).
- [x] Remoto de GitHub: `origin` no devolvía ramas; resuelto el 2026-10-25 (Roberto hizo push de `main`).
- [x] Vercel: primer deploy en `kshop-silk.vercel.app` (2026-10-25, cuenta Hobby de Claudia). La web da 404
  porque ese host no es ni la plataforma ni una tienda; resuelto con `kshop.fullkod.com` + `*.kshop.fullkod.com` (2026-10-26).
- [ ] Vercel: la cuenta es Hobby (no comercial, dominios limitados); pasar a Pro o a una cuenta de Fullkod antes de vender dominios propios.
