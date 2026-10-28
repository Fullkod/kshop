# Kshop: por qué el panel va lento y qué hacer sin pagar más base de datos

*Informe para Roberto, 28-10-2026. Todo se midió en modo solo lectura. Cada cifra lleva su fuente. Marco con **[hipótesis]** lo que no está medido.*

---

## 1. Resumen en 5 líneas

1. **El negocio no es demasiado grande para la base de datos.** Ocupa **67 MB** de los 500 MB del plan Free. Hay 2 tiendas, 321 productos, unas 860 variantes y 189 pedidos. El 99,99–100 % de las lecturas sale de memoria. Una lectura del admin con la caché caliente tarda **5–142 ms**.
2. **El tiempo no se va en los datos.** Se va en un **peaje fijo de pg_graphql**: unos **200 ms de CPU** cada vez que reconstruye su esquema, por cada conexión y rol. Sobre un **Nano con CPU "a créditos"**, ese peaje sube a 2–8 s y termina en el error **57014** (consulta cancelada a los 8 s). Las llamadas REST/RPC usan la misma CPU y casi nunca fallan: **1 fallo frente a 372–378 de GraphQL** en 24 h.
3. **Sobre todo es diseño y operación, no mala programación por todas partes.** Pesan tres cosas: desarrollo, tests, imports y builds en la misma base que producción; lecturas en cadena y sin red de seguridad en el admin; y comandos de cambio de esquema en producción que vacían la caché de pg_graphql.
4. **Hay además un bug puro de código.** Abrir directamente `/admin/login` o `/admin/set-password` en producción deja la página en «Cargando…» para siempre. El caso grave es `set-password`: los correos de invitación llevan ahí, así que los dueños nuevos y el personal invitado no pueden entrar.
5. **Lo que hace falta para que funcione cuesta $0.** Más adelante sí recomiendo pagar unos **$25–30/mes de Supabase (Pro)** antes de que klau tenga clientes reales, y **$20/mes de Vercel Pro**. El motivo principal son las copias de seguridad y el uso comercial, no la velocidad. Pagar no arregla ninguno de los problemas de código.

---

## 2. Qué está pasando, explicado simple

### Recorrido de una vista del admin hoy

```
Navegador ──► Vercel /api/v1/me ──► GoTrue (¿token válido?) ──► PostgREST (store_members)
        ◄──────────────────────────────────────────────────────────────┘
Navegador ──► pg_graphql "StoreEntitlements"   ← suele caer en una conexión "fría"
        ◄──┘
   (hasta aquí el panel solo muestra «Cargando…»; si falla 3 veces → «No se pudo cargar el panel»)
Navegador ──► campana: /api/v1/.../orders/summary ──► GoTrue ──► store_members ──► admin_home_summary
Navegador ──► lecturas propias de la página (pg_graphql), a veces 250 ms después o en cadena
```

Antes de que la página empiece a pedir sus propios datos hay **unos 5 viajes de red seguidos** y entre 3 y 7 accesos a Supabase. Cada viaje cuesta poco cuando el Nano está descansado y varios segundos cuando está ahogado.

### Dónde se pierde el tiempo

- **La consulta en sí casi no cuesta.** Lo más pesado del admin, la ficha de producto, tarda 66–142 ms en caliente. Los pedidos tardan 16–33 ms y el resumen de inicio 5–17 ms.
- **El peaje de pg_graphql es lo caro.** La primera consulta GraphQL en cada conexión, y para cada rol (anónimo o usuario), obliga a Postgres a reconstruir el esquema GraphQL entero. Eso son **~37 000 lecturas de memoria y ~190–270 ms de CPU**, incluso para la consulta vacía `{__typename}`. La segunda consulta tarda **1 ms**. Lo midieron 4 investigadores por separado, y la comprobación final dio anónimo 270 ms → 1 ms y usuario 190 ms → 1 ms.
- **La CPU del Nano funciona a ráfagas.** Gasta "créditos" cuando trabaja mucho y, cuando se le acaban, baja a un mínimo muy pequeño **[hipótesis: tipo AWS t4g.nano, ~5 % por núcleo; Supabase no publica la cifra]**. Con la CPU en ese mínimo, los 200 ms del peaje pasan a 2–2,4 s. Si una pantalla dispara varias lecturas sobre conexiones frías, o la consulta espera en la cola de PostgREST (10 conexiones), se superan los **8 s** y Postgres la cancela: **error 57014**. GraphQL devuelve entonces un 500 y la vista se queda en blanco o muestra un mensaje falso.

### Por qué fallan vistas (las cifras)

