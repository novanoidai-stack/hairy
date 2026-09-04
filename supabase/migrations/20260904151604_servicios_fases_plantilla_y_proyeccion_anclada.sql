-- Spec 1, paso 2 del plan (informes/SPEC-1-REPOSOS-MULTIPLES-PLAN-2026-08-31.md §7):
-- la PLANTILLA de fases en el catalogo.
--
-- Que entra aqui:
--   1. servicios.fases jsonb + su CHECK de forma.
--   2. public.fases_de_plantilla(): la costura que convierte una plantilla en los
--      tramos concretos de UNA cita, anclados a su [inicio, fin] real.
--   3. sembrar_fases_de_cita(): su rama de plantilla --escrita hace tiempo y
--      muerta hasta hoy-- pasa por esa costura.
--   4. citas_normalizar_fases(): las 4 marcas se deducen de la MISMA costura, para
--      que el resumen y la proyeccion no puedan contradecirse.
--
-- Lo que NO entra, a proposito: invertir el sentido de la sincronizacion (paso 4).
-- `citas` sigue mandando y `cita_fases` sigue siendo proyeccion. Los triggers
-- trg_seed_fases_from_cita y trg_resync_fases_de_cita se quedan donde estan; se
-- retiran el dia que se instale el trigger de resumen, en la MISMA migracion.
--
-- ---------------------------------------------------------------------------
-- POR QUE HAY QUE ANCLAR, con la cuenta hecha (1 sep 2026)
-- ---------------------------------------------------------------------------
-- La rama de plantilla que habia extendia las fases desde c.inicio sumando los
-- minutos del CATALOGO, sin mirar c.fin. Y la duracion de una cita no siempre es
-- la del catalogo: medido sobre las 1.917 citas con servicio vivo, **60 no cuadran**
-- (53 mas cortas, hasta -45 min; 7 mas largas, hasta +30). Vienen de los overrides
-- por profesional (duracion_efectiva_profesional) y de ajustes a mano.
--
-- Con la rama sin anclar, en cuanto un servicio tuviera plantilla:
--   * cita mas larga que el catalogo -> la ultima fase activa acaba ANTES que la
--     cita, y la cola de una clienta que sigue sentada aparece LIBRE. lib/retrasos.ts
--     (`ventanasActivas`) prefiere cita_fases sobre las 4 marcas, asi que la agenda
--     ofreceria ese hueco. Es la direccion peligrosa.
--   * cita mas corta -> las fases desbordan c.fin y AppointmentCard.web.tsx pinta
--     bandas de reposo fuera de la tarjeta.
--
-- Por eso `fases_de_plantilla` garantiza SIEMPRE dos cosas:
--     min(fase.inicio) = cita.inicio      max(fase.fin) = cita.fin
-- que son ademas dos de las cuatro formulas del resumen del paso 4: dejarlas
-- ciertas hoy es la condicion de entrada de ese paso, no un adorno.
--
-- El reparto: los minutos de REPOSO se respetan tal cual (la quimica no escala:
-- un tinte reposa 40 minutos dure lo que dure la cita) y la diferencia la absorben
-- las fases de trabajo (`activa` y `transicion`) en proporcion a lo declarado. Si
-- la cita es tan corta que ni cabe el reposo, la plantilla NO se usa y se cae a la
-- descomposicion clasica de tres tramos: mejor conservador que inventado.

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------

alter table public.servicios add column if not exists fases jsonb;

comment on column public.servicios.fases is
  'Plantilla de fases del servicio: [{"tipo":"activa|reposo|transicion","min":45,"etiqueta":"Aplicacion","recurso_tipo":"lavacabezas"}]. NULL = servicio sin secuencia declarada (lo normal): la cita se descompone con las 4 marcas clasicas. La suma de minutos es NOMINAL: cada cita la ancla a su duracion real con public.fases_de_plantilla().';

