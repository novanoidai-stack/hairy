-- Autoservicio · tipo de solicitud 'addon_ia'.
--
-- Una cuenta en prueba tiene el software entero pero NO los Recepcionistas IA
-- (profiles.ia_nivel), que se contratan aparte. Y no puede activarlos sola: la
-- edge cambiar-addon-ia responde 409 'sin_suscripcion' si no hay una suscripcion
-- de Stripe viva. Este tipo recoge la peticion desde dentro del producto y la deja
-- en la bandeja de solicitudes; el aviso por correo lo manda notificar-solicitud,
-- que no necesita cambios.
--
-- LOS DOS SITIOS: el tipo se valida por duplicado, en el CHECK de la tabla Y
-- dentro de la funcion. Ampliar solo uno hace que la insercion falle con 23514 y
-- el lead se pierda EN SILENCIO (el formulario dice "enviado" porque llega un 200).
-- Ya paso con los mensajes del pricing; esta documentado en contacto-tres-vias.sql.
--
-- El cuerpo de la funcion se reproduce entero porque `create or replace` no admite
-- parches parciales. Lo unico que cambia respecto a solicitudes-tipo-calculadora.sql
-- es la lista de tipos validos, en las dos comprobaciones.

-- 1) CHECK de la tabla
alter table public.solicitudes drop constraint if exists solicitudes_tipo_check;
alter table public.solicitudes
  add constraint solicitudes_tipo_check
  check (tipo = any (array[
    'demo'::text, 'reserva_llamada'::text, 'signup'::text,
    'mensaje'::text, 'quiero_software'::text, 'calculadora'::text,
    'addon_ia'::text
  ]));

-- 2) Validacion dentro de la RPC
create or replace function public.crear_solicitud_publica(
  p_tipo text,
  p_nombre text,
  p_salon text,
  p_email text,
  p_telefono text,
  p_num_profesionales text default null::text,
  p_herramienta_actual text default null::text,
  p_nota text default null::text,
  p_fecha_preferida text default null::text,
  p_hora_preferida text default null::text,
  p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ip text := public.request_ip();
  v_id uuid;
begin
  if p_tipo is null or p_tipo not in ('demo', 'reserva_llamada', 'signup', 'mensaje', 'quiero_software', 'calculadora', 'addon_ia') then
    raise exception 'Tipo de solicitud invalido';
  end if;
  if p_email is null or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(p_email) > 120 then
    raise exception 'El email es obligatorio';
  end if;
  if length(coalesce(p_nombre, '')) > 80 or length(coalesce(p_salon, '')) > 80
     or length(coalesce(p_telefono, '')) > 20 or length(coalesce(p_nota, '')) > 1000
     or length(coalesce(p_herramienta_actual, '')) > 80
     or length(coalesce(p_num_profesionales, '')) > 10
     or length(coalesce(p_fecha_preferida, '')) > 40 or length(coalesce(p_hora_preferida, '')) > 40
     or pg_column_size(p_meta) > 4096 then
    raise exception 'Datos demasiado largos';
  end if;

  if p_telefono is not null and btrim(p_telefono) <> ''
     and coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    raise exception 'El telefono debe contener al menos 7 digitos';
  end if;

  if v_ip <> '' and (
    select count(*) from public.solicitudes
    where ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes enviadas. Intentalo de nuevo mas tarde.';
  end if;
  if (
    select count(*) from public.solicitudes
    where lower(email) = lower(p_email) and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Demasiadas solicitudes para esta direccion de correo hoy.';
  end if;

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
$function$;

-- La llama el formulario del sitio publico sin sesion, asi que anon necesita
-- execute (era asi antes de este cambio y debe seguir siendolo).
grant execute on function public.crear_solicitud_publica(text,text,text,text,text,text,text,text,text,text,jsonb) to anon, authenticated, service_role;