- **Fallos en 24 h** (logs de Supabase): **378–388 consultas canceladas (57014)**, todas de pg_graphql. En la misma CPU, REST/RPC solo tuvo **1** error 5xx.
- **Peor hora: 28-10 a las 01:00 UTC.** Fallaron **154 de 900** peticiones GraphQL. Hubo 160 errores 57014, el GraphQL del navegador tardó de media 6,3 s y pg_cron ni siquiera pudo arrancar sus tareas («job startup timeout»). Coincidió con dos cosas:
  - el import de klau, justo antes, desde tu máquina;
  - un build de Vercel que prerenderizaba páginas de tienda, que ya quedó corregido en `8bc17e7`.
- **Los fallos ocurren con poco tráfico, justo después de una ráfaga** (17–30 % de fallo con 219–1 666 peticiones/hora). Eso encaja con créditos de CPU agotados, no con un techo de capacidad.
- **En una hora tranquila sí carga todo.** Se abrieron 36 vistas del admin con **0 errores**, aunque cada una tardó **2,7–10,9 s** (mediana ~3,6 s). Funciona, pero lento.

---

## 3. Causas raíz

### C1. Desarrollo, tests, imports y builds comparten el Nano de producción

**Categoría:** infraestructura/operación. **Confianza:** media.

**Qué es.** La regla "dev = prod" hace que tu `pnpm dev`, los scripts e2e/qa, `test:rls`, codegen, los imports y los agentes trabajen sobre la misma base que la tienda real. Gastan los créditos de CPU y luego todo lo demás va estrangulado.

**Evidencia** (edge logs de Supabase, 24 h):
- Desde tu salida a internet (colo MIA, proveedores M247 / PV-SL-HOSTED, probablemente VPN) llegaron **~39 000 de ~42 000 peticiones**:
  - scripts/node: 34 139 (23 938 REST y 4 406 GraphQL);
  - tu navegador: 4 824.
- Producción desde Vercel (IAD) envió unas 3 079 peticiones. Clientes reales de Cuba (ETECSA): **3 peticiones**. Hoy casi no hay tráfico real.
- La media horaria de GraphQL sube a lo largo del día de trabajo: 455 → 606 → … → 2 512 ms.

**Correcciones a lo que se pensaba al principio:**
- La peor hora la provocaron sobre todo **el build de Vercel** (1 224 peticiones IAD, 104 errores 500) y **el import de klau** (874 + 906 peticiones), no el desarrollo en general.
- **Que el tráfico sea tuyo no prueba que también lo sea el gasto de CPU.** Las estadísticas no dicen de dónde viene cada consulta, y las consultas por Management API (`db:query`, MCP) ni siquiera aparecen en los logs.
- **Separar dev no devolverá todo a 200 ms.** A las 11:00 casi no había tráfico local y la media de GraphQL fue 904 ms. Las horas tranquilas van a 276–394 ms. El peaje en frío (C2) sigue ahí.

**Impacto:** alto. Es lo que convierte 200 ms en varios segundos y en errores 57014.

### C2. pg_graphql reconstruye su esquema por conexión, rol y versión

**Categoría:** arquitectura. **Confianza:** alta.

**Qué es.** Todas las lecturas del admin, y el SSR de la tienda, pasan por pg_graphql. Su caché vive dentro de cada conexión y es aparte para cada rol, así que el rol anónimo y el de usuario pagan el peaje cada uno.

**Evidencia** (`pg_stat_statements` desde el 25-10, ~81 h, 9 423 s de CPU registrada):

| Rol | Llamadas | Media | Bloques/llamada | % del tiempo de BD |
|---|---|---|---|---|
| anónimo | 9 277 | 472 ms | 7 260 | 46 % |
| usuario | 3 314 | 699 ms | 6 533 | 25 % |
| Total pg_graphql | | | | **~75 %** |

- Una lectura del admin en caliente usa 11–1 394 bloques; una reconstrucción usa ~37 000.
- Las tablas internas de Postgres que describen el esquema sumaron **~125 millones de lecturas de bloque**. La tabla de productos, la más leída del negocio, sumó 4,9 millones. Eso indica que la mayor parte del trabajo es describir el esquema, no leer datos.
- El esquema expuesto es grande: 73 tablas, 726 columnas, 137 claves foráneas y 75 funciones en `public`, más 139 funciones de `extensions` porque están en el search_path. La app usa **46 de las 72 colecciones**.

