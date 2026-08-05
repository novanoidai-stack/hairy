# S5 (revisado) — Stripe Connect Standard (OAuth): spec + plan de migración

> **Fecha:** 5 de agosto de 2026 · **Autor:** Alexandro (pagos)
> **Estado:** diseño (aprobado el modelo Connect Standard sobre el BYO-key actual).
> **Reemplaza:** el modelo "BYO-key" vigente (el salón pega su `sk_live` en Mecha).
> **Contexto/decisión:** ver el análisis BYO-key vs Connect (chat 5 ago). Resumen: guardar
> la `sk_live` de N salones concentra un riesgo catastrófico y va contra las prácticas de
> Stripe; Connect es la vía sancionada y no ve nunca la clave secreta del salón.

---

## 1. Objetivo

Que cada salón conecte **su** cuenta Stripe a Mecha con **un botón** ("Conectar con Stripe"),
de forma que:
- El dinero de sus cobros entra directo en **su** cuenta y Stripe le hace el payout a **su** IBAN.
- Mecha **nunca** almacena la clave secreta del salón — solo un `stripe_account_id` (`acct_…`).
- Todo es **self-serve** (0 trabajo manual de Mecha por salón) y **conforme al ToS de Stripe**.
- Se mantiene el pricing "**0% de comisión**" (application fee = 0), con la opción de activarla en el futuro.

**No-objetivos (S5 revisado):** onboarding Express hosted (fase posterior), cobro de comisión por
transacción (parametrizado pero a 0), y el flujo Redsys/Bizum (S6, que **sigue siendo BYO** porque
es la pasarela del banco del salón — no cambia).

---

## 2. Estado actual (BYO-key) — lo que hay que migrar

- **Tabla `negocio_pasarela`**: `negocio_id`, `proveedor`, `publishable_key`, `redsys_fuc`,
  `redsys_terminal`, `redsys_test`, `configurado`, `updated_at`. (Sin columnas de secreto.)
- **Secretos en Supabase Vault**: `stripe_sk_<negocio>` (clave secreta del salón) y
  `stripe_whsec_<negocio>` (signing secret del webhook del salón).
- **RPCs**: `guardar_pasarela_stripe(sk, whsec, pk)` (owner/admin, guarda en Vault),
  `pasarela_stripe_secret(negocio)` y `pasarela_stripe_webhook_secret(negocio)` (service_role).
- **Helper** `supabase/functions/_shared/stripeNegocio.ts` (inlineado en cada edge):
  `stripeParaNegocio(supabase, negocioId)` → `new Stripe(sk_del_salon)` (o plataforma);
  `webhookSecretParaNegocio(...)` → signing secret del salón.
- **Edges que resuelven Stripe por negocio** (consumidores del helper): `crear-checkout-cobro`,
  `crear-checkout-senal`, `reembolsar-cobro`, `capturar-hold`, `liberar-hold`,
  `terminal-cobro-intent`, `terminal-connection-token`. (`crear-checkout-suscripcion` es la
  suscripción de Mecha en la **plataforma** — NO se toca.)
- **Webhook** `stripe-webhook`: enruta por `?negocio=<id>` y verifica la firma con el signing
  secret de ESE salón (Vault).
- **Frontend**: `app/(tabs)/configuracion.web.tsx` → pantalla de Pagos donde el salón **pega**
  su `sk`/`whsec`/`pk` (llama `guardar_pasarela_stripe`).

**La clave de la migración:** como todos los edges pasan por `stripeParaNegocio`, y el SDK de
Stripe permite atar la cuenta conectada al cliente (`new Stripe(PLATFORM_KEY, { stripeAccount })`),
**cambiando SOLO el helper los edges no se tocan.**

---

## 3. Modelo objetivo (Connect Standard + direct charges)

- **Standard**: el salón conserva su cuenta y su panel Stripe; puede **desconectar** a Mecha en
  un clic. El salón es el **merchant of record** (bueno para su fiscalidad/VeriFactu, S8).
- **Direct charges**: el cargo se crea EN la cuenta del salón vía la cabecera `Stripe-Account`.
  Mecha usa **su** clave de plataforma + `{ stripeAccount: acct_id }`. Opcional
  `application_fee_amount` (default 0).
- **Un solo webhook** de plataforma escuchando **eventos de cuentas conectadas**; cada evento
  trae `event.account = acct_id` → se mapea a `negocio_id`. Se verifica con **un** signing secret
  (el de plataforma). Adiós al webhook por salón.

