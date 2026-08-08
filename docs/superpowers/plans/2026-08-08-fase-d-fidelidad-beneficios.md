# Fase D: Fidelidad — beneficios operativos + asignación manual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los niveles de fidelización (`niveles_fidelizacion`) ganan dos beneficios operativos configurables (`sin_deposito`, `acceso_express`), un cliente puede recibir un nivel asignado a mano en vez de calculado por umbrales (mismo patrón que el override de riesgo/depósito ya existente), y el beneficio `sin_deposito` manda sobre el cálculo de depósito dinámico por riesgo al reservar online.

**Architecture:** Dos columnas nuevas en `niveles_fidelizacion` (D1) + una columna override nulable en `clientes` que referencia `niveles_fidelizacion` (D2, mismo patrón que `clientes.deposito_perfil_override`/`perfil_riesgo_cliente`). `obtener_nivel_cliente` se reescribe para resolver primero el override (si apunta a un nivel activo) y solo si no hay override caer al cálculo automático por umbrales; su JSON de salida gana `sin_deposito`/`acceso_express`. `crear_cita_publica` consulta ese nivel resuelto antes de aplicar cualquier depósito (base por servicio o dinámico por riesgo): si `sin_deposito = true`, el depósito se fija a 0 sin evaluar `perfil_riesgo_cliente` (D3). Dos superficies de UI: el editor de nivel en Configuración → Recompensas gana los 2 toggles (D1), y la ficha de cliente gana un selector de nivel junto al que ya existe para el override de depósito (D2).

**Tech Stack:** PostgreSQL/plpgsql (Supabase, proyecto `vtrggiogjrhqtwbhbgia`), TypeScript, React (Expo Router web).

## Global Constraints

- Proyecto Supabase: `vtrggiogjrhqtwbhbgia` (nombre "Mecha"). Usa las tools MCP de Supabase (`execute_sql`, `apply_migration`) contra este `project_id`.
- Repo real de la app: `C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy` (NO el repo hermano de tests en `Escritorio\novanoidai\Hairy`).
- Tenant de pruebas aislado: `test_s18_e6d9d` (negocio_id). Login de pruebas con acceso de propietario: `chispa.test.s18@mecha.app` / `MechaTestS18_2026`. Cualquier dato de prueba insertado en este plan se limpia al final de cada tarea; `negocio_config.config` del tenant de pruebas se restaura a su valor original (no tiene hoy `depositoDinamicoActivo` — confirmado antes de escribir este plan).
- Profesional de pruebas ya existente en ese tenant: `051d5c70-9698-41f9-8dba-db40014d5b84` ("Marta Prueba").
- No se toca el sistema de recompensas canjeables ni de logros — solo `niveles_fidelizacion` y el flujo de depósito de `crear_cita_publica`.
- Decisión explícita de la spec: no se crea una segunda escalera de fidelidad "por ventana de tiempo reciente". Se reutiliza `niveles_fidelizacion` (histórico total) tal cual.
- Spec de referencia: `docs/superpowers/specs/2026-08-08-portal-reposo-pausas-fidelidad-express-design.md`, sección "Fase D".

---

### Task 1: Migración SQL — beneficios por nivel + asignación manual (D1 + D2)

**Files:**
- Create: `migrations/fidelidad-beneficios-override.sql`

**Interfaces:**
- Produce: `public.niveles_fidelizacion` gana columnas `sin_deposito boolean not null default false`, `acceso_express boolean not null default false`.
- Produce: `public.clientes` gana columna `nivel_fidelizacion_override uuid null references public.niveles_fidelizacion(id) on delete set null`.
- Produce: `public.obtener_nivel_cliente(p_cliente_id uuid) returns jsonb` — mismo nombre/firma que hoy, pero el objeto `nivel` del JSON de salida gana `sin_deposito` y `acceso_express`, y resuelve `clientes.nivel_fidelizacion_override` antes que los umbrales automáticos. Lo consume Task 2 (`crear_cita_publica`) y, más adelante, la Fase E (gating de `acceso_express`).
- Consume (no se toca): `public.citas` (conteo de completadas), `public.cobros` (`total_cents`, ya migrado a céntimos reales — ver `migrations/fix-cobro-ambiguo-y-precio-cobrado.sql`).

- [ ] **Step 1: Preparar el escenario de prueba (aislado, tenant `test_s18_e6d9d`)**

Ejecuta vía la tool MCP `execute_sql` (project_id `vtrggiogjrhqtwbhbgia`):

```sql
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333111';
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';

-- Umbrales deliberadamente inalcanzables (999 visitas, 999.999€): ningun cliente de prueba
-- los cumple por historial. Si obtener_nivel_cliente devuelve este nivel para nuestro
-- cliente de prueba (0 visitas, 0 gastado), solo puede ser por el override manual (Step 6).
insert into niveles_fidelizacion (negocio_id, nombre, orden, umbral_visitas, umbral_gastado_cents, color, icono, activo)
values ('test_s18_e6d9d', 'TEST Fase D nivel inalcanzable', 0, 999, 99999900, '#f4501e', 'star', true);

insert into clientes (negocio_id, nombre, telefono)
values ('test_s18_e6d9d', 'Cliente Test Fase D Override', '600333111');
```

- [ ] **Step 2: RED — confirmar que las columnas nuevas no existen todavía**

```sql
select sin_deposito, acceso_express from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' limit 1;
```

Expected: error `column "sin_deposito" does not exist` (42703).

```sql
update clientes set nivel_fidelizacion_override = null where negocio_id = 'test_s18_e6d9d' and telefono = '600333111';
```