**Correcciones:**
- El "~80 % del trabajo es reconstrucción" es un **techo**, no una medida exacta: el periodo incluye lecturas anteriores a la mejora R10.
- PostgREST reinició su pool **17 veces** en 24 h, no 22, y ninguna en las últimas ~10 h. Son reinicios ligados a deploys o recargas, no "cierre de conexiones por inactividad". Ese cierre sigue siendo hipótesis.
- La tienda pública sufre menos de lo que parecía, porque sus páginas se cachean. **La víctima principal es el admin**: todas sus lecturas salen del navegador por pg_graphql.

**Impacto:** muy alto. Es el coste que la CPU estrangulada (C1) multiplica hasta pasar los 8 s.

### C3. Bug: `/admin/login` y `/admin/set-password` se quedan en «Cargando…»

**Categoría:** programación. **Confianza:** alta. **No toca la base de datos.**

**Qué es.**
- `AdminShell.tsx:38` define `PUBLIC_PATHS = ["/admin/login", "/admin/set-password"]`, y `:72` compara con `PUBLIC_PATHS.includes(pathname)`.
- En el servidor, tras reescribir el dominio, la ruta es `/s/demo/admin/login`. No coincide, así que el servidor pinta «Cargando…» (`:123-125`).
- El navegador ve otra ruta, no cuadra con lo que mandó el servidor, y React deja esa parte congelada sin dar ningún error.

**Evidencia:**
- Reproducido 4 veces en demo y klau, con una pestaña observada más de 10 minutos.
- La respuesta llega con `X-Matched-Path: /s/[storeSlug]/admin/login`, y el HTML solo contiene «Cargando…».
- `/admin/set-password` se comporta igual.
- Comprobación de control: entrar por `/admin` **sí funciona**, porque redirige en el navegador hasta un formulario que ya funciona.

**Impacto:**
- Crítico para las **invitaciones**: los correos de alta de tienda (`platform-stores.ts:121`) y de personal (`team.ts:75`) llevan a `set-password`, y desde ahí no hay manera de seguir.
- Para el login normal hay un rodeo: abrir `/admin`.
- Probablemente existe desde que se creó el layout del admin; `8bc17e7` no es lo que lo provocó.

### C4. El arranque del admin va en cascada, no tiene timeouts y falla "todo o nada"

**Categoría:** programación. **Confianza:** alta.

**Evidencia en el código:**
- **Arranque en serie.** `AdminShell.tsx:84-103` no muestra nada hasta que termina `loadAdminState` (`admin-context.ts:37-41`), que hace `me()` y **después** `StoreEntitlements`. Si falla, lo reintenta todo 3 veces (esperando 0,8, 1,6 y 2,4 s) y después **todo el panel** muestra «No se pudo cargar el panel».
- **Retraso artificial al cargar.** `ProductList.tsx:51/63` y `OrderList.tsx:148/151` esperan 250 ms antes de su primera lectura. Por eso esa lectura no entra en el lote y cada pantalla abre 2 conexiones (posiblemente frías).
- **Ficha de producto.** `ProductEditor.tsx:135` carga la estructura y **luego** el producto. Si falla el producto, se queda en «Cargando…» para siempre (`:141`, `:239`).
- **Detalle de pedido.** `OrderDetail.tsx:104-110` muestra un error de red como **«Pedido no encontrado»**.
- **Lotes.** `graphql-batch.ts:157-164`: un solo 500 hace fallar todas las consultas del lote. Con un error dentro de la respuesta, reenvía todas las consultas en paralelo, lo que duplica la carga en plena crisis.
- **Sin límite de espera.** Ni `createApiClient` ni `createGraphqlClient` tienen timeout, y desde Vercel se vieron peticiones de hasta 42 s.
- **App de admin.** `apps/admin-app/src/App.tsx:230-345` hace 4 fases en serie, llama dos veces a `me()` y no reintenta.

**Hallazgo nuevo de la verificación (importante):**
- `session.tsx:70-80` vuelve a crear los clientes `api` y `graphql` cada vez que cambia el objeto de sesión.
- Supabase emite eventos al volver a la pestaña y al renovar el token (cada ~1 h), y cada evento crea clientes nuevos. Con ellos se relanzan el arranque completo y todas las lecturas de la página, **sin cancelar las anteriores**.
- Si esos reintentos fallan, un panel que ya funcionaba **cambia a «No se pudo cargar el panel»**.

**Medido:** inicio atascado una vez y luego 16,5 s (resumen 9,4 s, lote 7,5 s, StoreEntitlements 5,7 s). StoreEntitlements fue la lectura más lenta en **15 de 36 vistas** (0,4–5,9 s).

**Impacto:** alto. Es la razón, del lado del código, de que "muchas vistas no cargan".

### C5. Los tests y el DDL en producción vacían la caché de pg_graphql de todos

