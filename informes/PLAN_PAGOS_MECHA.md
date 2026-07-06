# 💳 PLAN DE SESIONES — PAGOS (Mecha)

> **Fecha:** 6 de julio de 2026
> **Autor:** Alexandro (backend/pagos/IA) — plan de trabajo por sesiones.
> **Propósito:** Descomponer TODA la parte de pagos de Mecha en sesiones ejecutables, con
> estado real, esfuerzo, dependencias y gating externo. Mismo espíritu que la §7 (IA) del
> `MEGA_INFORME_MECHA.md`: cada pieza etiquetada, con "qué construye" y "qué falta".
> **Fuentes:** `informes/ESTRATEGIA_PAGOS_SUPERIORIDAD.md` (4 pilares + Fases 1/2/3),
> `informes/ARQUITECTURA_PAGOS_MECHA.md` (flujo pago antes/después + enlace público),
> §4 de `ROADMAP_MECHA.md`, y el código real en `supabase/functions/`.
>
> **Reparto:** todo lo que mueve dinero es de **Alexandro**. Carlos deja el lado de la cita
> (modelo, UI del enlace/QR, badges) sobre las RPCs que expongo. Se marca **[A]** / **[C]**
> en cada pieza.

---

## 1. Estado de partida — BLOQUE 0 (YA HECHO, en producción)

Lo construido hasta hoy. No se re-hace; es la base sobre la que montan las sesiones.

| Pieza | Detalle | Estado |
|---|---|---|
| Modelo de datos agnóstico | Tabla `pagos` (`cita_id`, `cliente_id`, `tipo` senal/total/reembolso, `importe_cents`, `estado`, `pasarela`, `pasarela_ref`, `metodo`, `metadata`). `importe_senal_servicio()`, `requerir_senal_cita()` (idempotente, suma encadenados de grupo). | ✅ prod |
| Señal Stripe P1 | Edge `crear-checkout-senal` (Checkout Session) + `stripe-webhook` (`checkout.session.completed` → cita `confirmada`+`deposito_pagado`). Página `/app/pago/[ref]` + `/app/pago/ok`. Expiración `expirar_citas_sin_senal` (cron n8n, libera hueco a los 15 min). | ✅ prod |
| Endurecimiento (Paso 1) | Tokens opacos `cita_pago_enlaces` (64 hex → cita, acuñado por trigger `citas_acunar_enlace_pago`), `enlace_pago_token()`/`resolver_enlace_pago()`; el enlace ya NO expone `cita_id`. Idempotencia webhook `stripe_webhook_eventos` (exactly-once), replay protection (>5 min → 400), índice único `cobros.idempotency_key`. Commit `47245889`. | ✅ prod |
| Pilar 3 — Depósitos dinámicos | `perfil_riesgo_cliente()` (exento/normal/riesgo/alto, modo auto/manual/ambos, VIP exento), `deposito_dinamico_cents()`, override por cliente, checkout coherente, reservas online + staff + ofertas de lista de espera. Toggle `depositoDinamicoActivo` (OFF por defecto). | ✅ prod |
| Base de cumplimiento | Inmutabilidad de `cobros` (`compliance-antifraude-inmutabilidad.sql`, commit `9dc3a778`). | ✅ prod (parcial) |

**Deuda conocida del Bloque 0 (a saldar en las primeras sesiones):**
- Las edge functions aún tienen `success_url`/`cancel_url` por defecto a `https://mecha.app/...`.
  El dominio canónico es ahora **`https://www.mechaa.es`** (ver CLAUDE.md del repo). Actualizar.
- `crear-checkout-senal` sólo cubre `tipo=senal`. El flujo **"pago después"** (`tipo=total`) del
  `ARQUITECTURA_PAGOS` §5-B aún no existe.
- Relación **`pagos` ↔ `cobros`** por confirmar/unificar: `pagos` = pasarela (señal), `cobros` =
  caja fiscal inmutable. Se aclara en S8.
