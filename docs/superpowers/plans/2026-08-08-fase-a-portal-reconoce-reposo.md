# Fase A: el portal reconoce el reposo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El portal público de reservas deja de bloquear el reposo de una cita existente como si fuera trabajo activo — tanto al MOSTRAR huecos (`disponibilidad_publica`, `portal_dias_disponibles`) como al RESERVARLOS de verdad (`crear_cita_publica`, `modificar_cita_publica`, `crear_cita_publica_grupo`) — y anota con el minutaje exacto los huecos que nacen de un reposo.

**Architecture:** Cinco funciones SQL (`SECURITY DEFINER`, proyecto Supabase "Mecha") se reescriben para chocar solo contra las fases activas de cada cita (`[inicio, fin_activa)` y, si hay reposo real, `[fin_espera, fin)`), replicando la regla que ya usa `ventanasActivas()` en `lib/retrasos.ts` para la agenda interna. Dos funciones LEEN disponibilidad (Task 1) y tres funciones ESCRIBEN una cita nueva (Task 3) — las cinco deben usar la misma regla de choque, o el portal ofrece huecos que luego rechaza al confirmar. `disponibilidad_publica` gana dos columnas calculadas (`en_reposo`, `reposo_disponible_min`); el cliente TS y la UI del portal las consumen para mostrar una nota neutra (Task 2).

**Tech Stack:** PostgreSQL/plpgsql (Supabase, proyecto `vtrggiogjrhqtwbhbgia`), TypeScript, React (Expo Router web).

## Global Constraints

- Proyecto Supabase: `vtrggiogjrhqtwbhbgia` (nombre "Mecha"). Usa las tools MCP de Supabase (`execute_sql`, `apply_migration`) contra este `project_id`.
- Repo real de la app: `C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy` (NO el repo hermano de tests en `Escritorio\novanoidai\Hairy`).
- El cambio es aditivo/correctivo: solo revela huecos que hoy se ocultan indebidamente. No debe cambiar el comportamiento de ningún hueco que ya se ofrecía.
- Tenant de pruebas aislado: `test_s18_e6d9d` (negocio_id). Cualquier dato de prueba insertado en este plan se limpia al final de cada tarea.
- Zona horaria del salón: `'Europe/Madrid'` (hardcodeada en ambas funciones, no tocar).
- Spec de referencia: `docs/superpowers/specs/2026-08-08-portal-reposo-pausas-fidelidad-express-design.md`, sección "Fase A".
- Task 3 se añadió tras la revisión final de rama de Tasks 1-2 (ya en producción): el reviewer detectó que las funciones de ESCRITURA seguían con el choque de rango completo, así que un hueco de reposo aparecía como reservable pero la reserva fallaba con "El hueco ya esta ocupado". Es un hueco del plan original (Task 1 solo cubría lectura), no un defecto de implementación de Tasks 1-2.

---

### Task 1: Migración SQL — las funciones del portal dejan de bloquear el reposo

**Files:**
- Create: `migrations/fix-reposo-portal-disponibilidad.sql`

**Interfaces:**
- Produce: `public.disponibilidad_publica(p_slug text, p_servicio_id uuid, p_fecha date, p_profesional_id uuid default null)` ahora devuelve `TABLE(profesional_id uuid, profesional_nombre text, slot timestamptz, en_reposo boolean, reposo_disponible_min integer)` (antes solo `profesional_id, profesional_nombre, slot`).
- Produce: `public.portal_dias_disponibles(...)` misma firma que antes, `TABLE(dia date)`.
- Consume (no se toca): `public.citas` (columnas `inicio, fin, fin_activa, fin_espera, estado, profesional_id`), `public.horarios_profesional`, `public.bloqueos_profesional`, `public.cierres_negocio`, `public.negocio_portal`, `public.servicios`.

- [ ] **Step 1: Preparar el escenario de prueba (aislado, tenant `test_s18_e6d9d`)**

Ejecuta vía la tool MCP `execute_sql` (project_id `vtrggiogjrhqtwbhbgia`):

