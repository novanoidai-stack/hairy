-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Sistema de Recompensas y Fidelización
-- Autor: Carlos + Claude (1 jul 2026)
--
-- Completa el sistema de fidelización con persistencia de recompensas, niveles y logros.
-- Reemplaza el cálculo en vivo por persistencia en BD.
--
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. TABLA DE RECOMPENSAS (configuración por negocio)
--    Premios canjeables por los clientes
-- ===============================================================================
create table if not exists recompensas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Información de la recompensa
  nombre text not null,
  descripcion text,

  -- Tipo y valor
  tipo text not null check (tipo in (
    'descuento_pct',  -- Porcentaje de descuento
    'descuento_eur',  -- Valor monetario directo
    'producto',       -- Producto físico
    'servicio'        -- Servicio gratis
  )),
  valor text not null, -- Según tipo: % (ej: "10"), EUR (ej: "15.00"), o texto

  -- Umbral para canjear
  umbral_visitas integer not null default 10, -- Visitas necesarias

  -- Caducidad (meses tras el umbral)
  expira_meses integer default 6, -- NULL = no expira

  -- Estado
  activo boolean not null default true,

  created_at timestamptz not null default now(),

  -- RLS
  constraint recompensas_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists recompensas_negocio on recompensas(negocio_id, umbral_visitas);
create index if not exists recompensas_activas on recompensas(negocio_id, activo) where activo = true;

-- Comentario
comment on table recompensas is 'Recompensas canjeables por clientes (configuración del negocio)';
comment on column recompensas.umbral_visitas is 'Número de visitas necesarias para canjear';
comment on column recompensas.expira_meses is 'Meses de validez tras alcanzar el umbral (0 = no expira)';

-- ===============================================================================
-- 2. TABLA DE RECOMPENSAS CANJEADAS (historial)
--    Registro de canjes de recompensas por cliente
-- ===============================================================================
create table if not exists recompensas_canjeadas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references clientes(id) on delete cascade,
  recompensa_id uuid not null references recompensas on delete cascade,

  -- Contexto del canje
  cita_id uuid references citas(id) on delete set null, -- Cita asociada
  canjeado_en timestamptz not null default now(),

  -- Estado de uso
  estado text not null default 'canjeado'
    check (estado in ('canjeado', 'usado', 'expirado', 'cancelado')),
  usado_en timestamptz,

  -- Detalles opcionales
  notas text,

  -- RLS
  constraint recompensas_canjeadas_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists recompensas_canjeadas_negocio on recompensas_canjeadas(negocio_id, cliente_id);
create index if not exists recompensas_canjeadas_recompensa on recompensas_canjeadas(recompensa_id);
create index if not exists recompensas_canjeadas_estado on recompensas_canjeadas(estado, canjeado_en);

-- Comentario
comment on table recompensas_canjeadas is 'Historial de canjes de recompensas por cliente';

