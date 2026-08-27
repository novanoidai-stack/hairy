-- KPI Fase A: unificar el estado de no-show en 'no_presentada' (termino oficial
-- del glosario, Documento Modular 1). Elimina la ambiguedad no_show/no_presentada
-- que causaba que informes contara 0 no-shows y el CRM contara los reales.
--
-- Orden: primero normalizar datos (mientras el trigger viejo aun cuenta ambos
-- valores, asi noshows_count no se descuadra), luego recrear funciones, y al
-- final endurecer el CHECK (ya sin filas 'no_show').

-- 1. Normalizar datos existentes ------------------------------------------------
update public.citas set estado = 'no_presentada' where estado = 'no_show';

-- 2. Writer canonico ------------------------------------------------------------
create or replace function public.marcar_cita_no_show(p_cita_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_neg text; v_role text; v_cita public.citas;
  v_hold uuid; v_auto boolean;
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
  update public.citas set estado = 'no_presentada', modificado_at = now(), modificado_por = auth.uid() where id = p_cita_id;
  if v_cita.cliente_id is not null then
    update public.clientes set noshows_count = coalesce(noshows_count, 0) + 1
     where id = v_cita.cliente_id and negocio_id = v_neg;
  end if;

  select id into v_hold from public.pagos
    where cita_id = p_cita_id and tipo = 'senal' and estado = 'retenido'
    order by created_at desc limit 1;
  select coalesce((config->>'depositoNoShowCapturaAuto')::boolean, true) into v_auto
    from public.negocio_config where negocio_id = v_neg;

  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'cliente_id', v_cita.cliente_id,
    'hold_pago_id', v_hold, 'capturar_auto', coalesce(v_auto, true));
end $function$;

-- 3. Trigger de sincronizacion de noshows_count ---------------------------------
create or replace function public.tg_sync_noshows_count()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cli uuid;
begin
  v_cli := case when TG_OP = 'DELETE' then OLD.cliente_id else NEW.cliente_id end;
  if v_cli is not null then
    update public.clientes set noshows_count = (
      select count(*) from public.citas
      where cliente_id = v_cli and estado = 'no_presentada'
    ) where id = v_cli;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $function$;