### 3.1 Cambios de datos (DDL)

```sql
alter table public.negocio_pasarela
  add column if not exists stripe_account_id text,           -- acct_… (NO es secreto)
  add column if not exists stripe_conectado_at timestamptz;

-- Accesor (el account_id no es secreto; se puede leer de la tabla, pero centralizamos):
create or replace function public.pasarela_stripe_account(p_negocio_id text)
returns text language sql stable security definer set search_path=public
as $$ select stripe_account_id from public.negocio_pasarela where negocio_id = p_negocio_id $$;
revoke all on function public.pasarela_stripe_account(text) from public, anon;
grant execute on function public.pasarela_stripe_account(text) to authenticated, service_role;

-- Guardar la conexión (lo llama el edge de OAuth tras el intercambio de code):
create or replace function public.guardar_conexion_stripe(p_negocio_id text, p_account_id text)
returns jsonb language plpgsql security definer set search_path=public
as $$ ... insert/update negocio_pasarela set stripe_account_id, proveedor='stripe',
        configurado=true, stripe_conectado_at=now() ...; return {ok:true}; $$;
-- service_role only (lo llama el edge con la sesión ya validada por state/CSRF).

-- Desconexión (webhook account.application.deauthorized o botón):
create or replace function public.desconectar_stripe(p_negocio_id text) ...
  -- limpia stripe_account_id, configurado=false. authenticated(owner/admin) + service_role.
```

`stripe_account_id` en la tabla RLS-legible es **aceptable** (no es secreto). Los Vault
`stripe_sk_*`/`stripe_whsec_*` dejan de crearse para Stripe (se mantienen para Redsys).

### 3.2 Flujos

**A) Onboarding (una vez, self-serve):**
1. Salón (owner/admin) en Config → Pagos pulsa **"Conectar con Stripe"**.
2. El front pide a un edge `stripe-connect-oauth?action=start` un `state` firmado (CSRF + negocio),
   y redirige a `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=<CA>&scope=read_write&state=<state>&redirect_uri=<mechaa>`.
3. El salón inicia sesión/crea cuenta en Stripe y autoriza.
4. Stripe redirige a `…/stripe-connect-oauth?code=…&state=…`. El edge valida `state`,
   intercambia `stripe.oauth.token({ grant_type:'authorization_code', code })` → `stripe_user_id`
   (= `acct_…`) y llama `guardar_conexion_stripe(negocio, acct_id)`. Redirige a la app con "Conectado".

**B) Cobro (cualquier tipo — sin cambios en los edges):**
`stripeParaNegocio(supabase, negocioId)` devuelve `new Stripe(PLATFORM_KEY, { apiVersion,
stripeAccount: acct_id })` si el negocio está conectado (Connect); si no, fallback BYO (Vault sk,
compat) y luego plataforma. El resto del edge (checkout/PI/refund/hold/terminal) queda **idéntico**.
Opcional `application_fee_amount` = `comisionPlataformaCents(importe)` (default 0).

**C) Webhook (Connect):** un webhook de plataforma sobre "connected accounts". Verifica firma con
`STRIPE_WEBHOOK_SECRET` (plataforma). Mapea `event.account` → `negocio_id` (via `negocio_pasarela`).
El resto de la conciliación (`registrar_cobro_online`, holds, refunds, terminal) **igual**.

**D) Desconexión:** el salón desconecta en su panel Stripe → llega `account.application.deauthorized`
→ `desconectar_stripe`. O botón "Desconectar" en Config.

---

## 4. Cambios de código (touch points exactos)

| Pieza | Cambio | Tamaño |
|---|---|---|
| `_shared/stripeNegocio.ts` (+ copias inlineadas) | `stripeParaNegocio`: preferir `stripe_account_id` (`{stripeAccount}`) → fallback Vault sk → plataforma | S — **el cambio central** |
| `stripe-connect-oauth` (edge NUEVA) | `action=start` (genera state+redirige) y callback (intercambia code → guarda acct_id). verify_jwt=false (Stripe redirige sin JWT); CSRF por `state` firmado | M |
| `stripe-webhook` | Añadir verificación/rama Connect: firma con secret de plataforma + `event.account`→negocio; mantener la rama `?negocio` como fallback durante la transición | M |
| `negocio_pasarela` + RPCs | `stripe_account_id`/`stripe_conectado_at` + `pasarela_stripe_account`/`guardar_conexion_stripe`/`desconectar_stripe` | S |
| `configuracion.web.tsx` (Pagos) | Botón "Conectar con Stripe" + estado "Conectado/Desconectar"; **ocultar** el formulario de pegar `sk` para Stripe (dejar Redsys) | M (UI, coordinable con Carlos) |
| Config comisión | `comisionPlataformaBps` en `negocio_config` (default 0) leído por el helper para `application_fee_amount` | S |

