-- Copiloto Fase 3: briefing proactivo. Detectores operativos para el panel del asistente.
-- v1: senales_sin_pagar + bandeja_sin_responder. clientes_a_recuperar se reusa via
-- clientes_en_riesgo_fuga() desde el cliente; las senales de puesta en marcha salen de
-- useOnboardingStatus (cliente). huecos_rellenables queda para v1.1 (calculo de franjas).

-- Detector interno: recibe el negocio explicito para poder testear con service_role.
-- NO ejecutable por usuarios: acepta un negocio arbitrario, asi que solo service_role
-- y la RPC publica (que deriva el negocio del auth.uid) pueden llamarlo.
create or replace function public.agenda_briefing_operativa(p_negocio text, p_scope text default 'all', p_prof uuid default null)
 returns jsonb
 language sql stable security definer set search_path to 'public'
as $function$
  with senal as (
    select c.id
    from public.citas c
    where c.negocio_id = p_negocio
      and (p_prof is null or c.profesional_id = p_prof)
      and c.estado = 'pendiente'
      and coalesce(c.deposito_requerido, false) = true
      and coalesce(c.deposito_pagado, false) = false
      and c.inicio > now()
  ),
  bandeja as (
    select cv.id
    from public.conversaciones cv
    where cv.negocio_id = p_negocio
      and cv.estado = 'abierta'
  )
  select jsonb_build_array(
    jsonb_build_object(
      'tipo','senales_sin_pagar','familia','operativa','severidad','alta',
      'titulo','Señales sin pagar','detalle','Cita con depósito pendiente de pago',
      'count',(select count(*) from senal),
      'items',coalesce((select jsonb_agg(jsonb_build_object('cita_id', id)) from senal), '[]'::jsonb),
      'accion',jsonb_build_object('tipo','reenviar_pago','label','Reenviar enlace de pago','payload','{}'::jsonb)
    )
  ) || case
    when coalesce(p_scope,'all') <> 'self' then jsonb_build_array(
      jsonb_build_object(
        'tipo','bandeja_sin_responder','familia','operativa','severidad','media',
        'titulo','Bandeja sin responder','detalle','Conversaciones abiertas',
        'count',(select count(*) from bandeja),
        'items',coalesce((select jsonb_agg(jsonb_build_object('conversacion_id', id)) from bandeja), '[]'::jsonb),
        'accion',jsonb_build_object('tipo','ir_a','label','Ir a Bandeja','payload', jsonb_build_object('destino','bandeja'))
      )
    )
    else '[]'::jsonb
  end;
$function$;

-- RPC publica: deriva negocio/rol/profesional del auth.uid().
create or replace function public.agenda_briefing(p_scope text default 'all')
 returns jsonb
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_neg text; v_role text; v_prof uuid; v_scope text;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null then return '[]'::jsonb; end if;
  -- propietario/direccion/recepcion ven todo el negocio; el resto (profesional) solo lo suyo.
  v_scope := case when v_role in ('owner','admin','recepcion','direccion') then coalesce(p_scope,'all') else 'self' end;
  if v_scope = 'self' then
    select id into v_prof from public.profesionales where negocio_id = v_neg and profile_id = auth.uid() limit 1;
  end if;
  return public.agenda_briefing_operativa(v_neg, v_scope, v_prof);
end $function$;

-- Seguridad (round 4): nada ejecutable por anon; la interna solo service_role.
revoke execute on function public.agenda_briefing(text) from public, anon;
grant execute on function public.agenda_briefing(text) to authenticated;
revoke execute on function public.agenda_briefing_operativa(text, text, uuid) from public, anon, authenticated;
grant execute on function public.agenda_briefing_operativa(text, text, uuid) to service_role;
