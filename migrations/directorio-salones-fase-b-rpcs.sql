-- Directorio publico de salones — FASE B: RPCs publicas de lectura
--
-- El directorio es la UNICA parte del producto que lee cruzando tenants: el
-- resto de la app filtra siempre por negocio_id. Por eso no se abre ningun
-- SELECT a anon (regla 2 de CLAUDE.md) y todo pasa por estas dos funciones
-- security definer, que exponen SOLO los campos que el salon ya publica en su
-- portal y unicamente de los salones que estan listados.
--
-- Mismo patron que portal_info: sql / stable / security definer / search_path fijo.
-- Segun la regla 4 (round 4 de seguridad), las funciones nuevas NO nacen
-- ejecutables por anon: hay revoke + grant explicito al final.

-- ---------------------------------------------------------------------------
-- 1. Busqueda de salones
-- ---------------------------------------------------------------------------
-- p_lat/p_lng son opcionales: si vienen, se calcula distancia (haversine) y se
-- ordena por cercania. Mientras no haya geocodificacion, se busca por ciudad y
-- se ordena por valoracion.

create or replace function public.buscar_salones_publico(
  p_texto     text default null,
  p_ciudad    text default null,
  p_categoria text default null,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_limit     integer default 20,
  p_offset    integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with limites as (
    -- Tope duro de pagina: una RPC anonima no debe poder pedir la plataforma entera.
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  base as (
    select
      np.negocio_id,
      np.slug,
      np.nombre_publico,
      np.descripcion,
      np.direccion,
      np.ciudad,
      np.provincia,
      np.logo_url,
      case
        when p_lat is null or p_lng is null or np.lat is null or np.lng is null then null
        else 6371 * acos(least(1, greatest(-1,
               cos(radians(p_lat)) * cos(radians(np.lat)) * cos(radians(np.lng) - radians(p_lng))
             + sin(radians(p_lat)) * sin(radians(np.lat))
             )))
      end as distancia_km
    from public.negocio_portal np
    where np.portal_activo = true
      and np.directorio_visible = true
      and (p_ciudad is null or lower(np.ciudad) = lower(p_ciudad))
      and (
        p_texto is null
        or np.nombre_publico ilike '%' || p_texto || '%'
        or exists (
          select 1 from public.servicios s
          where s.negocio_id = np.negocio_id and s.activo and s.reservable_online
            and s.nombre ilike '%' || p_texto || '%'
        )
      )
      and (
        p_categoria is null
        or exists (
          select 1 from public.servicios s
          left join public.categorias_servicio cs on cs.id = s.categoria_id
          where s.negocio_id = np.negocio_id and s.activo and s.reservable_online
            and (lower(cs.nombre) = lower(p_categoria) or lower(s.categoria) = lower(p_categoria))
        )
      )
  ),
  contado as (select count(*) as total from base),
  ordenado as (
    -- El orden se fija aqui con row_number porque jsonb_agg NO conserva el
    -- orden de la subconsulta: hay que agregar con "order by rn" mas abajo.
    select b.*,
           row_number() over (
             order by
               case when b.distancia_km is null then 1 else 0 end,
               b.distancia_km asc,
               (select coalesce(avg(r.puntuacion), 0) from public.resenas r
                 where r.negocio_id = b.negocio_id and r.visible) desc,
               b.nombre_publico asc
           ) as rn
    from base b
  ),
  pagina as (
    select o.* from ordenado o
    order by o.rn
    limit (select lim from limites) offset (select off from limites)
  )
  select jsonb_build_object(
    'total', (select total from contado),
    'salones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', p.slug,
        'nombre', p.nombre_publico,
        'descripcion', p.descripcion,
        'direccion', p.direccion,
        'ciudad', p.ciudad,
        'provincia', p.provincia,
        'logo_url', p.logo_url,
        'distancia_km', round(p.distancia_km::numeric, 1),
        'foto', (
          select nf.url from public.negocio_fotos nf
          where nf.negocio_id = p.negocio_id order by nf.orden, nf.created_at limit 1
        ),
        'valoracion', (
          select round(avg(r.puntuacion)::numeric, 1) from public.resenas r
          where r.negocio_id = p.negocio_id and r.visible
        ),
        'resenas', (
          select count(*) from public.resenas r
          where r.negocio_id = p.negocio_id and r.visible
        ),
        'servicios', coalesce((
          select jsonb_agg(x) from (
            select jsonb_build_object(
              'nombre', s.nombre,
              'precio', s.precio,
              'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0)
            ) as x
            from public.servicios s
            where s.negocio_id = p.negocio_id and s.activo and s.reservable_online
            order by s.precio asc
            limit 4
          ) sub
        ), '[]'::jsonb)
      ) order by p.rn)
      from pagina p
    ), '[]'::jsonb)
  );