- E2E de pago real con tarjeta 4242 + reenvío de evento (dedup en vivo) sigue como verificación
  manual pendiente.

---

## 2. Marco: 4 pilares × 3 fases

La estrategia (`ESTRATEGIA_PAGOS_SUPERIORIDAD.md`) define **4 pilares de valor**; la ruta técnica
define **3 fases**. Las sesiones de este plan cubren ambos ejes:

- **Pilar 1** — Tasas híbridas + BYOP (Mecha Pay/Stripe vs TPV propio Redsýs/Bizum) → **S5, S6**
- **Pilar 2** — Datáfono virtual (Tap to Pay NFC + QR dinámico) → **S1 (QR), S7 (Tap to Pay)**
- **Pilar 3** — Depósitos dinámicos por riesgo (holds/pre-auth) → **Bloque 0 (base) + S3 (holds)**
- **Pilar 4** — Automatización E2E (propinas, pago dividido, VeriFactu) → **S4, S8**

- **Fase 1** — Enlace + webhook Stripe → ✅ Bloque 0 (hecho y endurecido)
- **Fase 2** — Bizum + Redsýs (BYOP) → **S6**
- **Fase 3** — Stripe Terminal (Tap to Pay) → **S7**

---

## 3. Tabla resumen de sesiones

Orden por **valor near-term ↑** y **dependencia externa ↓** (S1–S4 ejecutables ya; S5–S8 con
gating estratégico/externo). Esfuerzo: S ≈ ½–1 día · M ≈ 2–3 días · L ≈ ~1 semana · XL ≈ varias
semanas o bloqueado por terceros.

| # | Sesión | Pilar/Fase | Esfuerzo | Gating externo |
|---|---|---|---|---|
| **S1** ✅ | Cobro en el local ("pago después") + QR de mostrador | Pilar 2 (QR) | L | — |
| **S2** | Reembolsos + robustez del webhook | Ciclo de vida | M | — |
| **S3** | Holds / pre-autorizaciones (completa Pilar 3) | Pilar 3 | M | — |
| **S4** | Propinas + pago dividido / grupal | Pilar 4 | L | — |
| **S5** | Mecha Pay + Stripe Connect (modelo de tasas) | Pilar 1 | XL | KYC Stripe Connect |
| **S6** | BYOP: Bizum + Redsýs (Fase 2) | Pilar 1 / Fase 2 | XL | Credenciales Redsýs del salón |
| **S7** | Datáfono virtual: Tap to Pay (Fase 3) | Pilar 2 / Fase 3 | XL | App nativa + elegibilidad Stripe Terminal |
| **S8** | Fiscalidad VeriFactu + factura simplificada | Pilar 4 / Cumplimiento | XL | Fiscalista / DPA |

---

## 4. Detalle por sesión

Cada sesión: **Objetivo · Piezas (con [A]/[C] y esfuerzo) · Modelo/flujo · Estado · Pendiente
externo (tú) · Verificación**.

---

### S1 — Cobro en el local ("pago después") + QR de mostrador

