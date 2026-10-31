# Trucos de entorno, Next 16 y pg_graphql (válidos para cualquier fase)

Detalle de cada error en la sección «Aprendizajes» de los PRP de las fases 1 y 2.

## Next 16 con Cache Components (activo desde la Fase 2)
- Lecturas públicas: funciones con `"use cache"` + `cacheTag` por tienda (`store:{id}:catalog`,
  `store:{id}:content`, `store:{slug}`) + `cacheLife`. Escrituras: `revalidateTag(tag, { expire: 0 })`.
- Prohibido `export const runtime` en route handlers. `apiHandler` hace `unstable_rethrow(error)`.
- Rutas con params: o `generateStaticParams` (nunca vacío) + `await params` fuera de `<Suspense>` (ISR), o todo
  dentro de `<Suspense>`. `searchParams`, `cookies` y `headers` siempre dentro de `<Suspense>`.
- Admin y superadmin son apps de cliente: su layout envuelve todo en `<Suspense>`.
- En la tienda, leer `--fg/--bg/--ok…` directamente: los `--color-*` de `@theme inline` se resuelven en `:root`
  (paleta del admin, cambia con el modo oscuro del sistema).

## pg_graphql
> Desde el 2026-10-28 solo existe en el proyecto de prueba (comparadores y `db:graphql-schema`); producción lee por
> funciones SQL `admin_*`/`sf_*`. Lo de abajo sirve para escribir o comparar documentos GraphQL.
- `jsonb` llega como string JSON: `JSON.parse`. Enums en filtros sin comillas (`status: { eq: active }`).
- No expone funciones con argumentos enum ni las que devuelven `table(...)`: usar `text` y `setof <tabla>`.
- Admite `first` + `offset` + `totalCount` (paginación numerada) y `orderBy` sobre funciones `setof`.
- Prettier reformatea el GraphQL embebido: correr `pnpm codegen` después de formatear.

## Entorno de Roberto (Windows)
- `pnpm db:query "…"` pasa por `cmd`: `>>`, `||` y `<>` se rompen (`->>` hasta crea un archivo suelto). Usar `jsonb_extract_path_text`, `concat()` y `!=`, o un script con `fetch` a la Management API.
- Dentro de un `if` de PL/pgSQL el primer `then` termina la condición: un `case` ahí va entre paréntesis.
- Node no resuelve `*.localhost` (ENOTFOUND): scripts → `http://localhost:3000`; el navegador sí.
- El puerto 3100 es de otra app de Roberto: builds de prueba en 3200, compiladas con
  `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3200`.
- `TaskStop` sobre `npx next start` deja vivo el proceso hijo: pararlo por puerto comprobando su línea de comandos.
- Si el navegador del MCP de Playwright está ocupado por otra sesión: `playwright-core` (misma versión que el
  Chromium de `%LOCALAPPDATA%\ms-playwright`) instalado en el scratchpad. Lighthouse igual, con `CHROME_PATH`.
- En el Bash del agente los heredocs largos con comillas a veces fallan («unexpected EOF»): escribir el script
  en un archivo del scratchpad y ejecutarlo.

- Capturas de Playwright: `caret: "initial"`; el valor por defecto inyecta `caret-color` y da un falso error de
  hidratación si la captura llega antes de que React hidrate.

## Vercel + Turborepo
- Route handlers con Cache Components: si todo lo que leen está en `use cache`, el build los **prerenderiza**; bajo
  un segmento dinámico (`/s/[storeSlug]/…`) eso acabó en 404 en Vercel aunque `next start` local funcionaba. Usar
  `await connection()` en el handler. Comprobar en la salida del build que salen como `ƒ`.
- Los puertos **3000 y 3001** también los usan otras apps de Roberto (2026-10-28): Kshop en dev local en 3003 con
  `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3003`.
- Docker guarda todo en `%LOCALAPPDATA%/Docker/wsl/disk/ext4.vhdx`, que no encoge al borrar imágenes: el disco C: se
  llenó con las imágenes de Supabase local (2026-10-28). Compactar con `wsl --shutdown` + diskpart (administrador). Supabase local en Docker se retiró por eso: no
  volver a proponerlo en esta máquina.
- El puerto 3100 lo usa otra app de Roberto: para `next start` de prueba usar otro (p. ej. 3217).
- Turbo corre en *strict env mode*: una variable del proyecto de Vercel que no esté en `turbo.json`
  (`globalEnv` o `tasks.build.env`) **no llega al build**. `next build` importa los route handlers al
  "Collecting page data" y `src/server/env.ts` valida `SUPABASE_SECRET_KEY` al importarse → el build falla
  (2026-10-25). Toda variable nueva que lea la app va a `turbo.json`. En local no se nota porque
  `next.config.ts` carga el `.env.local` de la raíz.
- En Vercel solo van las variables que usa la app (`NEXT_PUBLIC_*`, `SUPABASE_SECRET_KEY`,
  `PLATFORM_CANONICAL_DOMAIN`); nunca `SUPABASE_ACCESS_TOKEN` ni contraseñas de E2E/demo.
- (Antes de R11) El prerender del build consulta pg_graphql como `anon` (`statement_timeout=3s`). Con la concurrencia por
  defecto de Next (8 páginas por worker × CPUs) la instancia de Supabase se satura y falla con 57014
  (2026-10-25). Arreglo en `next.config.ts`: `staticGenerationMaxConcurrency: 2` + `staticGenerationRetryCount: 3`.
  Diagnóstico: `query_logs` (postgrest_logs/postgres_logs) en la hora del build.
- **`pnpm dev` sirviendo código viejo** (fases 4 y 5): rutas y módulos de servidor de antes de los últimos cambios
  aunque el archivo ya cambió (p. ej. la API aceptaba cupones en Base y el carrito no traía campos nuevos). Pasa tras
  `pnpm build` con el dev corriendo y a veces sin él; editar el archivo no siempre basta. Síntoma: un E2E que
  pasaba falla con un comportamiento «imposible». Fix: reiniciar `pnpm dev` (parar el `next dev` del puerto 3000).