**Categoría:** operación. **Confianza:** alta.

**Qué es.**
- Cualquier cambio de esquema (DDL), aunque vaya dentro de una transacción que se deshace, sube el contador `graphql.seq_schema_version`. Al subir, **todas** las conexiones tienen que reconstruir el esquema la próxima vez.
- `supabase/tests/_harness.sql:5,10` crea tablas temporales y funciones en cada uno de los 13 ficheros de test. Eso da **~190 subidas por cada `pnpm test:rls`**. Lo que importa es que cada ejecución provoca un episodio de invalidación (un "vaciado" general), no 190.

**Evidencia:**
- **718** ejecuciones del harness en ~81 h, unas **55 ejecuciones de test:rls** (~0,7 por hora).
- `db:graphql-schema` se ejecutó 35 veces.
- Cuando nadie hace DDL, el contador se queda quieto: subió 1 vez en 48 minutos.
- Aviso: la propia verificación subió el contador una vez (15 756 → 15 757). No se tocó ningún dato.

**Correcciones:**
- Las 25 recargas de esquema de PostgREST vienen de migraciones y DDL confirmados, no de los tests.
- Solo afecta mientras alguien trabaja. Amplifica C1/C2, pero no explica fallos en reposo.

### C6. Lecturas repetidas: la campana, Realtime y la falta de caché

**Categoría:** programación. **Confianza:** alta (impacto medio).

**Evidencia:**
- **La campana.** `AdminShell.tsx:105-121` ejecuta el resumen completo `admin_home_summary` (838 llamadas, media 260 ms, máx. 5,5 s) **en cada cambio de página** y en cada señal de Realtime, solo para leer un número. En Inicio coincide con el propio Home, así que el resumen se ejecuta 2 veces.
- **Sin caché.** urql funciona con `noCache: true`: la estructura del catálogo se pide unas 3 veces al ir catálogo → producto → volver.
- **Realtime.** El disparador `20261106100100_realtime_signals.sql` avisa también por `notification_log`, y `realtime.ts` tira la información de qué tabla cambió, así que nadie puede filtrar.

**Correcciones:**
- Ya existe un agrupado de 400 ms y el despachador en reposo no emite señales. No hay "tormentas", sino ~3–4 rondas de lecturas por pedido.
- El arreglo correcto para los clientes es atarlos al `user.id`, **no** al `access_token`, porque el token cambia en cada renovación.

**Impacto:** medio. Multiplica llamadas y alimenta las ráfagas.

### C7. Cada llamada a `/api/v1` hace 3–4 viajes en serie antes de trabajar

**Categoría:** programación. **Confianza:** alta (impacto medio).

**Evidencia:**
- En cada llamada se hacen, uno detrás de otro:
  1. `auth.ts:23`: `getUser`, un viaje a GoTrue;
  2. `auth.ts:42-63`: consulta a `store_members`;
  3. en escrituras, `store-writable.ts:17`: consulta a `stores`;
  4. `requireModule`, con una caché que solo vive en memoria de cada instancia.
- El proyecto ya firma con ES256, así que el token **se puede verificar localmente** con `getClaims()` sin llamar a GoTrue.

**Medido desde producción** (IAD, 24 h, mediana / p95):

| Paso | Mediana | p95 |
|---|---|---|
| getUser | 102 ms | 2,0 s |
| store_members | 154 ms | 3,6 s |
| entitlements | 144 ms | 2,4 s |

En la base de datos esas consultas cuestan **menos de 1 ms**: el resto es cola. El guardián añade ~0,25–0,4 s en mediana y varios segundos en los peores casos.

**Impacto:** medio. Es latencia en las GET de la API y en todas las escrituras; no es la causa de que fallen las vistas.

### C8. La caché del servidor es por instancia y el proxy consulta la BD

**Categoría:** arquitectura. **Confianza:** media (impacto bajo-medio).

**Evidencia:**
- `"use cache"` vive en la memoria de cada instancia de Vercel.
- `proxy.ts:111` llama a `resolve_store_custom_domain` (corta a los 3 s, `:32`) **incluso antes de servir una página ya cacheada**. Hoy esa llamada no sirve para nada: ninguna tienda tiene dominio propio activo, y devuelve null para demo y klau.
- `stores.ts:17` repite esa misma llamada **sin timeout**. Si falla, la tienda devuelve un 500. Esa es la fuente probable de esperas de hasta 25 s.
- Peso en la base de datos: solo 1,65 % (dominio) y 1,3 % (entitlements).

