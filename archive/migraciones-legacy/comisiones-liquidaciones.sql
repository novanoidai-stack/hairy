-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Sistema de Comisiones y Liquidaciones
-- Autor: Carlos + Claude (1 jul 2026)
--
-- Completa el sistema de comisiones con persistencia y liquidaciones mensuales.
-- Añade modelos avanzados: porcentaje por categoría, tramos.
--
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. TABLA DE LIQUIDACIONES DE COMISIONES
--    Persiste el cálculo de comisiones por profesional y periodo
-- ===============================================================================
create table if not exists comisiones (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Profesional (profile_id)
  profesional_id uuid not null references profiles(id) on delete cascade,

  -- Periodo de liquidación
  periodo_inicio timestamptz not null,
  periodo_fin timestamptz not null,

  -- Base de cálculo (en céntimos para evitar floating point)
  base_calculo_cents integer not null default 0,

  -- Configuración aplicada (snapshot para auditoría)
  porcentaje_aplicado numeric(5,2) not null,  -- ej: 15.00 = 15%
  comision_base text not null,                -- 'neto' | 'bruto'
  incluir_addons boolean not null default true,
  incluir_propinas boolean not null default false,

  -- Resultado
  importe_comision_cents integer not null,    -- comisión calculada

  -- Estado
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'pagada', 'anulada')),

  -- Timestamps
  created_at timestamptz not null default now(),
  pagada_en timestamptz,

  -- Detalle JSONB (desglose de servicios, addons, etc.)
  detalles jsonb default '{}'::jsonb,

  -- RLS
  constraint comisiones_negocio_check check (negocio_id is not null),
  constraint comisiones_periodo_unico unique (negocio_id, profesional_id, periodo_inicio, periodo_fin)
);

-- Índices
create index if not exists comisiones_negocio_profesional on comisiones(negocio_id, profesional_id, periodo_fin desc);
create index if not exists comisiones_estado on comisiones(negocio_id, estado, created_at desc);

-- Comentario
comment on table comisiones is 'Liquidaciones de comisiones por profesional y periodo';
comment on column comisiones.base_calculo_cents is 'Base sobre la que se calcula la comisión (según config: neto/bruto, addons, propinas)';
comment on column comisiones.detalles is 'Desglose JSON de servicios, addons, propinas, descuentos';

-- ===============================================================================
-- 2. TABLA DE TRAMOS DE COMISIÓN (por negocio)
--    Modelos de comisión por tramos de facturación
-- ===============================================================================
create table if not exists comisiones_tramos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Nivel del tramo (orden de aplicación)
  nivel smallint not null,

  -- Umbrales (en céntimos)
  umbral_min_cents integer not null default 0,
  umbral_max_cents integer,                      -- null = sin límite

  -- Porcentaje para este tramo
  porcentaje numeric(5,2) not null,

  -- Activo
  activo boolean not null default true,

  created_at timestamptz not null default now(),

  -- RLS
  constraint comisiones_tramos_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists comisiones_tramos_negocio on comisiones_tramos(negocio_id, nivel);
create index if not exists comisiones_tramos_activos on comisiones_tramos(negocio_id, activo) where activo = true;

-- Comentario
comment on table comisiones_tramos is 'Tramos de comisión por volumen de facturación (ej: 0-1000€ 10%, 1000-2000€ 15%)';

-- ===============================================================================
-- 3. TABLA DE COMISIONES POR CATEGORÍA DE SERVICIO
--    Porcentajes diferentes según categoría (corte, color, tratamiento...)
-- ===============================================================================
create table if not exists comisiones_por_categoria (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Categoría de servicio (referencia a categorías de servicios)
  categoria_id text not null,

  -- Porcentaje para esta categoría
  porcentaje numeric(5,2) not null,

  -- Activo
  activo boolean not null default true,

  created_at timestamptz not null default now(),

  -- RLS
  constraint comisiones_cat_negocio_check check (negocio_id is not null),
  constraint comisiones_cat_unico unique (negocio_id, categoria_id)
);

-- Índices
create index if not exists comisiones_cat_negocio on comisiones_por_categoria(negocio_id, categoria_id);
create index if not exists comisiones_cat_activos on comisiones_por_categoria(negocio_id, activo) where activo = true;

-- Comentario
comment on table comisiones_por_categoria is 'Porcentajes de comisión específicos por categoría de servicio';

-- ===============================================================================
-- 4. RLS (Row Level Security)
-- ===============================================================================

-- Habilitar RLS
alter table comisiones enable row level security;
alter table comisiones_tramos enable row level security;
alter table comisiones_por_categoria enable row level security;

-- Políticas para comisiones
drop policy if exists comisiones_negocio_all on comisiones;
create policy comisiones_negocio_all
  on comisiones for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para comisiones_tramos
drop policy if exists comisiones_tramos_negocio_all on comisiones_tramos;
create policy comisiones_tramos_negocio_all
  on comisiones_tramos for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para comisiones_por_categoria
drop policy if exists comisiones_cat_negocio_all on comisiones_por_categoria;
create policy comisiones_cat_negocio_all
  on comisiones_por_categoria for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- ===============================================================================
