# Código de atributo (2026-11-02)

**Problema:** en klauShop quisieron separar «Talla» en una de ropa y otra de calzado, y la segunda «Talla» daba «ya existe
la URL (slug)». El diálogo de atributos no tenía campo de slug: el servidor lo sacaba siempre del nombre
(`slugOf` en `apps/web/src/server/catalog/resources.ts`), y al editar un atributo sin slug también lo rehacía del nombre.

**Qué hace Saleor:** el nombre se puede repetir; el slug («Attribute Code» en su panel) es único y se puede escribir a mano.
El patrón es un atributo por tipo de producto cuando los valores no tienen nada que ver (tallas de ropa vs. de calzado).

**Decisión de Roberto:** opción 2, como Saleor. Sin migración (`unique (store_id, slug)` se queda).

**Dónde está:**
- `AttributesPage.tsx`: campo «Código» (se rellena del nombre hasta que se toca; al editar llega el guardado y siempre se
  envía), «Código: …» en la lista, y `attributeLabel()` que añade « · código» cuando dos atributos se llaman igual.
- `ProductTypesPage.tsx`: usa `attributeLabel()` en el diálogo y en la lista.
- `server/db-errors.ts`: `attributes_store_id_slug_key` → «Ese código ya lo usa otro atributo de la tienda.» en el campo
  `slug`; `attribute_values_store_id_attribute_id_slug_key` → «Hay dos valores iguales en el atributo.».
- Ayuda: consejo en la guía `first-product` y `help:pdf` regenerado.
- QA en navegador (base de prueba, 10/10): capturas en `.titan/qa/atributo-codigo/`.

**Pendiente:** en producción la tienda `klau` tiene un solo tipo («Ropa y accesorios») y su «Talla» solo XS–XXL; pasar los
zapatos a un tipo «Calzado» con su propia talla está sin hacer y sin decidir.