**Objetivo:** cobrar el importe **total** del servicio realizado, en el mostrador, sin cuenta y
sin datáfono físico. Es el flujo B del `ARQUITECTURA_PAGOS` §5 y el "P2 cobro por QR" que sigue
pendiente en el CLAUDE.md del repo. Generaliza el enlace de pago (hoy sólo `senal`) a `total`.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S1.1 | Ampliar `cita_pago_enlaces` a `tipo` (`senal`/`total`) y RPC `enlace_pago_token(cita_id, tipo)` get-or-create por tipo | [A] | S |
| S1.2 | RPC `pago_info_publica(token)` → `{negocio_nombre, servicio(s), fecha, hora, importe_cents, moneda, tipo, estado, requiere_datos}` — **sin PII**, importe recalculado en servidor | [A] | S |
| S1.3 | RPC `completar_datos_pago_publico(token, nombre, telefono, email?, acepto_politica)` (caso invitado; escribe datos mínimos + consentimiento; anti-abuso token/tel/IP) | [A] | M |
| S1.4 | Edge `crear-checkout-pago` (o ampliar `crear-checkout-senal`) para `tipo=total`: importe = suma de servicios realizados, no `importe_senal_servicio` | [A] | M |
| S1.5 | Webhook: en `checkout.session.completed` con `tipo=total`, registrar `pagos` pagado ligado a la cita (sin forzar `confirmada`; la cita ya está `completada`) | [A] | S |
| S1.6 | UI "Cobrar" en la ficha de la cita → llama RPC, muestra **QR** (Bizum/Apple/Google Pay via Stripe) + enlace copiable | [C] sobre RPC [A] | M |
| S1.7 | Actualizar `success_url`/`cancel_url` a `https://www.mechaa.es/...` (saldar deuda Bloque 0) | [A] | XS |

**Modelo/flujo:** reusa `pagos` (`tipo='total'`) + `cita_pago_enlaces` (token opaco). El QR es
la URL del Checkout de Stripe (que ya ofrece Bizum/Apple Pay/Google Pay como métodos). Importe
**siempre server-side** a partir de los servicios reales de la cita.

**Estado:** ✅ **HECHO y en producción (6 jul 2026).** Migración `migrations/cobro-online-total-qr.sql`
aplicada al remoto; edges `crear-checkout-cobro` (nueva) y `stripe-webhook` (v13, ramifica tipo)
desplegadas; página anónima `app/pagar/[token].web.tsx` + ruta exenta de auth; botón "Cobrar con QR"
en `components/pos/CobroSheet.tsx` (mode cita, 1 cita → `iniciar_cobro_online` + QR del enlace).
Diferencias vs el diseño inicial (por el código real): se descubrió que **el POS/caja ya existe**
(`cobros`/`cobro_lineas` + `crear_cobro_desde_cita`), así que el QR concilia en `cobros` (metodo
`online`/`bizum`, origen `portal`) vía `registrar_cobro_online` (service_role, idempotente); el QR
apunta a `/app/pagar/<token>` (Checkout hospedado por Stripe), no hace falta página propia para el
mostrador pero se construyó igual para el enlace anónimo. `cobros` es inmutable (trigger antifraude):
el cobro se **crea** al confirmar el webhook, nunca se pre-crea+actualiza.

**Pendiente externo (tú):** activar **Bizum + Apple/Google Pay** como métodos en el dashboard de
Stripe (Payment methods) para que aparezcan en el Checkout. Y el **E2E con tarjeta real 4242 + Bizum
test** desde un navegador (no automatizable sin tarjeta).

**Verificación (6 jul):** E2E completo a nivel BD en tenant aislado (la ruta exacta que ejecutan la
edge y el webhook): total = precio − señal − descuento + propina (2500 = 3000−500) ✅; token 64 hex,
resolver tipo=total ✅; `pago_info_publica` importe/salón/requiere_datos ✅; `registrar_cobro_online`
crea 1 cobro (online/portal, cita cobrada, 1 línea) e **idempotente** (2ª llamada = mismo cobro, sin
duplicar) ✅; invitado: requiere_datos true→false, cliente actualizado + consentimiento ✅. Advisors
sin ERROR (solo el WARN by-design `anon_security_definer_function_executable`, como el resto del portal).
Typecheck + build web OK. Navegador: `/app/pagar/<token>` inválido renderiza "Enlace no válido" (ruta
anónima no bloqueada, RPC alcanzable), sin errores de consola. Datos de prueba limpiados.

---

### S2 — Reembolsos + robustez del webhook

