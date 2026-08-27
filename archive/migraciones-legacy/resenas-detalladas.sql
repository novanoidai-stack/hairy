-- Migración: reseñas detalladas (Métricas granulares para Salón y Mecha)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia

alter table public.resenas
  add column if not exists salon_trato_puntuacion smallint check (salon_trato_puntuacion between 1 and 5),
  add column if not exists salon_productos_puntuacion smallint check (salon_productos_puntuacion between 1 and 5),
  add column if not exists mecha_facilidad_puntuacion smallint check (mecha_facilidad_puntuacion between 1 and 5),
  add column if not exists mecha_disponibilidad_puntuacion smallint check (mecha_disponibilidad_puntuacion between 1 and 5),
  add column if not exists mecha_pagos_puntuacion smallint check (mecha_pagos_puntuacion between 1 and 5),
  add column if not exists mecha_mejora_comentario text;

create or replace function public.crear_resena_publica(
  p_slug          text,
  p_puntuacion    smallint,
  p_comentario    text,
  p_autor_nombre  text,
  p_profesional_id uuid default null,
  p_servicio_id    uuid default null,
  p_mecha_puntuacion smallint default null,
  p_mecha_comentario text default null,
  p_salon_trato_puntuacion smallint default null,
  p_salon_productos_puntuacion smallint default null,
  p_mecha_facilidad_puntuacion smallint default null,
  p_mecha_disponibilidad_puntuacion smallint default null,
  p_mecha_pagos_puntuacion smallint default null,
  p_mecha_mejora_comentario text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_id uuid;
  v_ip text := public.request_ip();
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;
  if p_puntuacion is null or p_puntuacion < 1 or p_puntuacion > 5 then raise exception 'Puntuación del salón inválida'; end if;
  
  if p_mecha_puntuacion is not null and (p_mecha_puntuacion < 1 or p_mecha_puntuacion > 5) then raise exception 'Puntuación de Mecha inválida'; end if;
  if p_salon_trato_puntuacion is not null and (p_salon_trato_puntuacion < 1 or p_salon_trato_puntuacion > 5) then raise exception 'Puntuación de trato inválida'; end if;
  if p_salon_productos_puntuacion is not null and (p_salon_productos_puntuacion < 1 or p_salon_productos_puntuacion > 5) then raise exception 'Puntuación de productos inválida'; end if;
  if p_mecha_facilidad_puntuacion is not null and (p_mecha_facilidad_puntuacion < 1 or p_mecha_facilidad_puntuacion > 5) then raise exception 'Puntuación de facilidad inválida'; end if;
  if p_mecha_disponibilidad_puntuacion is not null and (p_mecha_disponibilidad_puntuacion < 1 or p_mecha_disponibilidad_puntuacion > 5) then raise exception 'Puntuación de disponibilidad inválida'; end if;
  if p_mecha_pagos_puntuacion is not null and (p_mecha_pagos_puntuacion < 1 or p_mecha_pagos_puntuacion > 5) then raise exception 'Puntuación de pagos inválida'; end if;

  -- Anti-abuso: misma IP max 3 resenas/dia por negocio; negocio max 30/dia.
  if v_ip <> '' and (
    select count(*) from public.resenas
    where negocio_id = v_negocio and ip_origen = v_ip and created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'Ya has enviado tu valoración. Gracias.';
  end if;
  if (
    select count(*) from public.resenas
    where negocio_id = v_negocio and fuente = 'web' and created_at > now() - interval '1 day'
  ) >= 30 then
    raise exception 'No se pueden registrar más valoraciones hoy. Inténtalo mañana.';
  end if;

  if p_profesional_id is not null and not exists (
    select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio
  ) then p_profesional_id := null; end if;
  if p_servicio_id is not null and not exists (
    select 1 from public.servicios where id = p_servicio_id and negocio_id = v_negocio
  ) then p_servicio_id := null; end if;

  insert into public.resenas (
    negocio_id, profesional_id, servicio_id, 
    puntuacion, comentario, autor_nombre, 
    fuente, visible, ip_origen, 
    mecha_puntuacion, mecha_comentario,
    salon_trato_puntuacion, salon_productos_puntuacion,
    mecha_facilidad_puntuacion, mecha_disponibilidad_puntuacion,
    mecha_pagos_puntuacion, mecha_mejora_comentario
  )
  values (
    v_negocio, p_profesional_id, p_servicio_id, 
    p_puntuacion, left(nullif(trim(p_comentario), ''), 1000), left(nullif(trim(p_autor_nombre), ''), 80), 
    'web', true, nullif(v_ip, ''),
    p_mecha_puntuacion, left(nullif(trim(p_mecha_comentario), ''), 1000),
    p_salon_trato_puntuacion, p_salon_productos_puntuacion,
    p_mecha_facilidad_puntuacion, p_mecha_disponibilidad_puntuacion,
    p_mecha_pagos_puntuacion, left(nullif(trim(p_mecha_mejora_comentario), ''), 1000)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;
