-- El candado de solapes vuelve a decir lo mismo que la funcion que decide los
-- huecos. Es la tercera vez que este par se desincroniza, y la segunda que el
-- sintoma es el mismo: el portal ofrece un hueco que la base de datos prohibe.
--
-- LA HISTORIA, porque importa para no repetirla
--   * 20260831220000 creo el candado con `tstzrange(inicio, fin)`: el bloque
--     entero. Apagaba el diferencial nº1 del producto -- durante el reposo el
--     profesional esta libre -- y encajar ahi una cita daba 23P01.
--   * 20260901153828 lo arreglo pasandolo al MULTIRANGO de las ventanas
--     activas, "exactamente lo que devuelve public.ventanas_activas_cita()", y
--     dejo escrita la regla: *un candado que contradice a la funcion que decide
--     los huecos es peor que no tener candado*.
--   * El paso 5 (20260905130000) cambio lo que devuelve esa funcion: ahora las
--     ventanas salen de `cita_fases`, que desde el paso 4 es la fuente de
--     verdad. **El candado no siguio**, porque su expresion esta congelada en
--     un indice y solo sabe leer las 4 marcas. Para una cita de DOS reposos, el
--     segundo le sigue pareciendo ocupado.
--
-- REPRODUCIDO DE PUNTA A PUNTA el 5 sep 2026, no deducido:
--     mecha 09:40-12:00, segundo reposo [11:15,11:35)
--     disponibilidad_publica  -> OFRECE las 11:15
--     crear_cita_publica      -> 23P01 citas_solape_profesional_excl
-- Exposicion en ese momento: 3 citas futuras con dos reposos y 4 servicios de
-- dos reposos reservables online.
--
-- POR QUE UNA COLUMNA Y NO ARREGLAR LA EXPRESION
-- Una EXCLUDE necesita una expresion INMUTABLE sobre la propia fila. Leer
-- `cita_fases` no lo es, asi que la expresion no puede ir dentro del indice: hay
-- que materializar el resultado. La alternativa era cambiar la EXCLUDE por un
-- trigger de restriccion, y eso PIERDE la garantia que justifica el candado --
-- dos reservas simultaneas en el mismo hueco pasarian las dos, porque un trigger
-- no ve la fila que otra transaccion aun no ha confirmado. El indice si.
--
-- Asi que `citas.ventanas_ocupadas` guarda el multirango real y el candado se
-- monta sobre la columna. Quien la mantiene:
--   * un BEFORE INSERT/UPDATE en `citas` la recalcula SIEMPRE, con la misma
--     costura: fases si las hay, 4 marcas si no. Que sea BEFORE y sin
--     condiciones es lo que impide que un cliente con sesion se la escriba a
--     mano y desactive el candado para su fila (las RLS de `citas` permiten
--     UPDATE dentro del negocio).
--   * el trigger de resumen del paso 4 ya lanza ese UPDATE cada vez que cambian
--     las fases... pero solo si cambiaban las 4 marcas, y ahi estaba el agujero
--     fino: mover la frontera del SEGUNDO reposo cambia la ocupacion sin tocar
--     ninguna de las cuatro. Su guarda pasa a mirar tambien el multirango.

-- ---------------------------------------------------------------------------
-- 1. La costura, agregada a multirango
-- ---------------------------------------------------------------------------

create or replace function public.ventanas_ocupadas_de_cita(
  p_cita_id     uuid,
  p_inicio      timestamptz,
  p_fin_activa  timestamptz,
  p_fin_espera  timestamptz,
  p_fin         timestamptz
)
returns tstzmultirange
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select range_agg(tstzrange(v.desde, v.hasta))
       from public.ventanas_activas_cita(p_cita_id, p_inicio, p_fin_activa, p_fin_espera, p_fin) v
      where v.desde < v.hasta),
    '{}'::tstzmultirange);
$function$;

comment on function public.ventanas_ocupadas_de_cita(uuid, timestamptz, timestamptz, timestamptz, timestamptz) is
  'Las ventanas de ocupacion de una cita como UN multirango, para que el candado de solapes pueda indexarlas. Misma costura que ventanas_activas_cita (fases NO-reposo si las hay, 4 marcas si no), solo que agregada. Vacio, no nulo, cuando la cita no ocupa nada: un multirango vacio nunca solapa, que es lo que hacia antes la expresion del indice.';

-- ---------------------------------------------------------------------------
-- 2. La columna y su sello
-- ---------------------------------------------------------------------------

alter table public.citas
  add column if not exists ventanas_ocupadas tstzmultirange;

comment on column public.citas.ventanas_ocupadas is
  'Multirango de ocupacion REAL de la cita (fases de trabajo si las hay, 4 marcas si no), materializado para que citas_solape_profesional_excl pueda indexarlo. NO se escribe a mano: el trigger trg_citas_sellar_ventanas lo recalcula en cada insert y en cada update, y pisa cualquier valor que venga de fuera.';