-- ===============================================================================
-- 3. TABLA DE NIVELES DE FIDELIZACIÓN
--    Clasificación de clientes (Nuevo, Habitual, VIP...)
-- ===============================================================================
create table if not exists niveles_fidelizacion (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Identificación
  nombre text not null, -- 'Nuevo', 'Habitual', 'VIP', etc.
  orden smallint not null default 0, -- Orden visual

  -- Umbrales (OR lógico: cumple visitas O gastado)
  umbral_visitas integer default 0,
  umbral_gastado_cents integer default 0, -- En céntimos

  -- Visualización
  color text default '#6b7280', -- Hex color
  icono text default 'star',

  -- Activo
  activo boolean not null default true,

  created_at timestamptz not null default now(),

  -- RLS
  constraint niveles_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists niveles_negocio on niveles_fidelizacion(negocio_id, orden);
create index if not exists niveles_activos on niveles_fidelizacion(negocio_id, activo) where activo = true;

-- Comentario
comment on table niveles_fidelizacion is 'Niveles de fidelización (Nuevo, Habitual, VIP...)';

-- ===============================================================================
-- 4. TABLA DE LOGROS
--    Logros desbloqueables por clientes
-- ===============================================================================
create table if not exists logros (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Identificación
  nombre text not null,
  descripcion text,

  -- Tipo de logro
  tipo text not null check (tipo in (
    'primera_visita',  -- Primera cita completada
    'visitas_multiple', -- N visitas alcanzadas
    'gastado_total',    -- Importe acumulado
    'sin_noshow',       -- X meses sin inasistencias
    'servicio_fav',     -- Servicio específico repetido
    'antiguedad',       -- Cliente desde hace X meses
    'custom'            -- Custom por negocio
  )),

  -- Condición de desbloqueo (JSONB)
  condicion jsonb not null default '{}'::jsonb,
  -- ej: { "visitas": 10 }
  -- ej: { "gastado_cents": 50000 }
  -- ej: { "meses_sin_noshow": 6 }

  -- Visualización
  icono text default 'trophy',
  color text default '#fbbf24',

  -- Activo
  activo boolean not null default true,

  created_at timestamptz not null default now(),

  -- RLS
  constraint logros_negocio_check check (negocio_id is not null)
);

-- Índices
create index if not exists logros_negocio on logros(negocio_id, tipo);
create index if not exists logros_activos on logros(negocio_id, activo) where activo = true;

-- Comentario
comment on table logros is 'Logros desbloqueables por clientes (achievements)';

-- ===============================================================================
-- 5. TABLA DE LOGROS DESBLOQUEADOS
--    Registro de logros desbloqueados por cliente
-- ===============================================================================
create table if not exists logros_desbloqueados (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references clientes(id) on delete cascade,
  logro_id uuid not null references logros on delete cascade,

  -- Contexto del desbloqueo
  desbloqueado_en timestamptz not null default now(),
  detalles jsonb default '{}'::jsonb, -- Datos adicionales

  -- Único por cliente-logro
  constraint logro_unico unique (negocio_id, cliente_id, logro_id)
);

-- Índices
create index if not exists logros_desbloqueados_cliente on logros_desbloqueados(cliente_id, desbloqueado_en desc);
create index if not exists logros_desbloqueados_logro on logros_desbloqueados(logro_id);

-- Comentario
comment on table logros_desbloqueados is 'Registro de logros desbloqueados por clientes';

-- ===============================================================================
-- 6. RLS (Row Level Security)
-- ===============================================================================

-- Habilitar RLS
alter table recompensas enable row level security;
alter table recompensas_canjeadas enable row level security;
alter table niveles_fidelizacion enable row level security;
alter table logros enable row level security;
alter table logros_desbloqueados enable row level security;

-- Políticas para recompensas
drop policy if exists recompensas_negocio_all on recompensas;
create policy recompensas_negocio_all
  on recompensas for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para recompensas_canjeadas
drop policy if exists recompensas_canjeadas_negocio_all on recompensas_canjeadas;
create policy recompensas_canjeadas_negocio_all
  on recompensas_canjeadas for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para niveles_fidelizacion
drop policy if exists niveles_negocio_all on niveles_fidelizacion;
create policy niveles_negocio_all
  on niveles_fidelizacion for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para logros
drop policy if exists logros_negocio_all on logros;
create policy logros_negocio_all
  on logros for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- Políticas para logros_desbloqueados
drop policy if exists logros_desbloqueados_negocio_all on logros_desbloqueados;
create policy logros_desbloqueados_negocio_all
  on logros_desbloqueados for all
  to authenticated
  using (negocio_id = (select negocio_id from profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from profiles where id = auth.uid()));

-- ===============================================================================
-- 7. RPCs (Remote Procedure Calls)
-- ===============================================================================

-- -------------------------------------------------------------------------
-- RPC: obtener_recompensas_negocio
-- Lista recompensas configuradas del negocio
-- -------------------------------------------------------------------------
create or replace function obtener_recompensas_negocio(
  p_negocio_id text default null,
  p_solo_activas boolean default true
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

  -- Construir resultado
  select jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'nombre', r.nombre,
      'descripcion', r.descripcion,
      'tipo', r.tipo,
      'valor', r.valor,
      'umbral_visitas', r.umbral_visitas,
      'expira_meses', r.expira_meses,
      'activo', r.activo
    )
  ) into v_resultado
  from recompensas r
  where r.negocio_id = v_negocio_id
    and (not p_solo_activas or r.activo = true)
  order by r.umbral_visitas;

  return jsonb_build_object(
    'ok', true,
    'recompensas', coalesce(v_resultado, '[]'::jsonb)
  );
end;
$$;

-- Grant a authenticated
grant execute on function obtener_recompensas_negocio to authenticated;

-- Comentario
comment on function obtener_recompensas_negocio is 'Lista recompensas configuradas del negocio';