Expected: error `column "nivel_fidelizacion_override" does not exist` (42703).

- [ ] **Step 3: Escribir la migración**

Crea `migrations/fidelidad-beneficios-override.sql`:

```sql
-- Fase D (D1+D2): niveles de fidelizacion ganan 2 beneficios operativos configurables
-- (sin_deposito, acceso_express) y un cliente puede recibir un nivel asignado a mano en
-- vez de calculado por umbrales de visitas/gasto. Mismo patron que el override de riesgo
-- ya existente (clientes.deposito_perfil_override / perfil_riesgo_cliente en
-- migrations/depositos-dinamicos.sql): un override manual gana siempre al calculo
-- automatico, y null vuelve al comportamiento de siempre.
--
-- obtener_nivel_cliente se reescribe para resolver primero el override (si apunta a un
-- nivel ACTIVO — un override colgante a un nivel desactivado no debe devolver datos de un
-- nivel fantasma) y solo si no hay override valido cae al calculo por umbrales de siempre.
-- Su JSON de salida gana sin_deposito/acceso_express: los consume crear_cita_publica en la
-- Task 2 de este plan, y mas adelante la Fase E (gating de acceso_express).

alter table public.niveles_fidelizacion
  add column if not exists sin_deposito boolean not null default false,
  add column if not exists acceso_express boolean not null default false;

alter table public.clientes
  add column if not exists nivel_fidelizacion_override uuid null references public.niveles_fidelizacion(id) on delete set null;

create or replace function public.obtener_nivel_cliente(p_cliente_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_negocio_id text;
  v_visitas integer;
  v_gastado_cents integer;
  v_override uuid;
  v_nivel niveles_fidelizacion%rowtype;
  v_encontrado boolean := false;
begin
  select negocio_id, nivel_fidelizacion_override into v_negocio_id, v_override
  from clientes where id = p_cliente_id;
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  select count(*) into v_visitas from citas
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  if v_override is not null then
    select * into v_nivel from niveles_fidelizacion
    where id = v_override and negocio_id = v_negocio_id and activo = true;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    select * into v_nivel from niveles_fidelizacion
    where negocio_id = v_negocio_id and activo = true
      and (v_visitas >= umbral_visitas or v_gastado_cents >= umbral_gastado_cents)
    order by orden desc limit 1;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    return jsonb_build_object(
      'ok', true,
      'nivel', jsonb_build_object('nombre', 'Nuevo', 'color', '#9ca3af', 'orden', 0, 'sin_deposito', false, 'acceso_express', false),
      'visitas', v_visitas, 'gastado_cents', v_gastado_cents
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'nivel', jsonb_build_object(
      'id', v_nivel.id, 'nombre', v_nivel.nombre, 'color', v_nivel.color, 'icono', v_nivel.icono, 'orden', v_nivel.orden,
      'sin_deposito', v_nivel.sin_deposito, 'acceso_express', v_nivel.acceso_express
    ),
    'visitas', v_visitas, 'gastado_cents', v_gastado_cents
  );
end;
$function$;
```

- [ ] **Step 4: Aplicar la migración al proyecto Supabase**

Usa la tool MCP `apply_migration` (project_id `vtrggiogjrhqtwbhbgia`, name `fidelidad_beneficios_override`) con el contenido exacto del archivo del Step 3. `obtener_nivel_cliente` no cambia su `RETURNS` (sigue siendo `jsonb`), así que `CREATE OR REPLACE` basta — no hace falta `DROP` ni re-`GRANT`.

- [ ] **Step 5: GREEN — columnas nuevas + el comportamiento automático (sin override) no cambia**

```sql
select id, nombre, sin_deposito, acceso_express from niveles_fidelizacion
where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';
```

Expected: 1 fila, `sin_deposito = false`, `acceso_express = false` (default de la migración).

```sql
select obtener_nivel_cliente((select id from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333111'));
```

Expected: `nivel.nombre = 'Nuevo'` (el cliente tiene 0 visitas/0€ gastado; el nivel de prueba exige 999 visitas y no lo cumple por umbral), `nivel.sin_deposito = false`, `nivel.acceso_express = false`.

- [ ] **Step 6: GREEN — el override manual manda sobre el cálculo automático**

```sql
update niveles_fidelizacion set sin_deposito = true, acceso_express = true
where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';

update clientes set nivel_fidelizacion_override = (
  select id from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable'
) where negocio_id = 'test_s18_e6d9d' and telefono = '600333111';

select obtener_nivel_cliente((select id from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333111'));
```

Expected: `nivel.nombre = 'TEST Fase D nivel inalcanzable'`, `nivel.sin_deposito = true`, `nivel.acceso_express = true` — pese a que el cliente sigue sin cumplir el umbral de 999 visitas por sí solo. Esto confirma que el override gana al cálculo automático.

- [ ] **Step 7: Control — un override a un nivel desactivado no deja un nivel fantasma**

```sql
update niveles_fidelizacion set activo = false where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';

select obtener_nivel_cliente((select id from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333111'));
```

Expected: `nivel.nombre = 'Nuevo'` de nuevo (el override ya no resuelve porque el nivel está inactivo, y el cliente tampoco cumple ningún umbral automático).

Reactiva el nivel para dejar el escenario limpio antes de limpiar datos:

```sql
update niveles_fidelizacion set activo = true where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';
```

- [ ] **Step 8: Limpiar los datos de prueba**

```sql
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333111';
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel inalcanzable';
```

- [ ] **Step 9: Commit**

