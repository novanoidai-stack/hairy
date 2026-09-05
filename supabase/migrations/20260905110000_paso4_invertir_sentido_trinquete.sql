-- Spec 1, paso 4 del plan (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7):
-- INVERTIR EL SENTIDO de la sincronizacion. A partir de aqui `cita_fases` es la
-- fuente de verdad y las 4 marcas de `citas` son un resumen mantenido por trigger.
--
-- DECISION DE DISENO (Carlos, 5 sep 2026): TRINQUETE CON GUARDA, no extraccion
-- literal de los triggers de proyeccion. El prompt de sesion pedia retirar
-- trg_seed_fases_from_cita y trg_resync_fases_de_cita, pero medido contra el
-- arbol: TODOS los flujos de mover/editar una cita (drag & drop de Timeline y
-- Calendar, movil, Chispa, RPCs del portal) escriben las 4 marcas de `citas`, y
-- el cliente (lib/retrasos.ts, AppointmentCard, recursos) PREFIERE `cita_fases`.
-- Quitar la proyeccion sin mas dejaria las fases en el hueco viejo tras cada
-- arrastre y las citas nuevas nacerian sin fases. El paso 5 no lo arregla.
--
-- Lo que evita el desastre del 30 ago no es la ausencia de los dos sentidos
-- sino la ausencia del ECO. Aqui cada trigger solo propaga la escritura cuando
-- es la iniciada por el usuario (pg_trigger_depth = 1); todo lo anidado se
-- bloquea:
--
--   usuario edita fases  -> resumen (prof 1) reescribe marcas
--                           -> resync (prof 2) BLOQUEADO. Las fases sobreviven.
--   usuario edita marcas -> resync (prof 1) rehace las fases
--                           -> resumen (prof 2) PERMITIDO: recalcula las marcas
--                              desde las fases recien sembradas. Idempotente (la
--                              guarda `is distinct from` evita el UPDATE en
--                              vano y con el los avisos/notify espureos).
--   INSERT de cita       -> seed (prof 1) siembra fases (plantilla o clasico)
--                           -> resumen (prof 2) PERMITIDO: deja las marcas
--                              exactamente derivadas de las fases.
--
-- El resumen se permite hasta profundidad 2 a proposito: es lo que hace que las
-- marcas de una cita recien sembrada salgan de SUS fases y no de los numeros
-- de catalogo. El resync se permite SOLO a profundidad 1: es lo que impide el
-- bucle. Ninguna combinacion puede realimentar: del lado de `citas` solo seed
-- (INSERT) y resync (UPDATE con guarda) escriben `cita_fases`; verificado en
-- pg_proc que ningun otro trigger de `citas` la toca (audit, noshows, ojos,
-- acunar, gate, updated_at: ninguno).
--
-- Fórmulas del resumen (migracion 20260904151604 §5, NO las literales de la
-- spec original):
--   inicio/fin  = min(fase.inicio) / max(fase.fin)
--   fin_activa  = INICIO DEL PRIMER REPOSO (la spec decia "fin de la primera
--                 activa" y con transicion declararia libre un tramo con
--                 trabajo)
--   fin_espera  = fin del PRIMER reposo
--   sin reposos = fin_activa = fin_espera = fin (la cita ocupa entera)
--
-- Tambien entra aqui, y es condicion de coherencia del trinquete:
--   * `citas_normalizar_fases()` pierde su rama de plantilla (la decision (b)
--     de la migracion 20260904151604 decia literalmente "esta anulacion
--     desaparece con el paso 4"). Si la conservara, el BEFORE UPDATE
--     reescribiria fin_espera con los minutos NOMINALES del catalogo encima
--     del resumen calculado desde las fases reales (p.ej. un reposo estirado
--     a mano volveria solo a su duracion nominal).
--   * EL BACKFILL: se regeneran TODAS las fases en un solo INSERT ... SELECT
--     desde las marcas actuales (para los 14 servicios con plantilla, via
--     fases_de_plantilla anclada; para el resto, la descomposicion clasica).
--     Los 14 con plantilla aun no tienen citas pasadas por sembrar desde su
--     tecnificacion, asi que el backfill reproduce el mundo clasico: mismos
--     totales de filas y de reposos que antes.

-- ---------------------------------------------------------------------------
-- 1. El resumen: cita_fases -> citas (el sentido NUEVO)
-- ---------------------------------------------------------------------------

create or replace function public.resumir_citas_desde_fases()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Profundidad 1 = escritura del usuario (o de una RPC a pelo). Profundidad 2
  -- = fases recien sembradas por seed/resync: se resumen. 3 o mas = eco: nunca.
  if pg_trigger_depth() > 2 then
    return null;
  end if;

  -- Postgres no admite tablas de transicion en triggers multi-evento, asi que
  -- son tres triggers (insert/update/delete) sobre esta misma funcion y el
  -- FROM se resuelve por TG_OP con EXECUTE: una tabla de transicion que no
  -- existe para el evento no se puede nombrar en SQL estatico.
  execute format(
    'update public.citas c
        set inicio     = r.ini,
            fin        = r.fin,
            fin_activa = r.fa,
            fin_espera = r.fe
       from (
         select f.cita_id,
                min(f.inicio)                                        as ini,
                max(f.fin)                                           as fin,
                coalesce(min(f.inicio) filter (where f.tipo = %L),
                         max(f.fin))                                 as fa,
                coalesce(min(f.fin)    filter (where f.tipo = %L),
                         max(f.fin))                                 as fe
           from public.cita_fases f
          where f.cita_id in (%s)
          group by f.cita_id
       ) r
      where c.id = r.cita_id
        -- Si las marcas ya son esas, no se toca la cita: cada UPDATE dispararia
        -- audit/notify por un reposo que solo se ha cronometrado, no movido.
        and (c.inicio, c.fin, c.fin_activa, c.fin_espera)
            is distinct from (r.ini, r.fin, r.fa, r.fe)',
    'reposo', 'reposo',
    case tg_op
      when 'INSERT' then 'select cita_id from insertadas'
      when 'DELETE' then 'select cita_id from borradas'
      else               'select cita_id from insertadas union select cita_id from borradas'
    end);

  return null;
end;
$function$;

comment on function public.resumir_citas_desde_fases() is
  'Spec 1 paso 4: resumen de las 4 marcas de citas desde SUS fases. fin_activa = inicio del PRIMER reposo, fin_espera = fin del PRIMER reposo (migracion 20260904151604 §5, no la formula literal de la spec). Trinquete: solo propaga a profundidad de trigger <= 2; el eco del 30 ago es estructuralmente imposible. Si se borran todas las fases de una cita, la cita no se toca (no hay resumen que calcular).';

drop trigger if exists trg_resumir_fases_ins on public.cita_fases;
drop trigger if exists trg_resumir_fases_upd on public.cita_fases;
drop trigger if exists trg_resumir_fases_del on public.cita_fases;
create trigger trg_resumir_fases_ins
  after insert on public.cita_fases
  referencing new table as insertadas
  for each statement execute function public.resumir_citas_desde_fases();
create trigger trg_resumir_fases_upd
  after update on public.cita_fases
  referencing new table as insertadas old table as borradas
  for each statement execute function public.resumir_citas_desde_fases();
create trigger trg_resumir_fases_del
  after delete on public.cita_fases
  referencing old table as borradas
  for each statement execute function public.resumir_citas_desde_fases();

-- ---------------------------------------------------------------------------
-- 2. El trinquete en el sentido clasico: resync solo a profundidad 1
-- ---------------------------------------------------------------------------

create or replace function public.resync_fases_de_cita()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_marcas jsonb;
begin
  -- Paso 4: solo propaga cuando el UPDATE de marcas lo inicia el usuario.
  -- Cuando lo inicia el resumen (el sentido nuevo), esto ya no rehace las
  -- fases desde las marcas: las fases MANDAN y una edicion directa de ellas
  -- (un segundo reposo) tiene que sobrevivir. Es la guarda que falta el 30 ago.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.inicio         is not distinct from old.inicio
 and new.fin            is not distinct from old.fin
 and new.fin_activa     is not distinct from old.fin_activa
 and new.fin_espera     is not distinct from old.fin_espera
 and new.profesional_id is not distinct from old.profesional_id then
    return null;
  end if;

  select jsonb_object_agg(orden::text, jsonb_build_object('i', iniciada_at, 'c', cerrada_at))
    into v_marcas
  from public.cita_fases
  where cita_id = new.id and (iniciada_at is not null or cerrada_at is not null);

  perform public.sembrar_fases_de_cita(new.id);

  if v_marcas is not null then
    update public.cita_fases f
       set iniciada_at = nullif(v_marcas -> f.orden::text ->> 'i', '')::timestamptz,
           cerrada_at  = nullif(v_marcas -> f.orden::text ->> 'c', '')::timestamptz
     where f.cita_id = new.id
       and v_marcas ? f.orden::text;
  end if;

  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. citas_normalizar_fases pierde la rama de plantilla
-- ---------------------------------------------------------------------------
-- Motivo: en el mundo invertido el resumen manda. Si este BEFORE siguiera
-- recalculando fin_activa/fin_espera desde la plantilla nominal, pisaria el
-- resumen calculado desde las fases reales (el reposo estirado volveria solo).
-- Se queda lo que sigue haciendo falta: rellenar marcas a NULL al crear una
-- cita que aun no tiene fases, y el acotado.

create or replace function public.citas_normalizar_fases()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_activa int;
  v_espera int;
begin
  if new.inicio is null or new.fin is null then
    return new;
  end if;

  select coalesce(s.duracion_activa_min, 0), coalesce(s.duracion_espera_min, 0)
    into v_activa, v_espera
    from public.servicios s
   where s.id = new.servicio_id;

  if new.fin_activa is null then
    new.fin_activa := case
      when coalesce(v_activa, 0) > 0
        then least(new.inicio + make_interval(mins => v_activa), new.fin)
      else new.fin
    end;
  end if;

  if new.fin_espera is null then
    new.fin_espera := least(
      new.fin_activa + make_interval(mins => coalesce(v_espera, 0)), new.fin);
  end if;

  new.fin_activa := greatest(new.inicio, least(new.fin_activa, new.fin));
  new.fin_espera := greatest(new.fin_activa, least(new.fin_espera, new.fin));
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. EL BACKFILL: todas las fases regeneradas en un solo INSERT ... SELECT
-- ---------------------------------------------------------------------------
-- Se borra y se rehace el mundo entero de `cita_fases` desde las marcas
-- actuales. No hace falta desactivar los triggers: con el trinquete, el DELETE
-- no toca marcas (no quedan fases que resumir) y el INSERT deja las marcas
-- exactamente como estaban (el resumen recalcula lo que ya habia). Sin
-- auto-devoracion posible: es la leccion 1 de la forense del 30 ago, cumplida
-- por construccion y no por cuidado.

delete from public.cita_fases;

with cubiertas as (
  select distinct c.id
    from public.citas c
    join public.servicios s on s.id = c.servicio_id
   cross join lateral public.fases_de_plantilla(s.fases, c.inicio, c.fin) f
   where s.fases is not null
     and c.inicio < c.fin
),
clasicas as (
  select c.*
    from public.citas c
    left join cubiertas k on k.id = c.id
   where k.id is null
     and c.inicio < c.fin
)
insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin,
                               profesional_id, recurso_tipo, etiqueta)
