-- ===========================================================================
-- Migración: Pruebas de alergia 48h (Reglamento CE 1223/2009 y Seguro RC)
-- Spec 5
-- ===========================================================================

create table if not exists public.pruebas_alergia (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  solicitada_at  timestamptz not null default now(),
  realizada_at   timestamptz,
  resultado      text check (resultado in ('negativa', 'positiva', 'no_concluyente')),
  producto_id    uuid references public.productos(id),
  profesional_id uuid references public.profesionales(id),
  nota           text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_pruebas_alergia_cliente on public.pruebas_alergia (negocio_id, cliente_id);
create index if not exists idx_pruebas_alergia_resultado on public.pruebas_alergia (negocio_id, resultado);

-- RLS
alter table public.pruebas_alergia enable row level security;

drop policy if exists pruebas_alergia_tenant_select on public.pruebas_alergia;
create policy pruebas_alergia_tenant_select on public.pruebas_alergia
  for select
  using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists pruebas_alergia_tenant_all on public.pruebas_alergia;
create policy pruebas_alergia_tenant_all on public.pruebas_alergia
  for all
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- RPC para agendar prueba de alergia 48h antes de un servicio técnico
create or replace function public.agendar_prueba_alergia_48h(
  p_cliente_id uuid,
  p_inicio_color timestamptz,
  p_profesional_id uuid default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_inicio_prueba timestamptz;
  v_fin_prueba timestamptz;
  v_prueba_id uuid;
  v_cita_id uuid;
  v_srv_id uuid;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Calcular 48 horas antes
  v_inicio_prueba := p_inicio_color - interval '48 hours';
  v_fin_prueba := v_inicio_prueba + interval '15 minutes';

  -- Buscar servicio de prueba de alergia o consulta de diagnóstico si existe
  select id into v_srv_id
  from public.servicios
  where negocio_id = v_negocio
    and (lower(nombre) like '%alergia%' or lower(nombre) like '%diagnostico%' or lower(nombre) like '%mechón%')
  limit 1;

  -- Si no existe un servicio específico, usar el primer servicio activo
  if v_srv_id is null then
    select id into v_srv_id
    from public.servicios
    where negocio_id = v_negocio and activo = true
    limit 1;
  end if;

  -- Registrar la prueba de alergia
  insert into public.pruebas_alergia (
    negocio_id,
    cliente_id,
    solicitada_at,
    profesional_id,
    nota
  ) values (
    v_negocio,
    p_cliente_id,
    now(),
    p_profesional_id,
    coalesce(p_nota, 'Prueba de alergia preventiva 48h antes de coloración')
  )
  returning id into v_prueba_id;

  -- Crear la cita correspondiente en agenda si hay servicio disponible
  if v_srv_id is not null then
    insert into public.citas (
      negocio_id,
      cliente_id,
      servicio_id,
      profesional_id,
      inicio,
      fin,
      estado,
      notas
    ) values (
      v_negocio,
      p_cliente_id,
      v_srv_id,
      p_profesional_id,
      v_inicio_prueba,
      v_fin_prueba,
      'confirmada',
      '⚠️ Test de alergia / mechón 48h previo a servicio de coloración'
    )
    returning id into v_cita_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'prueba_id', v_prueba_id,
    'cita_id', v_cita_id,
    'inicio_prueba', v_inicio_prueba
  );
end;
$$;

grant execute on function public.agendar_prueba_alergia_48h(uuid, timestamptz, uuid, text) to authenticated, service_role;
