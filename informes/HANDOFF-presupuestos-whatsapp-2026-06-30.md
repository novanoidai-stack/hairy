# HANDOFF → Alexandro (IA/mensajería): enviar Presupuestos por WhatsApp

**Fecha:** 30 jun 2026 · **De:** Carlos+Claude · **Para:** Alexandro+Claude
**Estado:** correo HECHO (Carlos). WhatsApp PENDIENTE (tú). Todo el backend ya está listo y esperándote.

## Qué es la feature (contexto)

Nueva herramienta **Presupuestos** en el software: el profesional crea un presupuesto a una
clienta (líneas con conceptos reutilizables), genera un **PDF** y se lo manda. Cuando la clienta
lo acepta (página pública `/app/presupuesto/<token>`), aparece en **Caja** para cobrarlo (crea un
`cobro` normal, ligado al cliente si lo tiene → entra en arqueo/estadísticas). El presupuesto NO
toca contabilidad hasta que se cobra. Puede engancharse a una cita (`citas.presupuesto_id`).

- **Correo: ya funciona** (edge function `enviar-presupuesto`, Resend, PDF adjunto). No lo toques.
- **WhatsApp: tu parte.** En la UI hoy pone "Envío por WhatsApp · próximamente".

## Tu tarea: motor de envío de presupuestos por WhatsApp (n8n, cron-pull)

Misma mecánica que el workflow **"Mecha — Notificaciones"** (`notificaciones_pendientes`). Pasos:

1. **Cron cada ~2 min** → llamar RPC (service_role):
   `select public.presupuestos_pendientes_envio(50);`
   Devuelve un array JSON de presupuestos encolados:
   ```json
   [{ "presupuesto_id":"uuid", "numero":14, "token":"hex", "telefono":"+34...",
      "nombre":"Ana", "salon":"Studio X", "slug":"studio-x",
      "total_cents":4500, "pdf_path":"<negocio_id>/<presupuesto_id>.pdf" }]
   ```
   (Filtra: `whatsapp_solicitado=true AND enviado_whatsapp_at IS NULL AND telefono presente AND pdf_path presente`.)

2. **Conseguir el PDF**: el bucket privado es `presupuestos`. Firma una URL temporal con service_role:
   `storage.from('presupuestos').createSignedUrl(pdf_path, 3600)` — o descárgalo y mándalo como media.

3. **Enviar el WhatsApp** (WhatsApp del salón, mismas credenciales que ya usas para notificaciones):
   mensaje + **PDF como documento adjunto** + enlace a la página pública:
   `https://<PUBLIC_APP_URL>/app/presupuesto/<token>` (allí la clienta puede **Aceptar** y "Pedir cita").
   Sugerencia de copy: «Hola {nombre}, te paso el presupuesto de {salon} (P-{numero}), total {total}. Puedes verlo y aceptarlo aquí: <enlace>».

4. **Marcar enviado** (service_role):
   `select public.marcar_presupuesto_enviado('<presupuesto_id>', 'whatsapp');`
   (Pone `enviado_whatsapp_at=now()` y, si era borrador, pasa a `enviado`.)

### Coordinación con Carlos
Hoy la UI **no** marca `whatsapp_solicitado=true` todavía (botón "próximamente"). Cuando tu workflow
esté probado, avisa y Carlos activa el botón "Enviar por WhatsApp" en el editor (pondrá
`whatsapp_solicitado=true` y subirá el `pdf_path` antes de encolar, igual que ya hace el correo).

## Contrato de datos (ya migrado en `vtrggiogjrhqtwbhbgia`)

- Tabla `presupuestos` (cabecera) + `presupuesto_lineas` + `presupuesto_conceptos`.
  Campos clave: `estado` (borrador/enviado/aceptado/rechazado/caducado/cobrado), `token` (único, para la
  URL pública), `pdf_path`, `whatsapp_solicitado`, `enviado_whatsapp_at`, `cliente_id`, `cita_id`,
  `cobro_id`, `total_cents`, `contacto_*`.
- RPCs **service_role** (revocadas de anon/authenticated): `presupuestos_pendientes_envio(int)`,
  `marcar_presupuesto_enviado(uuid,text)`.
- RPCs públicas (anon) ya hechas: `presupuesto_publico(text)`, `aceptar_presupuesto_publico(text)`.
- RPC de cobro (authenticated, Caja): `crear_cobro_desde_presupuesto(uuid,text,int,int)`.
- Migración: `migrations/presupuestos.sql` (+ `presupuestos_seguridad`). Edge function: `supabase/functions/enviar-presupuesto`.

## Extra opcional (futuro, IA "muy top" que pidió Jose)

La clienta responde "sí quiero" por WhatsApp y **la IA le coge la cita** con ese presupuesto.
Está preparado para encajar sin rehacer nada: el presupuesto es un objeto con `cliente_id`/teléfono y
`token`. Faltaría un RPC tuyo tipo `crear_cita_desde_presupuesto(token/telefono)` que cree la cita y
rellene `citas.presupuesto_id` + `presupuestos.cita_id`. Al cobrar esa cita/presupuesto en Caja no hay
doble cargo (la lógica ya lo contempla). No es urgente; cuando lo veas.
