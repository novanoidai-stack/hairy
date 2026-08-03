-- Directorio: presencia OPT-IN y filtro de categoria que mira tambien el nombre.
--
-- 1) El modelo era opt-out (directorio_visible default true): cualquier cuenta
--    nueva con el portal activo entraba sola en el directorio publico. Con
--    cuentas de prueba en la misma BD eso se ensucia solo. Pasa a opt-in: el
--    salon tiene que marcarlo en Ajustes > Reserva online > Directorio publico.
--    Las filas ya existentes NO se tocan (quien ya estaba listado sigue listado).
--
-- 2) El filtro por categoria solo comparaba contra categorias_servicio.nombre y
--    servicios.categoria, dos campos que casi nadie rellena: "Corte" devolvia 1
--    salon cuando habia 3 vendiendo cortes. Ahora tambien mira el nombre del
--    servicio, que es lo que el salon si escribe siempre.
--    Medido sobre los datos reales: Corte 1->3, Barba 1->3, Peinado 1->2,
--    Tratamiento 0->1, Color 3->3.
--
-- Aplicada en remoto el 3 ago 2026 (migracion directorio_optin_y_categoria_por_nombre).

alter table negocio_portal
  alter column directorio_visible set default false;

comment on column negocio_portal.directorio_visible is
  'Opt-in del directorio publico. Por defecto false: el salon tiene que pedir aparecer.';

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
  patrones as (
    -- El texto del usuario se escapa antes de meterlo en un ilike: sin ello un
    -- "%" en la caja de busqueda listaria la plataforma entera.
    select
      replace(replace(replace(p_ciudad,    '\', '\\'), '%', '\%'), '_', '\_') as ciudad_pat,
      replace(replace(replace(p_categoria, '\', '\\'), '%', '\%'), '_', '\_') as categoria_pat
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
          -- Mientras no haya ciudad estructurada, la ciudad vive dentro de la
          -- direccion libre. Solo actua si ciudad es null: si existe, manda ella.
          np.ciudad is null
          and np.direccion is not null
          and np.direccion ilike '%' || (select ciudad_pat from patrones) || '%'
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
            and (
              lower(cs.nombre) = lower(p_categoria)
              or lower(s.categoria) = lower(p_categoria)
              -- El nombre del servicio es el unico campo que el salon rellena
              -- siempre: "Corte de nino" tiene que caer bajo "Corte".
              or s.nombre ilike '%' || (select categoria_pat from patrones) || '%'
            )
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
