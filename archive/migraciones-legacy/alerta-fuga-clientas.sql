-- =====================================================================
-- Mecha · Alerta de fuga de clientas
-- =====================================================================
-- Rellena las columnas ya existentes clientes.total_visitas/ultima_visita/
-- frecuencia_dias (hoy muertas: nadie las escribe) y detecta clientas en
-- riesgo de fuga. Motor cron-pull (mismo patron que lista_espera_matching.sql),
-- OFF por defecto via negocio_config.config.fugaClientasActivo.
-- Diseño: docs/superpowers/specs/2026-07-02-alerta-fuga-clientas-design.md
-- =====================================================================

create table if not exists public.fuga_clientas_avisos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  dias_desde_ultima_visita int not null,
  frecuencia_dias int not null,
  recompensa_sugerida_id uuid references public.recompensas(id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  created_at timestamptz not null default now(),
  enviado_at timestamptz
);

create index if not exists idx_fuga_clientas_avisos_negocio_estado
  on public.fuga_clientas_avisos(negocio_id, estado);

alter table public.fuga_clientas_avisos enable row level security;

drop policy if exists fuga_avisos_select_own_negocio on public.fuga_clientas_avisos;
create policy fuga_avisos_select_own_negocio on public.fuga_clientas_avisos
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- Sin policy de INSERT/UPDATE/DELETE para authenticated/anon: solo la
-- funcion service_role (motor) toca esta tabla.

-- ---------------------------------------------------------------------
-- Motor: recalcula agregados + detecta riesgo + gestiona outbox
-- ---------------------------------------------------------------------
create or replace function public.procesar_alertas_fuga()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_procesados int := 0;
  v_avisos_creados int := 0;
  v_avisos_descartados int := 0;
begin
  -- A. Recalcular agregados para clientes con >=3 citas completadas
  with gaps as (
    select
      c.cliente_id,
      c.inicio,
      c.inicio - lag(c.inicio) over (partition by c.cliente_id order by c.inicio) as gap,
      row_number() over (partition by c.cliente_id order by c.inicio desc) as rn_desc
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
  ),
  ultimas_6 as (
    select cliente_id, gap
    from gaps
    where gap is not null and rn_desc <= 6
  ),
  agregados as (
    select
      c.cliente_id,
      count(*) as total_visitas,
      max(c.inicio) as ultima_visita,
      (select round(avg(extract(epoch from u6.gap) / 86400))::int
         from ultimas_6 u6 where u6.cliente_id = c.cliente_id) as frecuencia_dias
    from public.citas c
    where c.estado = 'completada' and c.cliente_id is not null
    group by c.cliente_id
    having count(*) >= 3
  )
  update public.clientes cl
  set total_visitas = a.total_visitas,
      ultima_visita = a.ultima_visita::date,
      frecuencia_dias = a.frecuencia_dias
  from agregados a
  where cl.id = a.cliente_id
    and (cl.total_visitas is distinct from a.total_visitas
      or cl.ultima_visita is distinct from a.ultima_visita::date
      or cl.frecuencia_dias is distinct from a.frecuencia_dias);
  get diagnostics v_procesados = row_count;

  -- B + C. Detectar riesgo y gestionar outbox (insert + descarte) en una sola
  -- sentencia (las CTEs no cruzan sentencias distintas), solo negocios con el
  -- toggle activo. El recalculo de agregados de arriba corre siempre.
  with en_riesgo as (
    select
      cl.id as cliente_id,
      cl.negocio_id,
      (current_date - cl.ultima_visita) as dias_desde_ultima_visita,
      cl.frecuencia_dias,
      cl.total_visitas
    from public.clientes cl
    join public.negocio_config nc on nc.negocio_id = cl.negocio_id
    where coalesce((nc.config->>'fugaClientasActivo')::boolean, false) = true
      and cl.bloqueado = false
      and cl.frecuencia_dias is not null
      and cl.ultima_visita is not null
      and (current_date - cl.ultima_visita) > (cl.frecuencia_dias * 1.4)
      and not exists (
        select 1 from public.citas fc
        where fc.cliente_id = cl.id
          and fc.estado <> 'cancelada'
          and fc.inicio > now()
      )
  ),
  nuevos as (
    select er.*
    from en_riesgo er
    where not exists (
      select 1 from public.fuga_clientas_avisos fa
      where fa.cliente_id = er.cliente_id and fa.estado = 'pendiente'
    )
  ),
  insertados as (
    insert into public.fuga_clientas_avisos
      (negocio_id, cliente_id, dias_desde_ultima_visita, frecuencia_dias, recompensa_sugerida_id)
    select
      n.negocio_id, n.cliente_id, n.dias_desde_ultima_visita, n.frecuencia_dias,
      (
        select r.id from public.recompensas r
        where r.negocio_id = n.negocio_id and r.activo = true
          and r.umbral_visitas <= n.total_visitas
        order by r.umbral_visitas desc
        limit 1
      )
    from nuevos n
    returning 1
  ),
  descartados as (
    -- Clientas con aviso pendiente que ya dejaron de estar en riesgo (p.ej.
    -- reservaron antes de que saliera el WhatsApp): no tiene sentido avisarlas.
    update public.fuga_clientas_avisos fa
    set estado = 'descartado'
    where fa.estado = 'pendiente'
      and not exists (select 1 from en_riesgo er where er.cliente_id = fa.cliente_id)
    returning 1
  )
  select
    (select count(*) from insertados),
    (select count(*) from descartados)
  into v_avisos_creados, v_avisos_descartados;

  return jsonb_build_object(
    'clientes_actualizados', v_procesados,
    'avisos_creados', v_avisos_creados,
    'avisos_descartados', v_avisos_descartados
  );
end;
$$;

revoke all on function public.procesar_alertas_fuga() from public, anon, authenticated;
grant execute on function public.procesar_alertas_fuga() to service_role;

-- ---------------------------------------------------------------------
-- RPC de lectura para el frontend (Clientes + Avisos). security definer para
-- no repetir el join de 4 tablas por RLS en cada fila; gateada internamente
-- por auth.uid(), igual que el resto de RPCs "obtener_*" del proyecto.
-- ---------------------------------------------------------------------
create or replace function public.clientes_en_riesgo_fuga()
returns table(
  cliente_id uuid,
  nombre text,
  dias_desde_ultima_visita int,
  frecuencia_dias int,
  recompensa_sugerida_id uuid,
  recompensa_nombre text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cl.id as cliente_id,
    cl.nombre as nombre,
    (current_date - cl.ultima_visita)::int as dias_desde_ultima_visita,
    cl.frecuencia_dias as frecuencia_dias,
    fa.recompensa_sugerida_id as recompensa_sugerida_id,
    r.nombre as recompensa_nombre
  from public.clientes cl
  join public.profiles p on p.negocio_id = cl.negocio_id
  left join public.fuga_clientas_avisos fa
    on fa.cliente_id = cl.id and fa.estado = 'pendiente'
  left join public.recompensas r on r.id = fa.recompensa_sugerida_id
  where p.id = auth.uid()
    and cl.bloqueado = false
    and cl.frecuencia_dias is not null
    and cl.ultima_visita is not null
    and (current_date - cl.ultima_visita) > (cl.frecuencia_dias * 1.4)
    and not exists (
      select 1 from public.citas fc
      where fc.cliente_id = cl.id and fc.estado <> 'cancelada' and fc.inicio > now()
    )
  order by dias_desde_ultima_visita desc;
$$;

revoke all on function public.clientes_en_riesgo_fuga() from public, anon;
grant execute on function public.clientes_en_riesgo_fuga() to authenticated;
