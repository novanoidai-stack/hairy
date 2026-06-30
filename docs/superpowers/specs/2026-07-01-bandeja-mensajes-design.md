# Bandeja de mensajes (comunicación cliente → salón) — diseño

**Fecha:** 1 jul 2026 · **Autor:** Carlos + Claude

## Objetivo

Hoy la página pública de un presupuesto solo permite **Aceptar**. El cliente no tiene forma
de rechazarlo explicando por qué, pedir un cambio, o simplemente escribir. Y en general, un
cliente de un salón no tiene ninguna vía para contactar con el salón *a través de Mecha*: ni
desde el portal de reserva, ni desde la gestión de su cita.

Esta entrega añade:
1. Un **hilo de conversación** en la página pública del presupuesto (rechazar con motivo /
   pedir cambio / mensaje libre), visible para el cliente y para el salón.
2. Una página pública **"Contactar con el salón"** (`/app/contacto/<slug>`) con teléfono,
   WhatsApp (si hay teléfono configurado) y un formulario de mensaje — enlazada desde el
   portal de reserva y desde la autogestión de cita.
3. Una **Bandeja de entrada** en el software: sección propia para gestionar todos estos
   mensajes (leer, responder por correo, marcar resuelto), con aviso también en el panel
   "Avisos" de la Agenda.

**Fuera de alcance (YAGNI, fase 2):** WhatsApp/voz real (Alexandro — capa de IA transversal),
hilo de seguimiento con token para los mensajes de "Contactar" (es un disparo único, se
responde por correo), versionado de presupuestos, asignar conversaciones a un profesional
concreto, adjuntar archivos en los mensajes.

## Modelo de datos (migración `migrations/bandeja-mensajes.sql`)

Una única tabla de conversaciones cubre los dos orígenes, porque ambos caen en la misma
bandeja del salón:

```
conversaciones
  id, negocio_id,
  origen           text check in ('presupuesto','contacto'),
  presupuesto_id   uuid references presupuestos(id) on delete set null,  -- solo origen=presupuesto
  cliente_id       uuid references clientes(id) on delete set null,     -- si se matchea por telefono
  contacto_nombre, contacto_telefono, contacto_email,
  estado           text check in ('abierta','resuelta') default 'abierta',
  leido_at         timestamptz,        -- null = sin leer por el salon
  created_at, ultimo_mensaje_at

mensajes_conversacion
  id, conversacion_id references conversaciones(id) on delete cascade,
  autor            text check in ('cliente','salon'),
  tipo             text check in ('mensaje','rechazo','cambio') default 'mensaje',
  cuerpo           text not null,
  notificado_at    timestamptz,   -- marca que ya se avisó por correo al salon (idempotencia)
  enviado_email_at timestamptz,   -- solo autor='salon': cuándo se envió la respuesta por correo
  created_at timestamptz default now()
```

Reglas:
- `tipo='rechazo'` (solo desde un presupuesto) además actualiza `presupuestos.estado = 'rechazado'`.
  `tipo='cambio'` y `'mensaje'` no tocan el estado del presupuesto — sigue aceptable mientras
  el salón lo revisa o lo edita y reenvía (el editor actual ya soporta editar/reenviar).
- Para `origen='contacto'` se exige al menos `contacto_telefono` o `contacto_email`.
- Un presupuesto tiene **como mucho una conversación** (se reutiliza si el cliente escribe
  varias veces); índice único `(presupuesto_id) where presupuesto_id is not null`.
- RLS: mismo patrón que `presupuestos` (select/insert/update propio del negocio +
  RESTRICTIVE de bloqueo de escritura para el visitante de la demo compartida en `mensajes_conversacion`
  de tipo respuesta-salón; lectura sí permitida en demo).
- Multi-tenant `negocio_id` + índices por `(negocio_id, estado, ultimo_mensaje_at desc)`.

## RPCs

**Anónimas (anon), con anti-abuso server-side — mismo patrón que `crear_resena_publica`:**

- `presupuesto_publico(p_token)` — **se amplía** para devolver también `mensajes: []` (autor,
  tipo, cuerpo, created_at) del hilo, así la página pinta la conversación.
- `presupuesto_enviar_mensaje_publico(p_token, p_tipo, p_cuerpo)` → crea/reutiliza la
  conversación del presupuesto, inserta el mensaje (autor='cliente'), y si `p_tipo='rechazo'`
  marca `presupuestos.estado='rechazado'`. Límite: máx 5 mensajes/hora por token, cuerpo ≤ 1000
  caracteres.
- `negocio_contacto_publico(p_slug)` → identidad pública mínima del salón (nombre, logo,
  color, teléfono, dirección) para pintar `/app/contacto/<slug>`.
- `enviar_mensaje_contacto_publico(p_slug, p_nombre, p_telefono, p_email, p_cuerpo)` → crea
  conversación `origen='contacto'` + mensaje. Anti-abuso: máx 3/día por IP y negocio, máx
  30/día por negocio (igual que reseñas); nombre ≥ 2, cuerpo ≤ 1000, exige teléfono o email.

**Autenticadas (staff, vía RLS normal, sin RPC dedicada):** listar conversaciones, marcar
`leido_at`/`estado` e insertar el mensaje de respuesta del salón son updates/inserts directos
contra las tablas (RLS ya restringe a `negocio_id` propio, como en `presupuestos`).

## Edge functions (correo, SMTP Hostinger — mismo patrón que `enviar-presupuesto`)