-- Rama plantilla: la secuencia del catalogo, anclada al [inicio, fin] real.
select c.negocio_id, c.id, f.orden, f.tipo, f.inicio, f.fin,
       c.profesional_id, f.recurso_tipo, f.etiqueta
  from public.citas c
  join public.servicios s on s.id = c.servicio_id
 cross join lateral public.fases_de_plantilla(s.fases, c.inicio, c.fin) f
 where s.fases is not null
   and c.inicio < c.fin
union all
-- Rama clasica con reposo: activa / reposo / activa final.
select negocio_id, id, 1, 'activa', inicio, fin_activa, profesional_id, null, 'Aplicacion'
  from clasicas
 where fin_activa is not null and fin_espera is not null and fin_espera > fin_activa
union all
select negocio_id, id, 2, 'reposo', fin_activa, fin_espera, profesional_id, null, 'Reposo tecnico'
  from clasicas
 where fin_activa is not null and fin_espera is not null
   and fin_espera > fin_activa and fin_espera <= fin
union all
select negocio_id, id, 3, 'activa', fin_espera, fin, profesional_id, null, 'Lavado y peinado'
  from clasicas
 where fin_activa is not null and fin_espera is not null
   and fin_espera > fin_activa and fin > fin_espera
union all
-- Rama clasica sin reposo: la cita entera es una fase de trabajo.
select negocio_id, id, 1, 'activa', inicio, fin, profesional_id, null, 'Servicio'
  from clasicas
 where not (fin_activa is not null and fin_espera is not null and fin_espera > fin_activa);

-- Verificacion local (la ejecuta el ensayo y el vigilante de siempre):
--   select * from public.regresion_citas_fases_v2();  -- tiene que dar 0 filas
--   select tipo, count(*) from public.cita_fases group by 1;
