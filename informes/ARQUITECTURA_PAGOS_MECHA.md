# Arquitectura — Pagos y unificación de fuentes de citas (Mecha)

> Estado: **diseño** (15 jun 2026). El motor de pasarela (Stripe) lo implementa
> **Alexandro** (regla del proyecto: lo que mueve dinero / usa IA / integra terceros).
> Carlos deja preparado el **lado de la cita** (modelo, enlace público, modo invitado,
> consentimiento) y la UI gated en "Próximamente". Este doc define el flujo objetivo.

## 1. Objetivos

1. Una cita es **una cita** venga de donde venga: portal/QR, agente de WhatsApp, agente
   de voz, Buxi o creada a mano. Mismo modelo, mismos campos mínimos, misma lógica.
2. Cobro **flexible**: señal **antes** (anti no-show) **o** pago **después** del servicio
   (el cliente no sabía qué se iba a hacer; al terminar se le pasa enlace/QR).
3. **Sin cuenta**: reservar/pagar nunca exige registro. El cliente solo deja datos mínimos
   y acepta una política breve. Reservar tiene que ser rápido.
4. Todo pago queda **ligado a su cita** de forma segura y **verificable** (el sistema sabe
   qué cita pagó cada importe, aunque la cita fuera "invitada").

## 2. Lo que ya existe (no reinventar)

- Tabla `pagos` (gateway-agnóstica): `cita_id`, `cliente_id`, `tipo` (`senal|total|reembolso`),
  `importe_cents`, `estado` (`pendiente|pagado|fallido|reembolsado|cancelado`), `pasarela`,
  `pasarela_ref`, `metodo`, `metadata`. (`migrations/pagos.sql`).
- `importe_senal_servicio(servicio_id)` y `requerir_senal_cita(cita_id)` (crea/actualiza un
  pago `senal` pendiente, idempotente, suma encadenados de grupo).
- `servicios.prepago_requerido` / `prepago_porcentaje` / `prepago_cantidad_fija`.
- `citas`: `estado`, `canal`, `deposito_requerido/_pagado/_importe`, `confirmado_por_cliente`,
  `grupo_id`, `orden_en_grupo`.
- Portal público anónimo con RPCs `security definer` y anti-abuso (`crear_cita_publica`, …).
  El portal **ya** crea citas en modo invitado (canal `web`) sin cuenta.

## 3. Modelo de cita unificado

Toda fuente produce una cita con los mismos campos mínimos. Diferenciamos el **origen** y la
**autoría**, no el formato.

Campos a normalizar en `citas` (algunos ya existen):

| Campo | Valores | Notas |
|---|---|---|
| `canal` | `portal` · `whatsapp` · `voz` · `buxi` · `manual` | Renombrar `web`→`portal` o aceptar ambos. Fuente de la cita. |
| `autoria` | `cliente` · `ia` · `staff` | Quién la creó. La capa IA (A1–A6, de Alexandro) marca `ia`. |
| `estado` | `pendiente` · `confirmada` · … | `pendiente` si falta señal; `confirmada` si no requiere o ya pagó. |
| `es_invitado` | bool | True si el cliente no tiene cuenta (caso por defecto del cliente final). |
| `consentimiento_datos` | bool + `consentimiento_at` | El cliente aceptó la política de datos (RGPD) al reservar o al pagar. |

Cliente: el upsert por teléfono dentro del negocio ya existe en `crear_cita_publica`. Un
"cliente invitado" es simplemente un `clientes` con datos mínimos (nombre + teléfono) y sin
`auth` asociado. Si luego aparece por otro canal con el mismo teléfono, se reutiliza.

**Datos mínimos** que toda fuente debe rellenar para que la cita cumpla la lógica actual:
`nombre`, `telefono` (clave de identidad), y opcional `email`. Nada más es obligatorio.

## 4. El enlace público de pago (pieza central)

Para cobrar **antes o después** sin cuenta, cada cita (o grupo) puede generar un **enlace de
pago público** atado a un **token opaco**, no al `cita_id`.

```
/app/pagar/<token>
```

- `token`: aleatorio (32 bytes, base64url), **inadivinable**, único, con caducidad opcional y
  de un solo propósito. Vive en una tabla `cita_pago_enlaces` (o columna `citas.pago_token`):
  `{ token, cita_id (cabecera del grupo), negocio_id, tipo (senal|total), expira_at, usado_at }`.
- Lo genera quien corresponda:
  - **Antes**: al crear la reserva con prepago (portal/agente) → se devuelve el enlace.
  - **Después**: el profesional/recepción pulsa "Cobrar" en la cita → genera enlace + QR.
    También un agente puede generarlo y mandarlo por WhatsApp.

### RPCs públicas (security definer, grant a `anon`) — patrón del portal

- `pago_info_publica(token)` → `{ negocio_nombre, servicio(s), fecha, hora, importe_cents,
  moneda, tipo, estado, requiere_datos: bool }`. **Sin PII** más allá de lo imprescindible;
  el importe se calcula **en servidor** (nunca se confía en el cliente). `requiere_datos` es
  true si la cita es invitada y faltan nombre/teléfono.
- `completar_datos_pago_publico(token, nombre, telefono, email?, acepto_politica)` → escribe
  los datos mínimos en el `clientes`/`citas` de esa cita y marca el consentimiento. Es el
  "pide esos dos datos al pagar" del caso invitado. Anti-abuso por token/teléfono/IP.
- `iniciar_pago_publico(token)` → crea (o reutiliza) el `pagos` pendiente y devuelve lo que
  Stripe necesita (Checkout Session URL / PaymentIntent client_secret). **(Alexandro)**.

### Webhook de pasarela (Alexandro)