**Ojo:** **no** se debe alargar `cacheLife` a ciegas. Los "minutos" están puestos a propósito para que la suspensión de tiendas por el cobro diario y los banners programados se vean a tiempo (`stores.ts:71-72`, `auth.ts:68-71`, `storefront/data.ts:25`).

### C9. Dos tareas pg_cron cada minuto

**Categoría:** operación. **Confianza:** alta (impacto bajo).

**Evidencia:**
- `kshop-promotion-boundaries` y `kshop-whatsapp-dispatch` se ejecutan cada minuto: **2 880 arranques al día**, ~2,9 % del tiempo de BD.
- En reposo ya no hacen trabajo útil; ese 30–45 ms por ejecución es solo el coste de arrancar.
- Los 10 fallos de 24 h son todos «job startup timeout», en 5 parejas (20:12, 01:10, 01:49, 01:50 y 01:57 UTC). **Son síntoma** de saturación, no la causa.
- `cron.job_run_details` crece ~2 880 filas al día sin limpieza (7 392 filas ahora).

**Ojo:** espaciar la tarea de promociones **requiere** ampliar su ventana de 3 minutos (`pricing_engine.sql:183-203`). Si no, se perderían inicios de promoción.

### C10. Ineficiencias en las políticas RLS

**Categoría:** programación. **Confianza:** alta. **Impacto hoy:** bajo, de milisegundos.

**Evidencia:**
- **Orden de las condiciones.** En `product_variants`, `variant_prices` y similares, la condición "es público" va antes que "es mi tienda". El personal acaba construyendo la lista de variantes publicadas de **toda la plataforma**: 4,69 ms → 0,69 ms (unas 7 veces menos) por colección anidada al invertir el orden.
- **Comprobaciones fila a fila.** 32 políticas llaman a `has_store_role` o `store_is_public` una vez por fila.
- **Estimación por defecto.** Los helpers se estiman en 1 000 filas, lo que provoca planes peores.

**Por qué importa:** hoy son milisegundos, pero crece con el número de tiendas. El lado anónimo de la tienda no lo arregla el reordenado; necesita otra solución.

**No explica los 57014.**

**Descartado o menor:** las 772 advertencias de particiones de Realtime se concentraron en 35 s (27-10, 18:20), probablemente un hueco puntual; no está verificado. Ajustar el pool de PostgREST queda, como mucho, en experimento: en una CPU limitada aporta poco. Los 12 GB de ficheros temporales son acumulados desde el 02-10 y **no** se pueden atribuir a la monitorización.

---

## 4. Vistas del admin: carga, fallos y causa

Datos de carga medidos en hora tranquila (11:03–11:09 UTC, tienda Demo, una carga completa por vista). El riesgo de fallo sale del código y de los logs.

| Vista | Carga medida | Riesgo de fallo | Qué falla / por qué |
|---|---|---|---|
| **Login / set-password** (`/admin/login`, `/admin/set-password`) | **Nunca carga** | Siempre | C3, bug de ruta pública. Las invitaciones quedan bloqueadas |
| **Marco del panel (todas)** | 3 fases en serie antes de pintar | **Máximo** | C4: me → entitlements; si falla, todo el panel cae. C4 también: rearranque al volver a la pestaña |
| **Inicio** `/admin` | Atascado la 1ª vez, luego **16,5 s** | Alto | Resumen ×2 (campana + Home), StoreEntitlements 5,7 s. Si falla la API, los indicadores muestran «…» para siempre |
| Pedidos | 5,2 s | Alto | 2 lecturas sin agrupar (retraso de 250 ms). Error sin «Reintentar» |
| Detalle de pedido | 6,2 s | Alto | Un error se muestra como **«Pedido no encontrado»** |
| Clientes | 3,6 s | Medio | Sin reintento |
| Catálogo › Productos | 4,5 s | Alto | 2 conexiones (retraso de 250 ms), sin reintento |
| **Ficha de producto** | 3,6 s | Alto | Estructura y luego producto, en serie. Si falla, **«Cargando…» infinito** |
| Catálogo: categorías, atributos, marcas, colecciones, almacenes | 3,4–4,8 s | Medio | Estructura completa en cada pestaña; un error bloquea la sección |
| Finanzas | 3,2 s | Medio | Muestra el error |
| Finanzas › Inventario | **8,5 s** | Medio | StoreEntitlements 4,0 s |
| Descuentos / cupones | 2,7–3,1 s | Medio | 2 lecturas en serie |
| Envíos, pagos | 3,0–3,7 s | Medio | — |
| Apariencia (themes) | 6,9 s | Alto | El lote más grande; un 57014 lo tumba entero |
| **Apariencia › Banners** | **10,9 s** | Alto | StoreEntitlements **5,9 s** |
| Apariencia: home, menús, páginas | 3,9–5,3 s | Medio | `/me` 1,9 s |
| Equipo, dominio, app móvil | 3,0–4,5 s | Bajo-medio | — |
| WhatsApp (contactos, plantillas, log) | 2,9–4,3 s | Medio | El log se recarga con cada señal |
| Plan y facturación | 5,6 s | Medio | StoreEntitlements 2,9 s |
| Multi-almacén, movimientos, traspaso | 3,5–4,3 s | Bajo-medio | — |
| Ventas de hoy, multimoneda | 2,7–3,3 s | Bajo | — |

