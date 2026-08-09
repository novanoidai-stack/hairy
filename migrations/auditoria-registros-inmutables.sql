-- Migration: auditoria-registros-inmutables.sql
-- Tabla inmutable y RPCs de auditoria unificada (retencion 3 a 8 años)

create table if not exists public.auditoria_registros (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null,
  usuario_id   uuid,
  usuario_nombre text,
  modulo       text not null check (modulo in ('fichajes','caja','citas','equipo','configuracion','clientes','facturacion')),
  tipo_evento  text not null,
  detalles     jsonb default '{}'::jsonb,
  ip_origen    text,
  created_at   timestamptz not null default now()
);

alter table public.auditoria_registros enable row level security;

create index if not exists auditoria_negocio_created_idx on public.auditoria_registros (negocio_id, created_at desc);
create index if not exists auditoria_modulo_idx on public.auditoria_registros (negocio_id, modulo, created_at desc);

-- RLS
create policy auditoria_select_policy on public.auditoria_registros
  for select using (
    negocio_id = (select negocio_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('owner','admin','direccion')
  );

-- RPC para registrar evento
create or replace function public.registrar_evento_auditoria(
  p_modulo text,
  p_tipo_evento text,
  p_detalles jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_neg text;
  v_uid uuid;
  v_nom text;
begin
  v_uid := auth.uid();
  select negocio_id, nombre into v_neg, v_nom from public.profiles where id = v_uid;
  if v_neg is null then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  insert into public.auditoria_registros(negocio_id, usuario_id, usuario_nombre, modulo, tipo_evento, detalles)
    values (v_neg, v_uid, coalesce(v_nom, 'Usuario'), p_modulo, p_tipo_evento, coalesce(p_detalles, '{}'::jsonb));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.registrar_evento_auditoria(text, text, jsonb) to authenticated;

-- RPC para consultar auditoria historica ultra-rapida (hasta 8 años atrás)
create or replace function public.obtener_auditoria_historica(
  p_desde date default null,
  p_hasta date default null,
  p_modulo text default null,
  p_limit integer default 500
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_neg text;
  v_role text;
  v_res jsonb;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'usuario_nombre', usuario_nombre,
    'modulo', modulo,
    'tipo_evento', tipo_evento,
    'detalles', detalles,
    'created_at', created_at
  )), '[]'::jsonb) into v_res
  from (
    select * from public.auditoria_registros
    where negocio_id = v_neg
      and (p_desde is null or created_at::date >= p_desde)
      and (p_hasta is null or created_at::date <= p_hasta)
      and (p_modulo is null or modulo = p_modulo)
    order by created_at desc
    limit greatest(p_limit, 1)
  ) q;

  return jsonb_build_object('ok', true, 'registros', v_res);
end;
$$;

grant execute on function public.obtener_auditoria_historica(date, date, text, integer) to authenticated;
