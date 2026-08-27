-- Foto de fondo del portal publico de reserva.
-- El cliente (Ajustes > Portal) ya subia la imagen al bucket y guardaba la URL,
-- pero la columna nunca existio: el upsert fallaba y al refrescar se perdia.
-- El portal anonimo la lee por portal_info (anon NO tiene SELECT sobre la tabla).

alter table public.negocio_portal
  add column if not exists fondo_portal_url text;

create or replace function public.portal_info(p_slug text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug, 'nombre', np.nombre_publico, 'logo_url', np.logo_url, 'direccion', np.direccion,
      'telefono', np.telefono, 'web', np.web, 'idioma', np.idioma, 'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento,
      'analytics_config', coalesce(np.analytics_config, '{"enabled": false, "measurementId": "", "consentGiven": false}'::jsonb),
      'captcha_site_key', np.captcha_site_key,
      'fondo_portal_url', np.fondo_portal_url
    ),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria, 'categoria_id', s.categoria_id, 'categoria_nombre', cs.nombre,
        'categoria_color', cs.color, 'prepago', coalesce(s.prepago_requerido, false), 'foto_url', s.foto_url
      ) order by cs.orden nulls last, s.nombre)
      from public.servicios s left join public.categorias_servicio cs on cs.id = s.categoria_id
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'color', pr.color) order by pr.nombre)
      from public.profesionales pr where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np where np.slug = p_slug and np.portal_activo = true;
$function$;

-- portal_info es publica: desde el round 4 las funciones nuevas no nacen
-- ejecutables por anon, y el CREATE OR REPLACE no conserva los grants si la
-- firma cambiara. Se reafirma por seguridad.
grant execute on function public.portal_info(text) to anon, authenticated;