- **`notificar-bandeja`** (`verify_jwt=false`, la llama la página pública anónima justo
  después de que la RPC cree el mensaje): recibe `{ mensaje_id }`, resuelve `negocio_id` desde
  la conversación, busca el correo del `owner` en `profiles`, y si `notificado_at` es null
  envía un aviso corto ("Tienes un mensaje nuevo de <nombre> sobre <presupuesto P-X / contacto>")
  con enlace a `/app/bandeja`, y marca `notificado_at`. Idempotente — un reintento o doble click
  no reenvía. El destino nunca lo controla el llamante (se deriva siempre del `negocio_id` de
  la conversación ya existente), así que no hay vector de envío a direcciones arbitrarias.
- **`responder-mensaje-bandeja`** (`verify_jwt=false`, auth propia igual que
  `enviar-presupuesto`: valida el JWT del usuario a mano y comprueba que su `negocio_id`
  coincide con el de la conversación): recibe `{ mensaje_id }` de un mensaje `autor='salon'`
  ya insertado por el dashboard, envía el correo (mismo remitente “Nombre del salón
  <buzon@mechaa.es>”, `reply-to` = email del owner) al `contacto_email` de la conversación
  (o al email de `clientes` si está enganchada a un cliente con ficha), y marca
  `enviado_email_at`. Si no hay email de destino, devuelve error claro (`sin_email`) — el
  salón verá el aviso en el hilo y deberá llamar/escribir por WhatsApp aparte.

## UI

**Página pública del presupuesto** (`app/presupuesto/[token].web.tsx`): debajo del bloque de
acciones actual, un bloque "Conversación" con el hilo (burbujas cliente/salón) y, si
`aceptable`, tres acciones: **Rechazar** (abre textarea de motivo, opcional pero animado con
placeholder), **Pedir un cambio** (textarea), **Escribir un mensaje** (textarea libre). Si ya
está `rechazado`, se sigue mostrando el hilo y se puede seguir escribiendo (el salón puede
reabrir editando y reenviando). Si está `cobrado`, el hilo queda visible en solo lectura.

**Página nueva `app/contacto/[slug].web.tsx`** (+ stub nativo): mismo lenguaje visual que el
portal (`/app/r/[slug]`). Cabecera con logo/nombre del salón. Si hay teléfono: botón "Llamar"
(`tel:`) y botón "WhatsApp" (`https://wa.me/<telefono>`). Formulario: nombre, teléfono o email
(al menos uno), mensaje. Al enviar: confirmación simple ("Te responderemos por correo en
breve") — sin hilo ni token de seguimiento. Ruta exenta de los guards de auth (añadir
`'contacto'` a `isPublicRoute` en `app/_layout.tsx`, junto a `r`/`resena`/`cita`/`pago`/`presupuesto`).
Enlace "¿Dudas? Contacta con el salón" añadido al pie del portal (`/app/r/[slug].web.tsx`) y
de la autogestión de cita (`/app/cita/[id].web.tsx`).

**Bandeja (software)** — nueva sección `app/(tabs)/bandeja.web.tsx` (+ stub nativo):
- Entrada en `Sidebar` (icono `mail-outline`) con badge de no leídos, y en la hoja "Más" de
  `MobileTabBar` (mismo patrón que Presupuestos/Lista de espera).
- Lista de conversaciones (más reciente arriba), filtros por estado (abiertas/todas) y origen,
  con chip "Sin leer". Cada fila: nombre del contacto, último mensaje (preview), si viene de un
  presupuesto un chip "P-<numero>" que enlaza a su detalle.
- Detalle: hilo completo + textarea de respuesta → "Enviar por correo" (inserta el mensaje
  autor='salon' y llama a `responder-mensaje-bandeja`). Botón "Marcar resuelta" / "Reabrir".
  Si la conversación viene de un presupuesto, tarjeta resumen (total, estado, líneas) con
  enlace a abrirlo en el editor de Presupuestos — para "hablar de la propuesta" con contexto
  a la vista.
- Al abrir una conversación se marca `leido_at = now()`.

**Avisos (panel de la Agenda, `components/agenda/AgendaCalendar.web.tsx`):** se suma el conteo
de conversaciones sin leer (`leido_at is null`) al badge ya existente (`totalAvisos`), con una
línea "X mensajes nuevos" que enlaza a `/(tabs)/bandeja`. No sustituye la pestaña — es solo
visibilidad rápida, como ya pasa con las citas sin confirmar.

## Seguridad

- Mismo patrón de anti-abuso inline que `crear_resena_publica`/`crear_cita_publica`
  (límites por `request_ip()` + por negocio/token; sin tabla de rate-limit nueva).
- `mensajes_conversacion`/`conversaciones`: sin `SELECT` directo a `anon` — todo pasa por las
  RPCs `security definer` listadas arriba. Tras la migración, pasar `get_advisors` (security).
- Las edge functions nunca reciben la dirección de destino desde el llamante: siempre se
  deriva server-side (de la conversación / del owner del negocio).

## Validación

- `npx tsc --noEmit`, `npm run build:web`.
- Migración aplicada vía MCP de Supabase + `get_advisors` limpio.
- Smoke test E2E en navegador real: rechazar un presupuesto de la demo con motivo, comprobar
  que aparece en la Bandeja, responder, comprobar que aparece como respuesta del salón en el
  hilo público; enviar un mensaje desde `/app/contacto/demo`.