-- ---------------------------------------------------------------------------
-- 2. El CHECK de forma
-- ---------------------------------------------------------------------------
--
-- Va en una funcion y no inline porque hay reglas que necesitan mirar la fase
-- ANTERIOR (dos reposos seguidos) y agregar sobre el array, y eso un CHECK inline
-- no lo sabe hacer. Es IMMUTABLE y no toca ninguna tabla.
--
-- Ojo con el privilegio: el CHECK se evalua con los permisos de QUIEN ESCRIBE, no
-- con los del dueno de la tabla. Comprobado en produccion con `set local role
-- authenticated` y un uid real: una funcion nueva nace ejecutable por
-- `authenticated` (y NO por `anon`, que es lo que dejo la ronda 4 de seguridad),
-- asi que la pantalla de servicios sigue guardando. `anon` no escribe `servicios`.
--
-- Las reglas, y por que cada una:
--   * array de 1 a 12 objetos           una secuencia mas larga no es un servicio
--   * tipo in (activa|reposo|transicion) el tipo que no esta en cita_fases no existe
--   * min entero 1..300                  el regex acota a 3 digitos ANTES del cast:
--                                        '99999999999' casa con ^[0-9]+$ y revienta int
--   * etiqueta texto <= 40               cabe en la tarjeta de la agenda
--   * recurso_tipo del catalogo cerrado  el mismo de servicios.recurso_tipo
--   * al menos una fase que no sea reposo si nadie trabaja, la plantilla no proyecta
--                                        nada y se queda muerta sin decirlo
--   * nunca dos reposos seguidos         son UN reposo mal escrito, y proyectados
--                                        dan dos bandas pegadas en la agenda
--   * suma <= 600 min                    un servicio de mas de 10 h es un error de dato

create or replace function public.fases_servicio_validas(p_fases jsonb)
returns boolean
language sql
immutable
as $function$
  select case
    when p_fases is null then true
    when jsonb_typeof(p_fases) <> 'array' then false
    when jsonb_array_length(p_fases) not between 1 and 12 then false
    else coalesce((
      select bool_and(f.bien)
         and bool_or(f.tipo is distinct from 'reposo')
         and bool_and(f.tipo is distinct from 'reposo' or f.tipo_previo is distinct from 'reposo')
         and sum(f.min) <= 600
      from (
        select e.valor->>'tipo'                            as tipo,
               lag(e.valor->>'tipo') over (order by e.ord) as tipo_previo,
               case when (e.valor->>'min') ~ '^[0-9]{1,3}$'
                    then (e.valor->>'min')::int else 0 end as min,
               ( jsonb_typeof(e.valor) = 'object'
                 and (e.valor->>'tipo') in ('activa','reposo','transicion')
                 and (e.valor->>'min') ~ '^[0-9]{1,3}$'
                 and (e.valor->>'min')::int between 1 and 300
                 and (e.valor->'etiqueta' is null
                      or (jsonb_typeof(e.valor->'etiqueta') = 'string'
                          and length(e.valor->>'etiqueta') <= 40))
                 and (e.valor->'recurso_tipo' is null
                      or jsonb_typeof(e.valor->'recurso_tipo') = 'null'
                      or (e.valor->>'recurso_tipo') in ('lavacabezas','cabina','sillon','aparatologia'))
               )                                           as bien
        from jsonb_array_elements(p_fases) with ordinality as e(valor, ord)
      ) f
    ), false)
  end;
$function$;

comment on function public.fases_servicio_validas(jsonb) is
  'Valida la FORMA de servicios.fases. La usa el CHECK servicios_fases_forma, que se evalua con los permisos de quien escribe: no revocar de authenticated o la pantalla de servicios deja de guardar.';

alter table public.servicios drop constraint if exists servicios_fases_forma;
alter table public.servicios
  add constraint servicios_fases_forma check (public.fases_servicio_validas(fases));

-- ---------------------------------------------------------------------------
-- 3. La costura: plantilla -> tramos de UNA cita
-- ---------------------------------------------------------------------------
--
-- Devuelve 0 filas cuando la plantilla no sirve para esta cita (vacia, mal
-- formada, o no cabe). Quien llama interpreta el 0 como "usa el camino clasico";
-- asi el fallback es explicito y no hay un caso silencioso.
--
-- Se llama con `cross join lateral` / `from ... f`, NUNCA envuelta en un ayudante
-- booleano: Postgres no inlinea una funcion escalar cuyo cuerpo es un EXISTS sobre
-- una funcion de conjunto, y eso fueron 15 ms contra 883 ms (59x) al llevar el
-- grupo A a la costura de ocupacion el 1 sep.