```bash
git add migrations/fidelidad-beneficios-override.sql
git commit -m "feat(fidelidad): niveles ganan sin_deposito/acceso_express + asignacion manual por cliente"
```

---

### Task 2: El beneficio `sin_deposito` manda sobre el depósito dinámico por riesgo (D3)

**Files:**
- Create: `migrations/fidelidad-sin-deposito-manda-riesgo.sql`

**Interfaces:**
- Consume: `public.obtener_nivel_cliente(uuid) returns jsonb` (Task 1) — se llama con `v_cliente` ya resuelto, se lee `->'nivel'->>'sin_deposito'`.
- Modifica el cuerpo (no la firma) de `public.crear_cita_publica(...)` — sigue devolviendo `jsonb`, mismos parámetros. `CREATE OR REPLACE FUNCTION` basta, no cambia `RETURNS`.

- [ ] **Step 1: Preparar el escenario de prueba (tenant `test_s18_e6d9d`)**

```sql
delete from citas where negocio_id = 'test_s18_e6d9d' and notas like 'TEST-FASE-D%';
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono in ('600222111', '600222222');
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D sin deposito';
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D candidato';
delete from negocio_portal where negocio_id = 'test_s18_e6d9d';

insert into negocio_portal (negocio_id, slug, portal_activo)
values ('test_s18_e6d9d', 'test-fase-d-verificacion', true)
on conflict (negocio_id) do update set portal_activo = true, slug = 'test-fase-d-verificacion';

insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
values ('051d5c70-9698-41f9-8dba-db40014d5b84', extract(dow from current_date + 1)::int, '09:00', '18:00', 1);

-- Precio 40€, sin prepago propio: cualquier deposito que aparezca en la reserva viene
-- SOLO del bloque de riesgo dinamico (no del prepago base del servicio).
insert into servicios (negocio_id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, precio, reservable_online, activo)
values ('test_s18_e6d9d', 'TEST Fase D candidato', 15, 0, 0, 40, true, true);

insert into niveles_fidelizacion (negocio_id, nombre, orden, umbral_visitas, umbral_gastado_cents, activo, sin_deposito, acceso_express)
values ('test_s18_e6d9d', 'TEST Fase D sin deposito', 0, 999, 99999900, true, true, false);

-- Cliente A: tiene el override sin_deposito=true. Id fijo para poder referenciarlo en
-- pasos posteriores sin encadenar "returning" entre llamadas separadas a execute_sql.
insert into clientes (id, negocio_id, nombre, telefono, nivel_fidelizacion_override)
values (
  '33333333-3333-4333-8333-333333333333',
  'test_s18_e6d9d', 'Cliente Test Fase D Perk', '600222111',
  (select id from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D sin deposito')
);

-- Cliente B (control): mismo historial de riesgo, SIN override. Sirve para confirmar en
-- el Step 8 que el fix no rompe el deposito dinamico para el resto de clientes.
insert into clientes (id, negocio_id, nombre, telefono)
values ('44444444-4444-4444-8444-444444444444', 'test_s18_e6d9d', 'Cliente Test Fase D Control', '600222222');

-- 2 no-shows por cliente: con el umbral por defecto (depositoUmbralAltoNoShows=2),
-- perfil_riesgo_cliente() debe devolver 'alto' para ambos (deposito = precio completo).
insert into citas (negocio_id, profesional_id, cliente_id, inicio, fin, estado, canal, notas) values
  ('test_s18_e6d9d', '051d5c70-9698-41f9-8dba-db40014d5b84', '33333333-3333-4333-8333-333333333333', now() - interval '10 days', now() - interval '10 days' + interval '15 min', 'no_show', 'manual', 'TEST-FASE-D-NOSHOW'),
  ('test_s18_e6d9d', '051d5c70-9698-41f9-8dba-db40014d5b84', '33333333-3333-4333-8333-333333333333', now() - interval '5 days', now() - interval '5 days' + interval '15 min', 'no_show', 'manual', 'TEST-FASE-D-NOSHOW'),
  ('test_s18_e6d9d', '051d5c70-9698-41f9-8dba-db40014d5b84', '44444444-4444-4444-8444-444444444444', now() - interval '10 days', now() - interval '10 days' + interval '15 min', 'no_show', 'manual', 'TEST-FASE-D-NOSHOW'),
  ('test_s18_e6d9d', '051d5c70-9698-41f9-8dba-db40014d5b84', '44444444-4444-4444-8444-444444444444', now() - interval '5 days', now() - interval '5 days' + interval '15 min', 'no_show', 'manual', 'TEST-FASE-D-NOSHOW');

-- Activa el deposito dinamico SOLO para este tenant de pruebas (hoy esta OFF: la fila de
-- negocio_config no tenia esta clave — confirmado antes de escribir este plan). Se
-- restaura en el Step 9 quitando exactamente esta clave, sin tocar el resto del config.
update negocio_config set config = config || jsonb_build_object('depositoDinamicoActivo', true)
where negocio_id = 'test_s18_e6d9d';
```

- [ ] **Step 2: Confirmar que ambos clientes de prueba quedan con perfil de riesgo 'alto'**

```sql
select
  public.perfil_riesgo_cliente('33333333-3333-4333-8333-333333333333', 3, 2) as riesgo_perk,
  public.perfil_riesgo_cliente('44444444-4444-4444-8444-444444444444', 3, 2) as riesgo_control;
```

Expected: `riesgo_perk = 'alto'`, `riesgo_control = 'alto'`.

- [ ] **Step 3: RED — confirmar que hoy el perk `sin_deposito` NO evita el depósito por riesgo**