-- -------------------------------------------------------------------------
-- RPC: canjear_recompensa
-- Registra el canje de una recompensa por un cliente
-- -------------------------------------------------------------------------
create or replace function canjear_recompensa(
  p_recompensa_id uuid,
  p_cliente_id uuid,
  p_cita_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_recompensa recompensas%rowtype;
  v_visitas_cliente integer;
  v_puede_canjear boolean;
  v_nuevo_id uuid;
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

  -- Obtener recompensa
  select * into v_recompensa
  from recompensas
  where id = p_recompensa_id and negocio_id = v_negocio_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'Recompensa no encontrada'
    );
  end if;

  if not v_recompensa.activo then
    return jsonb_build_object(
      'ok', false,
      'error', 'Recompensa no activa'
    );
  end if;

  -- Obtener visitas del cliente (citas completadas)
  select count(*) into v_visitas_cliente
  from citas
  where cliente_id = p_cliente_id
    and negocio_id = v_negocio_id
    and estado = 'completada';

  -- Verificar si puede canjear (visitas >= umbral)
  v_puede_canjear := v_visitas_cliente >= v_recompensa.umbral_visitas;

  if not v_puede_canjear then
    return jsonb_build_object(
      'ok', false,
      'error', 'No tienes suficientes visitas',
      'visitas_actuales', v_visitas_cliente,
      'visitas_requeridas', v_recompensa.umbral_visitas
    );
  end if;

  -- Insertar canje
  insert into recompensas_canjeadas (
    negocio_id,
    cliente_id,
    recompensa_id,
    cita_id,
    canjeado_en,
    estado
  ) values (
    v_negocio_id,
    p_cliente_id,
    p_recompensa_id,
    p_cita_id,
    now(),
    'canjeado'
  )
  returning id into v_nuevo_id;

  return jsonb_build_object(
    'ok', true,
    'canje_id', v_nuevo_id,
    'recompensa', v_recompensa.nombre,
    'valor', v_recompensa.valor
  );
end;
$$;

-- Grant a authenticated
grant execute on function canjear_recompensa to authenticated;

-- Comentario
comment on function canjear_recompensa is 'Registra el canje de una recompensa por un cliente';

-- -------------------------------------------------------------------------
-- RPC: obtener_nivel_cliente
-- Calcula el nivel de fidelización de un cliente
-- -------------------------------------------------------------------------
create or replace function obtener_nivel_cliente(
  p_cliente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_visitas integer;
  v_gastado_cents integer;
  v_nivel niveles_fidelizacion%rowtype;
begin
  -- Obtener negocio_id del cliente
  select negocio_id into v_negocio_id
  from clientes
  where id = p_cliente_id;

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Cliente no encontrado'
    );
  end if;

  -- Obtener métricas del cliente
  select count(*) into v_visitas
  from citas
  where cliente_id = p_cliente_id
    and negocio_id = v_negocio_id
    and estado = 'completada';

  select coalesce(sum(precio_cobrado), 0) into v_gastado_cents
  from citas
  where cliente_id = p_cliente_id
    and negocio_id = v_negocio_id
    and estado = 'completada';

  -- Buscar nivel más alto que cumpla (visitas OR gastado)
  select * into v_nivel
  from niveles_fidelizacion
  where negocio_id = v_negocio_id
    and activo = true
    and (v_visitas >= umbral_visitas or v_gastado_cents >= umbral_gastado_cents)
  order by orden desc
  limit 1;

  if not found then
    -- Nivel por defecto (más bajo o crear uno genérico)
    return jsonb_build_object(
      'ok', true,
      'nivel', jsonb_build_object(
        'nombre', 'Nuevo',
        'color', '#9ca3af',
        'orden', 0
      ),
      'visitas', v_visitas,
      'gastado_cents', v_gastado_cents
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'nivel', jsonb_build_object(
      'id', v_nivel.id,
      'nombre', v_nivel.nombre,
      'color', v_nivel.color,
      'icono', v_nivel.icono,
      'orden', v_nivel.orden
    ),
    'visitas', v_visitas,
    'gastado_cents', v_gastado_cents
  );
end;
$$;

-- Grant a authenticated
grant execute on function obtener_nivel_cliente to authenticated;

-- Comentario
comment on function obtener_nivel_cliente is 'Calcula el nivel de fidelización de un cliente según visitas/gastado';

