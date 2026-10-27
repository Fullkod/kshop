# 04 · Admin web y APK Kshop Admin

Prototipos: `referencias/Admin Biblioteca.dc.html` (A1 Inicio, A2 Apariencia, A3 APK) y `referencias/AdminSidebar.dc.html`.
**El admin usa siempre la marca Kshop.** No aplica el tema de la tienda, salvo dentro de la vista previa de Apariencia.

## Paleta y medidas del admin
| Token | Valor |
|---|---|
| Barra lateral y cabecera de la APK | `--night #24104F` |
| Activo, botón principal | `#5B21B6` (hover `#4C1D95`) |
| Detalles, contadores, PRO | `--gold #F2B705` sobre night: texto `#24104F` |
| Fondo de contenido | `#F7F5FC` |
| Tarjeta | `#FFFFFF`, `border #E6E1F2`, `rounded-[14px]` |
| Texto / secundario | `#17132A` / `#625C7A` |
| Texto en la barra lateral | reposo `#D9D3EA` · títulos de grupo `#9C93B8` · email `#C8C0DA` |
| Notificación | punto de 8 `#C42350` con anillo blanco de 2 |
| Radios | controles 9–10 · botones 10–12 · tarjetas 14 · fichas de la APK 14 · FAB 18 |
En modo oscuro del sistema siguen valiendo las variables oscuras de `:root` (`packages/ui/src/styles.css`). La barra lateral pasa a `--ink #0B0618`.

## AdminShell web (`AdminShell.tsx`)
`flex min-h-dvh`. Aside de **248 px** `bg-night text-white p-[16px_12px] flex-col gap-1.5`:
1. **Selector de tienda:** cuadrado de 36 `bg-gold text-night` con la inicial (800 17px Outfit), nombre 700 15px, «Dueño · Plan Pro» 11.5px y `chevrons-up-down` 16.
   Para el superadmin o el staff de varias tiendas, abre la lista.
2. **Grupos** (título 10.5px 700 uppercase tracking .1em `#9C93B8`, padding `6px 10px 4px`):
   - (sin título) Inicio
   - **Ventas:** Pedidos (contador gold) · Entregas · Clientes · Descuentos · Avisos WhatsApp
   - **Catálogo:** Productos · Importar Excel · Almacenes · Monedas
   - **Tienda:** Apariencia · Dominio propio · App móvil
   - **Negocio:** Ventas de hoy · Finanzas · Plan y facturación (y Equipo)
   Añadir `group` a cada módulo en `features/registry`. El orden de cada grupo sale del registro.
3. **Ítem:** alto 36, `px-2.5 rounded-[9px] gap-2.5`, icono 17 y 13.5px. Activo: `bg-[#5B21B6] text-white font-semibold`. Hover: `bg-white/8`.
   Bloqueado: badge `PRO` (candado 10, `bg-gold/16 text-gold` 700 10px) y enlace a `/admin/billing` con el `title` de precio actual.
4. **Pie:** tarjeta de usuario `bg-white/6 rounded-xl p-[12px_10px]`, avatar de 32 `bg-[#5B21B6]`, nombre y email, y `log-out` 16 (cerrar sesión).

**Topbar** (nueva) de alto 64, `bg-white border-b px-7 gap-3`: búsqueda global (máx. 420, alto 40, `bg-surface`, atajo «Ctrl K» en mono 11),
«Ver tienda» outline con `external-link`, campana de 40 con punto y botón principal contextual («Nuevo pedido» en Inicio y Pedidos, «Nuevo producto» en Catálogo…).
`AccountBanner` (suspensión, prueba) queda justo debajo de la topbar.

## Inicio (`admin/page.tsx` + `SalesTodayCard.tsx`)
Contenido `p-7 gap-5`:
- Saludo: fecha 13px muted + «Buenos días, {nombre}» 700 28px Outfit. A la derecha, segmentado Hoy · 7 días · Mes (activo `bg-accent-soft text-primary`).
- **4 KPIs** (`grid-cols-4 gap-3.5`), tarjeta `p-[18px] rounded-[14px] gap-2.5`: etiqueta 13px + icono 17, valor 800 28px Outfit y variación 12.5px 600.
  El primero («Vendido hoy») va **relleno** `bg-[#5B21B6] text-white` con variación en gold. El resto en blanco: Cobrado (variación en verde) · Por cobrar (`#8A5A00`) · Pedidos hoy.
- **Ventas de la semana** (`1.7fr`): barras de 150 px de alto, hueco 14, `rounded-[8px_8px_4px_4px]`. Hoy en `#5B21B6` y el resto en `#E3DAF6`, con valor 11px encima y día 12px debajo.
  Se puede usar `packages/ui/src/charts.tsx`.
