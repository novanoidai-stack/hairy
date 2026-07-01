-- Depositos dinamicos v3: aplicar el deposito client-aware tambien a las OFERTAS de lista
-- de espera. Aplicado al remoto como `depositos_dinamicos_ofertas`.

-- Helper reutilizable: deposito client-aware en centimos para (cliente, servicio). Aplica el
-- perfil de riesgo sobre la senal base del servicio si el negocio tiene el dinamico activo.
-- Reglas: exento=0, normal=base, riesgo=min(base*factor, precio), alto=precio (prepago total).
create or replace function public.deposito_dinamico_cents(p_cliente_id uuid, p_servicio_id uuid)
returns int
language plpgsql stable security definer set search_path = public
as $$
declare
  v_negocio text;
  v_precio numeric;
  v_base_cents int;
  v_activo boolean;
  v_factor numeric;
  v_uf int;
  v_ua int;
  v_tier text;
  v_precio_cents int;
begin
  select negocio_id, precio into v_negocio, v_precio from public.servicios where id = p_servicio_id;
  v_base_cents := coalesce(public.importe_senal_servicio(p_servicio_id), 0);
  v_precio_cents := coalesce(round(coalesce(v_precio,0) * 100)::int, 0);

  select coalesce((config->>'depositoDinamicoActivo')::boolean, false),
         coalesce((config->>'depositoFactorRiesgo')::numeric, 2),
         coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3),
         coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
    into v_activo, v_factor, v_uf, v_ua
    from public.negocio_config where negocio_id = v_negocio;

  if not coalesce(v_activo, false) then
    return v_base_cents;
  end if;

  v_tier := public.perfil_riesgo_cliente(p_cliente_id, coalesce(v_uf,3), coalesce(v_ua,2));
  if v_tier = 'exento' then return 0; end if;
  if v_tier = 'alto'   then return v_precio_cents; end if;
  if v_tier = 'riesgo' then return least(round(v_base_cents * coalesce(v_factor,2))::int, v_precio_cents); end if;
  return v_base_cents; -- normal
end;
$$;
revoke all on function public.deposito_dinamico_cents(uuid,uuid) from public, anon;
grant execute on function public.deposito_dinamico_cents(uuid,uuid) to authenticated, service_role;

-- _lista_espera_ofrecer: si la oferta pide senal, la calcula client-aware y guarda el importe
-- en la cita de oferta (deposito_importe) -> al confirmar se cobra lo del perfil, no la plana.
create or replace function public._lista_espera_ofrecer(p_oferta uuid, p_cand uuid, p_pide_senal boolean, p_ventana integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o public.lista_espera_ofertas;
  le public.lista_espera;
  v_cliente uuid;
  v_cita uuid;
  v_dep boolean;
  v_dep_cents int;
  v_salon text;
  v_servicio text;
begin
  select * into o from public.lista_espera_ofertas where id = p_oferta;
  select * into le from public.lista_espera where id = p_cand;

  v_cliente := le.cliente_id;
  if v_cliente is null then
    select id into v_cliente from public.clientes
      where negocio_id = o.negocio_id and telefono = le.telefono limit 1;
    if v_cliente is null then
      insert into public.clientes(negocio_id, nombre, telefono)
        values (o.negocio_id, coalesce(le.nombre, 'Cliente'), le.telefono) returning id into v_cliente;
    end if;
  end if;

  if coalesce(p_pide_senal, false) then
    v_dep_cents := public.deposito_dinamico_cents(v_cliente, o.servicio_id);
  else
    v_dep_cents := 0;
  end if;
  v_dep := v_dep_cents > 0;

  insert into public.citas(negocio_id, cliente_id, servicio_id, profesional_id, inicio, fin, fin_activa,
    fin_espera, estado, canal, es_oferta_espera, deposito_requerido, deposito_importe, deposito_pagado,
    confirmacion_enviada, senal_enviada, recordatorio_enviado)
  values (o.negocio_id, v_cliente, o.servicio_id, o.profesional_id, o.inicio, o.fin, o.fin_activa,
    o.fin_espera, 'pendiente', 'web', true, v_dep, nullif(v_dep_cents, 0) / 100.0, false, false, true, false)
  returning id into v_cita;

  update public.lista_espera_ofertas set candidato_cita_id = v_cita where id = p_oferta;
  update public.lista_espera set estado = 'avisado', avisado_at = now() where id = p_cand;

  select coalesce(nombre_publico, '') into v_salon from public.negocio_portal
    where negocio_id = o.negocio_id and portal_activo = true limit 1;
  select coalesce(nombre, '') into v_servicio from public.servicios where id = o.servicio_id;

  insert into public.lista_espera_avisos(negocio_id, lista_espera_id, cita_id, telefono, nombre, salon,
    servicio, fecha, hora, ventana_texto, template, estado)
  values (o.negocio_id, p_cand, v_cita, le.telefono, split_part(coalesce(le.nombre, ''), ' ', 1), v_salon,
    v_servicio, to_char(o.inicio at time zone 'Europe/Madrid', 'DD/MM'),
    to_char(o.inicio at time zone 'Europe/Madrid', 'HH24:MI'),
    public._lista_espera_ventana_texto(p_ventana), 'aviso_lista_espera', 'pendiente');
end;
$function$;