-- 5. RPCs (Remote Procedure Calls)
-- ===============================================================================

-- -------------------------------------------------------------------------
-- RPC: calcular_comisiones_periodo
-- Calcula la comisión de un profesional para un periodo
-- -------------------------------------------------------------------------
create or replace function calcular_comisiones_periodo(
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
  v_propinas_cents integer;
  v_detalle jsonb;
  v_profesional_nombre text;
begin
  -- Obtener negocio_id del profesional
  select negocio_id into v_negocio_id
  from profiles
  where id = p_profesional_id;

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Profesional no encontrado'
    );
  end if;

  -- Obtener configuración de comisiones del negocio
  select config into v_config
  from negocio_config
  where negocio_id = v_negocio_id;

  -- Valores default si no hay config
  v_porcentaje_def := coalesce((v_config->>'comisionBase')::numeric, 15.00);
  v_comision_base := coalesce(v_config->>'comisionBaseImporte', 'neto');
  v_incluir_addons := coalesce((v_config->>'comisionAddons')::boolean, true);
  v_incluir_propinas := coalesce((v_config->>'comisionPropinas')::boolean, false);

  -- Obtener porcentaje individual del profesional (si existe)
  select coalesce(comision_pct, v_porcentaje_def) into v_porcentaje_def
  from profesionales
  where profile_id = p_profesional_id and negocio_id = v_negocio_id;

  -- Obtener nombre del profesional
  select concat(nombre, ' ', apellidos) into v_profesional_nombre
  from profiles
  where id = p_profesional_id;

  -- Calcular base: sumar cobros del profesional en el periodo
  select
    coalesce(sum(
      case
        when estado = 'completado' then
          total_cents - descuento_cents -
          case when v_comision_base = 'neto' then trunc((total_cents - descuento_cents) / 1.21) else 0 end
        else 0
      end
    ), 0) into v_base_cents
  from cobros
  where profesional_id = p_profesional_id::text
    and cobrado_at >= p_desde
    and cobrado_at <= p_hasta
    and estado = 'completado';

  -- Si no incluye addons, restar líneas tipo 'suplemento'
  if not v_incluir_addons then
    select coalesce(sum(precio_cents * cantidad), 0) into v_addons_cents
    from cobro_lineas cl
    join cobros c on c.id = cl.cobro_id
    where c.profesional_id = p_profesional_id::text
      and c.cobrado_at >= p_desde
      and c.cobrado_at <= p_hasta
      and c.estado = 'completado'
      and cl.tipo = 'suplemento';

    v_base_cents := v_base_cents - coalesce(v_addons_cents, 0);
  end if;

  -- Si incluye propinas, sumarlas
  if v_incluir_propinas then
    select coalesce(sum(propina_cents), 0) into v_propinas_cents
    from cobros
    where profesional_id = p_profesional_id::text
      and cobrado_at >= p_desde
      and cobrado_at <= p_hasta
      and estado = 'completado';

    v_base_cents := v_base_cents + coalesce(v_propinas_cents, 0);
  end if;

  -- Calcular comisión
  v_comision_cents := trunc(v_base_cents * v_porcentaje_def / 100);

  -- Construir detalle
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
    'num_cobros', (
      select count(*)
      from cobros
      where profesional_id = p_profesional_id::text
        and cobrado_at >= p_desde
        and cobrado_at <= p_hasta
        and estado = 'completado'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'resultado', v_detalle
  );
end;
$$;

-- Grant a authenticated
grant execute on function calcular_comisiones_periodo to authenticated;

-- Comentario
comment on function calcular_comisiones_periodo is 'Calcula la comisión de un profesional para un periodo según la configuración del negocio';