```sql
-- Limpieza defensiva por si una ejecucion anterior no limpio del todo
delete from citas where negocio_id = 'test_s18_e6d9d' and notas = 'TEST-FASE-A-REPOSO';
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato';

-- Portal publico activo para el tenant de pruebas (hoy no tiene ninguna fila)
insert into negocio_portal (negocio_id, slug, portal_activo)
values ('test_s18_e6d9d', 'test-fase-a-verificacion', true)
on conflict (negocio_id) do update set portal_activo = true, slug = 'test-fase-a-verificacion';

-- Horario de "Marta Prueba" MANANA: el turno es EXACTAMENTE la cita host (11:00-11:55),
-- para que el unico hueco posible del dia sea el reposo que estamos probando.
insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
values ('051d5c70-9698-41f9-8dba-db40014d5b84', extract(dow from current_date + 1)::int, '11:00', '11:55', 1);

-- Servicio candidato que un cliente nuevo intentaria reservar: 15 min activos, sin reposo propio.
insert into servicios (negocio_id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, precio, reservable_online, activo)
values ('test_s18_e6d9d', 'TEST Fase A candidato', 15, 0, 0, 10, true, true);

-- Cita host de Marta manana: 11:00-11:10 activa, 11:10-11:40 reposo (30 min), 11:40-11:55 activa.
insert into citas (negocio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, canal, notas)
values (
  'test_s18_e6d9d',
  '051d5c70-9698-41f9-8dba-db40014d5b84',
  ((current_date + 1) + time '11:00') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '11:55') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '11:10') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '11:40') at time zone 'Europe/Madrid',
  'confirmada', 'manual', 'TEST-FASE-A-REPOSO'
);
```

Con esta rejilla (turno 11:00-11:55, paso de 15 min desde las 11:00, servicio de 15 min) los únicos candidatos que genera la función son 11:00, 11:15 y 11:30. Análisis esperado:
- `11:00` → choca con la fase activa 1 del host (`[11:00,11:10)`). Bloqueado siempre (antes y después del fix).
- `11:15` → cae entera dentro del reposo `[11:10,11:40)`. **Bloqueada hoy (bug), debe liberarse con el fix.**
- `11:30` → su tramo `[11:30,11:45)` choca con la fase activa 2 del host (`[11:40,11:55)`). Bloqueado siempre.

- [ ] **Step 2: Escribir y ejecutar la consulta que hoy falla (prueba de `disponibilidad_publica`)**

```sql
select profesional_id, slot
from disponibilidad_publica(
  'test-fase-a-verificacion',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  current_date + 1,
  '051d5c70-9698-41f9-8dba-db40014d5b84'
);
```

Expected (ANTES del fix, con la función actual): **0 filas**. Confirma que el bug es real antes de tocar nada.

- [ ] **Step 3: Escribir y ejecutar la consulta que hoy falla (prueba de `portal_dias_disponibles`)**

```sql
select dia
from portal_dias_disponibles(
  'test-fase-a-verificacion',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  '051d5c70-9698-41f9-8dba-db40014d5b84',
  3
);
```

Expected (ANTES del fix): **0 filas** (el día de mañana no aparece como disponible, porque su único hueco real vive dentro del reposo).

- [ ] **Step 4: Escribir la migración con las dos funciones corregidas**

Crea `migrations/fix-reposo-portal-disponibilidad.sql`:

```sql
-- Fix: el portal publico dejaba de ofrecer el reposo de una cita como hueco reservable.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- disponibilidad_publica y portal_dias_disponibles bloqueaban el rango COMPLETO
-- [inicio, fin] de cualquier cita existente, sin mirar nunca fin_activa/fin_espera.
-- El comentario original en migrations/portal-reserva-publica.sql lo documentaba como
-- decision consciente de v1 ("conservador; el aprovechamiento de reposos es una
-- optimizacion solo para uso interno"). Esta migracion alinea el portal publico con
-- el modelo que ya usa la agenda interna (lib/retrasos.ts: ventanasActivas): una cita
-- ocupa [inicio, fin_activa) y, si hay reposo real, [fin_espera, fin); el tramo
-- [fin_activa, fin_espera) queda libre.
--
-- disponibilidad_publica gana ademas dos columnas: en_reposo (bool) y
-- reposo_disponible_min (minutos exactos que quedan desde ese slot hasta que el
-- profesional necesita volver con la clienta original). Se calculan gratis en la
-- misma consulta: como el NOT EXISTS ya descarta cualquier choque con una fase
-- activa, cualquier solape restante contra el rango total de otra cita cae
-- necesariamente dentro de su reposo.
--
-- OJO grants: disponibilidad_publica CAMBIA su RETURNS TABLE (gana 2 columnas), y
-- Postgres rechaza eso en un CREATE OR REPLACE (42P13: cannot change return type of
-- existing function) — hay que DROP + CREATE, lo que borra los grants existentes, asi
-- que se re-otorgan a mano al final (confirmados por consulta directa a
-- information_schema.routine_privileges antes de escribir esta migracion: anon,
-- authenticated, service_role tienen EXECUTE; PUBLIC no). portal_dias_disponibles NO
-- cambia su RETURNS TABLE, asi que ahi CREATE OR REPLACE si preserva los grants sin
-- tocar nada mas.

DROP FUNCTION IF EXISTS public.disponibilidad_publica(text, uuid, date, uuid);

CREATE FUNCTION public.disponibilidad_publica(p_slug text, p_servicio_id uuid, p_fecha date, p_profesional_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profesional_id uuid, profesional_nombre text, slot timestamp with time zone, en_reposo boolean, reposo_disponible_min integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_total     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  v_total := v_dur + v_espera + v_extra;

  return query
  with profs as (
    select pr.id, pr.nombre
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           (g.ts at time zone v_tz) as slot_tz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => v_total),
      interval '15 minutes'
    ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz, reposo.en_reposo, reposo.disponible_min
  from gen
  join profs pr on pr.id = gen.profesional_id
  cross join lateral (
    select
      exists (
        select 1 from public.citas c2
        where c2.profesional_id = gen.profesional_id
          and c2.estado in ('pendiente','confirmada')
          and c2.inicio < gen.slot_tz + make_interval(mins => v_total)
          and c2.fin    > gen.slot_tz
      ) as en_reposo,
      (
        select min(round(extract(epoch from (
          coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
        )) / 60)::int)
        from public.citas c3
        where c3.profesional_id = gen.profesional_id
          and c3.estado in ('pendiente','confirmada')
          and c3.inicio < gen.slot_tz + make_interval(mins => v_total)
          and c3.fin    > gen.slot_tz
      ) as disponible_min
  ) reposo
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => v_total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => v_total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.slot_tz, pr.nombre;
end;
$function$;

-- DROP borro los grants: se re-otorgan exactamente los que tenia antes de esta migracion
-- (confirmado por consulta directa a information_schema.routine_privileges: anon,
-- authenticated, service_role — PUBLIC no tenia EXECUTE, no se le concede aqui).
GRANT EXECUTE ON FUNCTION public.disponibilidad_publica(text, uuid, date, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_dias_disponibles(p_slug text, p_servicio_id uuid, p_profesional_id uuid DEFAULT NULL::uuid, p_dias integer DEFAULT 21)
 RETURNS TABLE(dia date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_total   int;
  v_min_ant int;
  v_tz      text := 'Europe/Madrid';
  v_hoy     date;
  v_dias    int := least(greatest(coalesce(p_dias, 21), 1), 60);
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select duracion_activa_min + coalesce(duracion_espera_min,0) + coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0)
    into v_total, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_total is null then return; end if;

  v_hoy := (now() at time zone v_tz)::date;

  return query
  with dias as (
    select gd::date as d
    from generate_series(v_hoy, v_hoy + (v_dias - 1), interval '1 day') gd
    where not exists (
      select 1 from public.cierres_negocio cn
      where cn.negocio_id = v_negocio and cn.fecha = gd::date
    )
  ),
  profs as (
    select pr.id
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  gen as (
    select d.d,
           p.id as profesional_id,
           (g.ts at time zone v_tz) as slot_tz
    from dias d
    cross join profs p
    join public.horarios_profesional h
      on h.profesional_id = p.id
     and h.dia_semana = extract(dow from d.d)::int
    cross join lateral generate_series(
      (d.d + h.hora_inicio),
      (d.d + h.hora_fin) - make_interval(mins => v_total),
      interval '15 minutes'
    ) as g(ts)
  )
  select distinct gen.d
  from gen
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => v_total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => v_total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.d;
end;
$function$;
```

- [ ] **Step 5: Aplicar la migración al proyecto Supabase**

Usa la tool MCP `apply_migration` (project_id `vtrggiogjrhqtwbhbgia`, name `fix_reposo_portal_disponibilidad`) con el contenido exacto del archivo del Step 4.