**Objetivo:** cerrar el ciclo de vida del pago. Hoy sólo se maneja el "happy path"
(`checkout.session.completed`). Falta reembolsar y reaccionar a fallos.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S2.1 | Edge/RPC `reembolsar_pago(pago_id, importe_cents?)` → `stripe.refunds.create`; registra `pagos` `tipo='reembolso'` (negativo o fila propia) ligado a la cita | [A] | M |
| S2.2 | Webhook: manejar `charge.refunded` (marca reembolsado), `payment_intent.payment_failed` / `checkout.session.expired` (marca `pagos` fallido; libera la cita según política) | [A] | S |
| S2.3 | Efecto en la cita al reembolsar la señal: política (¿vuelve a `pendiente`? ¿se cancela?) — decisión de negocio | [A] + decisión | S |
| S2.4 | UI: botón "Reembolsar" en la ficha (gated a gestor) + estado visible del pago/reembolso | [C] sobre RPC [A] | M |
| S2.5 | Hardening: log estructurado de eventos, tipos de evento no manejados → 200 + traza (no romper) | [A] | S |

**Estado:** diseño. El webhook actual ya tiene firma + idempotencia + replay protection (buena
base); sólo cubre un tipo de evento.

**Pendiente externo (tú):** suscribir en el endpoint del webhook de Stripe los eventos
`charge.refunded`, `payment_intent.payment_failed`, `checkout.session.expired`.

**Verificación:** pago → reembolso total y parcial (importe correcto en Stripe + `pagos`);
pago fallido/expirado → estado coherente; reenvío de evento no duplica (dedup en vivo — cierra
también la verificación manual pendiente del Bloque 0).

---

### S3 — Holds / pre-autorizaciones (completa Pilar 3)

**Objetivo:** en vez de **cobrar** la fianza por adelantado, **retenerla** (hold). Si el cliente
asiste, se libera o se captura como pago; si no asiste, se captura la penalización. Menos
fricción para el cliente, misma protección anti no-show. Es el punto que le falta al Pilar 3.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S3.1 | Checkout/PaymentIntent con `capture_method='manual'` para la fianza (hold en vez de cobro) | [A] | M |
| S3.2 | RPC/edge `capturar_hold(pago_id, importe_cents?)` (no-show → captura) y `liberar_hold(pago_id)` (asiste → release) | [A] | M |
| S3.3 | Config por salón: modo fianza `cobro` vs `hold` (toggle `depositoModoFianza`) + integrar con `perfil_riesgo_cliente` (p.ej. VIP 0%, nuevo hold, no-show cobro real) | [A] | S |
| S3.4 | Enganche con el motor de no-show: al marcar `no_presentada` → captura automática del hold (o propuesta "IA sugiere") | [A] | M |
| S3.5 | Webhook: eventos de PaymentIntent (`amount_capturable_updated`, `canceled`) | [A] | S |

**Estado:** diseño. Depende de que S1/S2 hayan generalizado el manejo de PaymentIntent y eventos.

**Pendiente externo (tú):** confirmar disponibilidad de pre-autorizaciones en la cuenta Stripe
(holds tienen caducidad ~7 días; definir política si la cita es a >7 días).

**Verificación:** reserva de cliente "nuevo" → hold visible en Stripe (no cobrado); asiste →
release; no-show → captura. VIP → 0€. Advisors sin ERROR.

---

### S4 — Propinas + pago dividido / grupal

**Objetivo:** Pilar 4 (parte no fiscal). Que el QR/checkout sugiera **propina** para el
profesional que atendió (→ "Mi Jornada"), y permitir **dividir** el pago (efectivo+tarjeta) y el
**pago familiar/grupal** (una persona paga varias citas del grupo).

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S4.1 | Modelo: `pagos.propina_cents` + `profesional_id` destino; o tabla `propinas` ligada a cita+profesional | [A] | S |
| S4.2 | Checkout con línea de propina sugerida (%, calculada server-side sobre el importe) | [A] | M |
| S4.3 | Split efectivo+tarjeta: registrar cobro mixto (parte `metodo='efectivo'` en `cobros`, parte tarjeta) sobre la misma cita | [A] | M |
| S4.4 | Pago grupal: un enlace/`token` que agrupa las citas de `grupo_id`; importe sumado; reparto de propinas por profesional | [A] | L |
| S4.5 | Enganche con "Mi Jornada": la propina aparece en el panel del profesional | [C] sobre datos [A] | M |
| S4.6 | UI de propina sugerida en el QR/mostrador + selección de a quién | [C] | M |

