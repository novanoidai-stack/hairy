-- ===========================================================================
-- Migración: Gramajes en inventario, vinculación de fórmulas y merma
-- Fecha: 2026-08-30 14:00:00
-- Specs 2 y 3
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SPEC 2: GRAMAJES FRACCIONADOS Y ENVASES ABIERTOS EN INVENTARIO
-- ───────────────────────────────────────────────────────────────────────────

alter table public.inventario add column if not exists cantidad_base numeric(12,3);
alter table public.inventario add column if not exists envases_cerrados integer default 0;
alter table public.inventario add column if not exists abierto_restante numeric(10,2);
alter table public.movimientos_inventario add column if not exists cantidad_base numeric(12,3);
alter table public.cita_consumos alter column cantidad type numeric(10,2);

-- Inicializar envases_cerrados a partir de unidades existentes
update public.inventario
set envases_cerrados = coalesce(unidades, 0),
    abierto_restante = 0,
    cantidad_base = coalesce(unidades, 0) * coalesce((select capacidad_envase from public.productos p where p.id = inventario.producto_id), 1)
where cantidad_base is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SPEC 3: VINCULACIÓN DE TONO Y MARCA DE FÓRMULA CON PRODUCTOS
-- ───────────────────────────────────────────────────────────────────────────

alter table public.productos add column if not exists tono text;
alter table public.productos add column if not exists marca text;

create index if not exists idx_productos_marca_tono on public.productos (negocio_id, marca, tono)
where tono is not null and marca is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. MOTOR DE DESCUENTO DE FÓRMULAS CON MERMA Y CONTROL DE ENVASES
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.descontar_consumo_formula(
  p_cita_id uuid,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_linea jsonb;
  v_prod_id uuid;
  v_gramos numeric(10,2);
  v_merma_pct numeric(5,2) := 8.0;
  v_gramos_reales numeric(10,2);
  v_capacidad int;
  v_coste_envase int;
  v_coste_micros bigint;
  v_inv record;
  v_restante numeric(10,2);
  v_cerrados int;
  v_descontados_total int := 0;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Obtener merma configurada del salón si existe
  select coalesce((c.config->>'merma_pct')::numeric, 8.0)
    into v_merma_pct
  from public.negocio_config c
  where c.negocio_id = v_negocio;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_prod_id := (v_linea->>'producto_id')::uuid;
    v_gramos := coalesce((v_linea->>'gramos')::numeric, 0);

    -- Si no viene producto_id pero viene tono, resolver contra productos
    if v_prod_id is null and v_linea->>'tono' is not null then
      select id into v_prod_id
      from public.productos
      where negocio_id = v_negocio
        and lower(trim(tono)) = lower(trim(v_linea->>'tono'))
        and (v_linea->>'marca' is null or lower(trim(marca)) = lower(trim(v_linea->>'marca')))
        and activo = true
      limit 1;
    end if;

    if v_gramos > 0 and v_prod_id is not null then
      v_gramos_reales := round(v_gramos * (1 + (v_merma_pct / 100.0)), 2);

      select capacidad_envase, coste_envase_cents
        into v_capacidad, v_coste_envase
      from public.productos
      where id = v_prod_id and negocio_id = v_negocio;

      if v_capacidad > 0 and v_coste_envase > 0 then
        v_coste_micros := round((v_coste_envase::numeric * 10000.0 / v_capacidad::numeric) * v_gramos_reales)::bigint;
      else
        v_coste_micros := 0;
      end if;

      insert into public.cita_consumos (
        negocio_id, cita_id, producto_id, cantidad, coste_micros, creado_por
      ) values (
        v_negocio, p_cita_id, v_prod_id, v_gramos_reales, v_coste_micros, v_uid
      );

      select * into v_inv from public.inventario
      where negocio_id = v_negocio and producto_id = v_prod_id
      for update;

      if found then
        v_capacidad := coalesce(v_capacidad, 60);
        v_restante := coalesce(v_inv.abierto_restante, 0);
        v_cerrados := coalesce(v_inv.envases_cerrados, v_inv.unidades, 0);

        if v_restante >= v_gramos_reales then
          v_restante := v_restante - v_gramos_reales;
        else
          v_gramos_reales := v_gramos_reales - v_restante;
          while v_gramos_reales > 0 and v_cerrados > 0 loop
            v_cerrados := v_cerrados - 1;
            v_restante := v_capacidad;
            if v_restante >= v_gramos_reales then
              v_restante := v_restante - v_gramos_reales;
              v_gramos_reales := 0;
            else
              v_gramos_reales := v_gramos_reales - v_restante;
              v_restante := 0;
            end if;
          end loop;
          if v_gramos_reales > 0 then
            v_restante := v_restante - v_gramos_reales;
          end if;
        end if;

        update public.inventario set
          abierto_restante = v_restante,
          envases_cerrados = v_cerrados,
          unidades = v_cerrados + (case when v_restante > 0 then 1 else 0 end),
          cantidad_base = (v_cerrados * v_capacidad) + v_restante,
          ultima_modificacion = now(),
          modificado_por = v_uid
        where id = v_inv.id;
      end if;

      v_descontados_total := v_descontados_total + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'descontados', v_descontados_total
  );
end;
$$;

grant execute on function public.descontar_consumo_formula(uuid, jsonb) to authenticated, service_role;
