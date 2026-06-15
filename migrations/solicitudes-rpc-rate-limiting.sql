-- Migracion: solicitudes INSERT via RPC con rate limiting
-- Proyecto Supabase Hairy: vtrggiogjrhqtwbhbgia

alter table public.solicitudes add column if not exists ip_origen text;

create or replace function public.crear_solicitud_publica(
  p_tipo               text,
  p_nombre             text,
  p_salon              text,
  p_email              text,
  p_telefono           text,
  p_num_profesionales  text default null,
  p_herramienta_actual text default null,
  p_nota               text default null,
  p_fecha_preferida    text default null,
  p_hora_preferida     text default null,
  p_meta               jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := public.request_ip();
  v_id uuid;
begin
  -- 1) Validar tipo
  if p_tipo is null or p_tipo not in ('demo', 'reserva_llamada', 'signup') then
    raise exception 'Tipo de solicitud invalido';
  end if;

  -- 2) Validar campos obligatorios
  if p_email is null or p_email = '' then
    raise exception 'El email es obligatorio';
  end if;

  -- 3) Anti-abuso por IP: max 5 solicitudes por IP al dia.
  if v_ip <> '' and (
    select count(*) from public.solicitudes
    where ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes enviadas. Intentalo de nuevo mas tarde.';
  end if;

  -- 4) Anti-abuso por Email: max 5 solicitudes por email al dia.
  if (
    select count(*) from public.solicitudes
    where lower(email) = lower(p_email) and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes para esta direccion de correo hoy.';
  end if;

  -- 5) Insertar solicitud
  insert into public.solicitudes (
    tipo, nombre, salon, email, telefono, num_profesionales,
    herramienta_actual, nota, fecha_preferida, hora_preferida, meta, ip_origen
  )
  values (
    p_tipo, p_nombre, p_salon, p_email, p_telefono, p_num_profesionales,
    p_herramienta_actual, p_nota, p_fecha_preferida, p_hora_preferida, p_meta, v_ip
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Revocar inserts directos en solicitudes para anon
revoke insert on public.solicitudes from anon, authenticated;

-- Quitar politica de insert publico anterior
drop policy if exists solicitudes_insert_public on public.solicitudes;

-- Permitir ejecutar la funcion a anon y authenticated
grant execute on function public.crear_solicitud_publica to anon, authenticated;