**Estado:** diseño. Depende de S1 (enlace `total` + QR) como base.

**Pendiente externo (tú):** ninguno técnico de terceros; decisión de negocio sobre porcentajes
de propina sugeridos por defecto.

**Verificación:** pago con propina → aparece asignada al profesional correcto en Mi Jornada;
split efectivo+tarjeta cuadra el total de la cita; pago grupal cobra la suma y reparte propinas.

---

### S5 — Mecha Pay + Stripe Connect (modelo de tasas)

**Objetivo:** Pilar 1, camino "Mecha Pay". Hoy el dinero va a **una** cuenta Stripe (la de la
plataforma). Para multi-salón real, cada salón necesita **su** cuenta conectada (Stripe Connect)
y Mecha cobra una **comisión de plataforma** (application fee). **Decisión estratégica abierta:**
con el modelo concierge (pivote 14 jun) puede bastar una cuenta por salón onboardado a mano a
corto plazo; Connect es la solución escalable.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S5.1 | **Decisión**: mono-cuenta por salón (manual, near-term) vs Stripe Connect (escalable). Documentar trade-offs | [A] + tú | S |
| S5.2 | Onboarding Connect: `Account`/`AccountLink`, guardar `stripe_account_id` por `negocio_id` | [A] | L |
| S5.3 | Checkout/PaymentIntent con `on_behalf_of` + `application_fee_amount` (comisión plataforma configurable por plan) | [A] | M |
| S5.4 | Config de plan de tarifas por salón (`% + fijo` Mecha Pay) en `negocio_config` | [A] | S |
| S5.5 | Webhook Connect (`account.updated`, payouts) + panel de estado de la cuenta del salón | [A] | M |

**Estado:** no empezado. Cambio arquitectónico (afecta a TODAS las edge functions de pago).

**Pendiente externo (tú):** decidir Connect sí/no; si sí, KYC de la plataforma en Stripe
(Connect platform) y verificación de cada salón.

**Verificación:** pago de un salón conectado → el dinero llega a SU cuenta menos la comisión de
plataforma; payout visible; onboarding completa KYC en sandbox.

---

### S6 — BYOP: Bizum + Redsýs (Fase 2)

**Objetivo:** Pilar 1, camino "Bring Your Own Processor". Salón grande con tasa baja de su banco
(0.3–0.6%) conecta su **TPV virtual Redsýs / Bizum** y paga a Mecha una **cuota fija** (+19/29€).
El argumento de venta demoledor para salones de volumen.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S6.1 | Abstracción de pasarela: el modelo `pagos` ya es agnóstico (`pasarela`); enrutar checkout por salón (`stripe` vs `redsys`) | [A] | M |
| S6.2 | Integración Redsýs: firma HMAC de la petición, formulario/redirección, parámetros del gateway | [A] | L |
| S6.3 | Bizum vía Redsýs (método dentro del mismo gateway) | [A] | M |
| S6.4 | Webhook/notificación Redsýs → conciliación idéntica a Stripe (marca `pagos` pagado, verifica firma, idempotencia) | [A] | M |
| S6.5 | Config BYOP por salón: credenciales Redsýs (cifradas), cuota fija de conector, activación | [A] | M |

**Estado:** no empezado. Fase 2 del roadmap. El modelo de datos ya soporta multi-pasarela.

