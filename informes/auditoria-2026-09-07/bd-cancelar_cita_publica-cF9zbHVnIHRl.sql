CREATE OR REPLACE FUNCTION public.cancelar_cita_publica(p_slug text, p_cita_id uuid, p_telefono text, p_motivo text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_cita    record;
  v_horas   int;
  v_fuera   boolean;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  select c.id, c.estado, c.inicio, coalesce(s.cancelacion_horas, 24) as cancelacion_horas
    into v_cita
  from public.citas c
  join public.clientes cl on cl.id = c.cliente_id
  left join public.servicios s on s.id = c.servicio_id
  where c.id = p_cita_id and c.negocio_id = v_negocio
    and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono);
  if v_cita.id is null then raise exception 'Cita no encontrada'; end if;
  if v_cita.estado not in ('pendiente','confirmada') then raise exception 'La cita no se puede cancelar'; end if;
  if v_cita.inicio <= now() then raise exception 'La cita ya ha pasado'; end if;

  v_horas := v_cita.cancelacion_horas;
  v_fuera := v_cita.inicio < now() + make_interval(hours => v_horas);

  update public.citas
    set estado = 'cancelada',
        cancelado_por = case when coalesce(nullif(trim(p_canal),''),'web') in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end,
        motivo_cancelacion = left(nullif(trim(p_motivo), ''), 300),
        modificado_at = now()
  where id = p_cita_id;

  return jsonb_build_object(
    'ok', true,
    'cita_id', p_cita_id,
    'estado', 'cancelada',
    'fuera_de_plazo', v_fuera,
    'cancelacion_horas', v_horas
  );
end;
$function$
