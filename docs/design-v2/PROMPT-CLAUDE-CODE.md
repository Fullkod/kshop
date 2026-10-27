# Prompt para Claude Code

Copia la carpeta `design_handoff_kshop_v2/` en la raíz del repo como `docs/design-v2/` y pega esto en Claude Code:

---

Vamos a migrar Kshop al diseño v2. Toda la especificación está en `docs/design-v2/`:
- `README.md`: visión general, mapa prototipo → archivo del repo y reglas.
- `01-TOKENS.md` … `05-LANDING.md`: especificación exacta, con medidas, colores y textos.
- `06-PLAN-MIGRACION.md`: fases R0–R7 con criterios de aceptación.
- `codigo/`: archivos listos para sustituir (`theme.ts`, `theme-style.ts`, `styles.css`) y añadidos para `content.ts`.
- `referencias/*.dc.html`: prototipos HTML que se abren en Chrome. Son referencia visual, **no código para copiar**.

Reglas:
1. Lee primero `docs/design-v2/README.md` y `06-PLAN-MIGRACION.md`, luego `.titan/memory/MEMORY.md` y `AGENTS.md`.
2. Usa `tf-prp` para crear `.titan/plans/prp-rediseno-v2.md` a partir de `06-PLAN-MIGRACION.md` y espera mi aprobación.
3. Trabaja **una fase cada vez**, empezando por R0, y al terminar cada una enséñame la evidencia: capturas de 1280 y 390 en `.titan/qa/rediseno-v2/`, tests y lint.
4. En la tienda no puede haber ningún color fijo: solo variables del tema o clases Tailwind del `@theme`. El admin usa la marca Kshop.
5. Si un dato del prototipo no tiene campo en la base de datos (umbral de envío gratis, imagen de colección, favoritos…), propón el cambio en el PRP en lugar de inventarlo.
6. No añadas dependencias sin preguntar. `lucide-react` está propuesta en R1.
7. No hagas push ni deploy sin permiso.

Empieza por R0.
