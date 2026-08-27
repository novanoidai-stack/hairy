-- Depositos dinamicos por perfil de riesgo (Entregable 1: motor + online). OFF por defecto:
-- nada cambia hasta que el negocio active `depositoDinamicoActivo` en negocio_config.config.
-- El perfil de riesgo modula la senal base del servicio.
-- Aplicado al remoto como migraciones: depositos_dinamicos_motor_a / _motor_b_crear_cita /
-- depositos_dinamicos_requerir_fix / citas_estado_no_presentada_y_perfil.

-- 1) Override manual por cliente (null = automatico por historial).
alter table public.clientes add column if not exists deposito_perfil_override text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_deposito_perfil_override_chk') then
    alter table public.clientes add constraint clientes_deposito_perfil_override_chk
      check (deposito_perfil_override is null or deposito_perfil_override in ('exento','normal','riesgo','alto'));
  end if;
end $$;

-- 2) El check de citas.estado admite 'no_presentada' (valor canonico del frontend/informes)
--    ademas de 'no_show'. Antes solo 'no_show' -> marcar no-show fallaba en silencio.
alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas add constraint citas_estado_check
  check (estado in ('pendiente','confirmada','completada','cancelada','no_show','no_presentada'));

-- 3) Perfil de riesgo del cliente. Override manual > bloqueado > historial (no-shows/completadas).
--    Sirve tambien para el indicador de riesgo del Modular 2.
create or replace function public.perfil_riesgo_cliente(
  p_cliente_id uuid,
  p_umbral_fiable int default 3,
  p_umbral_alto int default 2
) returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_override text;
  v_bloqueado boolean;
  v_negocio text;
  v_completadas int;
  v_noshows int;
begin
  select deposito_perfil_override, bloqueado, negocio_id
    into v_override, v_bloqueado, v_negocio
    from public.clientes where id = p_cliente_id;
  if not found then return null; end if;
  if auth.uid() is not null and v_negocio is distinct from public.my_negocio_id_text() then
    return null;
  end if;
  if v_override is not null then return v_override; end if;
  if coalesce(v_bloqueado, false) then return 'alto'; end if;

  select count(*) filter (where estado = 'completada'),
         count(*) filter (where estado in ('no_show','no_presentada'))
    into v_completadas, v_noshows
  from public.citas where cliente_id = p_cliente_id;

  if v_noshows >= greatest(p_umbral_alto, 1) then return 'alto'; end if;
  if v_noshows >= 1 then return 'riesgo'; end if;
  if v_completadas >= greatest(p_umbral_fiable, 1) then return 'exento'; end if;
  return 'normal';
end;
$$;
revoke all on function public.perfil_riesgo_cliente(uuid,int,int) from public, anon;
grant execute on function public.perfil_riesgo_cliente(uuid,int,int) to authenticated, service_role;

-- 4) Checkout coherente: cobra el deposito_importe ya calculado (client-aware) en vez de
--    recalcular la senal plana del servicio. Sin deposito -> no cobra. Grupos: sin cambios.
create or replace function public.requerir_senal_cita(p_cita_id uuid)
returns public.pagos
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_total int;
  v_pago public.pagos;
begin
  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_not_found'; end if;

  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;

  if v_cita.grupo_id is not null then
    select coalesce(sum(public.importe_senal_servicio(c.servicio_id)), 0)
      into v_total from public.citas c where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1;
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

  if coalesce(v_total, 0) <= 0 then return null; end if;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pendiente' limit 1;
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
$function$;

