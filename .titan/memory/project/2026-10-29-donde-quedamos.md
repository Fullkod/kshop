# Dónde quedamos (pausa 2026-10-29)

Roberto pidió dejar memoria y planes al día y seguir luego.

## Hecho en la sesión (2026-10-28 → 2026-10-29)
- **R12** superadmin v3 (secciones del menú por tienda, lista v3): en `main` (`project/2026-10-28-r12-superadmin-v3.md`).
- **R13** formularios en diálogo: en `main` (`project/2026-10-28-admin-formularios-en-dialogo.md`).
- **R14** confirmaciones en `useConfirm()` + regla `no-alert`: hecho y verificado, **en local**
  (`42b5a6f`, `97c73f1`, `bab1aa5` y el docs de esta pausa; `main` va por delante de `origin`). El push lo hace Roberto
  o lo autoriza.
- klauShop: 8.1–8.5 confirmadas en producción (`klaushop:verify`: 57 productos, 82 variantes, 83 imágenes, 21 pedidos).
- Docker compactado por Roberto.

## Qué sigue (en este orden, salvo que Roberto diga otra cosa)
1. Push de R14 (con permiso) y revisión de Roberto en el navegador.
2. Fase 8.6: QA en navegador y medición de la tienda `klau` en la Nano (`prp-fase-8-klaushop.md`).
3. Fase 8.7: corte de klauShop (dominio/DNS), **solo con permiso explícito**.
4. R11: 24 h de logs (57014 y 500 de `/api/v1`) con uso normal; resto en «Pendiente tras R11» de `prp-r11`.
5. Futuro: enlace de entrada de un solo uso superadmin → tienda (R12); hueco de «Monedas» gestionada editable desde
   Catálogo › Monedas (ruta compartida `catalog/currencies`).

## Para retomar
- Sigue vigente: WhatsApp en «Simulado»; nada de `e2e:*`/`qa:*`/`build` con la web en uso, y en serie.
- En local los puertos 3000 y 3100 los usan otros proyectos: `pnpm dev` en 3210 con
  `NEXT_PUBLIC_PLATFORM_DOMAIN=kshop.localhost:3210` y `QA_BASE_URL`/`E2E_APP_URL` a ese puerto.