Después de aplicarla, confirma que los grants de `disponibilidad_publica` quedaron exactamente como antes (el `DROP` los borra; la migración los re-otorga en el propio SQL, pero verifícalo con una consulta aparte en vez de darlo por hecho):

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'disponibilidad_publica'
order by grantee, privilege_type;
```

Expected: exactamente 4 filas — `(anon, EXECUTE)`, `(authenticated, EXECUTE)`, `(postgres, EXECUTE)`, `(service_role, EXECUTE)` — igual que antes de la migración. Si falta alguna, el portal público quedaría roto (un `anon` sin `EXECUTE` no puede llamar la función desde el navegador); no sigas al Step 6 hasta que esta consulta devuelva las 4 filas.

- [ ] **Step 6: Re-ejecutar la consulta del Step 2 y verificar que ahora pasa**

```sql
select profesional_id, slot, en_reposo, reposo_disponible_min
from disponibilidad_publica(
  'test-fase-a-verificacion',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  current_date + 1,
  '051d5c70-9698-41f9-8dba-db40014d5b84'
);
```

Expected: **1 fila** — `slot` = mañana a las 11:15 hora de Madrid, `en_reposo` = `true`, `reposo_disponible_min` = `25`.

- [ ] **Step 7: Re-ejecutar la consulta del Step 3 y verificar que ahora pasa**

```sql
select dia
from portal_dias_disponibles(
  'test-fase-a-verificacion',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  '051d5c70-9698-41f9-8dba-db40014d5b84',
  3
);
```

Expected: **1 fila** — `dia` = fecha de mañana.

- [ ] **Step 8: Verificar que no se ha roto ningún caso ya cubierto**

```sql
-- Un servicio de 40 min SI empieza dentro del reposo (11:15) pero se alarga hasta
-- las 11:55, invadiendo la segunda fase activa del host (11:40-11:55). Debe seguir
-- bloqueado: es el control de que el fix no ignora la ventana activa 2.
insert into servicios (negocio_id, nombre, duracion_activa_min, precio, reservable_online, activo)
values ('test_s18_e6d9d', 'TEST Fase A control 40min', 40, 10, true, true);

select count(*) as debe_ser_cero
from disponibilidad_publica(
  'test-fase-a-verificacion',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A control 40min'),
  current_date + 1,
  '051d5c70-9698-41f9-8dba-db40014d5b84'
);
```

Expected: `debe_ser_cero` = `0` (un candidato de 40 min que arranca a las 11:15 terminaría a las 11:55, invadiendo la fase activa 2 del host `[11:40,11:55)`; debe seguir bloqueado).

- [ ] **Step 9: Limpiar los datos de prueba**

```sql
delete from citas where negocio_id = 'test_s18_e6d9d' and notas = 'TEST-FASE-A-REPOSO';
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre in ('TEST Fase A candidato', 'TEST Fase A control 40min');
delete from negocio_portal where negocio_id = 'test_s18_e6d9d';
```

(La última línea borra el portal de prueba entero porque el tenant `test_s18_e6d9d` no tenía ninguna fila en `negocio_portal` antes de este plan — confirmado en el Step 1. Si al ejecutar este plan ya existiera una fila real, cambia esa línea por `update negocio_portal set portal_activo = false where negocio_id = 'test_s18_e6d9d'` en su lugar.)

- [ ] **Step 10: Commit**

```bash
git add migrations/fix-reposo-portal-disponibilidad.sql
git commit -m "fix(portal): el reposo de una cita ya no bloquea el hueco en el portal publico"
```

---

### Task 2: El portal muestra el minutaje exacto en los huecos de reposo

**Files:**
- Modify: `lib/reservaPublica.ts:45-49` (interfaz `SlotDisponible`)
- Modify: `lib/portalI18n.ts:99` (dict `es`, tras `slot_con_pro`) y `lib/portalI18n.ts:216` (dict `en`, tras `slot_con_pro`)
- Modify: `app/r/[slug].web.tsx:700-722` (render de cada botón de slot)

**Interfaces:**
- Consume: `SlotDisponible` (Task 1 ya hizo que el RPC devuelva `en_reposo`/`reposo_disponible_min`; este task solo declara los campos en TS).
- Produce: `SlotDisponible.en_reposo: boolean`, `SlotDisponible.reposo_disponible_min: number | null` — los consume el render de `app/r/[slug].web.tsx`.

- [ ] **Step 1: Declarar los campos nuevos en `SlotDisponible`**

En `lib/reservaPublica.ts`, reemplaza:

```typescript
export interface SlotDisponible {
  profesional_id: string;
  profesional_nombre: string;
  slot: string; // ISO timestamptz
}
```

por:

```typescript
export interface SlotDisponible {
  profesional_id: string;
  profesional_nombre: string;
  slot: string; // ISO timestamptz
  en_reposo: boolean;
  reposo_disponible_min: number | null;
}
```

- [ ] **Step 2: Añadir la clave de traducción (es + en)**

En `lib/portalI18n.ts`, dentro del dict `es` (justo después de la línea `slot_con_pro: 'con {pro}',`), añade:

```typescript
  slot_reposo_nota: 'Hueco breve · {min} min disponibles',
```

Y dentro del dict `en` (justo después de `slot_con_pro: 'with {pro}',`), añade:

```typescript
  slot_reposo_nota: 'Short slot · {min} min available',
