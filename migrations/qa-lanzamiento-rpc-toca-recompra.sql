-- QA de lanzamiento (2 ago 2026) — RPC `rpc_clientes_toca_recompra` que faltaba.
--
-- La pantalla de Clientes la llama para pintar el filtro y la insignia
-- "Oportunidad Recompra" (app/(tabs)/clientes.web.tsx), pero la funcion NUNCA
-- se creo en la base: la llamada devolvia 404 y el badge no aparecia jamas.
--
-- SEMANTICA (complementaria, no solapada, con clientes_en_riesgo_fuga):
--   - toca recompra: ya ha pasado su ciclo habitual (>= frecuencia_dias) pero
--     todavia NO llega al umbral de fuga (frecuencia_dias * 1.4). Es la senal
--     TEMPRANA: la clienta sigue siendo tuya, solo hay que darle el empujon.
--   - riesgo de fuga: pasado ese 1.4 (la que ya se te esta yendo).
-- En ambos casos se excluye a quien ya tiene una cita futura: si va a venir,
-- no hay nada que recuperar.
--
-- SEGURIDAD: security definer pero acotada al negocio del usuario autenticado
-- (mismo patron que clientes_en_riesgo_fuga). El parametro p_negocio_id se
-- conserva porque el cliente ya lo envia, pero NO decide el alcance: si no
-- coincide con el negocio del que llama, no devuelve nada. Sin grant a anon
-- (round 4: las funciones nuevas no nacen ejecutables por anonimos).

create or replace function public.rpc_clientes_toca_recompra(p_negocio_id text default null)
returns table(id uuid, nombre text, dias_desde_ultima_visita integer, frecuencia_dias integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    cl.id,
    cl.nombre,
    (current_date - cl.ultima_visita)::int as dias_desde_ultima_visita,
    cl.frecuencia_dias
  from public.clientes cl
  join public.profiles p on p.negocio_id = cl.negocio_id
  where p.id = auth.uid()
    and (p_negocio_id is null or cl.negocio_id = p_negocio_id)
    and cl.bloqueado = false
    and cl.frecuencia_dias is not null
    and cl.ultima_visita is not null
    and (current_date - cl.ultima_visita) >= cl.frecuencia_dias
    and (current_date - cl.ultima_visita) <= (cl.frecuencia_dias * 1.4)
    and not exists (
      select 1 from public.citas fc
      where fc.cliente_id = cl.id and fc.estado <> 'cancelada' and fc.inicio > now()
    )
  order by dias_desde_ultima_visita desc;
$$;

revoke all on function public.rpc_clientes_toca_recompra(text) from public, anon;
grant execute on function public.rpc_clientes_toca_recompra(text) to authenticated;
