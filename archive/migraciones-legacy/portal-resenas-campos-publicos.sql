-- Amplia resenas_publicas con los campos que el portal necesita para pintar
-- resenas REALES en vez del mock que habia.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Contexto: el bloque de resenas del portal publico nunca se conecto. Renderizaba
-- dos tarjetas estaticas ("Cliente feliz / Servicio x", siempre 5 estrellas)
-- mientras las resenas reales se pedian y se tiraban, y las barras 5-1 eran
-- numeros fijos inventados en el cliente (164/15/2/1/0 sobre 182).
--
-- Que gana la RPC:
--   1) distribucion: reparto REAL de 5 a 1 estrellas, para las barras.
--   2) por resena: trato, productos, profesional (+ su nota) y servicio.
--
-- Que NO sale, a proposito: todo el grupo mecha_* (mecha_puntuacion,
-- mecha_facilidad_puntuacion, mecha_disponibilidad_puntuacion,
-- mecha_pagos_puntuacion, mecha_comentario, mecha_mejora_comentario) es el
-- cliente valorando MECHA COMO SOFTWARE, no al salon: no pinta nada en la pagina
-- publica de un cliente. La separacion salon/mecha ya existe en el codigo, en
-- app/(tabs)/resenas.web.tsx (SCORE_FIELDS, campo `group`), y esta migracion la
-- respeta. Tampoco sale respuesta_borrador (es un BORRADOR: no hay columna de
-- respuesta publicada), ni ip_origen, cliente_id o cita_id.
--
-- OJO grants: la funcion sigue devolviendo jsonb y NO cambia su RETURNS, asi que
-- CREATE OR REPLACE basta y los grants existentes no se tocan ni se pierden. A
-- diferencia de disponibilidad_publica, que si cambiaba su RETURNS TABLE y
-- necesito DROP + re-GRANT. Confirmado antes de escribir esta migracion via
-- information_schema.routine_privileges: anon, authenticated, postgres,
-- service_role tienen EXECUTE.

CREATE OR REPLACE FUNCTION public.resenas_publicas(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_media numeric;
  v_total int;
  v_verificadas int;
  v_ultimas jsonb;
  v_distribucion jsonb;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return null; end if;

  select coalesce(round(avg(puntuacion)::numeric, 1), 0),
         count(*),
         count(*) filter (where cita_id is not null)
    into v_media, v_total, v_verificadas
  from public.resenas where negocio_id = v_negocio and visible;

  -- Reparto real 5..1. generate_series garantiza las cinco claves aunque alguna
  -- estrella no tenga ninguna resena, para que el cliente no tenga que rellenar.
  select coalesce(jsonb_object_agg(d.estrella::text, d.n), '{}'::jsonb)
    into v_distribucion
  from (
    select g.estrella, count(r.id) as n
    from generate_series(1, 5) as g(estrella)
    left join public.resenas r
      on r.negocio_id = v_negocio
     and r.visible
     and round(r.puntuacion) = g.estrella
    group by g.estrella
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'puntuacion', x.puntuacion,
           'comentario', x.comentario,
           'autor', x.autor_nombre,
           'fecha', x.created_at,
           'verificada', (x.cita_id is not null),
           'trato', x.salon_trato_puntuacion,
           'productos', x.salon_productos_puntuacion,
           'profesional', x.profesional_nombre,
           'profesional_puntuacion', x.profesional_puntuacion,
           'servicio', x.servicio_nombre
         ) order by x.created_at desc), '[]'::jsonb)
    into v_ultimas
  from (
    select r.puntuacion, r.comentario, r.autor_nombre, r.created_at, r.cita_id,
           r.salon_trato_puntuacion, r.salon_productos_puntuacion,
           r.profesional_puntuacion,
           pr.nombre as profesional_nombre,
           sv.nombre as servicio_nombre
    from public.resenas r
    left join public.profesionales pr on pr.id = r.profesional_id
    left join public.servicios sv on sv.id = r.servicio_id
    where r.negocio_id = v_negocio and r.visible
    order by r.created_at desc limit 10
  ) x;

  return jsonb_build_object(
    'media', v_media,
    'total', v_total,
    'verificadas', v_verificadas,
    'distribucion', v_distribucion,
    'ultimas', v_ultimas
  );
end;
$function$;
