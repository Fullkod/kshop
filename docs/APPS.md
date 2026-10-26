# Apps Android (Fase 7)

Dos apps de Capacitor sobre el mismo código que la web:

- **App de tienda** (`apps/store-app`): una por tienda, `com.fullkod.kshop.<slug>` (los `-` del slug pasan a `_`).
- **Kshop Admin** (`apps/admin-app`): una para todas las tiendas, `com.fullkod.kshop.admin`.

Se compilan en **GitHub Actions** (workflow `Android app`, `.github/workflows/android-app.yml`). En este PC no hace falta
JDK ni Android SDK.

## Preparación (una sola vez)

1. **GitHub CLI**: instala `gh` y entra con `gh auth login` en la cuenta con acceso a `Fullkod/kshop`.
2. **Variables del repositorio** (públicas, las mismas que usa la web):
   ```
   gh variable set NEXT_PUBLIC_SUPABASE_URL --body "https://<ref>.supabase.co"
   gh variable set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --body "sb_publishable_…"
   ```
   La clave secreta de Supabase **nunca** va a GitHub.

## Primera vez de cada app: su clave de firma

```
pnpm app:keystore <slug|admin> --github
```

- Crea `%USERPROFILE%\.kshop\keystores\<slug>.jks` y `<slug>.password.txt`, fuera del repo. Si ya existen, no
  los toca.
- Con `--github` los guarda como secretos de Actions: `ANDROID_KEYSTORE_<SLUG>` (en base64) y
  `ANDROID_KEYSTORE_PASSWORD_<SLUG>`.
- **Haz copia de seguridad de los dos archivos.** Sin esa clave, la app instalada en los teléfonos no se puede
  volver a actualizar: Android solo acepta una actualización firmada con la misma clave.

## Generar una versión

1. **GitHub › Actions › «Android app» › Run workflow** con:
   - el slug de la tienda, o `admin`;
   - opcionalmente, la versión visible. Por defecto es `1.0.<número de ejecución>`.
2. El workflow hace lo siguiente:
   - lee la ficha pública de la tienda;
   - genera el icono y el splash a partir del logo;
   - compila y firma el APK;
   - lo deja como artefacto `apk-<slug>` durante 30 días.

   El `versionCode` es el número de ejecución, así que siempre crece.
3. Publícalo desde aquí:
   ```
   pnpm app:publish <slug|admin>
   ```
   Descarga el artefacto de la última ejecución correcta (otra ejecución con `--run <id>`), sube el APK al bucket
   `store-apps` y lo registra en `store_app_builds` **oculto**.
4. Instala el APK, pruébalo y pulsa **Publicar** en **Superadmin › Apps**.
   - La versión de tienda se ofrece en la página `/app` de la tienda y en el aviso para Android, y responde a la
     petición del dueño.
   - Las apps ya instaladas muestran «Actualizar».
   - Kshop Admin aparece para descargar en Admin › App móvil.

## Icono y splash

- Salen del logo de la tienda, sobre su color de fondo.
- Si no hay logo, o es alargado (más de 1,4 veces más ancho que alto), se usa la inicial de la tienda en blanco
  sobre su color de acento.
- Kshop Admin usa el símbolo de Kshop.

## Probar sin GitHub (hasta el proyecto nativo)

```
pnpm app:build <slug|admin>      # config, bundle, apps/<app>/android, iconos y splash
```

- Con `--assemble` también compila y firma. Necesita JDK 21, el Android SDK y las variables `KSHOP_KEYSTORE_FILE`
  y `KSHOP_KEYSTORE_PASSWORD`.
- El APK queda en `apps/<app>/release/` junto con `build.json`. `pnpm app:publish <slug> --dir apps/<app>/release`
  lo sube.
- `apps/*/android`, `apps/*/release` y `apps/*/capacitor.config.json` son generados y están fuera de git.

## Quién ve qué

- **Dueño o administrador:** en Admin › App móvil (módulo `mobile_app`) pide la app con «Pedir mi app». Cuando la
  app está publicada, ve el enlace y el QR de `/app`.
- **Superadmin:** en Superadmin › Apps ve las peticiones, las versiones de cada app y Kshop Admin.
- **Sin el módulo o con la tienda suspendida:** `/app` deja de ofrecer la descarga y las apps instaladas muestran
  el aviso correspondiente. No se borra ninguna versión.