```sql
select crear_cita_publica(
  p_slug => 'test-fase-d-verificacion',
  p_servicio_id => (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D candidato'),
  p_profesional_id => '051d5c70-9698-41f9-8dba-db40014d5b84',
  p_inicio => ((current_date + 1) + time '10:00') at time zone 'Europe/Madrid',
  p_cliente_nombre => 'Cliente Test Fase D Perk',
  p_cliente_telefono => '600222111',
  p_notas => 'TEST-FASE-D-CITA-RED'
);
```

Expected (ANTES del fix): `jsonb` con `deposito_requerido = true`, `deposito_importe = 40`, `estado = 'pendiente'`. Confirma el bug real: el cliente tiene un nivel con `sin_deposito = true` pero igual se le exige el depósito completo por su historial de riesgo.

Borra la cita creada por esta llamada antes de continuar (si no, el mismo slot queda ocupado para el Step 6):

```sql
delete from citas where negocio_id = 'test_s18_e6d9d' and notas = 'TEST-FASE-D-CITA-RED';
```

- [ ] **Step 4: Escribir la migración con `crear_cita_publica` corregida**

Crea `migrations/fidelidad-sin-deposito-manda-riesgo.sql`:

```sql
-- Fase D (D3): el beneficio de fidelidad "sin_deposito" manda sobre el deposito dinamico
-- por riesgo. Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- crear_cita_publica calculaba el deposito en dos fases (prepago base del servicio, luego
-- ajuste dinamico por perfil_riesgo_cliente) sin mirar nunca el nivel de fidelidad del
-- cliente. Resultado: una clienta VIP con el perk "sin deposito" activado por el salon
-- seguia pagando senal completa si tenia algun no-show ocasional en su historial — el
-- perk no se aplicaba nunca de verdad.
--
-- Esta migracion resuelve el nivel de fidelidad (via obtener_nivel_cliente, Task 1 de este
-- plan) justo despues de resolver el cliente, y si sin_deposito=true SALTA ENTERO el
-- bloque de calculo de deposito (tanto el prepago base del servicio como el dinamico por
-- riesgo) dejando v_deposito en su valor inicial (0). Decision explicita: "el deposito se
-- fija a 0" en la spec significa CERO deposito de cualquier origen, no solo el dinamico —
-- una clienta VIP con este perk no paga senal, ni siquiera si el servicio la exige por
-- defecto.
--
-- No cambia RETURNS (sigue jsonb): CREATE OR REPLACE basta, no hace falta DROP ni re-GRANT.

CREATE OR REPLACE FUNCTION public.crear_cita_publica(p_slug text, p_servicio_id uuid, p_profesional_id uuid, p_inicio timestamp with time zone, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text, p_consentimiento_datos boolean DEFAULT true, p_consiente_ia boolean DEFAULT false, p_captcha_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text; v_dur int; v_espera int; v_extra int; v_total int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_cliente uuid; v_cita uuid; v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_deposito numeric := 0; v_estado text; v_canal text; v_tz text := 'Europe/Madrid';
  v_nivel_sin_deposito boolean := false;
begin
  if not coalesce(p_consentimiento_datos, false) then
    raise exception 'Debes aceptar el tratamiento de datos para reservar.';
  end if;

  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;
  if coalesce(length(public.normalizar_telefono(p_cliente_telefono)), 0) < 7 then raise exception 'Indica un telefono valido.'; end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fija
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio and activo = true)
  then raise exception 'Profesional no valido'; end if;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_cliente_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (select count(*) from public.citas where negocio_id = v_negocio and canal = 'web' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  v_total := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin := p_inicio + make_interval(mins => v_total);

  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then raise exception 'Fuera de la antelacion minima'; end if;

  if not exists (select 1 from public.horarios_profesional h where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio and (v_fin at time zone v_tz)::time <= h.hora_fin)
  then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_inicio)
      )
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio) then raise exception 'El profesional no esta disponible'; end if;

  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono) limit 1;

  if v_cliente is null then
    insert into public.clientes (
      negocio_id, nombre, telefono, email,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha
    )
    values (
      v_negocio,
      left(trim(p_cliente_nombre), 120),
      trim(p_cliente_telefono),
      left(nullif(trim(p_cliente_email), ''), 200),
      p_consiente_ia,
      case when p_consiente_ia then 'portal' else null end,
      case when p_consiente_ia then now() else null end
    )
    returning id into v_cliente;
  else
    update public.clientes
       set consiente_ia = p_consiente_ia,
           consiente_ia_origen = 'portal',
           consiente_ia_fecha = now()
     where id = v_cliente
       and (consiente_ia is distinct from p_consiente_ia or consiente_ia_origen is null);
  end if;

  v_nivel_sin_deposito := coalesce((public.obtener_nivel_cliente(v_cliente)->'nivel'->>'sin_deposito')::boolean, false);

  if v_nivel_sin_deposito then
    v_deposito := 0;
  else
    if v_prepago then
      if v_prepago_fijo is not null and v_prepago_fijo > 0 then v_deposito := v_prepago_fijo;
      elsif v_prepago_pct is not null and v_prepago_pct > 0 then v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
      end if;
    end if;

    if coalesce((select (config->>'depositoDinamicoActivo')::boolean from public.negocio_config where negocio_id = v_negocio), false) then
      declare v_tier text; v_factor numeric; v_uf int; v_ua int;
      begin
        select coalesce((config->>'depositoFactorRiesgo')::numeric, 2), coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3), coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
          into v_factor, v_uf, v_ua from public.negocio_config where negocio_id = v_negocio;
        v_tier := public.perfil_riesgo_cliente(v_cliente, coalesce(v_uf,3), coalesce(v_ua,2));
        if v_tier = 'exento' then v_deposito := 0;
        elsif v_tier = 'riesgo' then v_deposito := least(round(v_deposito * coalesce(v_factor,2), 2), coalesce(v_precio,0));
        elsif v_tier = 'alto' then v_deposito := coalesce(v_precio, 0);
        end if;
      end;
    end if;
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
    estado, canal, notas, deposito_requerido, deposito_pagado, deposito_importe, confirmado_por_cliente,
    consentimiento_datos, consentimiento_at)
  values (v_negocio, p_profesional_id, p_servicio_id, v_cliente, p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500), (v_deposito > 0), false, nullif(v_deposito, 0), true,
    p_consentimiento_datos, case when p_consentimiento_datos then now() else null end)
  returning id into v_cita;

  return jsonb_build_object('cita_id', v_cita, 'cliente_id', v_cliente, 'estado', v_estado, 'canal', v_canal,
    'deposito_requerido', (v_deposito > 0), 'deposito_importe', v_deposito, 'inicio', p_inicio, 'fin', v_fin);
end;
$function$;
```