-- 5) crear_cita_publica: aplica el deposito dinamico (modula la senal base por perfil) cuando
--    el negocio lo activa. Con el toggle OFF se comporta identico a antes.
CREATE OR REPLACE FUNCTION public.crear_cita_publica(p_slug text, p_servicio_id uuid, p_profesional_id uuid, p_inicio timestamp with time zone, p_cliente_nombre text, p_cliente_telefono text, p_cliente_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_canal text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio    text;
  v_dur        int;
  v_espera     int;
  v_extra      int;
  v_total      int;
  v_min_ant    int;
  v_precio     numeric;
  v_prepago    boolean;
  v_prepago_pct numeric;
  v_prepago_fijo numeric;
  v_cliente    uuid;
  v_cita       uuid;
  v_fin        timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
  v_deposito   numeric := 0;
  v_estado     text;
  v_canal      text;
  v_tz         text := 'Europe/Madrid';
begin
  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  if coalesce(length(trim(p_cliente_nombre)), 0) < 2 then
    raise exception 'Indica tu nombre.';
  end if;
  if coalesce(length(trim(p_cliente_telefono)), 0) < 6 then
    raise exception 'Indica un telefono valido.';
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fija
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (
    select 1 from public.profesionales
    where id = p_profesional_id and negocio_id = v_negocio and activo = true
  ) then raise exception 'Profesional no valido'; end if;

  if exists (
    select 1 from public.clientes
    where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono)
      and bloqueado = true
  ) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (
    select count(*)
    from public.citas c
    join public.clientes cl on cl.id = c.cliente_id
    where c.negocio_id = v_negocio
      and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_cliente_telefono)
      and c.estado in ('pendiente','confirmada')
      and c.inicio > now()
  ) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (
    select count(*) from public.citas
    where negocio_id = v_negocio and canal = 'web' and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  v_total      := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin        := p_inicio + make_interval(mins => v_total);

  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then
    raise exception 'Fuera de la antelacion minima';
  end if;

  if not exists (
    select 1 from public.horarios_profesional h
    where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio
      and (v_fin    at time zone v_tz)::time <= h.hora_fin
  ) then raise exception 'Fuera del horario laboral'; end if;

  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and c.inicio < v_fin and c.fin > p_inicio
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio
  ) then raise exception 'El profesional no esta disponible'; end if;

  select id into v_cliente
  from public.clientes
  where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_cliente_telefono)
  limit 1;
  if v_cliente is null then
    insert into public.clientes (negocio_id, nombre, telefono, email)
    values (
      v_negocio,
      left(trim(p_cliente_nombre), 120),
      trim(p_cliente_telefono),
      left(nullif(trim(p_cliente_email), ''), 200)
    )
    returning id into v_cliente;
  end if;

  -- Senal base del servicio
  if v_prepago then
    if v_prepago_fijo is not null and v_prepago_fijo > 0 then
      v_deposito := v_prepago_fijo;
    elsif v_prepago_pct is not null and v_prepago_pct > 0 then
      v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
    end if;
  end if;

  -- Deposito dinamico por perfil de riesgo (si el negocio lo activa). Modula la senal base.
  if coalesce((select (config->>'depositoDinamicoActivo')::boolean
                 from public.negocio_config where negocio_id = v_negocio), false) then
    declare
      v_tier   text;
      v_factor numeric;
      v_uf     int;
      v_ua     int;
    begin
      select coalesce((config->>'depositoFactorRiesgo')::numeric, 2),
             coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3),
             coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
        into v_factor, v_uf, v_ua
        from public.negocio_config where negocio_id = v_negocio;
      v_tier := public.perfil_riesgo_cliente(v_cliente, coalesce(v_uf,3), coalesce(v_ua,2));
      if v_tier = 'exento' then
        v_deposito := 0;
      elsif v_tier = 'riesgo' then
        v_deposito := least(round(v_deposito * coalesce(v_factor,2), 2), coalesce(v_precio,0));
      elsif v_tier = 'alto' then
        v_deposito := coalesce(v_precio, 0);
      end if;
    end;
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (
    negocio_id, profesional_id, servicio_id, cliente_id,
    inicio, fin, fin_activa, fin_espera,
    estado, canal, notas,
    deposito_requerido, deposito_pagado, deposito_importe,
    confirmado_por_cliente
  ) values (
    v_negocio, p_profesional_id, p_servicio_id, v_cliente,
    p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500),
    (v_deposito > 0), false, nullif(v_deposito, 0),
    true
  )
  returning id into v_cita;

  return jsonb_build_object(
    'cita_id', v_cita,
    'cliente_id', v_cliente,
    'estado', v_estado,
    'canal', v_canal,
    'deposito_requerido', (v_deposito > 0),
    'deposito_importe', v_deposito,
    'inicio', p_inicio,
    'fin', v_fin
  );
end;
$function$;
