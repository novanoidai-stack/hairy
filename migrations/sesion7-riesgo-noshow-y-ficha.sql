-- Sesion 7 del PLAN-IA-CHISPA: Q&A de cliente + riesgo de no-show + fuga.
--
-- Contexto: la RPC marcar_cita_no_show ya existia (Sesion 6 parcial de Alexandro)
-- pero (a) ninguna UI la llamaba y (b) no actualizaba el contador denormalizado
-- clientes.noshows_count, por lo que las pildoras de riesgo de la ficha nunca se
-- movian. Aqui se cierra el circuito y se anaden las lecturas de riesgo.
--
-- Piezas:
--   1) marcar_cita_no_show: al marcar, incrementa noshows_count y sella la traza.
--   2) clientes_riesgo_no_show(): score de riesgo por clienta del negocio del caller
--      (solo las de riesgo medio/alto, para no estigmatizar a todo el mundo).
--   3) riesgo_no_show_cliente(p_cliente_id): el score de UNA clienta (incluye bajo).
--   4) citas_riesgo_no_show(p_desde, p_hasta): citas sin confirmar de clientas de
--      riesgo en un rango (para el aviso proactivo "no-show inminente" de Chispa).
--   5) registrar_aviso_fuga(p_cliente_id, p_recompensa_id): deja el borrador/registro
--      de "propuesta de vuelta" para el motor de envio (el envio real = Alexandro).
--
-- Regla dura de salud: NINGUNA de estas funciones expone alergias/notas/salud.
-- Solo datos operativos (no-shows, cancelaciones tardias, antiguedad).
-- Multi-tenant estricto: todo scoped al negocio del auth.uid() via profiles.

-- ---------------------------------------------------------------------------
-- 1) marcar_cita_no_show: cierra el circuito con el contador denormalizado.
-- ---------------------------------------------------------------------------
create or replace function public.marcar_cita_no_show(p_cita_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_neg text; v_role text; v_cita public.citas;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','recepcion','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  select * into v_cita from public.citas where id = p_cita_id;
  if v_cita.id is null or v_cita.negocio_id <> v_neg then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada');
  end if;
  if v_cita.inicio > now() then
    return jsonb_build_object('ok', false, 'error', 'cita_futura');
  end if;
  if v_cita.estado not in ('confirmada', 'completada') then
    return jsonb_build_object('ok', false, 'error', 'estado_no_valido');
  end if;

  update public.citas
     set estado = 'no_show', modificado_at = now(), modificado_por = auth.uid()
   where id = p_cita_id;

  -- Contador denormalizado: mantiene coherente la ficha (pildora de riesgo) y el
  -- score. Solo si la cita tenia clienta identificada.
  if v_cita.cliente_id is not null then
    update public.clientes
       set noshows_count = coalesce(noshows_count, 0) + 1
     where id = v_cita.cliente_id and negocio_id = v_neg;
  end if;

  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'cliente_id', v_cita.cliente_id);
end $function$;

