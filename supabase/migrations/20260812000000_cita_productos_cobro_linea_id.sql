-- ─────────────────────────────────────────────────────────────────────────────
-- 2F: enlace de trazabilidad entre cita_productos y cobro_lineas.
--
-- Añade cita_productos.cobro_linea_id (nullable, SIN FK para cero riesgo de
-- integridad) y hace que crear_cobro_desde_cita lo rellene (mejor esfuerzo)
-- al cobrar las líneas extra de producto, para poder trazar
-- "este producto cobrado ↔ este producto usado en cita".
--
-- ✅ APLICADA en producción (proyecto Mecha) el 2026-08-12 vía Management API.
--    Verificada: la función compila, conserva toda la lógica original y contiene
--    el UPDATE de enlace. Queda pendiente probar el flujo de cobro en la app.
-- Rollback: ALTER TABLE cita_productos DROP COLUMN cobro_linea_id;
--           y restaurar crear_cobro_desde_cita a supabase/snapshots/crear_cobro_desde_cita.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cita_productos
  add column if not exists cobro_linea_id uuid;

-- Redefinición idéntica a la actual (snapshot supabase/snapshots/) + un UPDATE
-- de enlace INSERTADO antes de marcar la cita como cobrada. El UPDATE sólo
-- asigna una columna nullable (no puede romper el cobro).
create or replace function public.crear_cobro_desde_cita(
  p_cita_id uuid, p_metodo text, p_propina_cents integer default 0,
  p_descuento_cents integer default 0, p_efectivo_cents integer default null,
  p_datafono_cents integer default null, p_lineas_extra jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_negocio text;
  v_cita public.citas%rowtype;
  v_precio numeric;
  v_nombre text;
  v_base_cents integer;
  v_senal_cents integer;
  v_extras_cents integer;
  v_total_cents integer;
  v_prop integer := greatest(0, coalesce(p_propina_cents, 0));
  v_desc integer := greatest(0, coalesce(p_descuento_cents, 0));
  v_efe integer;
  v_dat integer;
  v_cobro_id uuid;
  v_extra_line jsonb;
begin
  select negocio_id into v_caller_negocio from public.profiles where id = auth.uid();
  if v_caller_negocio is null then raise exception 'sin_perfil'; end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_no_encontrada'; end if;
  if v_cita.negocio_id <> v_caller_negocio then raise exception 'no_autorizado'; end if;
  if v_cita.cobrada then raise exception 'cita_ya_cobrada'; end if;
  if p_metodo not in ('efectivo','datafono','online','bizum','mixto') then raise exception 'metodo_invalido'; end if;

  select precio, nombre into v_precio, v_nombre from public.servicios where id = v_cita.servicio_id;
  v_base_cents := coalesce(round(coalesce(v_precio, 0) * 100), 0);

  select coalesce(sum(importe_cents), 0) into v_senal_cents
  from public.pagos
  where cita_id = p_cita_id and tipo = 'senal' and estado in ('completado','pagado','succeeded','paid');

  -- Handle NULL array explicitly if it occurs
  if p_lineas_extra is null then
    p_lineas_extra := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_lineas_extra) = 'array' then
    SELECT coalesce(sum((e->>'precio_cents')::int * (e->>'cantidad')::int), 0)
    INTO v_extras_cents
    FROM jsonb_array_elements(p_lineas_extra) as e;
  else
    v_extras_cents := 0;
  end if;

  v_total_cents := greatest(0, v_base_cents + v_extras_cents - v_desc - coalesce(v_senal_cents, 0)) + v_prop;

  if p_metodo = 'mixto' then
    v_efe := greatest(0, coalesce(p_efectivo_cents, 0));
    v_dat := greatest(0, coalesce(p_datafono_cents, 0));
    if v_efe + v_dat <> v_total_cents then raise exception 'split_no_cuadra'; end if;
  else
    v_efe := case when p_metodo = 'efectivo' then v_total_cents else 0 end;
    v_dat := case when p_metodo = 'datafono' then v_total_cents else 0 end;
  end if;

  insert into public.cobros (
    negocio_id, cita_id, grupo_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents, metodo,
    efectivo_cents, datafono_cents, online_cents, origen, estado
  ) values (
    v_cita.negocio_id, v_cita.id, v_cita.grupo_id, v_cita.profesional_id, v_cita.cliente_id,
    v_total_cents, v_prop, v_desc, p_metodo,
    v_efe, v_dat, coalesce(v_senal_cents, 0), 'pos', 'completado'
  ) returning id into v_cobro_id;

  insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  values (v_cobro_id, 'servicio', v_cita.servicio_id, coalesce(v_nombre, 'Servicio'), v_base_cents, 1);

  if jsonb_typeof(p_lineas_extra) = 'array' and jsonb_array_length(p_lineas_extra) > 0 then
    for v_extra_line in select * from jsonb_array_elements(p_lineas_extra) loop
      insert into public.cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
      values (
        v_cobro_id,
        coalesce(v_extra_line->>'tipo', 'producto'),
        (case when v_extra_line->>'ref_id' = '' then null else (v_extra_line->>'ref_id')::uuid end),
        coalesce(v_extra_line->>'nombre', 'Extra'),
        (v_extra_line->>'precio_cents')::int,
        coalesce((v_extra_line->>'cantidad')::int, 1)
      );
    end loop;
  end if;

  -- 2F: enlace de trazabilidad producto-usado ↔ producto-cobrado (mejor esfuerzo;
  -- asigna una columna nullable, no puede romper el cobro).
  update public.cita_productos cp
  set cobro_linea_id = cl.id
  from public.cobro_lineas cl
  where cl.cobro_id = v_cobro_id
    and cl.tipo = 'producto'
    and cl.ref_id is not null
    and cp.cita_id = v_cita.id
    and cp.producto_id = cl.ref_id
    and cp.cobro_linea_id is null;

  update public.citas set cobrada = true, cobro_id = v_cobro_id where id = v_cita.id;

  return v_cobro_id;
end;
$function$;
