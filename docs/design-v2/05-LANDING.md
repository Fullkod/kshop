# 05 · Landing de la plataforma (`apps/web/src/app/(platform)/page.tsx`)

Prototipo: `referencias/Plataforma Landing.dc.html`. Marca Kshop fija y contenedor de 1200 de máximo, con padding lateral `clamp(16px,4cqw,40px)`.

1. **Hero** (`bg-night text-white`, overflow hidden). Lleva 2 círculos decorativos: violeta 520 px al 55 % arriba a la derecha y oro 380 px al 14 % abajo a la izquierda.
   - Cabecera: logo invertido (`kshop-horizontal-reversed.svg`, alto 34), enlaces Funciones · Temas · Precios · App (15px `#D9D3EA`), «Entrar»
     y el CTA «Crear mi tienda» (`bg-gold text-night` 700, alto 44). «Acceso Fullkod» pasa al pie.
   - Texto (`1 1 440px`):
     - Píldora «NUEVO · Tu propia app Android, incluida en el plan».
     - H1 800 `clamp(40px,5.4cqw,68px)`, con la palabra «WhatsApp» en gold. Es el mismo texto de hoy.
     - Subtítulo `#D9D3EA` máx. 520.
     - CTA «Prueba 30 días gratis →» (gold, alto 54) + «Ver una tienda de ejemplo» (outline blanco 25 %).
     - 3 garantías con `check` en `#6FD39C`.
   - Teléfono (`0 1 380px`): marco de 340×560 con la parte de abajo cortada y la tienda demo real dentro. Encima flotan dos tarjetas: «Nuevo pedido #1046» con icono WhatsApp
     y «Vendido hoy 5 100 CUP» en gold.
2. **Funciones:** eyebrow + H2 800 `clamp(30px,3.6cqw,46px)`. Rejilla `auto-fit minmax(300px,1fr)` de 6 tarjetas (`p-[26px] rounded-[20px]`, icono en caja de 48).
   La 1.ª va en violeta, la 5.ª en gold y el resto en `#F7F5FC`. Tarjetas: Dirección propia · Pedidos por WhatsApp · CUP, USD y MLC · Catálogo desde Excel · Tu app Android · Ofertas que venden.
3. **Temas:** caja `#F7F5FC rounded-[28px]`. A la izquierda, texto y 6 botones de preset (dos puntos accent/secondary + nombre). A la derecha, la portada real a escala 0,5
   con el preset elegido. Así se vende el sistema de temas.
4. **Pasos:** «En marcha en tres pasos», 3 tarjetas con borde y número 800 44px violeta.
5. **Precios:** Base 5 USD y Pro 12 USD «MÁS ELEGIDO» (fondo night, cifra en gold, CTA «Probar Pro 30 días»), con los textos de
   `.titan/memory/project/2026-10-25-estudio-precios-cuba.md`. Debajo, la nota de sueltos y socios fundadores. **Los precios deben leerse de la tabla de planes**, no ir escritos en el código.
6. **CTA final:** caja violeta `rounded-[28px]` con círculo gold, título y botón blanco «Hablar con Kshop» (WhatsApp de la plataforma).
7. **Pie:** logo, «© 2026 Fullkod · kshop.fullkod.com» y «Acceso Fullkod» (→ `/superadmin`).

Responsive: cada bloque usa `flex-wrap` / `auto-fit`; por debajo de 720 el teléfono va debajo del texto y las tarjetas se apilan.
