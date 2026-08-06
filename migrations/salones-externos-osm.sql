-- Directorio: salones que NO son de Mecha (arranque en frio)
--
-- Un directorio con un salon no se puede ensenar. Se rellena con peluquerias de
-- OpenStreetMap, que es redistribuible (ODbL, pide atribucion) — a diferencia de
-- Google Places, cuyas condiciones prohiben expresamente cachear su contenido y
-- montar con el un directorio propio.
--
-- REGLA DE PRESENTACION (no romper): estos salones NO se mezclan con los de
-- Mecha ni compiten en el mismo ranking. Van en un bloque aparte, sin
-- valoracion, sin precios y SIN reservar — su unica accion es llamar por
-- telefono. La pagina promete que el hueco que se ve es un hueco real; aqui no
-- hay agenda detras, asi que no se puede prometer nada.
--
-- OSM no trae valoraciones ni precios, lo que ademas evita de raiz inventarse
-- datos (regla 5 de CLAUDE.md).

create table if not exists public.salones_externos (
  id            uuid primary key default gen_random_uuid(),
  -- Par (fuente, fuente_id) = identidad estable del POI. En OSM el id es del
  -- tipo 'node/123456': el tipo forma parte del id porque los numeros se
  -- repiten entre nodes, ways y relations.
  fuente        text not null default 'osm',
  fuente_id     text not null,
  nombre        text not null,
  direccion     text,
  ciudad        text,
  provincia     text,
  codigo_postal text,
  lat           double precision,
  lng           double precision,
  telefono      text,
  web           text,
  -- Apagar uno a mano (duplicado, cerrado, se queja el dueno) sin borrar la
  -- fila: la siguiente importacion la volveria a crear.
  visible       boolean not null default true,
  -- Cuando ese salon se da de alta en Mecha, se enlaza aqui y deja de salir en
  -- el bloque de ajenos: pasa a listarse como salon de verdad.
  reclamado_por text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint salones_externos_fuente_unica unique (fuente, fuente_id),
  constraint salones_externos_lat_ok check (lat is null or (lat >= -90 and lat <= 90)),
  constraint salones_externos_lng_ok check (lng is null or (lng >= -180 and lng <= 180))
);

create index if not exists salones_externos_ciudad_idx
  on public.salones_externos (lower(ciudad)) where visible and reclamado_por is null;

-- Tabla cerrada: como el resto del directorio, no se abre ningun SELECT a anon
-- (regla 2 de CLAUDE.md). Se lee solo por la RPC de abajo. El importador entra
-- con service_role, que se salta RLS.
alter table public.salones_externos enable row level security;

-- ---------------------------------------------------------------------------
-- RPC publica del bloque de ajenos
-- ---------------------------------------------------------------------------
-- Va aparte de buscar_salones_publico a proposito: son dos listas distintas y
-- mezclarlas en una sola RPC acabaria, tarde o temprano, en un ranking unico.

create or replace function public.salones_externos_publico(
  p_texto  text default null,
  p_ciudad text default null,
  p_limit  integer default 12,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with limites as (
    -- Mismo tope duro que la busqueda de salones de Mecha.
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim,
           greatest(coalesce(p_offset, 0), 0)            as off
  ),
  base as (
    select se.*
    from public.salones_externos se
    where se.visible
      and se.reclamado_por is null
      and (p_ciudad is null or lower(se.ciudad) = lower(p_ciudad))
      and (p_texto is null or se.nombre ilike '%' || p_texto || '%')
      -- Si ese salon ya esta listado en Mecha, manda la ficha de verdad.
      and not exists (
        select 1 from public.negocio_portal np
        where np.directorio_visible
          and lower(btrim(np.nombre_publico)) = lower(btrim(se.nombre))
      )
  ),
  contado as (select count(*) as total from base),
  pagina as (
    -- Sin valoracion no hay nada por lo que ordenar salvo el nombre: cualquier
    -- otro orden seria un ranking inventado.
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
        -- Para el enlace de "Como llegar": es la unica accion que existe para
        -- todos, porque coordenadas hay siempre y telefono casi nunca.
        'lat', p.lat,
        'lng', p.lng
      ) order by p.nombre)
      from pagina p
    ), '[]'::jsonb)
  );
$function$;

-- Ciudades con salones ajenos, para no ofrecer filtros que devuelven cero.
create or replace function public.ciudades_externas_publico()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('ciudad', ciudad, 'salones', n) order by n desc, ciudad), '[]'::jsonb)
  from (
    select se.ciudad, count(*) as n
    from public.salones_externos se
    where se.visible and se.reclamado_por is null
      and se.ciudad is not null and btrim(se.ciudad) <> ''
    group by se.ciudad
  ) t;
$function$;

-- ---------------------------------------------------------------------------
-- Permisos explicitos (regla 4: las funciones nuevas no nacen ejecutables por anon)
-- ---------------------------------------------------------------------------

revoke all on function public.salones_externos_publico(text, text, integer, integer) from public;
revoke all on function public.ciudades_externas_publico() from public;

grant execute on function public.salones_externos_publico(text, text, integer, integer) to anon, authenticated;
grant execute on function public.ciudades_externas_publico() to anon, authenticated;