**Pendiente externo (tú/salón):** credenciales de comercio Redsýs del salón (código FUC, terminal,
clave secreta), alta de Bizum con su banco. Sin esto no se puede probar E2E.

**Verificación:** salón con Redsýs configurado → pago con tarjeta y Bizum llega a su TPV; webhook
concilia el estado en Supabase igual que Stripe; la cuota fija se refleja en su plan.

---

### S7 — Datáfono virtual: Tap to Pay (Fase 3)

**Objetivo:** Pilar 2. Eliminar el datáfono físico: el móvil del estilista cobra por NFC (Tap to
Pay) con la SDK de Stripe Terminal.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S7.1 | Integrar `@stripe/stripe-terminal-react-native` en la app Expo (requiere build nativo, no sólo web) | [A] | L |
| S7.2 | Backend: `ConnectionToken` endpoint (edge) + `PaymentIntent` para Terminal | [A] | M |
| S7.3 | Flujo de cobro NFC en la app: conectar lector (Tap to Pay on iPhone/Android), tomar pago, ligar a la cita | [A] | L |
| S7.4 | (Opcional) lectores físicos Bluetooth/red local para salones que los quieran | [A] | M |

**Estado:** no empezado. Fase 3. **Choca con la decisión "app nativa = lectora sin pagos in-app"**
del roadmap → aclarar: Tap to Pay es cobro presencial (no compra in-app de Apple/Google), así que
NO cae en la comisión del 30%; pero SÍ exige build nativo y salir de la web pura.

**Pendiente externo (tú):** app nativa desplegada (iOS/Android), elegibilidad de Tap to Pay en la
cuenta Stripe (requiere verificación), dispositivos compatibles (iPhone XS+/Android NFC).

**Verificación:** cobro real por NFC en un móvil de prueba → `PaymentIntent` capturado y ligado a
la cita; funciona en iOS y Android.

---

### S8 — Fiscalidad VeriFactu + factura simplificada

**Objetivo:** Pilar 4 (parte fiscal) + §8 cumplimiento del roadmap. Cada cobro genera un **hash
inmutable y correlativo** (encadenado) conforme a VeriFactu, y se puede exportar **factura
simplificada** para el gestor. La base de inmutabilidad de `cobros` ya existe; falta el
encadenado hash y la generación de facturas.

| # | Pieza | Quién | Esfuerzo |
|---|---|---|---|
| S8.1 | Aclarar/unificar `pagos` (pasarela) ↔ `cobros` (caja fiscal inmutable): quién es la fuente de verdad fiscal | [A] + decisión | S |
| S8.2 | Encadenado hash correlativo por salón (`cobros.hash_anterior` + `hash_actual`), inalterable | [A] | M |
| S8.3 | Generación de factura simplificada (numeración correlativa, IVA 21% servicios, base sin IVA) exportable PDF/CSV | [A] + [C] UI | L |
| S8.4 | Integración VeriFactu (envío/registro AEAT o formato compatible) — según normativa vigente | [A] + fiscalista | XL |
| S8.5 | Aviso/registro de consentimiento de grabación de voz (si aplica al agente) — cumplimiento paralelo | [A] | S |

**Estado:** base parcial (inmutabilidad `cobros` hecha). Encadenado hash y facturas: no empezado.

**Pendiente externo (tú):** **fiscalista** (NO improvisar — es la línea roja del dossier: caja
fiscal M-CJ requiere asesor), y confirmar el estado normativo de VeriFactu en la fecha de
implementación.

**Verificación:** cadena de hashes verificable e inalterable; factura simplificada correcta con
numeración correlativa; revisión del fiscalista.

---

## 5. Dependencias y orden recomendado

