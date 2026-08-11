-- Organizador: revisar hueco liberado contra la lista de espera (Fase 3).
-- ============================================================================
-- DRAFT — PENDIENTE DE APLICAR EN REMOTO via Supabase MCP / dashboard SQL.
-- No se puede aplicar con la service_role (exec_sql fue eliminado por security
-- hardening); necesita MCP o el password de BD. Aplicar y validar a mano.
-- ============================================================================
--
-- MOTIVO. Cuando el organizador MUEVE una cita (accion 'optimizar_agenda'),
-- libera un hueco en la posicion vieja. Ese hueco es exactamente tan valioso
-- como una cancelacion para la lista de espera, pero el motor actual
-- (procesar_lista_espera) solo se dispara al CANCELAR una cita, no al moverla.
-- Esta RPC cubre ese gap: la llama chispaOps justo despues de aplicar el
-- movimiento, pasando las coordenadas del hueco que ha quedado libre.
--
-- DISEÑO. Es un calco de la rama "nueva cancelacion -> oferta" de
-- procesar_lista_espera (migrations/lista-espera-matching.sql, lineas ~153-181):
-- misma lectura de config, misma ventana/bloqueo/antelacion, mismo
-- _lista_espera_mejor_candidato + _lista_espera_ofrecer. Reutiliza la logica
-- ya probada en vez de inventar otra.
--
-- Por que se pasan las fases (inicio/fin/fin_activa/fin_espera) y no se leen
-- de la cita: la cita YA se ha movido cuando se llama a esta RPC, asi que su
-- fila tiene la posicion NUEVA. El hueco es la posicion VIEJA, que conoce el
-- caller (chispaOps la lee del `prev` antes de actualizar). Pasarlas explicitas
-- evita depender de una fila que ya no representa el hueco.
--
-- SEGURIDAD. security definer porque escribe en lista_espera_ofertas / citas /
-- lista_espera_avisos (tablas que el staff no toca en crudo). Granted a
-- authenticated: la llama chispaOps con la sesion del staff. set search_path to
-- 'public' (igual que las demas RPC de lista de espera).

create or replace function public.revisar_hueco_lista_espera(
  p_origen_cita_id uuid,       -- la cita que se movio (traza, va a origen_cita_id)
  p_negocio_id text,
  p_servicio_id uuid,
  p_profesional_id uuid,       -- profesional sobre cuyo calendario estaba el hueco
  p_slot_inicio timestamptz,   -- inicio del hueco liberado (posicion vieja)
  p_slot_fin timestamptz,
  p_slot_fin_activa timestamptz,
  p_slot_fin_espera timestamptz
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  cfg jsonb;
  v_activo boolean;
  v_ventana integer;
  v_maxbloq integer;
  v_antel integer;
  v_pidesenal boolean;
  v_cand uuid;
  v_oferta uuid;
begin
  -- Sin servicio no hay matching posible (no sabemos la duracion/categoria).
  if p_servicio_id is null or p_profesional_id is null then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'sin_servicio_o_profesional');
  end if;

  cfg := (select config from public.negocio_config where negocio_id = p_negocio_id);
  v_activo := coalesce((cfg->>'listaEsperaMatchingActivo')::boolean, false);

  -- Si el salon no tiene el matching de lista de espera activo, no hacemos nada.
  -- Es el mismo guard que procesar_lista_espera; respeta la decision del salon.
  if not v_activo then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'matching_inactivo');
  end if;

  v_ventana  := greatest(coalesce((cfg->>'listaEsperaVentanaMin')::int, 30), 1);
  v_maxbloq  := greatest(coalesce((cfg->>'listaEsperaMaxBloqueoHoras')::int, 2), 1);
  v_antel    := greatest(coalesce((cfg->>'listaEsperaAntelacionMinHoras')::int, 4), 0);
  v_pidesenal := coalesce((cfg->>'listaEsperaOfertaPideSenal')::boolean, false);

  -- Mismo filtro de antelacion que el motor: si el hueco es inminente, no da
  -- tiempo a avisar a nadie ni a que confirme.
  if p_slot_inicio < now() + make_interval(hours => v_antel) then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'demasiado_pronto');
  end if;

  -- Mejor candidato para ese servicio/profesional/inicio (sin excluir a nadie
  -- aun: es el primer aviso sobre este hueco).
  v_cand := public._lista_espera_mejor_candidato(p_negocio_id, p_servicio_id, p_profesional_id, p_slot_inicio, array[]::uuid[]);
  if v_cand is null then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'sin_candidatos');
  end if;

  -- Crea la oferta (reserva el hueco) y ofrece al candidato: cita tentativa +
  -- marca avisado + encarga el WhatsApp via el outbox lista_espera_avisos.
  insert into public.lista_espera_ofertas(
    negocio_id, origen_cita_id, profesional_id, servicio_id,
    inicio, fin, fin_activa, fin_espera, estado, candidato_id, expira_at, bloqueo_hasta, avisados)
  values (
    p_negocio_id, p_origen_cita_id, p_profesional_id, p_servicio_id,
    p_slot_inicio, p_slot_fin, p_slot_fin_activa, p_slot_fin_espera, 'activa', v_cand,
    now() + make_interval(mins => v_ventana), now() + make_interval(hours => v_maxbloq), array[v_cand])
  returning id into v_oferta;

  perform public._lista_espera_ofrecer(v_oferta, v_cand, v_pidesenal, v_ventana);

  return jsonb_build_object('ok', true, 'avisados', 1, 'oferta_id', v_oferta, 'candidato_id', v_cand);
exception
  -- Cualquier fallo (helper caido, constraint...) no debe romper el movimiento
  -- de cita que ya se ha aplicado: lo tragamos y lo reportamos como motivo.
  when others then
    return jsonb_build_object('ok', false, 'avisados', 0, 'motivo', 'error', 'error', sqlerrm);
end;
$function$;

grant execute on function public.revisar_hueco_lista_espera(uuid, text, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