```

- [ ] **Step 3: Mostrar la nota en el botón del slot**

En `app/r/[slug].web.tsx`, dentro del `.map` de slots (línea ~700-722), reemplaza el bloque completo del `<button>` de cada slot:

```tsx
                          {items.map((s, i) => {
                            const sel = slotSel?.slot === s.slot;
                            return (
                              <button
                                key={s.slot}
                                className={sel ? 'rp-slot rp-on' : 'rp-slot'}
                                onClick={() => setSlotSel(s)}
                                title={profId === ANY_PRO ? t('slot_con_pro', { pro: s.profesional_nombre }) : undefined}
                                style={{
                                  padding: '10px 6px', borderRadius: 12, fontSize: 14.5, fontWeight: 700, animationDelay: `${i * 0.02}s`,
                                  border: sel ? 'none' : `1.5px solid ${T.border}`,
                                  background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                                  boxShadow: sel ? '0 8px 18px rgba(192,38,10,0.22)' : 'none',
                                }}
                              >
                                {fmtHora(s.slot, loc)}
                                {profId === ANY_PRO && (
                                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>
                                    {s.profesional_nombre.split(' ')[0]}
                                  </span>
                                )}
                              </button>
                            );
                          })}
```

por:

```tsx
                          {items.map((s, i) => {
                            const sel = slotSel?.slot === s.slot;
                            const notaReposo = s.en_reposo && s.reposo_disponible_min != null
                              ? t('slot_reposo_nota', { min: s.reposo_disponible_min })
                              : undefined;
                            const tituloPro = profId === ANY_PRO ? t('slot_con_pro', { pro: s.profesional_nombre }) : undefined;
                            return (
                              <button
                                key={s.slot}
                                className={sel ? 'rp-slot rp-on' : 'rp-slot'}
                                onClick={() => setSlotSel(s)}
                                title={[tituloPro, notaReposo].filter(Boolean).join(' · ') || undefined}
                                style={{
                                  position: 'relative',
                                  padding: '10px 6px', borderRadius: 12, fontSize: 14.5, fontWeight: 700, animationDelay: `${i * 0.02}s`,
                                  border: sel ? 'none' : `1.5px solid ${T.border}`,
                                  background: sel ? T.primary : T.card, color: sel ? '#fff' : T.text,
                                  boxShadow: sel ? '0 8px 18px rgba(192,38,10,0.22)' : 'none',
                                }}
                              >
                                {s.en_reposo && (
                                  <span aria-hidden style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: sel ? '#fff' : T.primary }} />
                                )}
                                {fmtHora(s.slot, loc)}
                                {profId === ANY_PRO && (
                                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>
                                    {s.profesional_nombre.split(' ')[0]}
                                  </span>
                                )}
                                {notaReposo && (
                                  <span style={{ display: 'block', fontSize: 8.5, fontWeight: 600, opacity: 0.75, marginTop: 1 }}>
                                    {notaReposo}
                                  </span>
                                )}
                              </button>
                            );
                          })}
