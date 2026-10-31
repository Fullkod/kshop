# Superadmin importa Excel (hecho)

Fecha: 2026-10-30. **Resuelto y en producción** con permiso de Roberto: `20261108101400_store_imports_superadmin_upload.sql`.

El importador sube el Excel desde el navegador a `store-imports`, y esa política solo admitía a los admin de la tienda: el
superadmin recibía `new row violates row-level security policy`. Ahora puede subir a cualquier tienda, solo INSERT y solo en
`stores/{id}/imports/`. El servidor lee el archivo con el cliente de servicio, así que no hay política de SELECT.

Pruebas: `01_platform_isolation` (superadmin sí, fuera de `imports/` no, dueño de otra tienda no) y `e2e:catalog` (sube e inicia
la importación como superadmin).