**Nada de los edges de cobro cambia** (crear-checkout-cobro/senal, reembolsar, holds, terminal):
heredan el cambio del helper.

---

## 5. Plan de migración (por fases, NO-breaking)

La coexistencia BYO↔Connect es la clave para no romper lo que ya funciona.

- **Fase 0 — Preparación:** DDL (`stripe_account_id` + RPCs). Sin efecto en runtime.
- **Fase 1 — Onboarding Connect:** edge `stripe-connect-oauth` + botón en Config. El salón ya puede
  conectar por OAuth. `stripeParaNegocio` pasa a **preferir** `stripe_account_id`; si no hay,
  fallback a Vault sk (BYO) y luego plataforma. → **Los salones BYO existentes siguen igual**; los
  nuevos usan Connect.
- **Fase 2 — Webhook Connect:** registrar el webhook de plataforma sobre cuentas conectadas y
  añadir la rama por `event.account`. Mantener la rama `?negocio` (BYO) hasta migrar a todos.
- **Fase 3 — Corte:** cuando no queden salones en BYO-Stripe, retirar el formulario de pegar `sk`,
  `guardar_pasarela_stripe` y los Vault `stripe_sk_*`/`stripe_whsec_*`. (Redsys BYO permanece.)

**Gating externo (tú, una vez, en el dashboard de Stripe de plataforma):**
- Activar **Connect** (Connect → Get started) y completar el **perfil de plataforma**.
- Obtener el **`client_id` (`ca_…`)** de Connect y registrar la **redirect URI**
  (`https://www.mechaa.es/…/stripe-connect-oauth`). Secret `STRIPE_CONNECT_CLIENT_ID`.
- Crear el **webhook de Connect** (eventos de cuentas conectadas) y poner su signing secret.
- Decidir **modo test vs live** (en test se conectan cuentas de prueba).

---

## 6. Seguridad

- Mecha **nunca** almacena la `sk` del salón; solo `acct_id` (público). Radio de un breach
  drásticamente menor; el salón revoca en un clic.
- `state` de OAuth **firmado** (HMAC con secreto de servidor) que ata la sesión al `negocio_id`
  → evita CSRF/confusión de cuenta. El edge valida rol owner/admin del negocio al iniciar.
- `guardar_conexion_stripe`/`desconectar_stripe` service_role (las llama el edge tras validar).
- Webhook: firma con secret de plataforma; `event.account` mapeado a negocio (no confiar en
  metadata para el tenant).
- Multi-tenant `negocio_id` en todo; advisors tras cada migración.

---

## 7. Decisiones abiertas / futuro

1. **Standard vs Express (definitivo):** Standard ahora (mínimo build, salón con su panel).
   Express después para el onboarding hosted más pulido (IBAN/KYC dentro de Stripe, marca Mecha).
2. **Comisión de plataforma:** parametrizada, **default 0%** (encaja con el pricing). Si algún día
   se quiere "Mecha Pay X%", basta poblar `comisionPlataformaBps` — sin cambios de código.
3. **Disputas/chargebacks:** con direct charges recaen en el salón (bueno para responsabilidad de
   Mecha). Revisar copy de soporte.
4. **Fiscalidad (S8):** direct charges = salón merchant of record → alinea con VeriFactu.

---

## 8. Verificación (cómo se probará)

- **Sandbox Connect:** conectar una cuenta de **prueba** por OAuth → `acct_id` guardado.
- **Cobro E2E:** pagar la cita de prueba → el cargo aparece **en la cuenta conectada** (no en la de
  plataforma), y la conciliación (`cobros`/cita cobrada) funciona igual.
- **Coexistencia:** un negocio en BYO y otro en Connect cobran correctamente en la misma release.
- **Webhook Connect:** `event.account` → negocio correcto; dedup + idempotencia intactas.
- **Desconexión:** `account.application.deauthorized` limpia `stripe_account_id`.
- Advisors sin ERROR; typecheck + build OK.
