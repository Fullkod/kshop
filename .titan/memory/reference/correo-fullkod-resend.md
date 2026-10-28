---
name: correo-fullkod-resend
description: El correo de @fullkod.com va por Resend (buzones contact@ y support@, sin reenvío); cada proyecto decide cómo avisar de sus formularios
metadata:
  type: reference
---

# Correo de Fullkod (@fullkod.com) — 2026-10-28

- `fullkod.com` está verificado en **Resend** (cuenta de Roberto, plan Free) para **enviar y recibir**. El MX del dominio
  apunta a Resend; el reenvío de Porkbun ya no se usa.
- Buzones: **`contact@fullkod.com`** (comercial, formulario de la web) y **`support@fullkod.com`** (soporte de las apps).
  Se leen y responden en `resend.com/inboxes`. **No hay reenvío automático** a Gmail ni a nadie: Resend no lo ofrece y se
  decidió no montarlo.
- Límites del plan Free, **compartidos entre todos los proyectos** que envíen desde `@fullkod.com`: 3.000 correos/mes,
  100/día, 1 webhook, 3 buzones (queda uno libre). Un subdominio (p. ej. `lensspace.fullkod.com`) es otro dominio para
  Resend: habría que añadirlo y verificarlo aparte.
- Detalle del DNS: `memoria/reference/dominio-fullkod-dns.md` en el repo `Fullkod/hub`.

**Uso en Kshop (2026-10-28):** `RESEND_API_KEY` propia de Kshop (solo envío, limitada a `fullkod.com`) en `.env.local`
y Vercel; remitente `Kshop <noreply@fullkod.com>` (`EMAIL_FROM` opcional). Solo se envían enlaces de acceso del personal
(`apps/web/src/server/email.ts`, `staff-access.ts`): «¿Olvidaste tu contraseña?» en `/admin/login` (solo a personal de
esa tienda, misma respuesta exista o no la cuenta, 3/h por email y 10/h por IP) y Superadmin › Tienda › «Enviar acceso
al dueño» (correo + copiar/WhatsApp). Nunca a clientes: su email es sintético y rebotaría. Para probar el envío sin
gastar reputación usar `delivered@resend.dev`; las cuentas `@*.kshop.test` no existen.

**Cómo aplicarlo en este proyecto:** si tiene (o va a tener) un formulario de contacto o cualquier mensaje que deba
leer el equipo, **el proyecto tiene que buscar su propia forma de avisar** (notificación en la app, alerta por
WhatsApp, tarea en Tasknic, correo a una dirección que alguien lea…). No dar por hecho que alguien mira los buzones de
Resend a diario. Si envía desde `@fullkod.com`, usar un remitente propio (p. ej. `noreply@` o `web@`) y tener en cuenta
la cuota compartida. Nunca guardar la clave de API en el repo: va en variables de entorno.