**Ojo:** en hora tranquila hubo **0 fallos**. Los fallos aparecen en ráfagas (C1 + C2 + C5), y entonces caen primero el marco del panel, Inicio, Pedidos, Productos, la Ficha y Apariencia. Además, cada carga dispara 36–62 precargas `_rsc` de la barra lateral; eso cuesta Vercel, no base de datos.

---

## 5. Soluciones, de gratis a pago

**Cómo leer la tabla:**
- Todas las soluciones gratuitas **respetan las reglas del proyecto**: multi-tienda, RLS, app móvil por `/api/v1` o RPC con token, y sin Server Actions. Lo que no las respeta del todo se avisa en su fila.
- Las ganancias son estimaciones; se confirman reseteando `pg_stat_statements` y repitiendo la medición.

### Gratis, empezando por la mayor ganancia

| # | Qué | Ganancia esperada | Esfuerzo | Riesgo | Notas |
|---|---|---|---|---|---|
| G1 | **Arreglar el bug de login/set-password.** Decidir lo público por segmento de layout (`useSelectedLayoutSegment`) o con `endsWith`. Probar con `next build && next start` y comprobar que el formulario **responde**, no solo que aparece | Desbloquea invitaciones y login directo | 1–2 h | Muy bajo | Sin BD. Comprobar que el `<form>` no envíe credenciales por la URL si no termina de hidratarse |
| G2 | **Disciplina ya:** no lanzar e2e, qa, imports ni `test:rls` mientras se usa la web ni justo antes de un deploy; en serie, nunca a la vez | Evita las peores horas (01:00 UTC: 17 % de fallo) | 0 h | Ninguno | Lo más barato de todo |
| G3 | **Sacar dev/test de producción:** un 2º proyecto Free o `supabase start` (Docker) local para `pnpm dev`, e2e, qa, `test:rls`, codegen e imports | Quita la mayor parte de las ráfagas y casi todos los vaciados de caché (C1, C5). No devuelve todo a 200 ms | 0,5–1 día | Bajo | Hay que cambiar el `.env`, aplicar las migraciones allí, `db:auth-config`, `demo:seed` y buckets. Se midió **1 proyecto** en la organización (Free permite 2): parece haber hueco, confirmarlo. Migraciones y `test:rls` se siguen pasando también en prod. El MCP debe seguir limitado al proyecto Kshop |
| G4 | **Clientes estables en la sesión:** memo por `session.user.id`, no por el objeto de sesión; no pasar de «listo» a «error» en una recomprobación de fondo | Quita los rearranques al volver a la pestaña y los paneles que se caen solos | 1–2 h | Bajo | `packages/admin`; sirve también para la app móvil |
| G5 | **Arranque plano del admin:** un solo `/api/v1/me?storeId=` que devuelva rol + entitlements + límites (una función SQL); montar la página a la vez; quitar el retraso de 250 ms en la primera carga; Ficha en paralelo; en la app, un solo `me()` | Quita 2–3 viajes en serie por vista y saca el arranque de pg_graphql | 1–2 días | Bajo | Respeta móvil (Bearer) y RLS |
| G6 | **Red de seguridad en lecturas:** timeout de ~10–12 s; **un** reintento con espera aleatoria solo ante 5xx/57014 (nunca tras un aborto propio); en el lote, reintentar una vez el lote entero, **no** partirlo en N; mensajes correctos con «Reintentar» (Ficha, Pedido, KPIs, listas) | Se acaban «Cargando…» infinito y «Pedido no encontrado»; menos carga en crisis | 1 día | Bajo | Abortar en el cliente no cancela la consulta en el servidor, por eso no se reintenta tras un aborto |
| G7 | **Campana barata:** quitar `pathname` de sus dependencias y usar un contador pequeño o reutilizar el dato de Home. Hacer que `realtime.ts` pase la tabla para que las listas ignoren `notification_log` | Menos llamadas a `admin_home_summary` (2,3 % de BD, p95 5,5 s en prod) | 2–4 h | Bajo | La vista de avisos sí debe seguir escuchando |
| G8 | **`getClaims()` en lugar de `getUser()`** en `auth.ts`, y una RPC `api_guard` (rol + estado de tienda) solo para `service_role` | −0,25–0,4 s de mediana por llamada a la API y mucho menos en el peor caso | 0,5–1 día | Bajo-medio | Un usuario baneado mantiene el acceso hasta 1 h; seguir usando `getUser` en superadmin. La pertenencia a la tienda se comprueba siempre igual |
| G9 | **Sin DDL en los tests:** helpers `tests.*` instalados una vez, en un esquema sin exponer y sin permisos para anon/authenticated; quitar las ~35 funciones `pg_temp` | `test:rls` deja de vaciar la caché | 1 día | Medio (seguridad del esquema `tests`) | Innecesario si G3 se hace bien |
| G10 | **Las lecturas calientes del admin a funciones SQL (RPC → jsonb):** `admin_bootstrap`, `admin_product`, `admin_orders` y luego el "shell" de la tienda | Esas pantallas dejan de pagar el peaje de 200 ms–2,4 s; es lo que más blinda sin pagar | 3–5 días, progresivo | Medio | Mismo RLS (SECURITY INVOKER) con `test:rls`. Se pierden los tipos de codegen en esas consultas |
| G11 | **Cron:** quitar la tarea de WhatsApp mientras el modo no sea «Real» (o ejecutarla cada 2–5 min); promociones cada 5 min **ampliando la ventana**; desfasar las dos tareas; purgar `job_run_details` a diario | Menos arranques en frío (2 880/día) | 2–4 h | Bajo-medio | **Decisión tuya:** las promociones y los avisos podrían llegar unos minutos tarde |
| G12 | **Proxy y tienda:** quitar o limitar la RPC de dominio propio mientras ninguna tienda lo tenga (lista o variable de entorno) y poner timeout a `stores.ts:17` con resultado null si falla | Quita hasta 3 s antes de las páginas cacheadas y los 500 por dominio | 2–4 h | Bajo | La redirección 308 sigue en el proxy (SEO) |
| G13 | **Reordenar RLS** (personal primero), helper `my_admin_store_ids()` sin correlación, `ROWS` realistas solo en `my_store_ids` | ~5–7× menos trabajo en lecturas anidadas del personal | 1 día + `test:rls` | Medio | Debe mantener que el precio de costo nunca se filtre |
| G14 | **Reducir lo que pg_graphql ve:** sacar tablas internas de `public`; quitar `extensions` del search_path | Peaje −30/45 % **[no verificado]** | 3–5 días | Medio-alto | 34 llamadas `.from()` que hay que cambiar. Quitar `extensions` es un cambio de configuración de Supabase y necesita tu permiso |
| G15 | Calentar unas pocas páginas tras cada deploy, una a una | El primer visitante no paga 1,3–2,6 s | 1 h | Bajo | Que sea suave con el Nano |

