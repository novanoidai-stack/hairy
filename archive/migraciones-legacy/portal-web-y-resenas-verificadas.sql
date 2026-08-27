-- Migracion: campo "web" del establecimiento en el portal + resenas verificadas (visita real).
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Aditiva y segura: NO cambia firmas de funciones existentes ni abre SELECT a anon.
--   1) negocio_portal.web: URL del sitio web del salon (visible en el portal, para visibilidad/SEO).
--   2) portal_info: misma version viva + 'web' en el objeto negocio (conserva foto_url de servicios).
--   3) resenas_publicas: misma version viva + 'verificadas' (conteo de resenas con cita real)
--      y 'verificada' por resena (cita_id is not null). El badge "Visita verificada" solo se
--      muestra cuando la resena esta atada a una cita real => sin claims falsos (CLAUDE.md #5).
--
-- La CREACION de resenas verificadas (enlace post-visita con token de cita) es un paso aparte:
-- el envio del enlace es de Alexandro (mensajeria). Aqui queda lista la parte de display.

alter table public.negocio_portal add column if not exists web text;

create or replace function public.portal_info(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug,
      'nombre', np.nombre_publico,
      'logo_url', np.logo_url,
      'direccion', np.direccion,
      'telefono', np.telefono,
      'web', np.web,
      'idioma', np.idioma,
      'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento
    ),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'nombre', s.nombre,
        'descripcion', s.descripcion,
        'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria,
        'prepago', coalesce(s.prepago_requerido, false),
        'foto_url', s.foto_url
      ) order by s.categoria nulls last, s.nombre)
      from public.servicios s
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'nombre', pr.nombre,
        'color', pr.color
      ) order by pr.nombre)
      from public.profesionales pr
      where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np
  where np.slug = p_slug and np.portal_activo = true;
$$;

create or replace function public.resenas_publicas(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_media numeric;
  v_total int;
  v_verificadas int;
  v_ultimas jsonb;
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then return null; end if;

  select coalesce(round(avg(puntuacion)::numeric, 1), 0),
         count(*),
         count(*) filter (where cita_id is not null)
    into v_media, v_total, v_verificadas
  from public.resenas where negocio_id = v_negocio and visible;

  select coalesce(jsonb_agg(jsonb_build_object(
           'puntuacion', puntuacion, 'comentario', comentario, 'autor', autor_nombre,
           'fecha', created_at, 'verificada', (cita_id is not null)
         )), '[]'::jsonb)
    into v_ultimas
  from (
    select puntuacion, comentario, autor_nombre, created_at, cita_id
    from public.resenas
    where negocio_id = v_negocio and visible
    order by created_at desc limit 10
  ) x;

  return jsonb_build_object('media', v_media, 'total', v_total, 'verificadas', v_verificadas, 'ultimas', v_ultimas);
end;
$$;
