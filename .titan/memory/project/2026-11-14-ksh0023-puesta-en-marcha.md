# KSH0023 Puesta en marcha en la primera factura

Fecha: 2026-11-14. Pedido por Claudia: los 5 USD de la puesta en marcha (decisión 31) se olvidaban porque había que
añadirlos a mano como «Ajuste» cuando ya existía la factura. Ahora van solos y el cliente ve un único total.

## Cómo funciona
- `subscriptions.setup_fee` (lo que se debe; null = nada) y `setup_fee_invoice_id` (la factura que lo lleva).
  Migración `20261108103000_setup_fee.sql`.
- `subscription_quote` añade la línea «Puesta en marcha (crear la tienda y cargar los datos), una sola vez» (tipo
  `adjustment`, marcada `setup: true` solo en el JSON) después del descuento: el % de un regalo no se aplica a ella.
  `issue_invoice` guarda la factura que la lleva. Si se anula esa factura, pasa a la siguiente.
- `subscription_update` acepta `setup_fee` (0/null la quita) mientras no esté facturada; después da error y se
  corrige con un ajuste en la factura.
- Ajuste de plataforma `setup_fee_usd` (5) en Superadmin › Cobros › Ciclo de cobro. «Nueva tienda» lo trae relleno
  (y también los días de prueba de la plataforma, que antes eran 30 fijos); cortesía = sin puesta en marcha.
- El landing lo lee de `getLandingData().setupFeeUsd` (se fue `SETUP_FEE_USD`).
- Tiendas anteriores sin puesta en marcha; a Arco Rojo (`arcorojobaez`, KSH0021) se le puso a mano (5 USD).

## Pruebas
`supabase/tests/27_setup_fee.test.sql` (17), `pnpm qa:setup-fee` (11; capturas en `.titan/qa/ksh0023-puesta-en-marcha/`).
Sin Chromium de Playwright en el PC de Claudia: `QA_CHROMIUM_PATH` al Chrome instalado.

## Aprendizajes
- Dos personas crearon migraciones a la vez con la misma versión (`20261108102900`): `db:migrate` aplica el SQL y
  luego falla al renumerar el historial. Renombrar el archivo y corregir `schema_migrations.version` a mano.
- El `next dev` cachea host → tienda: un QA que borra y recrea la misma tienda con otro id ve «No tienes acceso».
  Usar un subdominio nuevo en cada pasada.