- Verifica firma de Stripe. Marca `pagos.estado='pagado'`, `paid_at`, `pasarela_ref`.
- Efecto en la cita (por `cita_id` del pago, no por datos del cliente):
  - señal pagada → `citas.deposito_pagado=true`, `estado='confirmada'`.
  - pago total después → registra `tipo='total'` ligado a la cita; la cita ya estaba
    `completada`/`confirmada`. Queda la trazabilidad pago↔cita.
- **Idempotente**: índice único sugerido `(cita_id, tipo, estado)` para señal pendiente +
  dedupe por `pasarela_ref`. El webhook puede llegar varias veces.

## 5. Flujos

### A) Pago ANTES (señal anti no-show) — casi listo
1. Cliente reserva (portal/agente). Servicio con `prepago_requerido`.
2. `crear_cita_publica` crea la cita `pendiente` + `requerir_senal_cita` crea el `pagos` señal.
3. Se devuelve el **enlace de pago** (o Checkout embebido). Cliente paga.
4. Webhook → cita `confirmada`. Si no paga en X min, queda pendiente (o se libera, política aparte).

### B) Pago DESPUÉS — nuevo
1. La cita existe (la reservó el cliente, un agente, o la creó el profesional en modo invitado).
   Puede no tener señal.
2. Al terminar, el profesional pulsa **"Cobrar"** en la ficha de la cita → se genera enlace/QR
   `tipo=total` por el importe del/los servicio(s) realizados.
3. El cliente escanea el QR / abre el link → `pago_info_publica(token)`:
   - Si la cita era **invitada** y faltan datos → primero `completar_datos_pago_publico`
     (nombre + teléfono + aceptar política). Así la cita queda cumplimentada con toda la lógica.
   - Paga con `iniciar_pago_publico`.
4. Webhook → `pagos` `pagado` ligado a esa cita. El sistema **sabe** que ese pago es de esa cita
   (vía token→cita_id), aunque se creara en modo invitado.

### C) Cita en modo invitado creada por el profesional
- El profesional crea la cita poniendo solo nombre (o ni eso: "Cliente sin nombre"). `es_invitado=true`.
- Cuando el cliente paga por el enlace, se completan los dos datos y el consentimiento.
- Resultado idéntico a una cita del portal: misma forma, misma trazabilidad.

## 6. Modo invitado, datos mínimos y privacidad (lado Carlos)

- En el portal de reserva (ya hecho) y en el enlace de pago: pedir **solo** nombre + teléfono
  (email opcional) + un check de **aceptación de política de datos** (enlazando a
  `web/privacidad.html`). Resaltar el valor: "con tus datos te avisamos de tu cita y de
  cambios". Sin registro, sin contraseña.
- Guardar `consentimiento_datos` + `consentimiento_at` en la cita/cliente. Es el gancho RGPD
  y la base para que la captación de datos sea legítima.

## 7. Cambios de datos propuestos (DDL — los aplica Alexandro al construir)

```sql
alter table citas add column if not exists autoria text
  check (autoria in ('cliente','ia','staff')) default 'cliente';
alter table citas add column if not exists es_invitado boolean default false;
alter table citas add column if not exists consentimiento_datos boolean default false;
alter table citas add column if not exists consentimiento_at timestamptz;

create table if not exists cita_pago_enlaces (
  token text primary key,                 -- aleatorio, inadivinable
  negocio_id text not null,
  cita_id uuid not null references citas(id) on delete cascade,
  tipo text not null check (tipo in ('senal','total')),
  importe_cents integer,                   -- snapshot opcional; el server recalcula
  expira_at timestamptz,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);
-- + RPCs pago_info_publica / completar_datos_pago_publico / iniciar_pago_publico
-- + grants a anon, anti-abuso por token/telefono/IP, advisors de seguridad tras migrar.
```

`canal`: aceptar `portal|whatsapp|voz|buxi|manual`. Mapear el `web` actual a `portal`.

## 8. Reparto

| Pieza | Quién |
|---|---|
| Modelo de cita unificado (canal/autoría/invitado/consentimiento) | Carlos (DDL) + Alexandro (lo usan los agentes) |
| Modo invitado + datos mínimos + política en portal y enlace | **Carlos** |
| Enlace público de pago: token, `cita_pago_enlaces`, `pago_info_publica`, `completar_datos_pago_publico` | **Carlos** (cita-side, sin dinero) |
| `iniciar_pago_publico` + Stripe Checkout + webhook + reembolsos | **Alexandro** |
| Generar enlace/QR "Cobrar" desde la ficha de cita (UI) | Carlos (UI) sobre RPC de Alexandro |
| Agentes WhatsApp/voz/Buxi que crean citas y mandan enlaces | **Alexandro** |

## 9. Principios de seguridad

- Importes **siempre** server-side (`importe_senal_servicio` / recálculo por servicios reales).
- Token aleatorio, único, caducable, de un uso; nunca exponer `cita_id` ni PII en la URL.
- RPCs públicas `security definer`, sin SELECT directo a `citas`/`clientes`/`pagos` para `anon`.
- Webhook con verificación de firma + idempotencia (dedupe por `pasarela_ref`).
- Anti-abuso por token/teléfono/IP (mismo patrón que el portal).
- Tras cualquier migración: pasar advisors de seguridad de Supabase.

## 10. Hecho ya / pendiente

- Hecho (Carlos, 15 jun): stub "Cobro después del servicio · Próximamente" en el editor de
  servicios; portal de reserva en modo invitado funcional (falta solo el check de política).
- Hecho (Alexandro, previo): `pagos`, `importe_senal_servicio`, `requerir_senal_cita`.
- Siguiente: acordar DDL §7, construir el enlace público (Carlos) y enchufar Stripe (Alexandro).