$function$;

-- ---------------------------------------------------------------------------
-- 2. Ficha de salon en el directorio
-- ---------------------------------------------------------------------------
-- portal_info sigue siendo la fuente del PORTAL DE RESERVA y no se toca. Esta
-- devuelve lo que necesita la ficha del directorio: galeria, descripcion,
-- valoracion y resenas visibles.

create or replace function public.salon_directorio_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'slug', np.slug,
    'nombre', np.nombre_publico,
    'descripcion', np.descripcion,
    'direccion', np.direccion,
    'ciudad', np.ciudad,
    'provincia', np.provincia,
    'telefono', np.telefono,
    'web', np.web,
    'logo_url', np.logo_url,
    'valoracion', (select round(avg(r.puntuacion)::numeric, 1) from public.resenas r
                    where r.negocio_id = np.negocio_id and r.visible),
    'resenas_total', (select count(*) from public.resenas r
                       where r.negocio_id = np.negocio_id and r.visible),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('url', nf.url, 'alt', nf.alt) order by nf.orden, nf.created_at)
      from public.negocio_fotos nf where nf.negocio_id = np.negocio_id
    ), '[]'::jsonb),
    'servicios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', s.nombre,
        'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', coalesce(cs.nombre, s.categoria)
      ) order by cs.orden nulls last, s.nombre)
      from public.servicios s left join public.categorias_servicio cs on cs.id = s.categoria_id
      where s.negocio_id = np.negocio_id and s.activo and s.reservable_online
    ), '[]'::jsonb),
    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', pr.nombre) order by pr.nombre)
      from public.profesionales pr where pr.negocio_id = np.negocio_id and pr.activo
    ), '[]'::jsonb),
    'resenas', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'puntuacion', r.puntuacion, 'comentario', r.comentario,
          'autor', r.autor_nombre, 'fecha', r.created_at
        ) as x
        from public.resenas r
        where r.negocio_id = np.negocio_id and r.visible
        order by r.created_at desc limit 10
      ) sub
    ), '[]'::jsonb),
    'horario', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', nh.dia_semana, 'abierto', nh.abierto,
        'apertura', nh.apertura, 'cierre', nh.cierre
      ) order by nh.dia_semana)
      from public.negocio_horarios nh where nh.negocio_id = np.negocio_id
    ), '[]'::jsonb)
  ) end
  from public.negocio_portal np
  where np.slug = p_slug and np.portal_activo = true and np.directorio_visible = true;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Ciudades con salones (para la home del directorio)
-- ---------------------------------------------------------------------------

create or replace function public.ciudades_directorio_publico()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('ciudad', ciudad, 'salones', n) order by n desc, ciudad), '[]'::jsonb)
  from (
    select np.ciudad, count(*) as n
    from public.negocio_portal np
    where np.portal_activo and np.directorio_visible and np.ciudad is not null and btrim(np.ciudad) <> ''
    group by np.ciudad
  ) t;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Permisos explicitos (regla 4: no nacen ejecutables por anon)
-- ---------------------------------------------------------------------------

revoke all on function public.buscar_salones_publico(text, text, text, double precision, double precision, integer, integer) from public;
revoke all on function public.salon_directorio_publico(text) from public;
revoke all on function public.ciudades_directorio_publico() from public;

grant execute on function public.buscar_salones_publico(text, text, text, double precision, double precision, integer, integer) to anon, authenticated;
grant execute on function public.salon_directorio_publico(text) to anon, authenticated;
grant execute on function public.ciudades_directorio_publico() to anon, authenticated;