-- -------------------------------------------------------------------------
-- RPC: verificar_logros_cliente
-- Verifica y desbloquea logros automáticamente
-- -------------------------------------------------------------------------
create or replace function verificar_logros_cliente(
  p_cliente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_visitas integer;
  v_gastado_cents integer;
  v_logro record;
  v_cumple boolean;
  v_condicion jsonb;
  v_nuevo_id uuid;
  v_desbloqueados integer := 0;
begin
  -- Obtener negocio_id
  select negocio_id into v_negocio_id
  from clientes
  where id = p_cliente_id;

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Cliente no encontrado'
    );
  end if;

  -- Obtener métricas
  select count(*) into v_visitas
  from citas
  where cliente_id = p_cliente_id
    and negocio_id = v_negocio_id
    and estado = 'completada';

  select coalesce(sum(precio_cobrado), 0) into v_gastado_cents
  from citas
  where cliente_id = p_cliente_id
    and negocio_id = v_negocio_id
    and estado = 'completada';

  -- Para cada logro activo, verificar si cumple
  for v_logro in
    select * from logros
    where negocio_id = v_negocio_id and activo = true
  loop
    -- Verificar si ya está desbloqueado
    if exists (
      select 1 from logros_desbloqueados
      where cliente_id = p_cliente_id and logro_id = v_logro.id
    ) then
      continue; -- Ya desbloqueado, saltar
    end if;

    v_cumple := false;
    v_condicion := v_logro.condicion;

    -- Evaluar según tipo
    case v_logro.tipo
      when 'primera_visita' then
        v_cumple := v_visitas >= 1;

      when 'visitas_multiple' then
        v_cumple := v_visitas >= coalesce((v_condicion->>'visitas')::integer, 0);

      when 'gastado_total' then
        v_cumple := v_gastado_cents >= coalesce((v_condicion->>'gastado_cents')::integer, 0);

      when 'sin_noshow' then
        v_cumple := not exists (
          select 1 from citas
          where cliente_id = p_cliente_id
            and negocio_id = v_negocio_id
            and estado = 'no_show'
            and inicio >= now() - (coalesce((v_condicion->>'meses_sin_noshow')::integer, 6) || ' months')::interval
        );

      else
        v_cumple := false; -- Otros tipos requieren lógica custom
    end case;

    -- Si cumple, desbloquear
    if v_cumple then
      insert into logros_desbloqueados (
        negocio_id, cliente_id, logro_id, desbloqueado_en
      ) values (
        v_negocio_id, p_cliente_id, v_logro.id, now()
      )
      returning id into v_nuevo_id;

      v_desbloqueados := v_desbloqueados + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'desbloqueados', v_desbloqueados,
    'visitas', v_visitas,
    'gastado_cents', v_gastado_cents
  );
end;
$$;

-- Grant a authenticated
grant execute on function verificar_logros_cliente to authenticated;

-- Comentario
comment on function verificar_logros_cliente is 'Verifica y desbloquea logros automáticamente según métricas del cliente';

-- -------------------------------------------------------------------------
-- RPC: obtener_logros_desbloqueados
-- Lista logros desbloqueados de un cliente
-- -------------------------------------------------------------------------
create or replace function obtener_logros_desbloqueados(
  p_cliente_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio_id text;
  v_resultado jsonb;
begin
  -- Obtener negocio_id
  select negocio_id into v_negocio_id
  from clientes
  where id = p_cliente_id;

  if v_negocio_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Cliente no encontrado'
    );
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'logro_id', ld.logro_id,
      'logro_nombre', l.nombre,
      'logro_descripcion', l.descripcion,
      'logro_tipo', l.tipo,
      'logro_icono', l.icono,
      'logro_color', l.color,
      'desbloqueado_en', ld.desbloqueado_en
    )
  ) into v_resultado
  from logros_desbloqueados ld
  join logros l on l.id = ld.logro_id
  where ld.cliente_id = p_cliente_id and ld.negocio_id = v_negocio_id
  order by ld.desbloqueado_en desc;

  return jsonb_build_object(
    'ok', true,
    'logros', coalesce(v_resultado, '[]'::jsonb)
  );
end;
$$;

-- Grant a authenticated
grant execute on function obtener_logros_desbloqueados to authenticated;

-- Comentario
comment on function obtener_logros_desbloqueados is 'Lista logros desbloqueados de un cliente';
