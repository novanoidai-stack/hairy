-- Directorio: el filtro "Donde" cae a la direccion cuando no hay ciudad.
--
-- negocio_portal.ciudad esta a null en todos los salones (no hay UI que la
-- rellene todavia), asi que el buscador por ciudad devolvia SIEMPRE 0, incluso
-- con la ciudad escrita dentro de la direccion libre ("Calle Mayor 1, Madrid").
-- Cuando exista la ciudad estructurada manda ella; el fallback solo actua si es
-- null. El texto del usuario se escapa: sin ello un "%" listaria todo.
--
-- Misma firma que la version anterior: create or replace conserva los grants.
-- Aplicada en remoto el 3 ago 2026 (migracion directorio_ciudad_fallback_direccion).

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
      and (
        p_ciudad is null
        or lower(np.ciudad) = lower(p_ciudad)
        or (
          np.ciudad is null
          and np.direccion is not null
          and np.direccion ilike '%' ||
              replace(replace(replace(p_ciudad, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        )
      )
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
-- Limpieza de presencia: fuera del directorio los tenants que no son salones
-- reales. Opt-out (directorio_visible), no borrado: siguen con su portal.
--   - fewf_02801 / nose_03801 / prueba_46980 / testeo4_03801: cuentas de prueba,
--     con resenas de prueba que se estaban publicando como valoraciones reales.
--   - demo_salon_001: el tenant de la demo compartida. Listado permitia que una
--     clienta real reservase una cita dentro de la demo.
-- ---------------------------------------------------------------------------

update public.negocio_portal
   set directorio_visible = false
 where negocio_id in ('demo_salon_001','fewf_02801','nose_03801','prueba_46980','testeo4_03801');
