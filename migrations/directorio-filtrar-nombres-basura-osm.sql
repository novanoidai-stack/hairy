-- Directorio publico (marketplace): salian salones de OSM con nombres basura
-- (numeros e iniciales sueltas: "116", "13", "360", "MG", "A&F", "6d2"...). Se
-- exige al menos 3 letras reales en el nombre. "Oh La La" (6 letras) pasa; los
-- codigos/numeros no. Aplicada en remoto via MCP el 10-ago-2026 (quita 32 de 2388).
-- buscar_salones_publico no toca salones_externos, asi que no necesita el filtro.
create or replace function public.salones_externos_publico(p_texto text default null, p_ciudad text default null, p_limit integer default 12, p_offset integer default 0)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with limites as (
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  base as (
    select se.*
    from public.salones_externos se
    where se.visible
      and se.reclamado_por is null
      -- Filtra nombres basura de OSM: exige al menos 3 letras reales en el nombre.
      and char_length(regexp_replace(se.nombre, '[^[:alpha:]]', '', 'g')) >= 3
      and (p_ciudad is null or lower(se.ciudad) = lower(p_ciudad))
      and (p_texto is null or se.nombre ilike '%' || p_texto || '%')
      and not exists (
        select 1 from public.negocio_portal np
        where np.directorio_visible
          and lower(btrim(np.nombre_publico)) = lower(btrim(se.nombre))
      )
  ),
  contado as (select count(*) as total from base),
  pagina as (
    select b.* from base b
    order by b.nombre
    limit (select lim from limites) offset (select off from limites)
  )
  select jsonb_build_object(
    'total', (select total from contado),
    'salones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre,
        'direccion', p.direccion,
        'ciudad', p.ciudad,
        'provincia', p.provincia,
        'telefono', p.telefono,
        'web', p.web,
        'lat', p.lat,
        'lng', p.lng
      ) order by p.nombre)
      from pagina p
    ), '[]'::jsonb)
  );
$function$;
