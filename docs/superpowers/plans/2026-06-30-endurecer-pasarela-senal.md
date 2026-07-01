# Endurecer la pasarela de señal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el `cita_id` crudo del flujo de pago de señal por un token opaco y hacer el webhook de Stripe exactly-once.

**Architecture:** Migración aditiva (tabla de tokens `cita_pago_enlaces` + bitácora `stripe_webhook_eventos` + índice único en `cobros.idempotency_key`), un trigger que acuña el token cuando una cita pasa a requerir señal, y el token reemplaza al `cita_id` en los 4 puntos de entrada (motor n8n, oferta de lista de espera, página de pago, edge). El webhook deduplica por id de evento.

**Tech Stack:** Supabase/Postgres (plpgsql, RLS), Edge Functions Deno/TS, React Native web (expo-router), n8n (REST API con la write key).

---

## Orden de despliegue (evitar romper producción a medias)

1. **Tasks 1-3 (BD): seguras y aditivas** — se aplican al remoto ya. No rompen nada: la edge vieja sigue aceptando `cita_id`, los enlaces viejos siguen funcionando, `notificaciones_pendientes` solo emite un campo extra.
2. **Tasks 4-8 (el "switch"): edge token-only + página + oferta + webhook + n8n** — se despliegan juntas al final. A partir de aquí los enlaces nuevos llevan token y la edge exige token. Enlaces `cita_id` en vuelo (enviados en los ~15 min previos) quedan inválidos → asumible (demo, TTL de señal 15 min, `mecha.app` aún sin DNS).
3. **Task 9-10:** verificación E2E + un solo push a `master`.

**Secretos:** el PAT de Supabase, el service_role y la write key de n8n viven en el `CLAUDE.md` global. NO pegarlos en commits ni en este plan.

---

## Task 1: Migración base (tablas, funciones, trigger, índice)

**Files:**
- Create: `migrations/endurecer-pasarela-senal.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- migrations/endurecer-pasarela-senal.sql
-- Paso 1 endurecimiento de pagos (spec 2026-06-30): tokens opacos para el enlace de senal
-- + idempotencia del webhook Stripe. ADITIVA; segura de aplicar antes que edge/front/n8n.

-- 1) Tabla de tokens opacos (token -> cita). Sellada: RLS on, sin politicas para anon/auth.
create table if not exists public.cita_pago_enlaces (
  token text primary key,
  cita_id uuid not null references public.citas(id) on delete cascade,
  negocio_id text not null,
  created_at timestamptz not null default now(),
  expira_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists idx_cita_pago_enlaces_cita on public.cita_pago_enlaces(cita_id);
alter table public.cita_pago_enlaces enable row level security;
-- sin policies a proposito: solo service_role y funciones security definer la tocan.

-- 2) Bitacora de idempotencia del webhook Stripe.
create table if not exists public.stripe_webhook_eventos (
  event_id text primary key,
  tipo text,
  recibido_at timestamptz not null default now()
);
alter table public.stripe_webhook_eventos enable row level security;

-- 3) cobros.idempotency_key ya existe como columna; blindar con indice unico parcial.
create unique index if not exists uq_cobros_idempotency_key
  on public.cobros(idempotency_key) where idempotency_key is not null;

-- 4) Get-or-create del token vivo de una cita. VOLATILE (inserta).
-- Token = 2x gen_random_uuid() sin guiones (64 hex, ~244 bits). Se usa gen_random_uuid
-- (core, pg_catalog) en vez de gen_random_bytes (pgcrypto, schema extensions) para que
-- resuelva con search_path=public.
create or replace function public.enlace_pago_token(p_cita_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
  v_negocio text;
begin
  select token into v_token
    from public.cita_pago_enlaces
    where cita_id = p_cita_id and expira_at > now()
    order by created_at desc
    limit 1;
  if v_token is not null then
    return v_token;
  end if;

  select negocio_id into v_negocio from public.citas where id = p_cita_id;
  if v_negocio is null then
    raise exception 'cita_not_found';
  end if;

  insert into public.cita_pago_enlaces (token, cita_id, negocio_id)
  values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), p_cita_id, v_negocio)
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.enlace_pago_token(uuid) from public, anon, authenticated;
grant execute on function public.enlace_pago_token(uuid) to service_role;

-- 5) Resolver token -> cita_id (solo lectura). NULL si no existe o caducado.
create or replace function public.resolver_enlace_pago(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cita_id from public.cita_pago_enlaces
  where token = p_token and expira_at > now()
  limit 1;
$$;
revoke all on function public.resolver_enlace_pago(text) from public, anon, authenticated;
grant execute on function public.resolver_enlace_pago(text) to service_role;

-- 6) Trigger: al marcar una cita como que requiere senal (y no pagada), acuna el token.
create or replace function public.tg_acunar_enlace_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.deposito_requerido is true and coalesce(NEW.deposito_pagado, false) = false then
    perform public.enlace_pago_token(NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists citas_acunar_enlace_pago on public.citas;
create trigger citas_acunar_enlace_pago
  after insert or update of deposito_requerido on public.citas
  for each row execute function public.tg_acunar_enlace_pago();
```

