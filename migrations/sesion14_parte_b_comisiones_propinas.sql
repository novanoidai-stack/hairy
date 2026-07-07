-- ===============================================================================
-- 4. UPDATE calcular_comisiones_periodo PARA INCLUIR propinas_cents
-- ===============================================================================
create or replace function public.calcular_comisiones_periodo(
  p_profesional_id uuid,
  p_desde timestamptz,
  p_hasta timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_config jsonb;
  v_porcentaje_def numeric(5,2);
  v_comision_base text;
  v_incluir_addons boolean;
  v_incluir_propinas boolean;
  v_base_cents integer;
  v_comision_cents integer;
  v_addons_cents integer;
  v_propinas_cents integer := 0;
  v_detalle jsonb;
  v_profesional_nombre text;
begin
  select negocio_id into v_negocio_id from public.profiles where id = p_profesional_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado'); end if;

  select config into v_config from public.negocio_config where negocio_id = v_negocio_id;
  v_porcentaje_def := coalesce((v_config->>'comisionBase')::numeric, 15.00);
  v_comision_base := coalesce(v_config->>'comisionBaseImporte', 'neto');
  v_incluir_addons := coalesce((v_config->>'comisionAddons')::boolean, true);
  v_incluir_propinas := coalesce((v_config->>'comisionPropinas')::boolean, false);

  select coalesce(comision_pct, v_porcentaje_def) into v_porcentaje_def from public.profesionales where profile_id = p_profesional_id and negocio_id = v_negocio_id;
  select concat(nombre, ' ', apellidos) into v_profesional_nombre from public.profiles where id = p_profesional_id;

  select coalesce(sum(case when estado = 'completado' then total_cents - descuento_cents - case when v_comision_base = 'neto' then trunc((total_cents - descuento_cents) / 1.21) else 0 end else 0 end), 0) into v_base_cents from public.cobros where profesional_id = p_profesional_id::text and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';

  if not v_incluir_addons then
    select coalesce(sum(precio_cents * cantidad), 0) into v_addons_cents from public.cobro_lineas cl join public.cobros c on c.id = cl.cobro_id where c.profesional_id = p_profesional_id::text and c.cobrado_at >= p_desde and c.cobrado_at <= p_hasta and c.estado = 'completado' and cl.tipo = 'suplemento';
    v_base_cents := v_base_cents - coalesce(v_addons_cents, 0);
  end if;

  select coalesce(sum(propina_cents), 0) into v_propinas_cents from public.cobros where profesional_id = p_profesional_id::text and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';
  
  if v_incluir_propinas then
    v_base_cents := v_base_cents + coalesce(v_propinas_cents, 0);
  end if;

  v_comision_cents := trunc(v_base_cents * v_porcentaje_def / 100);

  v_detalle := jsonb_build_object(
    'profesional_id', p_profesional_id,
    'profesional_nombre', v_profesional_nombre,
    'periodo_inicio', p_desde,
    'periodo_fin', p_hasta,
    'base_cents', v_base_cents,
    'porcentaje_aplicado', v_porcentaje_def,
    'comision_cents', v_comision_cents,
    'comision_base', v_comision_base,
    'incluir_addons', v_incluir_addons,
    'incluir_propinas', v_incluir_propinas,
    'propinas_cents', coalesce(v_propinas_cents, 0),
    'num_cobros', (select count(*) from public.cobros where profesional_id = p_profesional_id::text and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado')
  );

  return jsonb_build_object('ok', true, 'resultado', v_detalle);
end;
$$;

revoke execute on function public.calcular_comisiones_periodo(uuid, timestamptz, timestamptz) from public;
grant execute on function public.calcular_comisiones_periodo(uuid, timestamptz, timestamptz) to authenticated;
