> Sembrado el 2026-10-24 desde `_materiales/kshop/04-tenancy-dominios-auth.md`. Las referencias "ver 0X" apuntan a las
> entradas hermanas de `project/` (ver índice en `MEMORY.md`). Desde ahora la memoria viva es esta.

# Multi-tenancy, dominios y usuarios

> **Dominio decidido (2026-10-24): `kshop.fullkod.com`**; tiendas en `{slug}.kshop.fullkod.com`.

## Resolución de tienda por host
- Middleware de Next lee el `Host`:
  - `kshop.fullkod.com` → landing/plataforma; `/superadmin` → panel de superadmin.
  - `{slug}.kshop.fullkod.com` → tienda `slug`.
  - dominio propio (`klaushop.com`) → buscar en `store_domains`.
- Rewrite interno a `/_store/[storeSlug]/...` (rutas reales); el usuario nunca ve el slug en la URL.
- El mapa host → store_id se cachea (edge config / cache con tag) para no consultar la BD en cada request.

## Alta automática de subdominios (Vercel)
- **Wildcard `*.kshop.fullkod.com`** en el proyecto de Vercel → cualquier tienda nueva funciona al
  instante sin tocar DNS. Requisito: Vercel solo emite el certificado wildcard si gestiona el DNS de la
  zona. Como `fullkod.com` ya tiene otros servicios, lo limpio es **delegar solo la subzona
  `kshop.fullkod.com`** a los nameservers de Vercel (registros NS en el DNS actual de fullkod.com) y
  dejar el resto de `fullkod.com` como está. Verificar con el proveedor DNS de fullkod.com antes de Fase 0b en producción.
- Crear tienda desde el superadmin = insertar `stores` + `store_domains` (subdominio). Nada más.
- **Dominio propio** (opcional, por plan): el panel llama a la Vercel Domains API (`POST /v10/projects/{id}/domains`),
  muestra al dueño el CNAME/A a configurar y consulta la verificación; al verificar → `verified_at`.
- Se descartó `*.fullkod.com` (chocaría con otros subdominios de Fullkod).
- Email sintético de clientes (ver abajo): dominio interno `customers.kshop.fullkod.com` (no necesita buzón real).

## Usuarios
| Rol | Dónde vive | Acceso |
|-----|-----------|--------|
| Superadmin | `app_metadata.role = 'superadmin'` | Todas las tiendas + panel plataforma |
| Owner/admin/staff | `store_members` | Solo su tienda (panel admin de la tienda) |
| Cliente final | `customers (store_id, user_id)` | Solo sus datos en esa tienda |

### "Una cuenta por tienda" con aislamiento total (decidido 2026-10-24)
Supabase Auth tiene **un solo** `auth.users` por proyecto y el email es único ahí. Roberto descarta
la identidad compartida (misma contraseña en todas las tiendas). Diseño propuesto: **email sintético por tienda**.

- Al registrarse en la tienda X con `ana@gmail.com`, el servidor crea en Supabase Auth un usuario con
  email interno `c_{hash(store_id + email)}@customers.<dominio-plataforma>` y
  `app_metadata = { store_id, kind: 'customer' }`. El email real va en `customers.email`.
- Login: el cliente escribe su email real → `POST /api/v1/auth/login` resuelve el email interno de
  **esa tienda** → `signInWithPassword` → devuelve la sesión. La misma persona en otra tienda es otro
  usuario, con otra contraseña.
- RLS: además de `auth.uid()`, se exige `auth.jwt()->'app_metadata'->>'store_id' = store_id`, así una
  sesión de la tienda A no sirve en la B ni aunque se copie el token.
- Verificación y recuperación de contraseña: el mailer de Supabase enviaría al email interno, así que
  **se desactiva para clientes** y lo hacemos nosotros: `auth.admin.generateLink` / OTP propio → envío
  por email (Resend) o por **WhatsApp (OpenWA)**.
- Consecuencias (aceptadas por Roberto 2026-10-24): **sin login con Google/OAuth para clientes**
  (tampoco se quiere por ahora); login por teléfono también iría por OTP propio. Recuperación:
  WhatsApp (OpenWA) como canal principal, email como alternativa. A cambio: aislamiento total y seguimos usando sesiones, refresh
  tokens, hashing y `auth.uid()` de Supabase.
- Staff/dueños y superadmin usan su **email real** (identidad de plataforma; un dueño puede tener varias
  tiendas vía `store_members`). Si un dueño compra como cliente en otra tienda, es otra cuenta sintética.

Alternativa descartada por ahora: sistema de auth propio con JWT firmados (más trabajo y más superficie de seguridad).

### Alta de tienda desde el superadmin (flujo)
1. Nombre → slug auto (editable) → comprobar disponibilidad.
2. Email del dueño → `auth.admin.inviteUserByEmail` (o crear con contraseña temporal) + `store_members (owner)`.
3. Moneda base, prefijo de orden, WhatsApp, plan/trial.
4. Seed: almacén por defecto, moneda base, zonas de envío vacías, plantilla de product types/atributos
   (p. ej. "Ropa": talla + color; "Accesorios": color).
5. La tienda queda accesible en `{slug}.kshop.fullkod.com`.

## Storage
Bucket único con prefijo por tienda (`stores/{store_id}/...`) + políticas de Storage por `store_id`.