- [ ] **Step 2: Aplicar la migración al remoto**

Aplicar vía el MCP de Supabase `apply_migration` (name: `endurecer_pasarela_senal`, project `vtrggiogjrhqtwbhbgia`) con el contenido del Step 1.
Expected: sin error de SQL.

- [ ] **Step 3: Pasar los advisors de seguridad**

MCP Supabase `get_advisors` (type `security`) sobre `vtrggiogjrhqtwbhbgia`.
Expected: sin ERROR nuevo atribuible a `cita_pago_enlaces` / `stripe_webhook_eventos` (RLS activada sin políticas es correcto: acceso solo service_role).

- [ ] **Step 4: Commit**

```bash
git add migrations/endurecer-pasarela-senal.sql
git commit -m "feat(pagos): tokens opacos de enlace de senal + idempotencia webhook (migracion)"
```

---

## Task 2: `notificaciones_pendientes` emite `pago_token`

**Files:**
- Modify: la función `public.notificaciones_pendientes` (definición vigente en `migrations/notificaciones-config-y-aviso-retraso.sql`; el remoto manda).

- [ ] **Step 1: Leer la definición vigente**

Obtener el cuerpo actual de `notificaciones_pendientes` desde el remoto:
```sql
select pg_get_functiondef('public.notificaciones_pendientes(integer,integer)'::regprocedure);
```
(vía MCP `execute_sql`). Es STABLE; se mantiene STABLE (el subquery de token solo lee).

- [ ] **Step 2: Añadir `pago_token` al objeto jsonb**

Dentro del `jsonb_build_object(...)` final (el que ya incluye `'importe_cents', case when tipo = 'senal' ...`), añadir esta clave usando un subquery escalar correlacionado por `cita_id`:

```sql
    'pago_token', case when tipo = 'senal' then (
        select e.token from public.cita_pago_enlaces e
        where e.cita_id = rows.cita_id and e.expira_at > now()
        order by e.created_at desc limit 1
      ) else null end,
```

Reemplazar la función completa con `create or replace function ... ` conservando el resto del cuerpo tal cual (misma firma, mismo `stable security definer set search_path`).

- [ ] **Step 3: Aplicar al remoto**

MCP `apply_migration` (name: `notif_pendientes_pago_token`) con el `create or replace` completo.
Expected: sin error.

- [ ] **Step 4: Commit**

```bash
git add migrations/notificaciones-config-y-aviso-retraso.sql
git commit -m "feat(pagos): notificaciones_pendientes emite pago_token para la senal"
```
(Actualizar también el archivo local para que refleje el remoto.)

---

## Task 3: Verificación SQL con datos sintéticos

**Files:**
- Create (temporal, no versionar): script en el scratchpad.

- [ ] **Step 1: Escribir el script de prueba**

Ejecutar en un tenant de prueba aislado (`__test_pago_token__`). Requiere una cita real con
`deposito_requerido=true`; reutilizar el patrón de siembra de otros tests SQL del repo o crear
mínimos (negocio + servicio prepago + cliente + cita). El corazón de las aserciones:

