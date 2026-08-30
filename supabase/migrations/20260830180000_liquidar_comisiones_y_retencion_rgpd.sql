-- ===========================================================================
-- Migración: Liquidación de Comisiones y Retención / Caducidad RGPD
-- Specs 11 y 13
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- SPEC 11: LIQUIDAR COMISIONES DE PERIODO (congelar y marcar pagadas)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.liquidar_comision_periodo(
  p_profesional_id uuid,
  p_periodo_inicio date,
  p_periodo_fin date,
  p_marcar_pagada boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_calculo jsonb;
  v_base_cents integer;
  v_pct numeric;
  v_comision_cents integer;
  v_comision_id uuid;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Calcular el importe del periodo usando la RPC de comisiones
  v_calculo := public.calcular_comisiones_periodo(
    v_negocio,
    p_profesional_id,
    p_periodo_inicio::text,
    p_periodo_fin::text
  );

  v_base_cents := coalesce((v_calculo->>'base_calculo_cents')::int, 0);
  v_pct := coalesce((v_calculo->>'porcentaje_aplicado')::numeric, 0);
  v_comision_cents := coalesce((v_calculo->>'importe_comision_cents')::int, 0);

  -- Insertar o actualizar liquidación congelada
  insert into public.comisiones (
    negocio_id,
    profesional_id,
    periodo_inicio,
    periodo_fin,
    base_calculo_cents,
    porcentaje_aplicado,
    importe_comision_cents,
    comision_base,
    estado,
    pagada_en,
    detalles
  ) values (
    v_negocio,
    p_profesional_id,
    p_periodo_inicio,
    p_periodo_fin,
    v_base_cents,
    v_pct,
    v_comision_cents,
    'servicios',
    case when p_marcar_pagada then 'pagada' else 'calculada' end,
    case when p_marcar_pagada then now() else null end,
    v_calculo
  )
  returning id into v_comision_id;

  return jsonb_build_object(
    'ok', true,
    'comision_id', v_comision_id,
    'importe_comision_cents', v_comision_cents,
    'estado', case when p_marcar_pagada then 'pagada' else 'calculada' end
  );
end;
$$;

grant execute on function public.liquidar_comision_periodo(uuid, date, date, boolean) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- SPEC 13: RETENCIÓN Y CADUCIDAD DE DATOS RGPD
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.ejecutar_retencion_rgpd(
  p_dias_inactividad integer default 1095
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_limite timestamptz;
  v_cli record;
  v_anonimizados integer := 0;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  v_limite := now() - make_interval(days => coalesce(p_dias_inactividad, 1095));

  -- Buscar clientes inactivos sin visitas recientes
  for v_cli in
    select id
    from public.clientes
    where negocio_id = v_negocio
      and (ultima_visita is not null and ultima_visita < v_limite)
      and not exists (
        select 1 from public.citas c
        where c.cliente_id = clientes.id
          and c.inicio > v_limite
      )
    limit 100
  loop
    -- Anonimizar cliente reutilizando la función segura
    perform public.anonimizar_cliente(v_cli.id);
    v_anonimizados := v_anonimizados + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'clientes_anonimizados', v_anonimizados,
    'limite_aplicado', v_limite
  );
end;
$$;

grant execute on function public.ejecutar_retencion_rgpd(integer) to authenticated, service_role;