- [ ] **Step 5: Aplicar la migración**

Usa `apply_migration` (project_id `vtrggiogjrhqtwbhbgia`, name `fidelidad_sin_deposito_manda_riesgo`) con el contenido exacto del Step 4.

- [ ] **Step 6: GREEN — el cliente con el perk ya no paga depósito**

Repite exactamente la llamada del Step 3 (mismo slot, ya liberado por el `delete` del final del Step 3):

```sql
select crear_cita_publica(
  p_slug => 'test-fase-d-verificacion',
  p_servicio_id => (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D candidato'),
  p_profesional_id => '051d5c70-9698-41f9-8dba-db40014d5b84',
  p_inicio => ((current_date + 1) + time '10:00') at time zone 'Europe/Madrid',
  p_cliente_nombre => 'Cliente Test Fase D Perk',
  p_cliente_telefono => '600222111',
  p_notas => 'TEST-FASE-D-CITA-GREEN'
);
```

Expected: `deposito_requerido = false`, `deposito_importe = 0`, `estado = 'confirmada'` — a pesar de que `perfil_riesgo_cliente` de este cliente sigue siendo `'alto'` (no se ha tocado su historial).

- [ ] **Step 7: Control negativo — el cliente SIN el perk sigue pagando el depósito por riesgo**

```sql
select crear_cita_publica(
  p_slug => 'test-fase-d-verificacion',
  p_servicio_id => (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D candidato'),
  p_profesional_id => '051d5c70-9698-41f9-8dba-db40014d5b84',
  p_inicio => ((current_date + 1) + time '11:00') at time zone 'Europe/Madrid',
  p_cliente_nombre => 'Cliente Test Fase D Control',
  p_cliente_telefono => '600222222',
  p_notas => 'TEST-FASE-D-CITA-CONTROL'
);
```

Expected: `deposito_requerido = true`, `deposito_importe = 40`, `estado = 'pendiente'` — confirma que el fix no rompe el depósito dinámico para clientes sin el perk.

- [ ] **Step 8: Limpiar todos los datos de prueba y restaurar la configuración del tenant**

```sql
delete from citas where negocio_id = 'test_s18_e6d9d' and notas like 'TEST-FASE-D%';
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono in ('600222111', '600222222');
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D sin deposito';
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D candidato';
delete from negocio_portal where negocio_id = 'test_s18_e6d9d';

-- Restaura negocio_config: solo quita la clave que este plan añadió, sin tocar el resto
-- (nombre/telefono/direccion/asistenteAgendaActivo del tenant de pruebas quedan intactos).
update negocio_config set config = config - 'depositoDinamicoActivo' where negocio_id = 'test_s18_e6d9d';
```

- [ ] **Step 9: Commit**

```bash
git add migrations/fidelidad-sin-deposito-manda-riesgo.sql
git commit -m "fix(fidelidad): el perk sin_deposito manda sobre el deposito dinamico por riesgo"
```

---

### Task 3: UI — 2 toggles de beneficio en el editor de nivel (Configuración → Recompensas)

**Files:**
- Modify: `components/config/TabRecompensas.web.tsx`

**Interfaces:**
- Consume: columnas `niveles_fidelizacion.sin_deposito`, `niveles_fidelizacion.acceso_express` (Task 1).
- Produce: `Nivel.sin_deposito: boolean`, `Nivel.acceso_express: boolean` en el estado del componente — no los consume ningún otro archivo.

- [ ] **Step 1: Añadir los dos campos a la interfaz `Nivel`**

En `components/config/TabRecompensas.web.tsx`, reemplaza:

```ts
interface Nivel {
  id: string;
  nombre: string;
  umbral_visitas?: number;
  umbral_gastado?: number;
  color: string;
  orden: number;
}
```

por:

```ts
interface Nivel {
  id: string;
  nombre: string;
  umbral_visitas?: number;
  umbral_gastado?: number;
  color: string;
  orden: number;
  sin_deposito: boolean;
  acceso_express: boolean;
}
```

- [ ] **Step 2: Incluir los campos al cargar niveles desde Supabase**

Reemplaza:

```ts
      // La BD guarda el umbral de gasto en centimos; el formulario trabaja en euros.
      setNiveles((data || []).map((n: any) => ({
        ...n,
        umbral_gastado: n.umbral_gastado_cents != null ? n.umbral_gastado_cents / 100 : undefined,
      })));
```

