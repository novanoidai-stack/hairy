-- Tres vias de contacto en el pricing + huecos reales de llamada (3 ago 2026).
-- APLICADAS en remoto.
--
-- 1) crear_solicitud_publica admitia solo 'demo' | 'reserva_llamada' | 'signup'.
--    Las dos vias nuevas del pricing ('mensaje' y 'quiero_software') habrian
--    sido rechazadas y esos leads se habrian perdido. Se amplia la lista SIN
--    tocar el anti-abuso (limites por IP y por email al dia).
--
-- 2) horas_llamada_ocupadas: reservar.html marcaba horas como cogidas con una
--    formula pseudoaleatoria ("so it feels real"), bloqueando huecos libres al
--    azar. Ahora se consultan las horas que de verdad tienen una llamada
--    agendada ese dia. Devuelve SOLO horas: ningun dato personal.
--    El dia se guarda en meta->>'fecha_iso' como YYYY-MM-DD local, porque
--    fecha_preferida es texto legible ("lunes, 3 de agosto") y no sirve para
--    comparar.
--
-- El cuerpo exacto de ambas esta aplicado en remoto (migraciones
-- solicitudes_tipos_mensaje_y_quiero_software y horas_llamada_ocupadas).

create or replace function public.horas_llamada_ocupadas(p_fecha text)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct s.hora_preferida), '{}')
  from public.solicitudes s
  where s.tipo = 'reserva_llamada'
    and s.hora_preferida is not null
    and coalesce(s.meta->>'fecha_iso', '') = p_fecha;
$$;

revoke all on function public.horas_llamada_ocupadas(text) from public;
grant execute on function public.horas_llamada_ocupadas(text) to anon, authenticated;

-- crear_solicitud_publica: ver migracion aplicada
-- 'solicitudes_tipos_mensaje_y_quiero_software' (anade 'mensaje' y
-- 'quiero_software' a la lista de tipos validos).
