-- RPC de "Mi jornada": resumen personal del profesional logueado para un rango.
-- Carlos + Claude (24 jun 2026). security definer: resuelve auth.uid() -> su ficha
-- de profesional (profesionales.profile_id) y agrega su actividad del periodo.
--
-- Gate server-side de visibilidad de dinero/comision: si el rol NO es gestor
-- (owner/admin) y el flag de negocio_config esta OFF, los campos de dinero/comision
-- NO se incluyen (no basta con ocultarlos en la UI). Defaults: importes ON, comision OFF.
--
-- No abre SELECT de cobros a empleados: todo pasa por esta funcion (definer).
create or replace function public.mi_jornada_resumen(
  p_desde timestamptz,
  p_hasta timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_nombre text;
  v_prof_id uuid;
  v_prof_nombre text;
  v_comision_pct numeric;
  v_config jsonb;
  v_is_manager boolean;
  v_show_money boolean;
  v_show_comision boolean;
  v_citas_completadas int := 0;
  v_tintes int := 0;
  v_horas numeric := 0;
  v_total_cents bigint := 0;
  v_propinas_cents bigint := 0;
  v_efectivo_cents bigint := 0;
  v_datafono_cents bigint := 0;
  v_cobros_count int := 0;
  v_ticket_medio_cents bigint := 0;
  v_comision_cents bigint := 0;
  v_citas_lista jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;

  select negocio_id, role, trim(coalesce(nombre,'') || ' ' || coalesce(apellido,''))
    into v_negocio, v_role, v_nombre
  from profiles where id = v_uid;
  if v_negocio is null then raise exception 'sin_perfil'; end if;

  -- Ficha de profesional vinculada a esta cuenta (puede no existir: p.ej. un owner que no atiende).
  select id, nombre, comision_pct
    into v_prof_id, v_prof_nombre, v_comision_pct
  from profesionales
  where profile_id = v_uid and negocio_id = v_negocio
  limit 1;

  select config into v_config from negocio_config where negocio_id = v_negocio;
  v_config := coalesce(v_config, '{}'::jsonb);

  v_is_manager := v_role in ('owner','admin');
  v_show_money := v_is_manager or coalesce((v_config->>'mi_jornada_mostrar_importes')::boolean, true);
  v_show_comision := v_is_manager or coalesce((v_config->>'mi_jornada_mostrar_comision')::boolean, false);

  -- Horas trabajadas en el rango: empareja cada 'entrada' con la 'salida' siguiente del propio usuario.
  with f as (
    select tipo, marcado_at,
      lead(marcado_at) over (order by marcado_at) as next_at,
      lead(tipo) over (order by marcado_at) as next_tipo
    from fichajes
    where user_id = v_uid and negocio_id = v_negocio
      and marcado_at >= p_desde and marcado_at < p_hasta
  )
  select coalesce(sum(extract(epoch from (next_at - marcado_at)) / 3600.0), 0)
    into v_horas
  from f
  where tipo = 'entrada' and next_tipo = 'salida';

  -- Actividad de citas (solo si hay ficha vinculada).
  if v_prof_id is not null then
    select
      count(*) filter (where c.estado = 'completada'),
      count(*) filter (where c.estado = 'completada' and (
        s.categoria ilike '%color%'
        or coalesce(s.duracion_espera_min, 0) > 0
        or c.formula_producto is not null
        or c.formula_tono is not null
      ))
    into v_citas_completadas, v_tintes
    from citas c
    left join servicios s on s.id = c.servicio_id
    where c.profesional_id = v_prof_id
      and c.negocio_id = v_negocio
      and c.inicio >= p_desde and c.inicio < p_hasta;

    if v_show_money then
      select
        coalesce(sum(total_cents), 0),
        coalesce(sum(propina_cents), 0),
        coalesce(sum(efectivo_cents), 0),
        coalesce(sum(datafono_cents), 0),
        count(*)
      into v_total_cents, v_propinas_cents, v_efectivo_cents, v_datafono_cents, v_cobros_count
      from cobros
      where profesional_id = v_prof_id
        and negocio_id = v_negocio
        and estado = 'completado'
        and cobrado_at >= p_desde and cobrado_at < p_hasta;

      if v_cobros_count > 0 then
        v_ticket_medio_cents := v_total_cents / v_cobros_count;
      end if;

      -- Comision estimada sobre lo cobrado de servicios (sin propinas).
      if v_show_comision and v_comision_pct is not null then
        v_comision_cents := round((v_total_cents - v_propinas_cents) * v_comision_pct / 100.0);
      end if;
    end if;

    -- Lista de citas completadas del rango (para mostrarlas, no solo contarlas). Cap 100.
    select coalesce(jsonb_agg(to_jsonb(sub) order by sub.inicio desc), '[]'::jsonb)
      into v_citas_lista
    from (
      select c.inicio as inicio,
        cl.nombre as cliente,
        s.nombre as servicio,
        (s.categoria ilike '%color%'
          or coalesce(s.duracion_espera_min, 0) > 0
          or c.formula_producto is not null
          or c.formula_tono is not null) as es_tinte
      from citas c
      left join servicios s on s.id = c.servicio_id
      left join clientes cl on cl.id = c.cliente_id
      where c.profesional_id = v_prof_id
        and c.negocio_id = v_negocio
        and c.estado = 'completada'
        and c.inicio >= p_desde and c.inicio < p_hasta
      limit 100
    ) sub;
  end if;

  v_result := jsonb_build_object(
    'profesional', jsonb_build_object(
      'id', v_prof_id,
      'nombre', coalesce(nullif(v_prof_nombre, ''), nullif(v_nombre, ''), 'Tu jornada'),
      'vinculado', v_prof_id is not null
    ),
    'rol', v_role,
    'horas', round(v_horas, 2),
    'citas_completadas', v_citas_completadas,
    'tintes', v_tintes,
    'citas_lista', v_citas_lista,
    'puede_ver_importes', v_show_money,
    'puede_ver_comision', (v_show_comision and v_comision_pct is not null)
  );

  if v_show_money then
    v_result := v_result || jsonb_build_object(
      'total_cents', v_total_cents,
      'propinas_cents', v_propinas_cents,
      'efectivo_cents', v_efectivo_cents,
      'datafono_cents', v_datafono_cents,
      'cobros_count', v_cobros_count,
      'ticket_medio_cents', v_ticket_medio_cents
    );
  end if;

  if v_show_comision and v_comision_pct is not null then
    v_result := v_result || jsonb_build_object('comision_cents', v_comision_cents);
  end if;

  return v_result;
end;
$$;

-- Solo autenticados (no anon/public). En Supabase las default privileges conceden
-- EXECUTE a anon/authenticated al crear la funcion; revocamos anon explicitamente.
revoke execute on function public.mi_jornada_resumen(timestamptz, timestamptz) from public;
revoke execute on function public.mi_jornada_resumen(timestamptz, timestamptz) from anon;
grant execute on function public.mi_jornada_resumen(timestamptz, timestamptz) to authenticated;