por:

```ts
      // La BD guarda el umbral de gasto en centimos; el formulario trabaja en euros.
      setNiveles((data || []).map((n: any) => ({
        ...n,
        umbral_gastado: n.umbral_gastado_cents != null ? n.umbral_gastado_cents / 100 : undefined,
        sin_deposito: !!n.sin_deposito,
        acceso_express: !!n.acceso_express,
      })));
```

- [ ] **Step 3: Incluir los campos al guardar un nivel**

Reemplaza:

```ts
      const payload = {
        negocio_id: negocioId,
        nombre: nivel.nombre,
        umbral_visitas: nivel.umbral_visitas || null,
        umbral_gastado_cents: nivel.umbral_gastado ? Math.round(nivel.umbral_gastado * 100) : null,
        color: nivel.color,
        orden: nivel.orden,
      };
```

por:

```ts
      const payload = {
        negocio_id: negocioId,
        nombre: nivel.nombre,
        umbral_visitas: nivel.umbral_visitas || null,
        umbral_gastado_cents: nivel.umbral_gastado ? Math.round(nivel.umbral_gastado * 100) : null,
        color: nivel.color,
        orden: nivel.orden,
        sin_deposito: nivel.sin_deposito,
        acceso_express: nivel.acceso_express,
      };
```

- [ ] **Step 4: Valores por defecto al crear un nivel nuevo**

Reemplaza:

```tsx
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditNivel({
            id: '',
            nombre: '',
            umbral_visitas: 0,
            umbral_gastado: 0,
            color: T.primary,
            orden: niveles.length,
          })}>
            Añadir nivel
          </Btn>
```

por:

```tsx
          <Btn variant="primary" size="md" icon="plus" onClick={() => setEditNivel({
            id: '',
            nombre: '',
            umbral_visitas: 0,
            umbral_gastado: 0,
            color: T.primary,
            orden: niveles.length,
            sin_deposito: false,
            acceso_express: false,
          })}>
            Añadir nivel
          </Btn>
```

- [ ] **Step 5: Los 2 toggles en el modal de edición de nivel**

Dentro de `ModalNivel`, reemplaza (el bloque de color seguido del cierre de `FieldStack`):

```tsx
            <FieldRow label="Color del nivel">
              <div style={{ display: 'flex', gap: 8 }}>
                {COLORES.map(c => {
                  const active = form.color === c.v;
                  return (
                    <button
                      key={c.v}
                      title={c.name}
                      onClick={() => setForm({ ...form, color: c.v })}
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: c.v,
                        border: `2px solid ${active ? '#fff' : 'transparent'}`,
                        cursor: 'pointer',
                        boxShadow: active ? `0 0 0 2px ${T.bg}, 0 0 0 4px ${c.v}` : 'none',
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      {active && <SettingsIcon name="check" size={14} color="#fff" />}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
          </div>
        </FieldStack>
```

por:

```tsx
            <FieldRow label="Color del nivel">
              <div style={{ display: 'flex', gap: 8 }}>
                {COLORES.map(c => {
                  const active = form.color === c.v;
                  return (
                    <button
                      key={c.v}
                      title={c.name}
                      onClick={() => setForm({ ...form, color: c.v })}
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: c.v,
                        border: `2px solid ${active ? '#fff' : 'transparent'}`,
                        cursor: 'pointer',
                        boxShadow: active ? `0 0 0 2px ${T.bg}, 0 0 0 4px ${c.v}` : 'none',
                        display: 'grid', placeItems: 'center',
                      }}
                    >
                      {active && <SettingsIcon name="check" size={14} color="#fff" />}
                    </button>
                  );
                })}
              </div>
            </FieldRow>

            <FieldRow label="Sin depósito" hint="Los clientes de este nivel nunca pagan señal al reservar online, aunque el salón tenga activado el depósito dinámico por riesgo.">
              <Toggle
                on={form.sin_deposito}
                onChange={v => setForm({ ...form, sin_deposito: v })}
                label={form.sin_deposito ? 'Sin depósito' : 'Depósito normal'}
              />
            </FieldRow>

            <FieldRow label="Acceso a citas exprés" hint='Los clientes de este nivel pueden usar "Lo antes posible" en el portal de reservas.'>
              <Toggle
                on={form.acceso_express}
                onChange={v => setForm({ ...form, acceso_express: v })}
                label={form.acceso_express ? 'Con acceso' : 'Sin acceso'}
              />
            </FieldRow>
          </div>
        </FieldStack>
```

- [ ] **Step 6: Arrancar el servidor y verificar en el navegador**

```bash
cd "C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy"
npx expo start --web --port 8081
```

Con el servidor arriba, usa las tools del Browser pane:
1. `preview_start` con `{"url": "http://localhost:8081/login"}`.
2. Con `find`, localiza el campo de correo, el de contraseña y el botón de entrar; con `computer`/`form_input`, introduce `chispa.test.s18@mecha.app` / `MechaTestS18_2026` y envía el formulario.
3. `navigate` a `http://localhost:8081/configuracion`.
4. Con `find`, localiza y pulsa la pestaña **"Recompensas"**.
5. Pulsa **"Añadir nivel"**. Rellena nombre `TEST Fase D toggles UI`, deja los umbrales en 0.
6. Activa los toggles **"Sin depósito"** y **"Acceso a citas exprés"**.
7. Pulsa **"Guardar nivel"**.
8. `read_page` sobre la lista de niveles para confirmar que `TEST Fase D toggles UI` aparece.

