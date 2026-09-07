-- Cierres de seguridad y consistencia descubiertos en la auditoría de producción
-- del 8 sep 2026. Se ejecuta por supabase db push; no aplicar desde el editor SQL.

-- -----------------------------------------------------------------------------
-- Portal público: la función histórica aceptaba que anon declarase otro canal y
-- solo aplicaba el rate-limit cuando el canal decía "web". La envolvemos para que
-- el canal público sea siempre web y para exigir/consumir captcha cuando el salón
-- lo tiene activo. El cuerpo histórico queda detrás de una puerta de servidor y
-- no se toca su lógica de disponibilidad.
-- -----------------------------------------------------------------------------
alter function public.crear_cita_publica(
  text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text
) rename to crear_cita_publica_legacy_20260908;

create or replace function public.crear_cita_publica(
  p_slug text,
  p_servicio_id uuid,
  p_profesional_id uuid,
  p_inicio timestamp with time zone,
  p_nombre text,
  p_telefono text,
  p_email text default null,
  p_notas text default null,
  p_consiente_ia boolean default false,
  p_captcha_token text default null,
  p_canal text default 'web'
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
  v_canal text := case when coalesce(auth.role(), '') = 'anon' then 'web'
                       when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal
                       else 'web' end;
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

  -- El token ya se ha consumido aquí. El legado recibe NULL para no consumirlo dos veces.
  return public.crear_cita_publica_legacy_20260908(
    p_slug, p_servicio_id, p_profesional_id, p_inicio, p_nombre, p_telefono,
    p_email, p_notas, p_consiente_ia, null, v_canal
  );
end;
$$;

revoke all on function public.crear_cita_publica(
  text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text
) from public;
-- Se expone al portal: el wrapper deriva el negocio del slug, limita por IP y exige captcha si el salón lo activa.
grant execute on function public.crear_cita_publica(
  text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text
) to anon, authenticated, service_role;
revoke all on function public.crear_cita_publica_legacy_20260908(
  text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.crear_cita_publica_legacy_20260908(
  text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text
) to service_role;

comment on function public.crear_cita_publica(text, uuid, uuid, timestamp with time zone, text, text, text, text, boolean, text, text)
is 'Portal público: deriva el negocio del slug, aplica rate-limit a todo canal público y exige captcha cuando el salón lo activa.';

-- -----------------------------------------------------------------------------
-- Señales: serializar por la cita, bloquear citas canceladas/pasadas y no crear
-- otra señal después de que ya exista una pagada.
-- -----------------------------------------------------------------------------
create or replace function public.requerir_senal_cita(p_cita_id uuid)
returns public.pagos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_total int;
  v_pago public.pagos;
begin
  select * into v_cita from public.citas where id = p_cita_id for update;
  if not found then raise exception 'cita_not_found'; end if;
  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;

  if v_cita.grupo_id is not null then
    select coalesce(sum(public.importe_senal_servicio(c.servicio_id)), 0)
      into v_total from public.citas c where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1 for update;
  else
    if v_cita.deposito_importe is not null then
      v_total := round(v_cita.deposito_importe * 100)::int;
    elsif coalesce(v_cita.deposito_requerido, false) then
      v_total := public.importe_senal_servicio(v_cita.servicio_id);
    else
      v_total := 0;
    end if;
    v_cabecera := v_cita.id;
  end if;

  if exists (select 1 from public.citas where id = v_cabecera
             and (estado = 'cancelada' or inicio <= now())) then
    raise exception 'cita_no_reservable';
  end if;
  if coalesce(v_total, 0) <= 0 then return null; end if;

  if exists (select 1 from public.pagos where cita_id = v_cabecera and tipo = 'senal' and estado = 'pagado') then
    raise exception 'senal_ya_pagada';
  end if;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pendiente'
    limit 1 for update;
  if found then
    update public.pagos set importe_cents = v_total, updated_at = now()
      where id = v_pago.id returning * into v_pago;
  else
    insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado)
    values (v_cita.negocio_id, v_cabecera, v_cita.cliente_id, 'senal', v_total, 'pendiente')
    returning * into v_pago;
  end if;
  return v_pago;
end;
$$;

revoke all on function public.requerir_senal_cita(uuid) from public, anon;
grant execute on function public.requerir_senal_cita(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tarjeta regalo: saldo y movimiento en una sola transacción, con bloqueo de
-- fila e idempotencia por cobro. El cliente ya no escribe ambas tablas por separado.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_tarjeta_regalo_a_cobro(
  p_tarjeta_id uuid,
  p_cobro_id uuid,
  p_importe_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarjeta public.tarjetas_regalo;
  v_cobro public.cobros;
begin
  if p_importe_cents <= 0 then raise exception 'importe_invalido'; end if;
  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'cobro_no_encontrado'; end if;
  perform public.exige_mi_negocio(v_cobro.negocio_id, false);

  select * into v_tarjeta from public.tarjetas_regalo
    where id = p_tarjeta_id for update;
  if not found or v_tarjeta.negocio_id is distinct from v_cobro.negocio_id then
    raise exception 'tarjeta_no_encontrada';
  end if;
  if exists (select 1 from public.tarjetas_regalo_movimientos
             where tarjeta_id = p_tarjeta_id and cobro_id = p_cobro_id and importe_cents < 0) then
    raise exception 'tarjeta_ya_aplicada';
  end if;
  if v_tarjeta.saldo_actual_cents < p_importe_cents then
    raise exception 'saldo_insuficiente';
  end if;

  update public.tarjetas_regalo
     set saldo_actual_cents = saldo_actual_cents - p_importe_cents
   where id = p_tarjeta_id;
  insert into public.tarjetas_regalo_movimientos(tarjeta_id, cobro_id, importe_cents)
  values (p_tarjeta_id, p_cobro_id, -p_importe_cents);
  return p_importe_cents;
end;
$$;

revoke all on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer) from public, anon;
grant execute on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer) to authenticated, service_role;
comment on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer)
is 'Descuenta saldo y registra movimiento de tarjeta regalo atomically, atado al negocio del cobro.';

notify pgrst, 'reload schema';
