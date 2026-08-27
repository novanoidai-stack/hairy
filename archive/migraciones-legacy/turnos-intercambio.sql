-- =====================================================================
-- Mecha · Intercambio de turnos entre compañeros
-- =====================================================================
-- Un profesional (A) pide cambiar su dia X con el dia Y de otro (B). Flujo:
--   pendiente_companero -> B acepta -> pendiente_gestor -> gestor aprueba
--   (o rechaza en cualquier paso). El sistema NO reasigna citas automaticamente
--   (los horarios semanales son plantilla; el cambio afecta a la disponibilidad
--   real y a quien fisicamente trabaja ese dia). Se registra como bitacora
--   compartida para acabar con los WhatsApp informales del chat de equipo.
-- =====================================================================

create table if not exists public.turnos_intercambio (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  solicitante_id uuid not null references public.profesionales(id) on delete cascade,
  companero_id uuid not null references public.profesionales(id) on delete cascade,
  fecha_solicitante date not null,
  fecha_companero date not null,
  motivo text,
  estado text not null default 'pendiente_companero'
    check (estado in ('pendiente_companero','pendiente_gestor','aprobado','rechazado','cancelado')),
  respondido_companero_at timestamptz,
  respondido_gestor_at timestamptz,
  respondido_gestor_por uuid,
  nota_rechazo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_turnos_intercambio_negocio_estado
  on public.turnos_intercambio(negocio_id, estado);
create index if not exists idx_turnos_intercambio_solicitante
  on public.turnos_intercambio(solicitante_id);
create index if not exists idx_turnos_intercambio_companero
  on public.turnos_intercambio(companero_id);

alter table public.turnos_intercambio enable row level security;

-- Lectura: cualquier miembro del negocio ve los intercambios de su negocio.
drop policy if exists turnos_intercambio_select on public.turnos_intercambio;
create policy turnos_intercambio_select on public.turnos_intercambio
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

-- Escritura solo por RPC (security definer).

-- ---------------------------------------------------------------------
-- Solicitar intercambio (profesional A)
-- ---------------------------------------------------------------------
create or replace function public.solicitar_intercambio_turno(
  p_companero_id uuid,
  p_fecha_solicitante date,
  p_fecha_companero date,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_solicitante_id uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id into v_negocio from profiles where id = v_uid;
  if v_negocio is null then raise exception 'sin_perfil'; end if;

  select id into v_solicitante_id from profesionales
    where profile_id = v_uid and negocio_id = v_negocio limit 1;
  if v_solicitante_id is null then raise exception 'cuenta_no_vinculada'; end if;

  if p_companero_id = v_solicitante_id then raise exception 'no_puedes_pedirte_a_ti'; end if;

  if not exists (
    select 1 from profesionales where id = p_companero_id and negocio_id = v_negocio and activo = true
  ) then raise exception 'companero_invalido'; end if;

  if p_fecha_solicitante is null or p_fecha_companero is null then raise exception 'fecha_invalida'; end if;
  if p_fecha_solicitante < current_date or p_fecha_companero < current_date then
    raise exception 'fecha_pasada';
  end if;

  insert into turnos_intercambio (negocio_id, solicitante_id, companero_id, fecha_solicitante, fecha_companero, motivo)
  values (v_negocio, v_solicitante_id, p_companero_id, p_fecha_solicitante, p_fecha_companero, p_motivo)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.solicitar_intercambio_turno(uuid,date,date,text) from public, anon;
grant execute on function public.solicitar_intercambio_turno(uuid,date,date,text) to authenticated;

-- ---------------------------------------------------------------------
-- Responder como compañero (aceptar o rechazar)
-- ---------------------------------------------------------------------
create or replace function public.responder_intercambio_companero(
  p_id uuid,
  p_aceptar boolean,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_prof_id uuid;
  v_row record;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id into v_negocio from profiles where id = v_uid;
  select id into v_prof_id from profesionales where profile_id = v_uid and negocio_id = v_negocio limit 1;
  if v_prof_id is null then raise exception 'cuenta_no_vinculada'; end if;

  select * into v_row from turnos_intercambio where id = p_id and negocio_id = v_negocio;
  if v_row is null then raise exception 'no_encontrado'; end if;
  if v_row.companero_id <> v_prof_id then raise exception 'no_eres_companero'; end if;
  if v_row.estado <> 'pendiente_companero' then raise exception 'estado_invalido'; end if;

  update turnos_intercambio
    set estado = case when p_aceptar then 'pendiente_gestor' else 'rechazado' end,
        respondido_companero_at = now(),
        nota_rechazo = case when p_aceptar then null else p_nota end
    where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.responder_intercambio_companero(uuid,boolean,text) from public, anon;
grant execute on function public.responder_intercambio_companero(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------
-- Responder como gestor (aprobar o rechazar)
-- ---------------------------------------------------------------------
create or replace function public.responder_intercambio_gestor(
  p_id uuid,
  p_aprobar boolean,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_row record;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_role not in ('owner','admin') then raise exception 'solo_gestor'; end if;

  select * into v_row from turnos_intercambio where id = p_id and negocio_id = v_negocio;
  if v_row is null then raise exception 'no_encontrado'; end if;
  if v_row.estado <> 'pendiente_gestor' then raise exception 'estado_invalido'; end if;

  update turnos_intercambio
    set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
        respondido_gestor_at = now(),
        respondido_gestor_por = v_uid,
        nota_rechazo = case when p_aprobar then null else p_nota end
    where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.responder_intercambio_gestor(uuid,boolean,text) from public, anon;
grant execute on function public.responder_intercambio_gestor(uuid,boolean,text) to authenticated;

-- ---------------------------------------------------------------------
-- Cancelar la solicitud (solo el propio solicitante mientras esté pendiente)
-- ---------------------------------------------------------------------
create or replace function public.cancelar_intercambio_turno(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_prof_id uuid;
  v_row record;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id into v_negocio from profiles where id = v_uid;
  select id into v_prof_id from profesionales where profile_id = v_uid and negocio_id = v_negocio limit 1;

  select * into v_row from turnos_intercambio where id = p_id and negocio_id = v_negocio;
  if v_row is null then raise exception 'no_encontrado'; end if;
  if v_row.solicitante_id <> v_prof_id then raise exception 'no_eres_solicitante'; end if;
  if v_row.estado not in ('pendiente_companero','pendiente_gestor') then raise exception 'estado_invalido'; end if;

  update turnos_intercambio set estado = 'cancelado' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.cancelar_intercambio_turno(uuid) from public, anon;
grant execute on function public.cancelar_intercambio_turno(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Listar intercambios visibles (con nombres). Todos los miembros ven los de su negocio.
-- ---------------------------------------------------------------------
create or replace function public.listar_intercambios_turno()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_prof_id uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_negocio is null then raise exception 'sin_perfil'; end if;
  select id into v_prof_id from profesionales where profile_id = v_uid and negocio_id = v_negocio limit 1;

  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb)
    into v_result
  from (
    select jsonb_build_object(
      'id', t.id,
      'solicitante_id', t.solicitante_id,
      'solicitante_nombre', ps.nombre,
      'companero_id', t.companero_id,
      'companero_nombre', pc.nombre,
      'fecha_solicitante', t.fecha_solicitante,
      'fecha_companero', t.fecha_companero,
      'motivo', t.motivo,
      'estado', t.estado,
      'nota_rechazo', t.nota_rechazo,
      'created_at', t.created_at,
      'es_solicitante', (t.solicitante_id = v_prof_id),
      'es_companero', (t.companero_id = v_prof_id),
      'es_gestor', (v_role in ('owner','admin'))
    ) as row, t.created_at
    from turnos_intercambio t
    join profesionales ps on ps.id = t.solicitante_id
    join profesionales pc on pc.id = t.companero_id
    where t.negocio_id = v_negocio
    order by t.created_at desc
  ) x;

  return jsonb_build_object('ok', true, 'intercambios', v_result);
end;
$$;
revoke all on function public.listar_intercambios_turno() from public, anon;
grant execute on function public.listar_intercambios_turno() to authenticated;