```

- [ ] **Step 4: Preparar el mismo escenario de prueba para verlo en el navegador**

Repite el Step 1 del Task 1 (setup completo: `negocio_portal`, `horarios_profesional`, servicio candidato, cita host) contra el proyecto Supabase `vtrggiogjrhqtwbhbgia`. Si Task 1 ya se ejecutó en la misma sesión y no se limpió, sáltate este paso.

- [ ] **Step 5: Arrancar el servidor y verificar visualmente**

```bash
cd "C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy"
npx expo start --web --port 8081
```

Con el servidor arriba, usa las tools del Browser pane:
1. `preview_start` con `{"url": "http://localhost:8081/r/test-fase-a-verificacion"}`.
2. En el portal: elige el servicio **"TEST Fase A candidato"**, sin filtrar profesional (o eligiendo "Marta Prueba").
3. Selecciona la fecha de mañana en el calendario.
4. `read_page` o `get_page_text` sobre la franja horaria correspondiente a las 11:15.

Expected: aparece un slot a las **11:15** con el puntito de reposo y, al pasar el cursor o en el texto visible, la nota **"Hueco breve · 25 min disponibles"**. No debe aparecer ningún slot a las 11:00 ni a las 11:30.

- [ ] **Step 6: Limpiar los datos de prueba**

Repite el Step 9 del Task 1.

- [ ] **Step 7: Commit**

```bash
git add lib/reservaPublica.ts lib/portalI18n.ts "app/r/[slug].web.tsx"
git commit -m "feat(portal): mostrar el minutaje exacto en los huecos que nacen de un reposo"
```

---

### Task 3: Las RPC de escritura del portal reconocen el reposo (hotfix — la Fase A está en producción y sin esto es inservible)

**Por qué existe esta tarea:** la revisión final de rama de las Tasks 1-2 detectó que `disponibilidad_publica` ya ofrece el hueco de reposo, pero las tres funciones que de verdad CREAN o MUEVEN una cita (`crear_cita_publica`, `modificar_cita_publica`, `crear_cita_publica_grupo`) seguían comparando contra el rango completo `[inicio, fin]` de cada cita. Resultado: un cliente ve el hueco, rellena sus datos, pulsa confirmar, y la RPC lo rechaza con `'El hueco ya esta ocupado'`. Las Tasks 1-2 ya están en producción — hasta que esta tarea se aplique, la Fase A no cumple su objetivo.

**Files:**
- Create: `migrations/fix-reposo-portal-escritura.sql`

**Interfaces:**
- Modifica el cuerpo (no la firma) de `public.crear_cita_publica(...)` — sigue devolviendo `jsonb`.
- Modifica el cuerpo (no la firma) de `public.modificar_cita_publica(...)` — sigue devolviendo `jsonb`.
- Modifica el cuerpo (no la firma) de `public.crear_cita_publica_grupo(...)` — sigue devolviendo `jsonb`.
- Ninguna cambia su `RETURNS`, así que basta `CREATE OR REPLACE FUNCTION` (sin el `DROP` que hizo falta en la Task 1) — los grants no se tocan.

- [ ] **Step 1: Preparar el escenario de prueba (mismo patrón que Task 1/2, tenant `test_s18_e6d9d`)**

```sql
delete from citas where negocio_id = 'test_s18_e6d9d' and notas like 'TEST-FASE-A-WRITE%';
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono in ('600111222', '600111333');
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato';
delete from negocio_portal where negocio_id = 'test_s18_e6d9d';

insert into negocio_portal (negocio_id, slug, portal_activo)
values ('test_s18_e6d9d', 'test-fase-a-verificacion', true)
on conflict (negocio_id) do update set portal_activo = true, slug = 'test-fase-a-verificacion';

insert into horarios_profesional (profesional_id, dia_semana, hora_inicio, hora_fin, turno)
values ('051d5c70-9698-41f9-8dba-db40014d5b84', extract(dow from current_date + 1)::int, '11:00', '13:15', 1);

insert into servicios (negocio_id, nombre, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, precio, reservable_online, activo)
values ('test_s18_e6d9d', 'TEST Fase A candidato', 15, 0, 0, 10, true, true);

