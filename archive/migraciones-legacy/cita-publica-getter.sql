-- Getter anonimo de una cita, gated por (cita_id + telefono del titular).
-- Alimenta la pagina de autogestion /app/cita/[id] (destino del enlace de los WhatsApp
-- de confirmacion / recordatorio). Mismo modelo de seguridad que cancelar/modificar_cita_publica:
-- NO abre SELECT a anon; solo devuelve la cita si el par (cita_id, telefono) casa.
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-17.

create or replace function public.cita_publica(p_slug text, p_cita_id uuid, p_telefono text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_cita    record;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'motivo', 'portal');
  end if;

  select c.id, c.estado, c.inicio, c.fin, c.servicio_id, c.profesional_id,
         coalesce(s.nombre, '')            as servicio,
         coalesce(s.cancelacion_horas, 24) as cancelacion_horas,
         coalesce(pr.nombre, '')           as profesional,
         coalesce(np.nombre_publico, '')   as salon
    into v_cita
  from public.citas c
  join public.clientes cl       on cl.id = c.cliente_id
  join public.negocio_portal np on np.negocio_id = c.negocio_id
  left join public.servicios s     on s.id = c.servicio_id
  left join public.profesionales pr on pr.id = c.profesional_id
  where c.id = p_cita_id and c.negocio_id = v_negocio and cl.telefono = trim(p_telefono);

  if v_cita.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  end if;

  return jsonb_build_object(
    'ok', true,
    'cita_id', v_cita.id,
    'estado', v_cita.estado,
    'servicio_id', v_cita.servicio_id,
    'servicio', v_cita.servicio,
    'profesional_id', v_cita.profesional_id,
    'profesional', v_cita.profesional,
    'inicio', v_cita.inicio,
    'fin', v_cita.fin,
    'salon', v_cita.salon,
    'slug', p_slug,
    'cancelable', (v_cita.estado in ('pendiente','confirmada') and v_cita.inicio > now()),
    'cancelacion_horas', v_cita.cancelacion_horas,
    'fuera_de_plazo', (v_cita.inicio < now() + make_interval(hours => v_cita.cancelacion_horas))
  );
end;
$function$;

grant execute on function public.cita_publica(text, uuid, text) to anon, authenticated, service_role;
