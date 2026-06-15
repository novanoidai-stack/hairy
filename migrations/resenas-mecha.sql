-- Añadir columnas para reseñas del sistema Mecha a la tabla public.resenas
alter table public.resenas add column if not exists mecha_puntuacion smallint;
alter table public.resenas add column if not exists mecha_comentario text;

-- Actualizar la función para guardar también los datos de Mecha
create or replace function public.crear_resena_publica(
  p_slug          text,
  p_puntuacion    smallint,
  p_comentario    text,
  p_autor_nombre  text,
  p_profesional_id uuid default null,
  p_servicio_id    uuid default null,
  p_mecha_puntuacion smallint default null,
  p_mecha_comentario text default null
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
    mecha_puntuacion, mecha_comentario
  )
  values (
    v_negocio, p_profesional_id, p_servicio_id, 
    p_puntuacion, left(nullif(trim(p_comentario), ''), 1000), left(nullif(trim(p_autor_nombre), ''), 80), 
    'web', true, nullif(v_ip, ''),
    p_mecha_puntuacion, left(nullif(trim(p_mecha_comentario), ''), 1000)
  )
  returning id into v_id;

  return jsonb_build_object('resena_id', v_id, 'ok', true);
end;
$$;

revoke all on function public.crear_resena_publica(text, smallint, text, text, uuid, uuid, smallint, text) from public;
grant execute on function public.crear_resena_publica(text, smallint, text, text, uuid, uuid, smallint, text) to anon, authenticated;

-- Función para que la landing page pueda consumir las estadísticas de Mecha
create or replace function public.obtener_estadisticas_mecha()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media numeric;
  v_total int;
  v_ultimas jsonb;
begin
  select coalesce(round(avg(mecha_puntuacion)::numeric, 1), 0), count(mecha_puntuacion)
  into v_media, v_total
  from public.resenas
  where mecha_puntuacion is not null;

  select jsonb_agg(
           jsonb_build_object(
             'puntuacion', mecha_puntuacion,
             'comentario', mecha_comentario,
             'autor_nombre', autor_nombre,
             'created_at', created_at
           )
         )
  into v_ultimas
  from (
    select mecha_puntuacion, mecha_comentario, autor_nombre, created_at
    from public.resenas
    where mecha_puntuacion is not null and mecha_comentario is not null
    order by mecha_puntuacion desc, created_at desc
    limit 10
  ) as sub;

  return jsonb_build_object(
    'media', v_media,
    'total', v_total,
    'ultimas', coalesce(v_ultimas, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.obtener_estadisticas_mecha() from public;
grant execute on function public.obtener_estadisticas_mecha() to anon, authenticated;