```sql
-- (a) El trigger acuno un token al insertar la cita con deposito_requerido=true
select count(*) = 1 as acunado
from public.cita_pago_enlaces where cita_id = :cita_id;

-- (b) resolver_enlace_pago devuelve la cita
select public.resolver_enlace_pago(
  (select token from public.cita_pago_enlaces where cita_id = :cita_id)
) = :cita_id as resuelve_ok;

-- (c) token caducado -> NULL
update public.cita_pago_enlaces set expira_at = now() - interval '1 minute' where cita_id = :cita_id;
select public.resolver_enlace_pago(
  (select token from public.cita_pago_enlaces where cita_id = :cita_id)
) is null as caducado_null;

-- (d) token inexistente -> NULL
select public.resolver_enlace_pago('no-existe') is null as inexistente_null;

-- (e) notificaciones_pendientes emite pago_token no nulo para la senal
--     (restaurar expira_at antes; poner senal_enviada=false)
update public.cita_pago_enlaces set expira_at = now() + interval '7 days' where cita_id = :cita_id;
select (elem->>'pago_token') is not null as cola_lleva_token
from jsonb_array_elements(public.notificaciones_pendientes(50,24)) elem
where (elem->>'cita_id') = :cita_id::text and elem->>'tipo' = 'senal';

-- (f) idempotencia: doble insert del mismo event_id -> el segundo falla (unique)
insert into public.stripe_webhook_eventos(event_id, tipo) values ('evt_test','checkout.session.completed');
-- el siguiente debe violar la PK:
insert into public.stripe_webhook_eventos(event_id, tipo) values ('evt_test','checkout.session.completed');
```

- [ ] **Step 2: Ejecutar y verificar**

Correr (a)-(e) vía MCP `execute_sql`; todas deben devolver `true`. (f): el segundo insert debe
dar `duplicate key value violates unique constraint`.
Expected: (a)-(e) `true`; (f) conflicto en el segundo insert.

- [ ] **Step 3: Limpiar**

Borrar el tenant de prueba y `delete from public.stripe_webhook_eventos where event_id='evt_test'`.
Verificar que `cita_pago_enlaces` no tiene residuos de prueba.

---

## Task 4: Edge `crear-checkout-senal` — solo token

**Files:**
- Modify: `supabase/functions/crear-checkout-senal/index.ts`

- [ ] **Step 1: Cambiar el parseo y resolver el token**

Reemplazar el bloque que lee `cita_id` (líneas ~22-30) por:

```ts
    const { token, success_url, cancel_url } = await req.json().catch(() => ({}));
    if (!token) return json({ error: 'token requerido' }, 400);

    const { data: citaId, error: eTok } = await supabase.rpc('resolver_enlace_pago', { p_token: token });
    if (eTok) throw eTok;
    if (!citaId) return json({ error: 'enlace_invalido' }, 404);

    const { data: pagoRaw, error: e1 } = await supabase.rpc('requerir_senal_cita', { p_cita_id: citaId });
```

El resto de la función queda igual, pero cambiar la línea del `metadata` para que use `citaId`:
```ts
      metadata: { pago_id: pago.id, cita_id: citaId },
```

- [ ] **Step 2: Desplegar la edge**

Desde el disco (el CLI no está instalado; usar npx), con el PAT del CLAUDE.md global exportado:
```bash
SUPABASE_ACCESS_TOKEN=<PAT> npx -y supabase@latest functions deploy crear-checkout-senal \
  --project-ref vtrggiogjrhqtwbhbgia --use-api
```
Expected: `Deployed Function crear-checkout-senal`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/crear-checkout-senal/index.ts
git commit -m "feat(pagos): crear-checkout-senal exige token opaco (resolver_enlace_pago)"
```

---

## Task 5: Página `/app/pago/[ref]` envía token

**Files:**
- Modify: `app/pago/[ref].web.tsx`

- [ ] **Step 1: Enviar `token` en vez de `cita_id`**

En `pagar()`, cambiar el cuerpo del invoke (línea ~53-55):
```ts
    const { data, error } = await supabase.functions.invoke('crear-checkout-senal', {
      body: { token: citaId, success_url: `${origin}/app/pago/ok`, cancel_url: window.location.href },
    });