**No hacer:**
- pings para "mantener caliente": cuestan CPU y solo calientan una conexión;
- subir el `statement_timeout`: solo alarga la cola;
- desactivar los disparadores de pg_graphql;
- alargar `cacheLife` sin antes invalidar las etiquetas desde el cobro diario.

### De pago (ver costes)

| # | Qué | Ganancia | Esfuerzo | Riesgo |
|---|---|---|---|---|
| P1 | Supabase Pro + Micro | Copias diarias, sin pausa por inactividad, logs de 7 días, ~2× CPU sostenida **[inferido]** | Un clic + reinicio de unos minutos | Bajo |
| P2 | Supabase Pro + Small | Lo mismo con ~4× CPU **[inferido]** y 2 GB | Igual | Bajo |
| P3 | Vercel Pro | Uso comercial legal (Hobby no lo permite) | Mover la cuenta de Claudia a Fullkod | Bajo |

---

## 6. Costes

Precios públicos de Supabase y Vercel (2026). No se comprobaron contra una factura real.

| Opción | USD/mes | Qué compra | ¿Arregla los fallos de código? |
|---|---|---|---|
| Seguir en Free/Nano | $0 | Nada más. **Sin copias de seguridad**, pausa tras 7 días sin uso, logs de 1 día | No |
| 2º proyecto Free para dev/test | $0 | Separar dev de prod (G3) | No (pero quita ráfagas) |
| **Supabase Pro + Micro** | **$25** (el crédito de $10 cubre la Micro) | Copias diarias (7 días), sin pausa, logs de 7 días, 8 GB de BD, tope de gasto; ~2× CPU **[inferido]** | No |
| **Supabase Pro + Small** | **~$30** | Igual, más ~4× CPU **[inferido]**, 2 GB de RAM y 90/400 conexiones | No |
| Pro + Medium | ~$75 | Solo añade RAM, que no hace falta (67 MB) | No |
| Pro + Large (CPU dedicada) | ~$126 | Sin estrangulamiento | No; excesivo hoy |
| Réplica de lectura | $45+ | No evita que se agoten los créditos de la principal | No |
| **Vercel Pro** | **$20/plaza** | Uso comercial, más tiempo de función, cuenta de equipo | No |
| Neon / VPS propio | — | Rompen la arquitectura o te obligan a operar todo Supabase tú | — (no recomendado) |