- [ ] **Step 7: Confirmar en base de datos que los toggles se guardaron**

```sql
select id, nombre, sin_deposito, acceso_express from niveles_fidelizacion
where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D toggles UI';
```

Expected: 1 fila, `sin_deposito = true`, `acceso_express = true`.

- [ ] **Step 8: Limpiar el nivel de prueba creado desde la UI**

```sql
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D toggles UI';
```

- [ ] **Step 9: Commit**

```bash
git add components/config/TabRecompensas.web.tsx
git commit -m "feat(fidelidad): editor de nivel gana toggles de sin_deposito y acceso_express"
```

---

### Task 4: UI — selector de nivel de fidelidad en la ficha de cliente

**Files:**
- Modify: `app/(tabs)/clientes.web.tsx`

**Interfaces:**
- Consume: columna `clientes.nivel_fidelizacion_override` (Task 1), tabla `niveles_fidelizacion` (`id, nombre` de niveles activos del negocio).
- Produce: nada que consuma otro archivo — es la superficie manual de D2 para el equipo del salón.

- [ ] **Step 1: Añadir el campo a la interfaz `Cliente`**

En `app/(tabs)/clientes.web.tsx`, reemplaza:

```ts
  deposito_perfil_override?: string | null;
```

por:

```ts
  deposito_perfil_override?: string | null;
  nivel_fidelizacion_override?: string | null;
```

- [ ] **Step 2: Añadir el estado de niveles disponibles**

Reemplaza:

```ts
  const [negocioId, setNegocioId] = useState('');
```

por:

```ts
  const [negocioId, setNegocioId] = useState('');
  // Fase D: niveles de fidelidad del negocio, para el selector de asignacion manual (D2).
  const [niveles, setNiveles] = useState<{ id: string; nombre: string }[]>([]);
```

- [ ] **Step 3: Cargar los niveles y la columna de override junto al resto de datos**

Reemplaza:

```ts
    const [{ data: clts }, { data: citsData }, { data: srvData }, { data: profData }, { data: fichasData }, { data: cfgRow }, { data: fugaData }, { data: riesgoNoShowData }, { data: recompraData }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, telefono, email, fecha_nacimiento, alergias, notas, canal_preferido, bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, frecuencia_dias, bloqueado, bloqueo_motivo, etiquetas, deposito_perfil_override, consiente_ia, consiente_ia_origen, consiente_ia_fecha')
        .eq('negocio_id', profile.negocio_id)
        .order('nombre'),
      supabase
        .from('citas')
        .select('id, cliente_id, inicio, fin, estado, servicio_id, profesional_id, notas, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('servicios')
        .select('id, nombre, precio')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('profesionales')
        .select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('fichas_tecnicas_color')
        .select('*')
        .eq('negocio_id', profile.negocio_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('negocio_config')
        .select('config')
        .eq('negocio_id', profile.negocio_id)
        .maybeSingle(),
      supabase.rpc('clientes_en_riesgo_fuga'),
      supabase.rpc('clientes_riesgo_no_show'),
      supabase.rpc('rpc_clientes_toca_recompra', { p_negocio_id: profile.negocio_id }),
    ]);
```

por:

```ts
    const [{ data: clts }, { data: citsData }, { data: srvData }, { data: profData }, { data: fichasData }, { data: cfgRow }, { data: fugaData }, { data: riesgoNoShowData }, { data: recompraData }, { data: nivelesData }] = await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre, telefono, email, fecha_nacimiento, alergias, notas, canal_preferido, bebida_preferida, sensibilidades_cuero, noshows_count, perfil_riesgo, ticket_medio, frecuencia_dias, bloqueado, bloqueo_motivo, etiquetas, deposito_perfil_override, nivel_fidelizacion_override, consiente_ia, consiente_ia_origen, consiente_ia_fecha')
        .eq('negocio_id', profile.negocio_id)
        .order('nombre'),
      supabase
        .from('citas')
        .select('id, cliente_id, inicio, fin, estado, servicio_id, profesional_id, notas, formula_producto, formula_tono, formula_tiempo_min, formula_resultado, formula_notas')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('servicios')
        .select('id, nombre, precio')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('profesionales')
        .select('id, nombre, color')
        .eq('negocio_id', profile.negocio_id),
      supabase
        .from('fichas_tecnicas_color')
        .select('*')
        .eq('negocio_id', profile.negocio_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('negocio_config')
        .select('config')
        .eq('negocio_id', profile.negocio_id)
        .maybeSingle(),
      supabase.rpc('clientes_en_riesgo_fuga'),
      supabase.rpc('clientes_riesgo_no_show'),
      supabase.rpc('rpc_clientes_toca_recompra', { p_negocio_id: profile.negocio_id }),
      supabase
        .from('niveles_fidelizacion')
        .select('id, nombre')
        .eq('negocio_id', profile.negocio_id)
        .eq('activo', true)
        .order('orden'),
    ]);
```

- [ ] **Step 4: Guardar los niveles cargados en el estado**

Reemplaza:

```ts
    setClientes(enrichedClients);
    setCitas(citsData ?? []);
    setServicios(srvData ?? []);
    setProfesionales(profData ?? []);
    setFichasTecnicas(fichasData ?? []);
```

por:

```ts
    setClientes(enrichedClients);
    setCitas(citsData ?? []);
    setServicios(srvData ?? []);
    setProfesionales(profData ?? []);
    setFichasTecnicas(fichasData ?? []);
    setNiveles(nivelesData ?? []);
```