create or replace function public.fases_de_plantilla(
  p_fases  jsonb,
  p_inicio timestamptz,
  p_fin    timestamptz
)
returns table (
  orden        smallint,
  tipo         text,
  inicio       timestamptz,
  fin          timestamptz,
  etiqueta     text,
  recurso_tipo text
)
language sql
immutable
as $function$
  with crudas as (
    select e.ord::int                                       as ord,
           case when lower(coalesce(e.valor->>'tipo','activa')) in ('activa','reposo','transicion')
                then lower(e.valor->>'tipo') else 'activa' end as tipo,
           floor((e.valor->>'min')::numeric)::int            as min,
           nullif(e.valor->>'etiqueta','')                   as etiqueta,
           nullif(e.valor->>'recurso_tipo','')               as recurso_tipo
    from jsonb_array_elements(
           case when jsonb_typeof(p_fases) = 'array' then p_fases else '[]'::jsonb end
         ) with ordinality as e(valor, ord)
    where jsonb_typeof(e.valor) = 'object'
      and (e.valor->>'min') ~ '^\s*[0-9]{1,3}(\.[0-9]+)?\s*$'
  ),
  utiles as (select * from crudas where min > 0),
  tot as (
    select extract(epoch from (p_fin - p_inicio))::numeric                     as total_seg,
           coalesce(sum(min) filter (where tipo =  'reposo'), 0)::numeric * 60 as reposo_seg,
           coalesce(sum(min) filter (where tipo <> 'reposo'), 0)::numeric      as flex_min,
           coalesce(min(min) filter (where tipo <> 'reposo'), 0)::numeric      as flex_min_menor
    from utiles
  ),
  f as (
    select t.*,
           case when t.flex_min > 0 and t.total_seg > t.reposo_seg
                then (t.total_seg - t.reposo_seg) / (t.flex_min * 60)
                else 0 end as factor
    from tot t
  ),
  -- Solo se usa la plantilla si TODA fase de trabajo queda con >= 1 minuto. Si no,
  -- esta cita es demasiado corta para esta secuencia: 0 filas y camino clasico.
  viable as (
    select f.factor from f
    where f.factor > 0 and f.factor * f.flex_min_menor * 60 >= 60
  ),
  dur as (
    select u.ord, u.tipo, u.etiqueta, u.recurso_tipo,
           case when u.tipo = 'reposo' then u.min::numeric * 60
                else u.min::numeric * 60 * v.factor end as seg
    from utiles u cross join viable v
  ),
  acum as (
    select d.*,
           row_number() over (order by d.ord) as rn,
           count(*)     over ()               as n,
           coalesce(sum(d.seg) over (order by d.ord
                     rows between unbounded preceding and 1 preceding), 0) as desde_seg,
           sum(d.seg)   over (order by d.ord
                     rows between unbounded preceding and current row)     as hasta_seg
    from dur d
  )
  select a.rn::smallint,
         a.tipo,
         p_inicio + make_interval(secs => round(a.desde_seg)::double precision),
         -- La ultima se clava en p_fin: asi el redondeo no puede dejar la cita
         -- ni un segundo mas corta ni mas larga de lo que dice `citas`.
         case when a.rn = a.n
              then p_fin
              else p_inicio + make_interval(secs => round(a.hasta_seg)::double precision) end,
         a.etiqueta,
         a.recurso_tipo
  from acum a
  order by a.rn;
$function$;

comment on function public.fases_de_plantilla(jsonb, timestamptz, timestamptz) is
  'Convierte servicios.fases en los tramos concretos de una cita, anclados a [p_inicio, p_fin]: los minutos de reposo se respetan y las fases de trabajo absorben la diferencia. 0 filas = la plantilla no sirve para esta cita (usa la descomposicion clasica). Garantiza min(inicio)=p_inicio y max(fin)=p_fin.';

-- ---------------------------------------------------------------------------
-- 4. La proyeccion: cita -> cita_fases
-- ---------------------------------------------------------------------------
--
-- Unico cambio respecto de lo que habia: la rama de plantilla pasa por la costura
-- y por tanto queda anclada. La rama clasica no se toca.
--
-- Se lee `s.fases` por su nombre y no con `to_jsonb(s)->'fases'` (el rodeo
-- defensivo que se puso cuando la columna no existia). Ahora existe y tiene un
-- CHECK encima: si alguien la borrara, esto tiene que fallar A GRITOS y que lo
-- cace `bd-triggers-ciegos`, no seguir devolviendo null y dejar las plantillas
-- mudas para siempre.

