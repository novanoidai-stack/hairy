-- Paso 1 endurecimiento de pagos (spec 2026-06-30): confirmar_cita_oferta devuelve
-- pago_token cuando needs_payment, para redirigir a /app/pago/{token} (no cita_id).
-- Aplicada al remoto como migracion `confirmar_oferta_pago_token`.
CREATE OR REPLACE FUNCTION public.confirmar_cita_oferta(p_cita_id uuid, p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cita public.citas;
  v_tel text;
begin
  select * into v_cita from public.citas
    where id = p_cita_id and es_oferta_espera = true and estado = 'pendiente';
  if not found then return jsonb_build_object('ok', false, 'error', 'oferta_no_disponible'); end if;
  select telefono into v_tel from public.clientes where id = v_cita.cliente_id;
  if public.normalizar_telefono(v_tel) is distinct from public.normalizar_telefono(p_telefono) then
    return jsonb_build_object('ok', false, 'error', 'telefono_no_coincide');
  end if;
  if v_cita.deposito_requerido and not v_cita.deposito_pagado then
    return jsonb_build_object('ok', false, 'needs_payment', true, 'cita_id', p_cita_id,
      'pago_token', coalesce(
        (select e.token from public.cita_pago_enlaces e
         where e.cita_id = p_cita_id and e.expira_at > now()
         order by e.created_at desc limit 1),
        public.enlace_pago_token(p_cita_id)
      ));
  end if;
  update public.citas set estado = 'confirmada', confirmacion_enviada = false, confirmada_cliente = true,
    confirmada_at = now(), modificado_at = now() where id = p_cita_id;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id);
end;
$function$;
