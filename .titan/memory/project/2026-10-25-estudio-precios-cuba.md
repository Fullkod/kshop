# Estudio de precios de Kshop para Cuba (2026-10-25)

Pedido por Roberto en la Fase 5: «me interesa que entren clientes antes que todo». Precios en USD, cobro en
efectivo y en persona al dueño del negocio (sin comprobantes). Editables luego en Superadmin › Planes.

## Contexto (octubre de 2026)
- Dólar informal ≈ 825–835 CUP (elTOQUE 23/10: 825; CiberCuba 25/10: 834); oficial 743. El peso se deprecia
  (~70 CUP en un mes), por eso cobrar en USD protege a Kshop.
- Las mipymes pagan a sus empleados «poco más de un dólar al día» (CiberCuba, 2026-10-25): 5 USD/mes ≈ 4 150 CUP
  ≈ 4–5 días de un empleado. Es un gasto pequeño para un negocio que vende online, grande para un cuentapropista.
- Competencia directa encontrada: **Plaza Cubana** (marketplace con tienda propia, pedidos por WhatsApp):
  Base 5 USD/mes (productos ilimitados, pedidos por formulario), Pro 10 USD/mes (botón de WhatsApp, cupones y
  promociones, avisos por WhatsApp, variantes y mayorista), Premium 15 USD/mes (visibilidad), módulo vertical
  (barbería) 8 USD/mes. VendeYa (app + marketplace) no publica precios. Yuppymarket suspendió Cuba.
- Lo que Kshop da y la competencia no: tienda con subdominio propio y SEO, temas, checkout por WhatsApp desde el
  Base, ofertas visibles (badge «-20 %» y precio tachado) desde el Base, Excel, app móvil por tienda, y en Pro
  multimoneda, multi-almacén, finanzas y dominio propio.

## Propuesta (aplicada como valores iniciales)
| Plan | USD/mes | Anual (2 meses gratis) | Límites |
|------|---------|------------------------|---------|
| Base | **5** | 50 | 300 productos, 2 de equipo |
| Pro  | **12** | 120 | sin límite de productos, 10 de equipo |

Módulos sueltos sobre el Base (USD/mes): Cupones 2 · Avisos por WhatsApp 3 · Multimoneda 3 · Multi-almacén 3 ·
Finanzas 3 · Dominio propio 3 (más el coste del dominio). Tres sueltos ya superan la diferencia con el Pro (7):
el Pro se vende solo.

Captación (lo que más pesa para Roberto):
- **Precio de entrada igual al más barato del mercado** (5 USD) pero con más valor que su Base.
- **Prueba de 30 días con el Pro completo**: el dueño se acostumbra a lo bueno y luego elige plan.
- **Socios fundadores** (primeras ~20 tiendas): precio congelado de por vida (grant `price_lock`) y badge.
- Apariencia (tema, portada, banners, menús, páginas) **no** está en el Base: la configura Kshop (Roberto); Pro sí.
- Ofertas visibles en el Base (Roberto: «si se ve que un producto tiene descuento al cliente le da por
  comprarlo»); cupones y descuento manual quedan para el Pro o como suelto.

Fuentes: plazacubana.com/vendedor; eltoque.com/tasas-de-cambio-cuba; cibercuba.com (25/10/2026, mipymes y tasa).