create or replace function public.citas_sellar_ventanas_ocupadas()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Sin condiciones y en BEFORE a proposito: es tambien la defensa contra que
  -- alguien escriba la columna a mano para colarse por debajo del candado.
  new.ventanas_ocupadas := public.ventanas_ocupadas_de_cita(
    new.id, new.inicio, new.fin_activa, new.fin_espera, new.fin);
  return new;
end;
$function$;

-- El nombre importa: los BEFORE de una tabla corren por orden alfabetico y este
-- tiene que ir DESPUES de trg_citas_normalizar_fases, que es quien rellena
-- fin_activa/fin_espera cuando llegan a null. 'n' < 's' < 'u'.
drop trigger if exists trg_citas_sellar_ventanas on public.citas;
create trigger trg_citas_sellar_ventanas
  before insert or update on public.citas
  for each row execute function public.citas_sellar_ventanas_ocupadas();

-- ---------------------------------------------------------------------------
-- 3. El resumen del paso 4 aprende a mirar el multirango
-- ---------------------------------------------------------------------------
-- El agujero fino: la guarda `is distinct from` de las 4 marcas evitaba el
-- UPDATE en vano, pero mover la frontera del SEGUNDO reposo cambia la ocupacion
-- SIN tocar ninguna de las cuatro (fin_activa y fin_espera hablan del PRIMER
-- reposo). Sin esto, la columna se quedaba vieja justo en el caso que la
-- migracion viene a arreglar.

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
        -- Si no cambia nada, no se toca la cita: cada UPDATE dispararia
        -- audit/notify por un reposo que solo se ha cronometrado, no movido.
        -- Pero "nada" incluye ahora la ocupacion: la frontera del segundo
        -- reposo se mueve sin que ninguna de las 4 marcas se entere, y el
        -- candado vive de esa columna.
        and ((c.inicio, c.fin, c.fin_activa, c.fin_espera)
               is distinct from (r.ini, r.fin, r.fa, r.fe)
          or c.ventanas_ocupadas
               is distinct from public.ventanas_ocupadas_de_cita(c.id, r.ini, r.fin, r.fa, r.fe))',
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
  'Spec 1 paso 4: resumen de las 4 marcas de citas desde SUS fases. fin_activa = inicio del PRIMER reposo, fin_espera = fin del PRIMER reposo (migracion 20260904151604 §5, no la formula literal de la spec). Trinquete: solo propaga a profundidad de trigger <= 2; el eco del 30 ago es estructuralmente imposible. Desde el 5 sep dispara tambien cuando cambia la OCUPACION sin cambiar las marcas (mover la frontera del segundo reposo), porque de ese UPDATE cuelga el sello de citas.ventanas_ocupadas y de esa columna cuelga el candado de solapes. Si se borran todas las fases de una cita, la cita no se toca (no hay resumen que calcular).';

-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
-- Con los triggers de `citas` apagados durante el relleno: no es un cambio de
-- la cita, es materializar lo que ya era verdad. Con ellos puestos, las 1.979
-- filas quedarian con updated_at de hoy y la agenda entera pareceria recien
-- tocada. Va dentro de la transaccion de la migracion, asi que si algo falla no
-- se quedan apagados.

alter table public.citas disable trigger user;

update public.citas c
   set ventanas_ocupadas = public.ventanas_ocupadas_de_cita(
         c.id, c.inicio, c.fin_activa, c.fin_espera, c.fin);

alter table public.citas enable trigger user;

-- ---------------------------------------------------------------------------
-- 5. El candado, sobre la columna
-- ---------------------------------------------------------------------------
-- Mismo alcance que tenia (20260831220000 y 20260901153828): misma fecha de
-- corte del 1 sep -- los pares historicos siguen exentos por decision de
-- producto --, mismas exclusiones (cancelada / grupo / sin profesional) y el
-- mismo 23P01 que lib/errores.ts ya traduce como "Ese horario se solapa con
-- otra reserva". Lo unico que cambia es de donde sale la nocion de "ocupado".

alter table public.citas drop constraint if exists citas_solape_profesional_excl;

alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (
    profesional_id with =,
    ventanas_ocupadas with &&
  )
  where (
    estado <> 'cancelada'
    and grupo_id is null
    and profesional_id is not null
    and inicio >= '2026-08-31 22:00:00+00'::timestamptz
  );

comment on constraint citas_solape_profesional_excl on public.citas is
  'Dos citas del mismo profesional no pueden solapar sus ventanas de TRABAJO. Los reposos no cuentan: encajar otra clienta ahi es el diferencial nº1 del producto. Desde el 5 sep 2026 la ocupacion sale de citas.ventanas_ocupadas, que sale de cita_fases, asi que vale para CUALQUIER numero de reposos y no solo para uno. Antes leia las 4 marcas y rechazaba con 23P01 huecos del segundo reposo que el portal estaba ofreciendo.';
