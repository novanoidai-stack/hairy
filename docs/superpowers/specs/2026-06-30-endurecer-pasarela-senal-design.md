# Endurecer la pasarela de señal — tokens opacos + idempotencia

- **Fecha:** 2026-06-30
- **Autor:** Alexandro
- **Ámbito:** Pagos (señal online anti no-show). Es el "paso 1" del endurecimiento de
  pagos del `ROADMAP_MECHA.md` §4.1, derivado de `informes/ESTRATEGIA_PAGOS_SUPERIORIDAD.md`
  (Fase 1: tabla `cita_pago_enlaces` con tokens opacos + `idempotency_key` para evitar
  cobros/efectos dobles).

## Motivación

El flujo de señal online funciona E2E pero expone dos debilidades:

1. **`cita_id` crudo en la URL y en el endpoint, sin segundo factor.** El enlace de pago es
   `https://mecha.app/app/pago/{cita_id}` y la edge `crear-checkout-senal` acepta cualquier
   `cita_id`. Cualquiera que sepa o itere un `cita_id` puede abrir checkouts de citas ajenas
   y filtrar el importe / la existencia de la cita.
2. **Sin idempotencia frente a reentregas de Stripe.** Stripe entrega los webhooks
   *at-least-once*. Hoy el efecto es inofensivo (el webhook hace UPDATE idempotente de
   `pagos`/`citas`), pero no hay garantía explícita de exactly-once para cuando se añadan
   efectos con escritura (p. ej. cobros online).

## Estado actual (verificado en código, 30 jun)

Puntos de entrada al pago, todos indexados por `cita_id` crudo:

1. **Motor n8n** `egkPWImnfQR1tRaA` → botón de la plantilla `enlace_pago_senal` →
   `/app/pago/{cita_id}`. El SQL `notificaciones_pendientes` (rama `senal`) emite `cita_id`;
   el Code node "Construir mensajes" arma la URL del botón.
2. **`/app/cita/[id].web.tsx:221`** → tras `confirmar_cita_oferta` con `needs_payment`,
   redirige a `/app/pago/{citaId}`.
3. **`/app/pago/[ref].web.tsx`** → `ref = cita_id` (ruta anónima).
4. **Edge `crear-checkout-senal`** → recibe `{ cita_id }`, llama a `requerir_senal_cita`,
   crea la sesión Stripe, guarda `session.id` en `pagos.pasarela_ref`.
5. **Edge `stripe-webhook`** → en `checkout.session.completed` marca `pagos`(pagado) +
   `citas`(deposito_pagado, confirmada). Ya rechaza eventos > 5 min (replay por antigüedad),
   pero no deduplica por id de evento.

Hechos relevantes:
- `notificaciones_pendientes` es **STABLE** (no puede hacer INSERT).
- `cobros.idempotency_key` **ya existe** como columna, pero **sin índice único** que la haga
  cumplir.

## Objetivos

- El `cita_id` deja de viajar en la URL y en el endpoint de pago; se sustituye por un token
  opaco e inadivinable.
- El webhook de Stripe es exactly-once de forma explícita (dedup por id de evento).
- `cobros.idempotency_key` queda blindado con un índice único parcial.

## No-objetivos (fuera de alcance)

- El webhook **no** inserta cobros fiscales. La señal sigue siendo un depósito en `pagos`;
  el cobro fiscal se crea en el POS (`crear_cobro_desde_cita`) como hasta ahora.
- Sin cambios en el cálculo del importe de la señal ni en la expiración (`expirar_citas_sin_senal`).
- Sin tocar Bizum / Redsýs / Stripe Terminal (Fases 2-3 de la estrategia).

## Diseño

### 1. Datos nuevos

**`cita_pago_enlaces`** — mapa token opaco → cita.

| Columna | Tipo | Notas |
|---|---|---|
| `token` | `text` PK | `encode(gen_random_bytes(24), 'hex')` = 48 hex / 192 bits |
| `cita_id` | `uuid` not null | `references citas(id) on delete cascade` |
| `negocio_id` | `text` not null | tenant scope / limpieza |
| `created_at` | `timestamptz` default now() | |
| `expira_at` | `timestamptz` | default `now() + interval '7 days'` |