**Ojo:**
- Al pasar a Pro el proyecto **sigue en Nano**, cobrado como Micro, hasta que eliges Micro o Small explícitamente.
- Cambiar la máquina reinicia la base de datos unos minutos.

**Total realista en producción:** **~$45–50/mes** (Supabase Pro + Small y una plaza de Vercel Pro).

---

## 7. Recomendación: plan en orden

**Esta semana ($0):**
1. **G1**, el bug de login/set-password. Es lo que más daño hace a quien llega nuevo.
2. **G2**, disciplina inmediata con tests e imports.
3. **G4 + G7**, que son cambios pequeños: clientes estables y campana barata.
4. **G6**, timeouts, reintento único y mensajes correctos.
5. **G3**, separar dev/test (2º proyecto Free o Docker local).

**Las 2–3 semanas siguientes ($0):**

6. **G5** (arranque plano) y **G8** (`getClaims` + guard).
7. **G12** (proxy/dominio) y **G11** (cron). G11 necesita antes tu decisión sobre minutos de retraso en promociones y avisos.
8. **G10**, pasar a RPC las lecturas que más fallan, empezando por el arranque y la ficha.
9. Medir:
   - resetear `pg_stat_statements`;
   - repetir la prueba de 36 vistas;
   - contar los 57014 por día.
   - Objetivo: **0 errores 57014** fuera de horas de trabajo y vistas por debajo de ~2 s.

**Más adelante, si hace falta:** G13 (RLS) cuando entren más tiendas y G14 (reducir el esquema) solo si después de todo lo anterior las reconstrucciones siguen dominando.

**Cuándo pagar:**
- **Antes de que klau tenga clientes y pedidos reales:** Supabase **Pro + Small (~$30/mes)**, o Micro ($25) si quieres el mínimo. El motivo son las **copias de seguridad y que no se pause**. La CPU extra es un plus.
- **Antes de vender tiendas o dominios propios:** **Vercel Pro ($20/mes)**.
- **No** subir de Small mientras no haya datos que lo pidan.

---

## 8. Qué no se pudo medir y por qué

- **El mínimo real de CPU del Nano y sus créditos.** Supabase no lo publica y no se ve por SQL. Hay que mirar Dashboard › Observability › CPU. Las cifras de "~5 % por núcleo" y de "2–4× con Micro/Small" son inferencias.
- **Qué parte de la CPU es de dev y qué parte de producción.** `pg_stat_statements` no guarda el origen, y las consultas por Management API (`db:query`, MCP) no aparecen en los logs de entrada.
- **Vercel:** el MCP estaba conectado a otra cuenta (`lgiavedonis-projects`). No se pudieron ver logs, la región exacta ni si Fluid compute está activo. La cabecera `iad1` indica que la región es la buena.
- **El cierre de conexiones por inactividad de PostgREST** (30 s por defecto): la API devuelve `db_pool: null` y no muestra ese valor.
- **El trabajo cancelado:** las consultas que dan 57014 no se registran. Se estiman ~3 100 s/día que faltan en los totales.
- **La ganancia real de G13 y G14:** solo se puede medir aplicando cambios, y esto fue solo lectura.
- **Si se pierden actualizaciones en vivo** por las advertencias de particiones de Realtime (ráfaga de 35 s el 27-10).
- **Si el bug de login existía antes de `8bc17e7`:** no se ejecutó un build local para confirmarlo.
- **La experiencia desde Cuba:** todo se midió desde tu PC/VPN, a ~0,13 s de conexión TCP.
- **Las tiendas en horas de tráfico real:** hoy casi no hay clientes (3 peticiones desde ETECSA en 24 h), así que el comportamiento con clientes de verdad no está medido.

Durante todo el diagnóstico no se cambió código, datos ni configuración. La única huella es una subida del contador de esquema de pg_graphql (15 756 → 15 757), provocada por una prueba que creó una tabla temporal. No cambió ningún dato; solo cuesta una reconstrucción extra por conexión.