create or replace function public.sembrar_fases_de_cita(p_cita_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c       public.citas%rowtype;
  v_fases jsonb;
begin
  select * into c from public.citas where id = p_cita_id;
  if not found then return; end if;

  delete from public.cita_fases where cita_id = p_cita_id;

  select s.fases into v_fases from public.servicios s where s.id = c.servicio_id;

  if v_fases is not null and c.inicio is not null and c.fin is not null then
    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin,
                                   profesional_id, recurso_tipo, etiqueta)
    select c.negocio_id, c.id, f.orden, f.tipo, f.inicio, f.fin,
           c.profesional_id, f.recurso_tipo, f.etiqueta
    from public.fases_de_plantilla(v_fases, c.inicio, c.fin) f;

    -- FOUND aqui es "el INSERT metio al menos una fila". Si la plantilla no cabia
    -- en esta cita, no metio ninguna y seguimos al camino clasico.
    if found then return; end if;
  end if;

  if c.fin_activa is not null and c.fin_espera is not null and c.fin_espera > c.fin_activa then
    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 1, 'activa', c.inicio, c.fin_activa, c.profesional_id, 'Aplicacion');

    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 2, 'reposo', c.fin_activa, c.fin_espera, c.profesional_id, 'Reposo tecnico');

    if c.fin > c.fin_espera then
      insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
      values (c.negocio_id, c.id, 3, 'activa', c.fin_espera, c.fin, c.profesional_id, 'Lavado y peinado');
    end if;
  else
    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 1, 'activa', c.inicio, c.fin, c.profesional_id, 'Servicio');
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. El resumen: las 4 marcas salen de la MISMA costura
-- ---------------------------------------------------------------------------
--
-- Sin esto, un servicio con plantilla tendria dos verdades a la vez: `cita_fases`
-- (que es lo que mira el cliente, `ventanasActivas` de lib/retrasos.ts) y las 4
-- marcas (que es lo que miran las 8 funciones del grupo A ya en la costura de
-- ocupacion). Y podrian discrepar en la direccion mala: que las marcas declaren
-- reposo --profesional libre-- un tramo en el que la plantilla pone trabajo.
--
-- DOS DECISIONES QUE HAY QUE CONOCER ANTES DE TOCAR ESTO:
--
-- (a) `fin_activa` = INICIO DEL PRIMER REPOSO, no "fin de la primera fase activa".
--     La spec original dice lo segundo y es un error que solo se ve con una
--     plantilla real: en `activa 20 -> transicion 10 -> activa 15 -> reposo 30`,
--     la primera activa acaba en +20 pero el reposo no empieza hasta +45. Con la
--     formula literal, el resumen declararia reposo --y por tanto profesional
--     libre-- de +20 a +75, y +20..+45 es trabajo. El paso 4 tiene que usar esta
--     formula, no la de la spec.
--
-- (b) Cuando el servicio tiene plantilla viable, las marcas se RECALCULAN aunque
--     vengan escritas. Si solo se rellenaran los nulos, al estirar una cita el
--     cliente mandaria las marcas viejas, la plantilla reescalaria las fases y las
--     dos verdades se separarian. Para los servicios sin plantilla --hoy, todos--
--     no cambia absolutamente nada. Esta anulacion desaparece con el paso 4, que
--     es quien pasa a mandar sobre las fases.

create or replace function public.citas_normalizar_fases()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_activa    int;
  v_espera    int;
  v_fases     jsonb;
  v_n         int := 0;
  v_fa        timestamptz;
  v_fe        timestamptz;
  v_plantilla boolean := false;
begin
  if new.inicio is null or new.fin is null then
    return new;
  end if;

  select coalesce(s.duracion_activa_min, 0), coalesce(s.duracion_espera_min, 0), s.fases
    into v_activa, v_espera, v_fases
    from public.servicios s
   where s.id = new.servicio_id;

  if v_fases is not null then
    select count(*)::int,
           min(f.inicio) filter (where f.tipo = 'reposo'),
           min(f.fin)    filter (where f.tipo = 'reposo')
      into v_n, v_fa, v_fe
      from public.fases_de_plantilla(v_fases, new.inicio, new.fin) f;

    -- Los reposos de una plantilla son disjuntos y van en orden, asi que el menor
    -- `inicio` y el menor `fin` entre ellos son los del PRIMER reposo.
    if v_n > 0 then
      v_plantilla    := true;
      new.fin_activa := coalesce(v_fa, new.fin);
      new.fin_espera := coalesce(v_fe, new.fin_activa);
    end if;
  end if;

  if not v_plantilla and (new.fin_activa is null or new.fin_espera is null) then
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
  end if;

  new.fin_activa := greatest(new.inicio, least(new.fin_activa, new.fin));
  new.fin_espera := greatest(new.fin_activa, least(new.fin_espera, new.fin));
  return new;
end;
$function$;