-- ---------------------------------------------------------------------------
-- Nucleo del score (tabla por clienta del negocio del caller). Determinista:
--   score = no_shows*35 + cancelaciones_tardias*15 + (clienta nueva ? 10 : 0)
--   nivel = alto (>=50) | medio (>=20) | bajo (<20)
-- Cancelacion tardia: cita cancelada cuyo ultimo cambio de estado cae dentro de
-- las 24h previas al inicio (senal razonable con los datos disponibles).
-- Antiguedad: una clienta con <2 visitas historicas suma un pequeno riesgo base
-- (aun no hay patron de fiabilidad).
-- ---------------------------------------------------------------------------
create or replace function public.clientes_riesgo_no_show()
returns table(
  cliente_id uuid,
  no_shows integer,
  cancelaciones_tardias integer,
  total_citas integer,
  antiguedad_dias integer,
  score integer,
  nivel text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mine as (
    select p.negocio_id from public.profiles p where p.id = auth.uid()
  ),
  agg as (
    select
      cl.id as cliente_id,
      cl.total_visitas,
      cl.primera_visita,
      count(*) filter (where c.estado = 'no_show') as no_shows,
      count(*) filter (
        where c.estado = 'cancelada'
          and coalesce(c.modificado_at, c.updated_at) is not null
          and coalesce(c.modificado_at, c.updated_at) >= c.inicio - interval '24 hours'
          and coalesce(c.modificado_at, c.updated_at) <= c.inicio + interval '24 hours'
      ) as cancelaciones_tardias,
      count(*) filter (where c.estado in ('completada','no_show','cancelada')) as total_citas
    from public.clientes cl
    join mine on mine.negocio_id = cl.negocio_id
    left join public.citas c on c.cliente_id = cl.id and c.negocio_id = cl.negocio_id
    group by cl.id, cl.total_visitas, cl.primera_visita
  ),
  scored as (
    select
      a.cliente_id,
      a.no_shows::int,
      a.cancelaciones_tardias::int,
      a.total_citas::int,
      coalesce((current_date - a.primera_visita)::int, 0) as antiguedad_dias,
      least(
        100,
        a.no_shows * 35
        + a.cancelaciones_tardias * 15
        + case when coalesce(a.total_visitas, 0) < 2 then 10 else 0 end
      )::int as score
    from agg a
  )
  select
    s.cliente_id,
    s.no_shows,
    s.cancelaciones_tardias,
    s.total_citas,
    s.antiguedad_dias,
    s.score,
    case when s.score >= 50 then 'alto' when s.score >= 20 then 'medio' else 'bajo' end as nivel
  from scored s
  where s.score >= 20   -- solo riesgo medio/alto: no se etiqueta a la mayoria fiable
  order by s.score desc;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Score de UNA clienta (incluye 'bajo'): para la ficha y para el edge de IA.
-- ---------------------------------------------------------------------------
create or replace function public.riesgo_no_show_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_neg text;
  v_no_shows int := 0; v_tardias int := 0; v_total int := 0; v_antig int := 0;
  v_visitas int := 0; v_score int := 0;
begin
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then
    return jsonb_build_object('nivel', 'bajo', 'score', 0);
  end if;
  -- Aislamiento: la clienta debe ser del negocio del caller.
  if not exists (select 1 from public.clientes where id = p_cliente_id and negocio_id = v_neg) then
    return jsonb_build_object('nivel', 'bajo', 'score', 0);
  end if;

  select coalesce(cl.total_visitas, 0), coalesce((current_date - cl.primera_visita)::int, 0)
    into v_visitas, v_antig
    from public.clientes cl where cl.id = p_cliente_id;

  select
    count(*) filter (where c.estado = 'no_show'),
    count(*) filter (
      where c.estado = 'cancelada'
        and coalesce(c.modificado_at, c.updated_at) is not null
        and coalesce(c.modificado_at, c.updated_at) >= c.inicio - interval '24 hours'
        and coalesce(c.modificado_at, c.updated_at) <= c.inicio + interval '24 hours'
    ),
    count(*) filter (where c.estado in ('completada','no_show','cancelada'))
    into v_no_shows, v_tardias, v_total
    from public.citas c
   where c.cliente_id = p_cliente_id and c.negocio_id = v_neg;

  v_score := least(100, v_no_shows * 35 + v_tardias * 15 + case when v_visitas < 2 then 10 else 0 end);

  return jsonb_build_object(
    'nivel', case when v_score >= 50 then 'alto' when v_score >= 20 then 'medio' else 'bajo' end,
    'score', v_score,
    'no_shows', v_no_shows,
    'cancelaciones_tardias', v_tardias,
    'total_citas', v_total,
    'antiguedad_dias', v_antig
  );
end $function$;

-- ---------------------------------------------------------------------------
-- 4) Citas de riesgo sin confirmar en un rango: aviso "no-show inminente".
-- ---------------------------------------------------------------------------
create or replace function public.citas_riesgo_no_show(p_desde timestamptz, p_hasta timestamptz)
returns table(
  cita_id uuid,
  cliente_id uuid,
  nombre text,
  inicio timestamptz,
  nivel text,
  score integer,
  no_shows integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mine as (
    select p.negocio_id from public.profiles p where p.id = auth.uid()
  ),
  riesgo as (
    select * from public.clientes_riesgo_no_show()
  )
  select
    c.id as cita_id,
    c.cliente_id,
    cl.nombre,
    c.inicio,
    r.nivel,
    r.score,
    r.no_shows
  from public.citas c
  join mine on mine.negocio_id = c.negocio_id
  join riesgo r on r.cliente_id = c.cliente_id
  join public.clientes cl on cl.id = c.cliente_id
  where c.estado = 'confirmada'
    and coalesce(c.confirmada_cliente, false) = false
    and cl.consiente_ia is distinct from false
    and c.inicio >= p_desde
    and c.inicio < p_hasta
  order by r.score desc, c.inicio asc;
$function$;

-- ---------------------------------------------------------------------------
-- 5) registrar_aviso_fuga: deja el borrador/registro de "propuesta de vuelta".
--    El envio real (WhatsApp) lo hace el motor de Alexandro; aqui solo se crea
--    el registro 'pendiente' que ese motor recoge. Idempotente: si ya hay uno
--    pendiente para la clienta, lo devuelve en vez de duplicar.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_aviso_fuga(p_cliente_id uuid, p_recompensa_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_neg text; v_role text; v_cli public.clientes; v_dias int; v_id uuid;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','recepcion','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  -- Guardrail demo: nunca escribir en el tenant demo compartido.
  if v_neg = 'demo_salon_001' then
    return jsonb_build_object('ok', false, 'error', 'demo_no_escribe');
  end if;

  select * into v_cli from public.clientes where id = p_cliente_id and negocio_id = v_neg;
  if v_cli.id is null then
    return jsonb_build_object('ok', false, 'error', 'cliente_no_encontrado');
  end if;
  if v_cli.frecuencia_dias is null or v_cli.ultima_visita is null then
    return jsonb_build_object('ok', false, 'error', 'sin_historial_suficiente');
  end if;

  v_dias := (current_date - v_cli.ultima_visita)::int;

  -- Idempotencia: reutiliza un aviso pendiente existente.
  select id into v_id from public.fuga_clientas_avisos
   where cliente_id = p_cliente_id and negocio_id = v_neg and estado = 'pendiente'
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'aviso_id', v_id, 'ya_existia', true);
  end if;

  insert into public.fuga_clientas_avisos
    (negocio_id, cliente_id, dias_desde_ultima_visita, frecuencia_dias, recompensa_sugerida_id, estado)
  values
    (v_neg, p_cliente_id, v_dias, v_cli.frecuencia_dias, p_recompensa_id, 'pendiente')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'aviso_id', v_id, 'ya_existia', false);
end $function$;

-- ---------------------------------------------------------------------------
-- Permisos: revocar de anon/public, conceder solo a authenticated (las RPCs
-- derivan negocio/rol del auth.uid(); no hay uso anonimo legitimo).
-- ---------------------------------------------------------------------------
revoke all on function public.clientes_riesgo_no_show() from anon, public;
revoke all on function public.riesgo_no_show_cliente(uuid) from anon, public;
revoke all on function public.citas_riesgo_no_show(timestamptz, timestamptz) from anon, public;
revoke all on function public.registrar_aviso_fuga(uuid, uuid) from anon, public;
grant execute on function public.clientes_riesgo_no_show() to authenticated;
grant execute on function public.riesgo_no_show_cliente(uuid) to authenticated;
grant execute on function public.citas_riesgo_no_show(timestamptz, timestamptz) to authenticated;
grant execute on function public.registrar_aviso_fuga(uuid, uuid) to authenticated;
