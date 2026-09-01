-- 1 sep 2026. consumir_bono_cita cobra los add-ons de la cita.
--
-- El bono cubre el servicio, pero los add-ons (extras "solo dinero" desde
-- 20260901153000) se quedaban sin cobrar en la via del bono. Mismo criterio
-- que crear_cobro_desde_cita (20260901161500): se suman al total y quedan
-- como lineas tipo 'addon' para informes y comisiones. Firma intacta => los
-- grants de 20260818000000 siguen valiendo; se re-dejan explicitos igualmente.

create or replace function public.consumir_bono_cita(
  p_cita_id uuid,
  p_bono_id uuid,
  p_propina_cents integer default 0,
  p_lineas_extra jsonb default '[]'::jsonb,
  p_descuento_cents integer default 0,
  p_metodo text default 'efectivo'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_negocio text;
  v_cita public.citas%rowtype;
  v_bono public.bonos%rowtype;
  v_cobro_id uuid;
  v_nombre text;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_metodo text := coalesce(nullif(p_metodo, ''), 'efectivo');
  v_lineas jsonb := coalesce(p_lineas_extra, '[]'::jsonb);
  v_producto_cents integer := 0;
  v_addon record;
  v_addons_cents integer := 0;
  li jsonb;
  v_nombre_li text;
  v_precio_li integer;
  v_cant_li integer;
  v_ref_li uuid;
  v_total integer;
  v_efectivo integer := 0;
  v_datafono integer := 0;
begin
  if v_metodo not in ('efectivo','datafono','online','bizum','mixto') then
    v_metodo := 'efectivo';
  end if;

  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;

  select * into v_bono from public.bonos where id = p_bono_id for update;
  if not found then raise exception 'bono_no_encontrado'; end if;
  if v_bono.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_bono.cliente_id <> v_cita.cliente_id then raise exception 'bono_cliente_distinto'; end if;
  if v_bono.servicio_id <> v_cita.servicio_id then raise exception 'bono_servicio_distinto'; end if;
  if v_bono.estado <> 'activo' or v_bono.sesiones_disponibles <= 0 then raise exception 'bono_agotado'; end if;

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_producto_cents := v_producto_cents + v_precio_li * v_cant_li;
  end loop;

  -- Add-ons de la cita: el bono NO los cubre, se cobran.
  select coalesce(sum(round(coalesce(sa.precio, 0) * 100)), 0)
    into v_addons_cents
    from public.cita_addons ca
    join public.service_addons sa on sa.id = ca.addon_id
   where ca.cita_id = p_cita_id;

  update public.bonos
  set sesiones_disponibles = sesiones_disponibles - 1,
      estado = case when sesiones_disponibles - 1 = 0 then 'agotado' else estado end,
      updated_at = now()
  where id = p_bono_id;

  select nombre into v_nombre from public.servicios where id = v_cita.servicio_id;

  v_total := greatest(0, v_producto_cents + v_addons_cents - v_desc) + v_prop;
  if v_metodo = 'datafono' then
    v_datafono := v_total;
  else
    if v_metodo = 'mixto' then v_metodo := 'efectivo'; end if;
    v_efectivo := v_total;
  end if;

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_total, v_prop, least(v_desc, v_producto_cents + v_addons_cents), v_metodo,
    v_efectivo, v_datafono, 0, 'pos', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio') || ' (Bono)', 0, 1);

  for v_addon in
    select ca.addon_id, sa.nombre, round(coalesce(sa.precio, 0) * 100) as precio_cents
      from public.cita_addons ca
      join public.service_addons sa on sa.id = ca.addon_id
     where ca.cita_id = p_cita_id
  loop
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, 'addon', v_addon.addon_id, v_addon.nombre, v_addon.precio_cents, 1);
  end loop;

  for li in select * from jsonb_array_elements(v_lineas) loop
    v_nombre_li := nullif(btrim(li->>'nombre'), '');
    v_precio_li := greatest(0, coalesce((li->>'precio_cents')::int, 0));
    v_cant_li := greatest(1, coalesce((li->>'cantidad')::int, 1));
    v_ref_li := nullif(li->>'ref_id', '');
    if v_nombre_li is null then continue; end if;
    insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
    values (v_cobro_id, 'producto', v_ref_li, v_nombre_li, v_precio_li, v_cant_li);
  end loop;

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$$;

revoke execute on function public.consumir_bono_cita(uuid, uuid, integer, jsonb, integer, text) from public, anon;
grant execute on function public.consumir_bono_cita(uuid, uuid, integer, jsonb, integer, text) to authenticated;