Índice: `(cita_id)` para el *get-or-create* (el filtro `expira_at > now()` se aplica en la
consulta; no se mete `now()` en un índice parcial porque no es IMMUTABLE).
**RLS activada sin políticas** para anon/authenticated → solo la tocan las funciones
`security definer` y el `service_role`. Sin `grant` a anon. (Cumple la regla "no abrir
SELECT a anon" del CLAUDE.md del repo.)

**`stripe_webhook_eventos`** — bitácora de idempotencia del webhook.

| Columna | Tipo | Notas |
|---|---|---|
| `event_id` | `text` PK | id del evento Stripe |
| `tipo` | `text` | `event.type` |
| `recibido_at` | `timestamptz` default now() | |

RLS activada sin políticas (solo `service_role`).

**`cobros.idempotency_key`** — la columna ya existe; se añade
`create unique index ... on cobros(idempotency_key) where idempotency_key is not null`.
Hoy `crear_cobro_desde_cita` no la fija; el índice deja el invariante listo para cuando se
inserten cobros con clave (POS futuro / online). Aditivo, no rompe nada existente.

### 2. Funciones SQL

- **`enlace_pago_token(p_cita_id uuid) returns text`** — VOLATILE, SECURITY DEFINER,
  `search_path = public`. *Get-or-create*: devuelve el token vivo (no caducado) de la cita,
  o acuña uno nuevo (`negocio_id` tomado de `citas`). Idempotente. `grant execute` a
  `service_role` (y a `authenticated` solo si hiciera falta desde RPCs propias; por defecto
  solo `service_role`).
- **`resolver_enlace_pago(p_token text) returns uuid`** — STABLE, SECURITY DEFINER.
  Devuelve `cita_id` si el token existe y `expira_at > now()`; si no, NULL. Mantiene la tabla
  sellada para la edge. `grant execute` a `service_role`.

### 3. Acuñación del token — vía trigger (enfoque A)

Trigger en `citas` `AFTER INSERT OR UPDATE OF deposito_requerido`:
- Si `NEW.deposito_requerido = true and NEW.deposito_pagado = false` → llama a
  `enlace_pago_token(NEW.id)` (get-or-create; no falla si ya existe).
- Dispara solo cuando esa columna aparece en el `SET` (las citas se actualizan mucho, pero
  `UPDATE OF deposito_requerido` acota el coste). Centraliza la acuñación y cubre todos los
  canales (portal, agente IA, agenda, oferta de lista de espera) sin tocar cada uno.

Con esto `notificaciones_pendientes` **sigue STABLE**: solo hace `LEFT JOIN cita_pago_enlaces`
para leer el token ya acuñado.

### 4. Cambios de flujo (token en vez de cita_id)

- **`notificaciones_pendientes`** (rama `senal`): añade al objeto jsonb el campo
  `pago_token` = token vivo de la cita (vía LEFT JOIN, `where expira_at > now()`).
  El resto del payload intacto.
- **Motor n8n `egkPWImnfQR1tRaA`** (Code node "Construir mensajes"): el botón de
  `enlace_pago_senal` usa `pago_token` para la URL `/app/pago/{pago_token}` en vez de
  `cita_id`. 1 edit vía curl PUT con la write key (builder `Desktop/build-mecha-motor-put.js`).
- **`confirmar_cita_oferta`**: cuando `needs_payment`, devuelve también `pago_token`
  (acuñado por el trigger al marcar `deposito_requerido`; lee de `cita_pago_enlaces`).
- **`lib/reservaPublica.ts`**: `ConfirmarOfertaResult` añade `pago_token?`; el wrapper lo
  propaga.
- **`/app/cita/[id].web.tsx:221`**: redirige a `/app/pago/{pago_token}` (no `citaId`).
- **`/app/pago/[ref].web.tsx`**: `ref` pasa a interpretarse como **token**; envía
  `{ token: ref }` a la edge.
- **Edge `crear-checkout-senal`**: recibe **solo `{ token }`** → `resolver_enlace_pago(token)`
  → si NULL responde 404 `enlace_invalido`; si resuelve, continúa exactamente igual con el
  `cita_id` resuelto. Ya **no** acepta `cita_id` directo.

### 5. Idempotencia del webhook

`stripe-webhook`, antes de ejecutar efectos:
```ts
const { error: dup } = await supabase
  .from('stripe_webhook_eventos')
  .insert({ event_id: event.id, tipo: event.type });
if (dup) return new Response('ok (dup)', { status: 200 }); // unique violation -> ya procesado
```
Si la inserción tiene éxito, se ejecutan los efectos (UPDATE de `pagos`/`citas`) como hoy.
Resultado: exactly-once aunque Stripe reentregue. Se conserva el rechazo por antigüedad
(> 5 min) ya existente.

## Seguridad / RLS

- `cita_pago_enlaces` y `stripe_webhook_eventos`: RLS ON, **cero políticas** para
  anon/authenticated; acceso solo por `service_role` y funciones `security definer`. Sin
  `grant select` a anon.
- El token (192 bits) es inadivinable; caduca a 7 días; `on delete cascade` lo limpia con la
  cita. La autorización efectiva del pago no cambia: sigue dependiendo de `requerir_senal_cita`.
- Tras la migración: pasar los **advisors de seguridad** de Supabase (regla del repo); sin
  ERROR nuevo.

## Pruebas / verificación

1. **SQL con datos sintéticos en tenant aislado** (estilo lista de espera): acuñar token al
   marcar `deposito_requerido`; `resolver_enlace_pago` devuelve la cita; token caducado →
   NULL; token inexistente → NULL.
2. **Idempotencia**: simular doble inserción del mismo `event_id` → un solo efecto.
3. **Edge `crear-checkout-senal`**: `token` válido → checkout_url; token inválido → 404;
   `cita_id` directo → ya no funciona (regresión esperada).
4. **Frontend**: `typecheck` 0 errores nuestros + `npm run build:web` OK; humo en navegador
   del flujo de oferta (redirección a `/app/pago/{token}`).
5. **n8n**: ejecución real del motor → la URL del botón lleva el token; advisors sin ERROR.

## Riesgos / decisiones tomadas

- **Enlaces antiguos con `cita_id`** enviados justo antes del deploy quedan inválidos. Viven
  ~15 min (ventana de expiración de señal) y estamos en demo → asumible.
- **Token reutilizable hasta caducar** (no single-use): el pago repetido ya está protegido por
  `pagos.estado='pagado'` (la edge devuelve `ya_pagado`). No se añade single-use (YAGNI).
- **Acuñación por trigger** elegida sobre "mint en la cola" para mantener
  `notificaciones_pendientes` STABLE y centralizar la lógica.
