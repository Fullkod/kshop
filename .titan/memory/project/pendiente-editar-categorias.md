# Editar categorías (hecho)

Fecha: 2026-10-30. **Resuelto y en producción:** `20261108101150_categories_move_descendants_fix.sql`. `e2e:catalog` ya prueba
editar una categoría y mover una rama.

Todo `PATCH /catalog/categories/{id}` daba 500: la API manda siempre `parent_id`, eso dispara `categories_move_descendants`, y con
`search_path = ''` el `is distinct from` de `ltree` falla (`42883 operator does not exist: extensions.ltree = extensions.ltree`).
Ahora compara como texto.

**Cuidado al escribir SQL de funciones con `search_path = ''`:** los operadores de extensiones hay que calificarlos, y
`=`, `is distinct from` e `in` no admiten `operator(...)` en todas las formas.