```
S1 (enlace total + QR)
 ├─> S2 (reembolsos + robustez webhook)   ── base de eventos/PaymentIntent
 │     └─> S3 (holds/pre-auth)            ── reusa manejo de PaymentIntent + eventos
 ├─> S4 (propinas + split + grupal)       ── reusa enlace total + QR
 └─> S8.1 (aclarar pagos↔cobros)          ── necesario antes de fiscal

S5 (Connect) y S6 (BYOP) = tracks de Pilar 1, independientes entre sí; abordar cuando
                            haya decisión estratégica + gating externo resuelto.
S7 (Tap to Pay) = requiere app nativa; el más tardío del bloque técnico.
S8 (VeriFactu) = requiere fiscalista; cierre de cumplimiento.
```

**Camino crítico near-term (sin bloqueos externos): S1 → S2 → S3 → S4.**
S5–S8 entran cuando se resuelva su gating.

---

## 6. Gating externo consolidado (checklist para el usuario)

Lo que tienes que resolver TÚ (fuera del código) para desbloquear cada sesión:

- [ ] **S1**: activar Bizum + Apple/Google Pay como métodos en el dashboard de Stripe.
- [ ] **S2**: suscribir eventos `charge.refunded`, `payment_intent.payment_failed`,
      `checkout.session.expired` en el webhook de Stripe.
- [ ] **S3**: confirmar pre-autorizaciones habilitadas + política para citas a >7 días.
- [ ] **S4**: decidir % de propina sugeridos por defecto.
- [ ] **S5**: decisión mono-cuenta vs Connect; si Connect → KYC plataforma + verificación por salón.
- [ ] **S6**: credenciales de comercio Redsýs del salón (FUC, terminal, clave) + alta Bizum banco.
- [ ] **S7**: app nativa desplegada + elegibilidad Tap to Pay en Stripe + dispositivos NFC.
- [ ] **S8**: fiscalista + estado normativo VeriFactu vigente.

**Ya disponible (no bloquea near-term):** secrets `STRIPE_SECRET_KEY` (sk_test) y
`STRIPE_WEBHOOK_SECRET` puestos vía Supabase Management API; webhook de test creado.

---

## 7. Principios de seguridad de pagos (invariantes, todas las sesiones)

Heredados de `ARQUITECTURA_PAGOS` §9 y del endurecimiento del Paso 1:

1. **Importes siempre server-side** (`importe_senal_servicio` / recálculo por servicios reales).
   Nunca confiar en el importe que manda el cliente.
2. **Token opaco** aleatorio/inadivinable, único, caducable; nunca exponer `cita_id` ni PII en la URL.
3. **RPCs públicas** `security definer` con grant explícito a `anon` (regla round 4); sin SELECT
   directo a `citas`/`clientes`/`pagos`/`cobros` para `anon`.
4. **Webhook**: verificación de firma + idempotencia (dedupe por `event.id` / `pasarela_ref`) +
   replay protection. `--no-verify-jwt` (la pasarela no manda JWT).
5. **Anti-abuso** por token/teléfono/IP en las RPCs de pago (mismo patrón que el portal).
6. **Multi-tenant**: `negocio_id` en toda consulta y política.
7. Tras CUALQUIER migración: **pasar advisors de seguridad de Supabase** (sin ERROR nuevo).

---

## 8. Notas operativas (cómo se despliega esto)

- Edge functions: `supabase/functions/`, desplegar con `npx supabase functions deploy <fn> --use-api`.
  El webhook con `--no-verify-jwt`.
- Secrets: `POST api.supabase.com/v1/projects/{ref}/secrets` con el PAT (CLAUDE.md global).
  Proyecto Mecha: `vtrggiogjrhqtwbhbgia`.
- Migraciones: archivo en `migrations/` + aplicar al remoto (MCP Supabase); el historial remoto manda.
- Motor de mensajería n8n (`egkPWImnfQR1tRaA`) ya manda el enlace de señal con `pago_token`; para
  "pago después"/QR se reutiliza el mismo patrón de plantilla + botón URL dinámico.
- Dominio canónico en URLs de retorno: **`https://www.mechaa.es`** (NO `mecha.app`).
```