- [ ] **Step 5: Selector de nivel junto al de depósito, en la ficha de cliente**

Reemplaza:

```tsx
                      {/* Deposito segun tipo de cliente (senal al reservar online). Se configura en Ajustes > Politicas. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <span title="Cuanto paga de senal este cliente al reservar online. 'Automatico' lo decide su historial (no-shows / citas completadas); las demas opciones lo fuerzan a mano. El comportamiento global se ajusta en Ajustes > Politicas." style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec }}>Deposito (senal):</span>
                        <select
                          className="m-control"
                          value={c.deposito_perfil_override ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            const { error } = await supabase.from('clientes').update({ deposito_perfil_override: v }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, deposito_perfil_override: v } : x)));
                          }}
                          style={{ padding: '7px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                        >
                          <option value="">Automatico (por historial)</option>
                          <option value="exento">Exento (no paga senal)</option>
                          <option value="normal">Normal (senal del servicio)</option>
                          <option value="riesgo">Riesgo (senal aumentada)</option>
                          <option value="alto">Prepago total</option>
                        </select>
                      </div>
```

por:

```tsx
                      {/* Deposito segun tipo de cliente (senal al reservar online). Se configura en Ajustes > Politicas. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        <span title="Cuanto paga de senal este cliente al reservar online. 'Automatico' lo decide su historial (no-shows / citas completadas); las demas opciones lo fuerzan a mano. El comportamiento global se ajusta en Ajustes > Politicas." style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec }}>Deposito (senal):</span>
                        <select
                          className="m-control"
                          value={c.deposito_perfil_override ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            const { error } = await supabase.from('clientes').update({ deposito_perfil_override: v }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, deposito_perfil_override: v } : x)));
                          }}
                          style={{ padding: '7px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                        >
                          <option value="">Automatico (por historial)</option>
                          <option value="exento">Exento (no paga senal)</option>
                          <option value="normal">Normal (senal del servicio)</option>
                          <option value="riesgo">Riesgo (senal aumentada)</option>
                          <option value="alto">Prepago total</option>
                        </select>
                      </div>
                      {/* Fase D (D2): asignacion manual del nivel de fidelidad. Mismo patron que el
                          override de deposito de arriba: null = automatico (por visitas/gasto),
                          cualquier otro valor lo fuerza a mano. Los beneficios del nivel
                          (sin_deposito, acceso_express) se aplican igual que si lo hubiera ganado
                          por historial (ver obtener_nivel_cliente). */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        <span title="Fuerza el nivel de fidelidad de este cliente en vez de calcularlo por su historial de visitas/gasto. Los beneficios del nivel (deposito, acceso a citas expres) se aplican igual." style={{ fontSize: 12, fontWeight: 600, color: TOKENS.textSec }}>Nivel de fidelidad:</span>
                        <select
                          className="m-control"
                          value={c.nivel_fidelizacion_override ?? ''}
                          onChange={async (e) => {
                            const v = e.target.value || null;
                            const { error } = await supabase.from('clientes').update({ nivel_fidelizacion_override: v }).eq('id', c.id);
                            if (!error) setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, nivel_fidelizacion_override: v } : x)));
                          }}
                          style={{ padding: '7px 12px', background: TOKENS.bgCard, border: `1px solid ${TOKENS.border}`, borderRadius: 10, color: TOKENS.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                        >
                          <option value="">Automatico (por historial)</option>
                          {niveles.map((n) => (
                            <option key={n.id} value={n.id}>{n.nombre}</option>
                          ))}
                        </select>
                      </div>
```

- [ ] **Step 6: Preparar un nivel y un cliente de prueba para verlo en el navegador**

```sql
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333222';
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel UI';

insert into niveles_fidelizacion (negocio_id, nombre, orden, umbral_visitas, umbral_gastado_cents, activo)
values ('test_s18_e6d9d', 'TEST Fase D nivel UI', 0, 999, 99999900, true);

insert into clientes (negocio_id, nombre, telefono)
values ('test_s18_e6d9d', 'Cliente Test Fase D UI', '600333222');
```

- [ ] **Step 7: Arrancar el servidor y verificar en el navegador**

```bash
cd "C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy"
npx expo start --web --port 8081
```

Con el servidor arriba (si ya está corriendo de la Task 3, reutilízalo):
1. Si no hay sesión activa, repite el login del Step 6 de la Task 3.
2. `navigate` a `http://localhost:8081/clientes`.
3. Con `find`, busca y abre la ficha de **"Cliente Test Fase D UI"**.
4. Con `find`, localiza el selector **"Nivel de fidelidad:"** y, con `form_input`, selecciona **"TEST Fase D nivel UI"**.
5. `read_page` sobre el selector para confirmar que quedó seleccionado tras el cambio.

- [ ] **Step 8: Confirmar en base de datos que el override se guardó**

```sql
select c.nombre, c.nivel_fidelizacion_override, n.nombre as nivel_nombre
from clientes c
join niveles_fidelizacion n on n.id = c.nivel_fidelizacion_override
where c.negocio_id = 'test_s18_e6d9d' and c.telefono = '600333222';
```

Expected: 1 fila, `nivel_nombre = 'TEST Fase D nivel UI'`.

- [ ] **Step 9: Limpiar los datos de prueba**

```sql
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono = '600333222';
delete from niveles_fidelizacion where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase D nivel UI';
```

- [ ] **Step 10: Commit**

```bash
git add "app/(tabs)/clientes.web.tsx"
git commit -m "feat(fidelidad): selector de nivel manual en la ficha de cliente"
```