-- Cita host de Marta manana: 11:00-11:10 activa, 11:10-13:00 reposo (110 min, deliberadamente ancho),
-- 13:00-13:15 activa. Un reposo ancho (en vez del de 30 min de las Tasks 1-2) da tres candidatos
-- de 15 min DISTINTOS dentro del mismo reposo (11:15, 11:30, 11:45) para que los Steps 2/3/4 no
-- choquen entre si al reservar cada uno de verdad (a diferencia de disponibilidad_publica, que solo
-- lee, crear/modificar_cita_publica SI dejan la cita insertada, y una reserva real ocupa el sitio).
insert into citas (negocio_id, profesional_id, inicio, fin, fin_activa, fin_espera, estado, canal, notas)
values (
  'test_s18_e6d9d',
  '051d5c70-9698-41f9-8dba-db40014d5b84',
  ((current_date + 1) + time '11:00') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '13:15') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '11:10') at time zone 'Europe/Madrid',
  ((current_date + 1) + time '13:00') at time zone 'Europe/Madrid',
  'confirmada', 'manual', 'TEST-FASE-A-REPOSO'
);
```

- [ ] **Step 2: RED — confirmar que hoy `crear_cita_publica` rechaza el hueco de reposo (candidato a las 11:15)**

```sql
select crear_cita_publica(
  p_slug => 'test-fase-a-verificacion',
  p_servicio_id => (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  p_profesional_id => '051d5c70-9698-41f9-8dba-db40014d5b84',
  p_inicio => ((current_date + 1) + time '11:15') at time zone 'Europe/Madrid',
  p_cliente_nombre => 'Cliente Test Fase A',
  p_cliente_telefono => '600111222',
  p_notas => 'TEST-FASE-A-WRITE-crear'
);
```

Expected (ANTES del fix): la llamada lanza una excepción `El hueco ya esta ocupado`. Confirma el bug real antes de tocar nada — el mismo slot que `disponibilidad_publica` ya anuncia como libre (Task 1) es rechazado al reservarlo.

- [ ] **Step 3: RED — preparar y confirmar que hoy `modificar_cita_publica` rechaza mover una cita al hueco de reposo (candidato a las 11:30, distinto del de los Steps 2/4 para no chocar con ellos)**

IDs fijos a propósito (no hay forma de pasar un id generado entre dos llamadas separadas a la tool `execute_sql`, y encadenarlo todo en una sola sentencia haría que la excepción esperada deshaga también el `insert` de preparación): usa literalmente `11111111-1111-4111-8111-111111111111` para el cliente y `22222222-2222-4222-8222-222222222222` para la cita.

Ejecuta esto PRIMERO, en su propia llamada a `execute_sql` (sin la excepción esperada, para que el `insert` quede confirmado):

```sql
insert into clientes (id, negocio_id, nombre, telefono)
values ('11111111-1111-4111-8111-111111111111', 'test_s18_e6d9d', 'Cliente Test Fase A Modificar', '600111333');

insert into citas (id, negocio_id, profesional_id, cliente_id, servicio_id, inicio, fin, fin_activa, fin_espera, estado, canal, notas)
values (
  '22222222-2222-4222-8222-222222222222',
  'test_s18_e6d9d',
  '051d5c70-9698-41f9-8dba-db40014d5b84',
  '11111111-1111-4111-8111-111111111111',
  (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  ((current_date + 2) + time '10:00') at time zone 'Europe/Madrid',
  ((current_date + 2) + time '10:15') at time zone 'Europe/Madrid',
  ((current_date + 2) + time '10:15') at time zone 'Europe/Madrid',
  ((current_date + 2) + time '10:15') at time zone 'Europe/Madrid',
  'confirmada', 'manual', 'TEST-FASE-A-WRITE-modorigen'
);
```

Ejecuta esto DESPUÉS, en una llamada `execute_sql` aparte (esta es la que se espera que falle; al estar sola, si falla no arrastra el `insert` de arriba):

```sql
select modificar_cita_publica(
  p_slug => 'test-fase-a-verificacion',
  p_cita_id => '22222222-2222-4222-8222-222222222222',
  p_telefono => '600111333',
  p_nuevo_inicio => ((current_date + 1) + time '11:30') at time zone 'Europe/Madrid'
);
```

Expected (ANTES del fix): excepción `El hueco ya esta ocupado`.

- [ ] **Step 4: RED — confirmar que hoy `crear_cita_publica_grupo` rechaza el hueco de reposo (candidato a las 11:45)**

```sql
select crear_cita_publica_grupo(
  p_slug => 'test-fase-a-verificacion',
  p_inicio => ((current_date + 1) + time '11:45') at time zone 'Europe/Madrid',
  p_reservante_nombre => 'Reservante Test Fase A',
  p_reservante_telefono => '600111222',
  p_reservante_email => null,
  p_asistentes => jsonb_build_array(jsonb_build_object(
    'nombre', 'Asistente Test Fase A',
    'servicio_id', (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
    'profesional_id', '051d5c70-9698-41f9-8dba-db40014d5b84'
  ))
);
```

Expected (ANTES del fix): excepción `El hueco del asistente 1 ya esta ocupado`.

- [ ] **Step 5: Escribir la migración con las tres funciones corregidas**

Crea `migrations/fix-reposo-portal-escritura.sql`. Reescribe el cuerpo completo de las tres funciones (recupera el cuerpo actual con `select pg_get_functiondef(oid) from pg_proc where proname = '<nombre>'` si necesitas el resto del cuerpo exacto) cambiando SOLO el bloque de choque de reposo. En **`crear_cita_publica`**, sustituye:

```sql
  if exists (select 1 from public.citas c where c.profesional_id = p_profesional_id and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_inicio) then raise exception 'El hueco ya esta ocupado'; end if;
```

por:

```sql
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
```

En **`modificar_cita_publica`**, sustituye:

```sql
  if exists (
    select 1 from public.citas c
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_nuevo_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;
```

por:

```sql
  if exists (
    select 1 from public.citas c
    where c.profesional_id = v_prof
      and c.id <> p_cita_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_nuevo_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_nuevo_inicio)
      )
  ) then raise exception 'El hueco ya esta ocupado'; end if;
```

En **`crear_cita_publica_grupo`**, sustituye:

```sql
    if exists (select 1 from public.citas c where c.profesional_id = v_prof_id and c.estado in ('pendiente','confirmada')
        and c.inicio < v_fin and c.fin > p_inicio) then
      raise exception 'El hueco del asistente % ya esta ocupado', v_orden;
    end if;
```

por:

```sql
    if exists (
      select 1 from public.citas c
      where c.profesional_id = v_prof_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
           and c.fin > p_inicio)
        )
    ) then
      raise exception 'El hueco del asistente % ya esta ocupado', v_orden;
    end if;