-- 4. Riesgo por cliente (agregado del negocio) ----------------------------------
create or replace function public.clientes_riesgo_no_show()
 returns table(cliente_id uuid, no_shows integer, cancelaciones_tardias integer, total_citas integer, antiguedad_dias integer, score integer, nivel text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with mine as (select p.negocio_id from public.profiles p where p.id = auth.uid()),
  agg as (
    select cl.id as cliente_id, cl.total_visitas, cl.primera_visita,
      count(*) filter (where c.estado = 'no_presentada') as no_shows,
      count(*) filter (where c.estado = 'cancelada' and coalesce(c.modificado_at, c.updated_at) is not null and coalesce(c.modificado_at, c.updated_at) >= c.inicio - interval '24 hours' and coalesce(c.modificado_at, c.updated_at) <= c.inicio + interval '24 hours') as cancelaciones_tardias,
      count(*) filter (where c.estado in ('completada','no_presentada','cancelada')) as total_citas
    from public.clientes cl
    join mine on mine.negocio_id = cl.negocio_id
    left join public.citas c on c.cliente_id = cl.id and c.negocio_id = cl.negocio_id
    group by cl.id, cl.total_visitas, cl.primera_visita
  ),
  scored as (
    select a.cliente_id, a.no_shows::int, a.cancelaciones_tardias::int, a.total_citas::int,
      coalesce((current_date - a.primera_visita)::int, 0) as antiguedad_dias,
      least(100, a.no_shows * 35 + a.cancelaciones_tardias * 15 + case when coalesce(a.total_visitas, 0) < 2 then 10 else 0 end)::int as score
    from agg a
  )
  select s.cliente_id, s.no_shows, s.cancelaciones_tardias, s.total_citas, s.antiguedad_dias, s.score,
    case when s.score >= 50 then 'alto' when s.score >= 20 then 'medio' else 'bajo' end as nivel
  from scored s where s.score >= 20 order by s.score desc;
$function$;

-- 5. Riesgo de un cliente concreto ----------------------------------------------
create or replace function public.riesgo_no_show_cliente(p_cliente_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare v_neg text; v_no_shows int := 0; v_tardias int := 0; v_total int := 0; v_antig int := 0; v_visitas int := 0; v_score int := 0;
begin
  select negocio_id into v_neg from public.profiles where id = auth.uid();
  if v_neg is null then return jsonb_build_object('nivel', 'bajo', 'score', 0); end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and negocio_id = v_neg) then
    return jsonb_build_object('nivel', 'bajo', 'score', 0);
  end if;
  select coalesce(cl.total_visitas, 0), coalesce((current_date - cl.primera_visita)::int, 0)
    into v_visitas, v_antig from public.clientes cl where cl.id = p_cliente_id;
  select count(*) filter (where c.estado = 'no_presentada'),
    count(*) filter (where c.estado = 'cancelada' and coalesce(c.modificado_at, c.updated_at) is not null and coalesce(c.modificado_at, c.updated_at) >= c.inicio - interval '24 hours' and coalesce(c.modificado_at, c.updated_at) <= c.inicio + interval '24 hours'),
    count(*) filter (where c.estado in ('completada','no_presentada','cancelada'))
    into v_no_shows, v_tardias, v_total
    from public.citas c where c.cliente_id = p_cliente_id and c.negocio_id = v_neg;
  v_score := least(100, v_no_shows * 35 + v_tardias * 15 + case when v_visitas < 2 then 10 else 0 end);
  return jsonb_build_object('nivel', case when v_score >= 50 then 'alto' when v_score >= 20 then 'medio' else 'bajo' end,
    'score', v_score, 'no_shows', v_no_shows, 'cancelaciones_tardias', v_tardias, 'total_citas', v_total, 'antiguedad_dias', v_antig);
end $function$;

-- 6. Perfil de riesgo (clasificacion de deposito) -------------------------------
create or replace function public.perfil_riesgo_cliente(p_cliente_id uuid, p_umbral_fiable integer default 3, p_umbral_alto integer default 2)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_override text;
  v_bloqueado boolean;
  v_negocio text;
  v_modo text;
  v_vip_exento boolean;
  v_completadas int;
  v_noshows int;
begin
  select deposito_perfil_override, bloqueado, negocio_id
    into v_override, v_bloqueado, v_negocio
    from public.clientes where id = p_cliente_id;
  if not found then return null; end if;
  if auth.uid() is not null and v_negocio is distinct from public.my_negocio_id_text() then
    return null;
  end if;

  select coalesce(config->>'depositoModoClasificacion', 'ambos'),
         coalesce((config->>'depositoVipExento')::boolean, true)
    into v_modo, v_vip_exento
    from public.negocio_config where negocio_id = v_negocio;
  v_modo := coalesce(v_modo, 'ambos');
  v_vip_exento := coalesce(v_vip_exento, true);

  if v_modo = 'manual' then
    return coalesce(v_override, 'normal');
  end if;
  if v_modo = 'ambos' and v_override is not null then
    return v_override;
  end if;

  -- clasificacion automatica
  if coalesce(v_bloqueado, false) then return 'alto'; end if;

  select count(*) filter (where estado = 'completada'),
         count(*) filter (where estado = 'no_presentada')
    into v_completadas, v_noshows
  from public.citas where cliente_id = p_cliente_id;

  -- VIP -> exento (por visitas o por gasto acumulado), aunque tenga algun no-show
  if v_vip_exento then
    if coalesce(v_completadas,0) > 10 then return 'exento'; end if;
    if (select coalesce(sum(total_cents),0) from public.cobros where cliente_id = p_cliente_id) > 50000 then
      return 'exento';
    end if;
  end if;

  if v_noshows >= greatest(p_umbral_alto, 1) then return 'alto'; end if;
  if v_noshows >= 1 then return 'riesgo'; end if;
  if v_completadas >= greatest(p_umbral_fiable, 1) then return 'exento'; end if;
  return 'normal';
end;
$function$;

-- 7. Logros: 'sin_noshow' ------------------------------------------------------
create or replace function public.verificar_logros_cliente(p_cliente_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_negocio_id text; v_visitas integer; v_gastado_cents integer; v_logro record; v_cumple boolean; v_condicion jsonb; v_desbloqueados integer := 0;
begin
  select negocio_id into v_negocio_id from clientes where id = p_cliente_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); end if;
  select count(*) into v_visitas from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  for v_logro in select * from logros where negocio_id = v_negocio_id and activo = true loop
    if exists (select 1 from logros_desbloqueados where cliente_id = p_cliente_id and logro_id = v_logro.id) then continue; end if;
    v_cumple := false; v_condicion := v_logro.condicion;
    case v_logro.tipo
      when 'primera_visita' then v_cumple := v_visitas >= 1;
      when 'visitas_multiple' then v_cumple := v_visitas >= coalesce((v_condicion->>'visitas')::integer, 0);
      when 'gastado_total' then v_cumple := v_gastado_cents >= coalesce((v_condicion->>'gastado_cents')::integer, 0);
      when 'sin_noshow' then v_cumple := not exists (select 1 from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'no_presentada' and inicio >= now() - (coalesce((v_condicion->>'meses_sin_noshow')::integer, 6) || ' months')::interval);
      else v_cumple := false;
    end case;
    if v_cumple then
      insert into logros_desbloqueados (negocio_id, cliente_id, logro_id, desbloqueado_en) values (v_negocio_id, p_cliente_id, v_logro.id, now());
      v_desbloqueados := v_desbloqueados + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'desbloqueados', v_desbloqueados, 'visitas', v_visitas, 'gastado_cents', v_gastado_cents);
end; $function$;

-- 8. Endurecer el CHECK (ya sin filas 'no_show') --------------------------------
alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas add constraint citas_estado_check
  check (estado = any (array['pendiente','confirmada','completada','cancelada','no_presentada']));
