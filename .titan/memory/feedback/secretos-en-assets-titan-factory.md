# Assets de Titan Factory pueden traer secretos

**2026-09-24:** GitHub Push Protection bloqueo el push: `.claude/skills/video-visuals/assets/levy.png` traia una
API key real de OpenRouter dentro de sus metadatos XMP (chunk `iTXt`). Se limpiaron los metadatos (imagen intacta)
y se reescribio el commit local antes de subir.

**Por que:** las imagenes generadas con herramientas de IA pueden guardar el prompt/config (incluida la key) en metadatos.
Un escaneo de texto no lo detecta.

**Como aplicar:**
- Antes de commitear skills/assets nuevos (sobre todo tras `update-tf`), escanear tambien binarios:
  `grep -aE 'sk-or-v1-[0-9a-f]{20,}|sk-(proj|ant)-|sbp_[0-9a-f]{20}|AKIA[0-9A-Z]{16}' <archivo>`.
- Si hay hit en un PNG: quitar chunks `iTXt/tEXt/zTXt/eXIf`, no borrar la imagen.
- Una key que llego a un repo hay que considerarla filtrada: rotarla en el proveedor.
