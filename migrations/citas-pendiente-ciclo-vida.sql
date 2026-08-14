-- Migration: citas-pendiente-ciclo-vida.sql (Mega-Plan WS-3, remate)
--
-- Al pasar el estado por defecto de las citas a `pendiente` quedaron dos
-- funciones del ciclo de vida mirando solo a `confirmada`. Ninguna falla: se
-- quedan calladas, que es peor.
--
--   1. autocompletar_citas: el cron que da por hecha una cita que ya ha pasado
--      solo tocaba las confirmadas. Una cita pendiente que pasa se quedaria
--      colgada PARA SIEMPRE en el calendario, nunca llegaria a `completada` y,
--      de rebote, nunca se pediria la resena (ese aviso exige `completada`).
--
--   2. marcar_cita_no_show: rechazaba las pendientes con `estado_no_valido`.
--      Es justo al reves: una cita que la clienta no llego ni a confirmar y a
--      la que ademas no vino es EL caso tipico de no-show. Ademas la agenda ya
--      ofrece el boton para pendientes, asi que sin esto el boton da error.
--
-- El portal publico (disponibilidad_publica, crear_cita_publica,
-- portal_dias_disponibles, modificar/cancelar_cita_publica, citas_de_cliente,
-- proponer_cambio_cita) YA usaba `in ('pendiente','confirmada')`: era la agenda
-- del staff la que iba por libre. No hay nada que tocar ahi.

-- 1. Autocompletar tambien las pendientes que ya han pasado.
create or replace function public.autocompletar_citas()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with upd as (
    update public.citas c
      set estado = 'completada', modificado_at = now()
    where c.estado in ('pendiente', 'confirmada')
      and c.fin < now()
      and c.fin > now() - interval '6 hours'
      and coalesce((select (nc.config->>'completarManual')::boolean
                    from public.negocio_config nc where nc.negocio_id = c.negocio_id), false) = false
    returning c.id
  )
  select jsonb_build_object('ok', true, 'completadas', coalesce(jsonb_agg(id), '[]'::jsonb)) from upd;
$function$;

-- 2. Permitir marcar no-show desde `pendiente`.
create or replace function public.marcar_cita_no_show(p_cita_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_neg text; v_role text; v_cita public.citas;
  v_hold uuid; v_auto boolean;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','recepcion','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  select * into v_cita from public.citas where id = p_cita_id;
  if v_cita.id is null or v_cita.negocio_id <> v_neg then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada');
  end if;
  if v_cita.inicio > now() then
    return jsonb_build_object('ok', false, 'error', 'cita_futura');
  end if;
  -- `pendiente` entra: ni confirmo ni vino, que es el no-show de manual.
  if v_cita.estado not in ('pendiente', 'confirmada', 'completada') then
    return jsonb_build_object('ok', false, 'error', 'estado_no_valido');
  end if;
  update public.citas set estado = 'no_presentada', modificado_at = now(), modificado_por = auth.uid() where id = p_cita_id;
  if v_cita.cliente_id is not null then
    update public.clientes set noshows_count = coalesce(noshows_count, 0) + 1
     where id = v_cita.cliente_id and negocio_id = v_neg;
  end if;

  select id into v_hold from public.pagos
    where cita_id = p_cita_id and tipo = 'senal' and estado = 'retenido'
    order by created_at desc limit 1;
  select coalesce((config->>'depositoNoShowCapturaAuto')::boolean, true) into v_auto
    from public.negocio_config where negocio_id = v_neg;

  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'cliente_id', v_cita.cliente_id,
    'hold_pago_id', v_hold, 'capturar_auto', coalesce(v_auto, true));
end $function$;