- **Por hacer** (`1fr`): filas `p-3 rounded-xl` con fondo suave según tipo: por confirmar `#FFF3D6`/`#8A5A00`, entregas `#EFE9F8`/`#5B21B6`,
  poco stock `#FBE6E7`/`#A3262E`. Icono en caja blanca de 36 y chevron.
- **Últimos pedidos:** tabla con columnas `90px 1.4fr 1fr 120px 130px 110px 40px` (Pedido mono violeta · Cliente con avatar de 30 + nº de productos ·
  Entrega · Total 700 Outfit · Estado en píldora con punto · Hora · WhatsApp). Cabecera `bg-surface` 11.5px uppercase.
  Estados: Por confirmar `#FFF3D6/#8A5A00` · En camino `#EFE9F8/#5B21B6` · Entregado `#E3F4EA/#1F7A4D` · Cancelado `#FBE6E7/#A3262E`.
- La tarjeta «Tu plan incluye» actual pasa a **Plan y facturación**; en Inicio no aparece.

## Apariencia › Tema (`ThemeEditor.tsx`)
Cabecera blanca con título 700 26px + «Ver la tienda», y pestañas subrayadas (Tema · Portada · Banners · Menús · Páginas; activa 700 `#5B21B6` con barra inferior de 2px).
Cuerpo `grid-cols-[440px_1fr] gap-5`:
- **Estilo de partida:** rejilla de 3 columnas con 6 tarjetas. Arriba, franja de 38 px con el acento del preset y dos puntos (secondary e ink); abajo, el nombre (600 12.5px).
  Seleccionada: anillo `#5B21B6` de 2px. Al cambiar de preset se borran los overrides.
- **Colores:** «Restablecer» a la derecha. Tres grupos (Marca, Superficies, Texto; ver `THEME_COLOR_FIELDS`). Cada color en rejilla de 2 columnas:
  `<input type="color">` de 30×30, nombre 600 12.5px y hex en mono 10.5px.
- **Letra y forma:** selects de Títulos y Texto + 4 segmentados (`bg-[#F3F0F9] p-[3px] rounded-[9px]`, activo blanco con sombra):
  Esquinas (Rectas, Suaves, Medias, Redondas, Píldora) · Botones (Como esquinas, Píldora) · Sombras (Planas, Suaves, Marcadas) · Títulos (Normal, MAYÚSCULAS).
- **Vista previa** (derecha): conmutador Web/Móvil y lienzo rayado. Dentro va una mini tienda **real** con `themeStyle()` aplicado a su contenedor:
  barra de anuncio, cabecera, hero, «Novedades» y 3 ProductCard (2 en móvil, ancho 340) y pie. Usar los componentes de verdad de `@kshop/storefront`, no una maqueta.
- **Pie:** estado de contraste («Contraste correcto en todas las parejas» en verde, o la lista de `themeContrastIssues` en rojo), «Descartar» y «Guardar tema».
  El contraste **avisa pero no bloquea**, igual que ahora.

## APK Kshop Admin (`apps/admin-app`, mismo código con layout < 720)
Pestañas inferiores (como la BottomTabBar de la tienda, en colores de marca): **Inicio** · **Pedidos** (badge `#C42350`) · **Productos** · **Ventas** · **Más**.
Píldora activa `#EFE9F8` con icono y texto `#5B21B6`.
| Pestaña | Contiene (módulos web) |
|---|---|
| Inicio | Inicio + Ventas de hoy |
| Pedidos | Pedidos, Entregas, Clientes |
| Productos | Catálogo, Importar Excel, Almacenes |
| Ventas | Finanzas, Descuentos, Monedas |
| Más | Apariencia, Avisos WhatsApp, App móvil, Dominio, Equipo, Plan (lista con iconos; PRO con candado) |

**Inicio APK:**
- Cabecera night con padding `18px 18px 64px`: tienda + fecha y campana de 44 `bg-white/8`.
- «Vendido hoy» 800 34px, con variación en `#6FD39C`.
- 2 tarjetas flotantes (`-mt-12`, blancas, sombra) con Cobrado y Por cobrar.
- «Por hacer» en filas de 56 de alto, y Accesos rápidos en 4 columnas (Pedido, Producto, Cupón, Compartir tienda).

**Pedidos APK:**
- Cabecera blanca: título 700 24px, botón de filtros de 44, búsqueda de 44 y chips de filtro de 34. El activo es `bg-night text-white`, con contador gold.
- Las tarjetas sustituyen a la tabla (`p-3.5 rounded-[14px] border`): avatar de 36 + nombre + «#1046 · 10:24» en mono, total 700 16px,
  estado + resumen + botón WhatsApp de 36 (`border #D7F0E0 text #1FA855`).
- FAB de 58 `rounded-[18px] bg-[#5B21B6]` con `+`, a 18/92 px de la esquina (por encima de las pestañas).

Las pantallas de «sin conexión», «sin módulo» y «app pedida» de la Fase 7 siguen igual, con los componentes v2.
