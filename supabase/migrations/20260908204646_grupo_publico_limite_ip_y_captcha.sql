-- Portal publico, reserva de GRUPO: limite por IP y captcha, como la individual.
--
-- QUE LE FALTABA, exactamente. El informe del 8 sep decia "sin rate-limit y sin
-- captcha"; leida la funcion desplegada, hay que matizarlo, porque topes SI tenia:
--   * maximo 6 asistentes por reserva,
--   * maximo 6 citas pendientes por telefono (contando el grupo entero),
--   * techo de 40 reservas web por hora y salon, que ademas SUMA los asistentes.
-- Lo que no tenia es lo que si tiene la individual desde hoy: **freno por IP** y
-- **captcha**. Su parametro `p_captcha_token` existe en la firma desde siempre y el
-- cuerpo NO LO USA NI UNA VEZ: se acepta y se tira. Un parametro que se ignora es
-- peor que no tenerlo, porque el cliente cree que esta mandando una defensa.
--
-- Mismo patron que la individual (20260908150851): el cuerpo historico se renombra y
-- queda detras de una puerta de servidor, y el envoltorio hace el control. No se toca
-- su logica de disponibilidad, que es la parte delicada.
--
-- El freno de IP comparte cubo con la individual (`crear_cita_publica_ip`) A
-- PROPOSITO: si fueran cubos distintos, un bot alternaria las dos puertas y tendria
-- el doble de presupuesto. Se cobra una unidad por LLAMADA, no por asistente; lo que
-- acota el dano por persona es el techo de 40/hora del salon, que ya cuenta v_n.

alter function public.crear_cita_publica_grupo(
  text, timestamp with time zone, text, text, text, jsonb, boolean, text
) rename to crear_cita_publica_grupo_legacy_20260908;

create or replace function public.crear_cita_publica_grupo(
  p_slug text,
  p_inicio timestamp with time zone,
  p_reservante_nombre text,
  p_reservante_telefono text,
  p_reservante_email text,
  p_asistentes jsonb,
  p_consentimiento_datos boolean default true,
  p_captcha_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_captcha_exigido boolean;
  v_ip text;
  v_publica boolean := coalesce(auth.role(), '') = 'anon';
begin
  select negocio_id, coalesce(captcha_activo, false)
    into v_negocio, v_captcha_exigido
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;

  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if v_publica then
    v_ip := public.request_ip();
    if not public.rate_limit_ok('crear_cita_publica_ip', v_ip, 5, interval '1 minute') then
      raise exception 'Demasiados intentos desde esta conexión. Por favor, espera un minuto o contacta con el salón.';
    end if;
    if v_captcha_exigido then
      if p_captcha_token is null or length(trim(p_captcha_token)) = 0 then
        raise exception 'La verificación de seguridad es obligatoria. Por favor, inténtalo de nuevo.';
      end if;
      if not public.consumir_captcha_token(p_captcha_token) then
        raise exception 'La verificación de seguridad ha caducado o no es válida. Por favor, inténtalo de nuevo.';
      end if;
    end if;
  end if;

  -- El token ya se ha consumido aqui. Al legado se le pasa NULL, que es lo mismo
  -- que recibia antes: no lo mira.
  return public.crear_cita_publica_grupo_legacy_20260908(
    p_slug, p_inicio, p_reservante_nombre, p_reservante_telefono, p_reservante_email,
    p_asistentes, p_consentimiento_datos, null
  );
end;
$$;

revoke all on function public.crear_cita_publica_grupo(
  text, timestamp with time zone, text, text, text, jsonb, boolean, text
) from public;
-- Se expone al portal: el envoltorio deriva el negocio del slug, frena por IP y exige
-- captcha si el salon lo activa. Misma justificacion que la individual.
grant execute on function public.crear_cita_publica_grupo(
  text, timestamp with time zone, text, text, text, jsonb, boolean, text
) to anon, authenticated, service_role;

revoke all on function public.crear_cita_publica_grupo_legacy_20260908(
  text, timestamp with time zone, text, text, text, jsonb, boolean, text
) from public, anon, authenticated;
grant execute on function public.crear_cita_publica_grupo_legacy_20260908(
  text, timestamp with time zone, text, text, text, jsonb, boolean, text
) to service_role;

comment on function public.crear_cita_publica_grupo(text, timestamp with time zone, text, text, text, jsonb, boolean, text)
is 'Portal publico (grupo): deriva el negocio del slug, frena por IP y exige captcha cuando el salon lo activa. El cuerpo historico vive en crear_cita_publica_grupo_legacy_20260908, solo para service_role.';

notify pgrst, 'reload schema';