```
Y renombrar la variable local `citaId`→`ref` (o dejar el nombre pero actualizar el comentario de cabecera: `ref` ahora es el token opaco, no el cita_id). El resto de la página no cambia.

- [ ] **Step 2: Typecheck + build**

```bash
npx tsc --noEmit
npm run build:web
```
Expected: 0 errores nuestros (ignorar los de `supabase/functions`, son Deno); build OK.

- [ ] **Step 3: Commit**

```bash
git add app/pago/[ref].web.tsx
git commit -m "feat(pagos): la pagina de pago envia el token opaco a la edge"
```

---

## Task 6: Oferta de lista de espera redirige con token

**Files:**
- Modify: la función `public.confirmar_cita_oferta` (definición en `migrations/lista-espera-matching.sql`)
- Modify: `lib/reservaPublica.ts`
- Modify: `app/cita/[id].web.tsx:221`

- [ ] **Step 1: `confirmar_cita_oferta` devuelve `pago_token`**

Leer la definición vigente:
```sql
select pg_get_functiondef('public.confirmar_cita_oferta(uuid,text)'::regprocedure);
```
En la rama que devuelve `needs_payment=true`, añadir al jsonb de retorno la clave `pago_token`
tomando el token ya acuñado (fallback a acuñarlo):
```sql
    'pago_token', coalesce(
      (select e.token from public.cita_pago_enlaces e
       where e.cita_id = p_cita_id and e.expira_at > now()
       order by e.created_at desc limit 1),
      public.enlace_pago_token(p_cita_id)
    ),
```
Reemplazar con `create or replace function ...` (misma firma/atributos). Aplicar vía MCP
`apply_migration` (name: `confirmar_oferta_pago_token`).

- [ ] **Step 2: Propagar en el wrapper**

En `lib/reservaPublica.ts`, la interfaz `ConfirmarOfertaResult` añade:
```ts
  pago_token?: string;
```
(el wrapper `confirmarCitaOferta` ya devuelve `data` tal cual; verificar que no filtra campos).

- [ ] **Step 3: Redirigir con token en la página de gestión**

En `app/cita/[id].web.tsx:221`, cambiar:
```ts
      if (r.needs_payment) {
        window.location.href = `/app/pago/${r.pago_token ?? citaId}`;
        return;
      }
```

- [ ] **Step 4: Typecheck + build**

```bash
npx tsc --noEmit
npm run build:web
```
Expected: 0 errores nuestros; build OK.

- [ ] **Step 5: Commit**

```bash
git add migrations/lista-espera-matching.sql lib/reservaPublica.ts "app/cita/[id].web.tsx"
git commit -m "feat(pagos): la oferta de lista de espera redirige al pago con token opaco"
```

---

## Task 7: Webhook Stripe idempotente

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts`

- [ ] **Step 1: Deduplicar por id de evento antes de los efectos**

Tras validar la firma y la antigüedad (después del bloque `if (now - eventTimestamp > 300)`),
y antes del `if (event.type === 'checkout.session.completed')`, insertar:

```ts
  const { error: dupErr } = await supabase
    .from('stripe_webhook_eventos')
    .insert({ event_id: event.id, tipo: event.type });
  if (dupErr) {
    // violacion de PK -> evento ya procesado -> no repetir efectos
    return new Response('ok (dup)', { status: 200 });
  }
```

- [ ] **Step 2: Desplegar**

```bash
SUPABASE_ACCESS_TOKEN=<PAT> npx -y supabase@latest functions deploy stripe-webhook \
  --project-ref vtrggiogjrhqtwbhbgia --use-api
```
Expected: `Deployed Function stripe-webhook`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(pagos): webhook Stripe exactly-once (bitacora stripe_webhook_eventos)"
```

---

## Task 8: Motor n8n usa `pago_token` en el botón

**Files:**
- Modify: workflow n8n `egkPWImnfQR1tRaA` ("Mecha — Notificaciones WhatsApp"), Code node "Construir mensajes".
- Reuse: builder `Desktop/build-mecha-motor-put.js` (patrón documentado).

- [ ] **Step 1: Descargar el workflow**

```bash
curl -s -H "X-N8N-API-KEY: <write-key>" \
  https://n8n-n8n.levhrm.easypanel.host/api/v1/workflows/egkPWImnfQR1tRaA > /tmp/motor.json