-- -------------------------------------------------------------------------
-- RPC: generar_liquidacion
-- Persiste una liquidación de comisión
-- -------------------------------------------------------------------------
create or replace function generar_liquidacion(
  p_profesional_id uuid,
  p_periodo_inicio timestamptz,
  p_periodo_fin timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calculo jsonb;
  v_resultado jsonb;
  v_negocio_id text;
  v_liquidacion_id uuid;
begin
  -- Obtener negocio_id
  select negocio_id into v_negocio_id
  from profiles
  where id = p_profesional_id;

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Profesional no encontrado'
    );
  end if;

  -- Calcular comisión
  select calcular_comisiones_periodo(p_profesional_id, p_periodo_inicio, p_periodo_fin)
  into v_calculo;

  if not (v_calculo->>'ok')::boolean then
    return v_calculo;
  end if;

  -- Verificar si ya existe liquidación para este periodo
  if exists (
    select 1 from comisiones
    where profesional_id = p_profesional_id
      and periodo_inicio = p_periodo_inicio
      and periodo_fin = p_periodo_fin
      and estado != 'anulada'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'Ya existe una liquidación para este periodo'
    );
  end if;

  -- Persistir liquidación
  insert into comisiones (
    negocio_id,
    profesional_id,
    periodo_inicio,
    periodo_fin,
    base_calculo_cents,
    porcentaje_aplicado,
    comision_base,
    incluir_addons,
    incluir_propinas,
    importe_comision_cents,
    estado,
    detalles
  ) values (
    v_negocio_id,
    p_profesional_id,
    p_periodo_inicio,
    p_periodo_fin,
    (v_calculo#>'{resultado,base_cents}')::integer,
    (v_calculo#>'{resultado,porcentaje_aplicado}')::numeric,
    v_calculo#>'{resultado,comision_base}',
    (v_calculo#>'{resultado,incluir_addons}')::boolean,
    (v_calculo#>'{resultado,incluir_propinas}')::boolean,
    (v_calculo#>'{resultado,comision_cents}')::integer,
    'pendiente',
    v_calculo->'resultado'
  )
  returning id into v_liquidacion_id;

  return jsonb_build_object(
    'ok', true,
    'liquidacion_id', v_liquidacion_id,
    'importe', (v_calculo#>'{resultado,comision_cents}')::integer,
    'calculo', v_calculo->'resultado'
  );
end;
$$;

-- Grant a authenticated
grant execute on function generar_liquidacion to authenticated;

-- Comentario
comment on function generar_liquidacion is 'Genera y persiste una liquidación de comisión para un profesional y periodo';

-- -------------------------------------------------------------------------
-- RPC: obtener_liquidaciones
-- Lista liquidaciones filtradas
-- -------------------------------------------------------------------------
create or replace function obtener_liquidaciones(
  p_negocio_id text default null,
  p_profesional_id uuid default null,
  p_estado text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Obtener negocio_id del usuario actual
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Si se pasa p_negocio_id, verificar que coincide
  if p_negocio_id is not null and p_negocio_id != v_negocio_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'Negocio no coincide'
    );
  end if;

  -- Construir query dinámico
  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'profesional_id', c.profesional_id,
      'profesional_nombre', p.nombre,
      'periodo_inicio', c.periodo_inicio,
      'periodo_fin', c.periodo_fin,
      'base_calculo_cents', c.base_calculo_cents,
      'porcentaje_aplicado', c.porcentaje_aplicado,
      'importe_comision_cents', c.importe_comision_cents,
      'estado', c.estado,
      'created_at', c.created_at,
      'pagada_en', c.pagada_en
    )
  ) into v_resultado
  from comisiones c
  join profiles p on p.id = c.profesional_id
  where c.negocio_id = v_negocio_id
    and (p_profesional_id is null or c.profesional_id = p_profesional_id)
    and (p_estado is null or c.estado = p_estado)
  order by c.periodo_fin desc, c.created_at desc;

  return jsonb_build_object(
    'ok', true,
    'liquidaciones', coalesce(v_resultado, '[]'::jsonb)
  );
end;
$$;

-- Grant a authenticated
grant execute on function obtener_liquidaciones to authenticated;

-- Comentario
comment on function obtener_liquidaciones is 'Lista liquidaciones filtradas por negocio, profesional y/o estado';

-- -------------------------------------------------------------------------
-- RPC: marcar_liquidacion_pagada
-- Marca una liquidación como pagada
-- -------------------------------------------------------------------------
create or replace function marcar_liquidacion_pagada(
  p_liquidacion_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_estado_actual text;
begin
  -- Obtener negocio_id del usuario actual
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Obtener estado actual
  select estado into v_estado_actual
  from comisiones
  where id = p_liquidacion_id and negocio_id = v_negocio_id;

  if v_estado_actual is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Liquidación no encontrada'
    );
  end if;

  if v_estado_actual = 'pagada' then
    return jsonb_build_object(
      'ok', false,
      'error', 'Liquidación ya está pagada'
    );
  end if;

  -- Actualizar
  update comisiones
  set estado = 'pagada',
      pagada_en = now()
  where id = p_liquidacion_id
    and negocio_id = v_negocio_id;

  return jsonb_build_object(
    'ok', true,
    'liquidacion_id', p_liquidacion_id,
    'pagada_en', now()
  );
end;
$$;

-- Grant a authenticated
grant execute on function marcar_liquidacion_pagada to authenticated;

-- Comentario
comment on function marcar_liquidacion_pagada is 'Marca una liquidación como pagada y registra la fecha';

-- -------------------------------------------------------------------------
-- RPC: anular_liquidacion
-- Anula una liquidación (permite regenerarla)
-- -------------------------------------------------------------------------
create or replace function anular_liquidacion(
  p_liquidacion_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
begin
  -- Obtener negocio_id del usuario actual
  select negocio_id into v_negocio_id
  from profiles
  where id = auth.uid();

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Usuario no válido'
    );
  end if;

  -- Actualizar
  update comisiones
  set estado = 'anulada'
  where id = p_liquidacion_id
    and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Liquidación no encontrada'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'liquidacion_id', p_liquidacion_id
  );
end;
$$;

-- Grant a authenticated
grant execute on function anular_liquidacion to authenticated;

-- Comentario
comment on function anular_liquidacion is 'Anula una liquidación (permite regenerarla para el mismo periodo)';
