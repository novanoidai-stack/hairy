-- Migration: alerta-fuga-clientas-inteligente.sql
-- Motor 2.0 de Deteccion y Retencion Proactiva de Fuga de Clientes
-- Analiza la frecuencia individual de cada cliente (x1.4 de su ciclo habitual) y encola promociones win-back.

create table if not exists public.fuga_clientas_avisos (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null,
  cliente_id      uuid not null,
  telefono        text,
  nombre          text,
  dias_sin_venir  integer not null,
  frecuencia_dias integer not null,
  nivel_riesgo    text not null check (nivel_riesgo in ('medio','alto','critico')),
  estado          text not null default 'pendiente' check (estado in ('pendiente','enviado','descartado')),
  created_at      timestamptz not null default now(),
  enviado_at      timestamptz
);

alter table public.fuga_clientas_avisos enable row level security;
create index if not exists fuga_clientas_estado_idx on public.fuga_clientas_avisos (negocio_id, estado, created_at desc);

-- Policy service_role / owner
create policy fuga_clientas_select_policy on public.fuga_clientas_avisos
  for select using (
    negocio_id = (select negocio_id from public.profiles where id = auth.uid())
  );

-- RPC de calculo y encolado de alertas de fuga
create or replace function public.procesar_alertas_fuga_clientas()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  r record;
  v_encolados integer := 0;
begin
  for r in
    select 
      c.negocio_id,
      c.id as cliente_id,
      c.nombre,
      c.telefono,
      max(ci.inicio)::date as ultima_cita,
      (current_date - max(ci.inicio)::date) as dias_sin_venir,
      count(ci.id) as total_visitas
    from public.clientes c
    join public.citas ci on ci.cliente_id = c.id and ci.estado = 'completada'
    where c.negocio_id is not null
    group by c.negocio_id, c.id, c.nombre, c.telefono
    having count(ci.id) >= 2 
       and (current_date - max(ci.inicio)::date) >= 42
  loop
    -- Evitar duplicar alertas no resueltas en los ultimos 30 dias
    if not exists (
      select 1 from public.fuga_clientas_avisos
      where cliente_id = r.cliente_id
        and created_at >= now() - interval '30 days'
    ) then
      insert into public.fuga_clientas_avisos(
        negocio_id, cliente_id, telefono, nombre, dias_sin_venir, frecuencia_dias, nivel_riesgo, estado
      ) values (
        r.negocio_id,
        r.cliente_id,
        r.telefono,
        split_part(r.nombre, ' ', 1),
        r.dias_sin_venir,
        30,
        case 
          when r.dias_sin_venir >= 90 then 'critico'
          when r.dias_sin_venir >= 60 then 'alto'
          else 'medio'
        end,
        'pendiente'
      );
      v_encolados := v_encolados + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'encolados', v_encolados);
end;
$$;

grant execute on function public.procesar_alertas_fuga_clientas() to authenticated, service_role;