```

- [ ] **Step 2: Cambiar el parámetro del botón de `enlace_pago_senal`**

En el Code node "Construir mensajes", el componente `button` (URL dinámica) de la plantilla
`enlace_pago_senal` rellena `{{1}}` con el `cita_id`. Cambiarlo para que use `pago_token`
(que ahora viene en cada item de la cola). Es decir, donde ponga algo como
`...parameters:[{ type:'text', text: item.cita_id }]` para ese botón, pasar a `item.pago_token`.
La URL base de la plantilla en Meta (`https://mecha.app/app/pago/{{1}}`) NO cambia → sin
re-aprobación de plantilla.

- [ ] **Step 3: Subir el workflow (PUT con body limpio)**

Body solo con `name/nodes/connections/settings` (settings recortado a `executionOrder`;
quitar `callerPolicy`/`availableInMCP` que rompen el schema del API público):
```bash
curl -s -X PUT -H "X-N8N-API-KEY: <write-key>" -H "Content-Type: application/json" \
  https://n8n-n8n.levhrm.easypanel.host/api/v1/workflows/egkPWImnfQR1tRaA \
  --data-binary @/tmp/motor-clean.json
```
Expected: 200 con el workflow actualizado; sigue ACTIVO.

- [ ] **Step 4: Actualizar el builder versionado**

Reflejar el cambio en `Desktop/build-mecha-motor-put.js` (o copiar el nodo actualizado) para
que quede trazado. (No versionado en el repo; es del escritorio.)

---

## Task 9: Verificación E2E

- [ ] **Step 1: Ejecución real del motor**

Poner una cita demo con `deposito_requerido=true`, `senal_enviada=false`, teléfono del tester.
Disparar el workflow del motor (o esperar el cron). Verificar en la ejecución de n8n
(`/api/v1/executions/{id}?includeData=true`) que la URL del botón es `/app/pago/{token}` (64 hex),
no un UUID.

- [ ] **Step 2: Flujo de pago**

Abrir `/app/pago/{token}` (local `node scripts/serve-web.mjs` o mecha.app si hay DNS), pulsar
"Pagar señal ahora" → debe redirigir a Stripe Checkout (tarjeta test 4242…). Tras pagar, el
webhook confirma: `pagos` pagado, `citas` deposito_pagado+confirmada. Probar además abrir
`/app/pago/{cita_id_crudo}` → la edge responde 404 `enlace_invalido` (regresión esperada).

- [ ] **Step 3: Idempotencia del webhook**

Reenviar el mismo evento desde el dashboard de Stripe (o `stripe events resend`). Verificar que
el segundo intento no re-ejecuta efectos (row ya en `stripe_webhook_eventos`; respuesta `ok (dup)`).

- [ ] **Step 4: Advisors + limpieza**

`get_advisors` (security) sin ERROR nuevo. Limpiar datos de prueba (pagos/cobros/citas de test,
`stripe_webhook_eventos` de prueba). Revertir el servicio demo si se tocó.

---

## Task 10: Integración a `master`

- [ ] **Step 1: Sincronizar con Carlos**

```bash
git fetch origin
git rebase origin/master   # si origin/master movio
npm install                # Carlos suele anadir dependencias; evita build roto
```

- [ ] **Step 2: Re-verificar tras rebase**

```bash
npx tsc --noEmit
npm run build:web
```
Expected: 0 errores nuestros; build OK.

- [ ] **Step 3: Push**

```bash
git push origin master
```
Confirmar `git status -sb` (ahead/behind 0 tras el push). Vercel despliega la web.

---

## Notas de verificación cruzada con el spec

- Tokens opacos (`cita_pago_enlaces`) → Tasks 1, 4, 5, 6, 8.
- Idempotencia webhook (`stripe_webhook_eventos`) → Tasks 1, 7.
- `cobros.idempotency_key` índice único → Task 1.
- `notificaciones_pendientes` STABLE + emite token → Task 2.
- No se insertan cobros fiscales en el webhook → confirmado (Task 7 solo dedup + UPDATE existente).
- Advisors sin ERROR nuevo → Tasks 1, 9.