```

El resto de cada función (validaciones de antelación, horario, bloqueos, depósito, inserción de cliente/cita, valor de retorno) se copia **tal cual está hoy en producción** — usa `pg_get_functiondef` para traer el cuerpo completo antes de escribir el archivo, y cambia únicamente el bloque de choque de cada una. Encabeza el archivo con un comentario explicando el gap (mismo tono que `fix-reposo-portal-disponibilidad.sql`: qué pasaba, por qué, qué cambia).

- [ ] **Step 6: Aplicar la migración**

Usa `apply_migration` (project_id `vtrggiogjrhqtwbhbgia`, name `fix_reposo_portal_escritura`) con el contenido exacto del archivo del Step 5. Ninguna de las tres funciones cambia su `RETURNS`, así que `CREATE OR REPLACE` basta — no hace falta `DROP` ni re-`GRANT` (verifícalo de todas formas con la misma consulta a `information_schema.routine_privileges` de la Task 1, para las tres funciones, y confirma que los grants no cambiaron respecto a antes de aplicar).

- [ ] **Step 7: GREEN — repetir el Step 2 y verificar que ahora reserva**

Repite exactamente la llamada del Step 2. Expected: ya NO lanza excepción; devuelve un `jsonb` con `estado = 'confirmada'` (el servicio candidato no tiene prepago) y un `cita_id`. Guarda ese `cita_id` para la limpieza.

- [ ] **Step 8: GREEN — repetir el Step 3 y verificar que ahora modifica**

Repite exactamente la llamada `modificar_cita_publica` del Step 3, con el mismo `p_cita_id => '22222222-2222-4222-8222-222222222222'` (la fila que preparó el Step 3 sigue ahí — solo falló la llamada a la función, no el `insert`). Expected: ya NO lanza excepción; devuelve `jsonb` con `ok = true` e `inicio` = mañana 11:30 hora Madrid. Confírmalo también con `select inicio, fin from citas where id = '22222222-2222-4222-8222-222222222222'`.

- [ ] **Step 9: GREEN — repetir el Step 4 y verificar que ahora reserva el grupo**

Repite exactamente la llamada del Step 4. Expected: ya NO lanza excepción; devuelve `jsonb` con `ok = true` y un array `citas` de 1 elemento.

- [ ] **Step 10: Control negativo — el hueco realmente ocupado sigue rechazado**

```sql
select crear_cita_publica(
  p_slug => 'test-fase-a-verificacion',
  p_servicio_id => (select id from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato'),
  p_profesional_id => '051d5c70-9698-41f9-8dba-db40014d5b84',
  p_inicio => ((current_date + 1) + time '11:00') at time zone 'Europe/Madrid',
  p_cliente_nombre => 'Cliente Test Fase A Control',
  p_cliente_telefono => '600111444',
  p_notas => 'TEST-FASE-A-WRITE-control'
);
```

Expected: sigue lanzando `El hueco ya esta ocupado` (las 11:00 chocan con la fase activa 1 real del host, `[11:00,11:10)` — este slot nunca debió liberarse).

- [ ] **Step 11: Limpiar todos los datos de prueba**

```sql
-- crear_cita_publica_grupo NO usa p_notas: construye su propia nota ("Grupo N/M — <nombre>"),
-- de ahi el tercer patron para no dejarla huerfana.
delete from citas where negocio_id = 'test_s18_e6d9d' and notas like 'TEST-FASE-A-WRITE%';
delete from citas where negocio_id = 'test_s18_e6d9d' and notas = 'TEST-FASE-A-REPOSO';
delete from citas where negocio_id = 'test_s18_e6d9d' and notas like '%Asistente Test Fase A%';
delete from clientes where negocio_id = 'test_s18_e6d9d' and telefono in ('600111222', '600111333', '600111444');
delete from horarios_profesional where profesional_id = '051d5c70-9698-41f9-8dba-db40014d5b84'
  and dia_semana = extract(dow from current_date + 1)::int;
delete from servicios where negocio_id = 'test_s18_e6d9d' and nombre = 'TEST Fase A candidato';
delete from negocio_portal where negocio_id = 'test_s18_e6d9d';
```

- [ ] **Step 12: Commit**

```bash
git add migrations/fix-reposo-portal-escritura.sql
git commit -m "fix(portal): las RPC de escritura tambien reconocen el reposo (el hueco que se ve ahora se puede reservar)"
```
