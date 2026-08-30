-- Migración: gate_suscripcion_triggers_y_portal
-- 1. Actualiza caducar_pruebas_vencidas para no tocar el plan (modo lectura/portabilidad).
-- 2. Engancha statement triggers de gate a todas las tablas operativas de salon.
-- 3. Actualiza crear_cita_publica, disponibilidad_publica y portal_info para verificar acceso.
-- 4. Añade comprobación 12 a vigilancia_bd().

-- 1. Actualizar caducar_pruebas_vencidas para NO bajar el plan a free
CREATE OR REPLACE FUNCTION public.caducar_pruebas_vencidas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_negocios text[];
  v_neg      text;
begin
  perform set_config('mecha.identity_ctx', '1', true);

  with vencidos as (
    select p.id, p.negocio_id
      from public.profiles p
     where p.suscripcion_estado = 'prueba'
       and p.trial_ends_at is not null
       and p.trial_ends_at < now()
       and coalesce(p.negocio_id, '') not in ('', 'demo_salon_001')
       and p.id = public.titular_del_negocio(p.negocio_id)
  ), actualizados as (
    update public.profiles p
       set suscripcion_estado = 'caducada',
           updated_at = now()
      from vencidos v
     where p.id = v.id
    returning p.negocio_id
  )
  select array_agg(distinct negocio_id) into v_negocios from actualizados;

  if v_negocios is null then
    return 0;
  end if;

  foreach v_neg in array v_negocios loop
    perform public.sincronizar_plan_negocio(v_neg);
  end loop;

  return coalesce(array_length(v_negocios, 1), 0);
end;
$$;

-- 2. Enganchar triggers en tablas con negocio_id (excepto exentas) y tablas hijas de operacion
DO $$
declare
  r record;
  v_tablas text[] := array[
    -- Tablas con negocio_id (80)
    'bloqueos_profesional', 'bonos', 'campana_destinatarios', 'campanas', 'categorias_servicio',
    'chispa_acciones', 'chispa_memoria', 'cierres_negocio', 'cita_consumos', 'cita_fases',
    'cita_pago_enlaces', 'cita_productos', 'citas', 'citas_historial', 'citas_propuestas_cambio',
    'cliente_fotos', 'clientes', 'cobros', 'cola_dia', 'comisiones', 'comisiones_por_categoria',
    'comisiones_tramos', 'config_fiscal', 'consentimientos_cliente', 'contratos', 'conversaciones',
    'conversaciones_ia', 'cumpleanos_avisos', 'facturas', 'fichajes', 'fichas_tecnicas_color',
    'fuga_clientas_avisos', 'gastos', 'grupos_familiares', 'hallazgos_ia', 'hallazgos_notificaciones',
    'informes_periodicos_enviados', 'inventario', 'jornada_correcciones', 'lista_espera',
    'lista_espera_avisos', 'lista_espera_ofertas', 'logros', 'logros_desbloqueados',
    'movimientos_inventario', 'n8n_webhook_config', 'negocio_clasificacion', 'negocio_config',
    'negocio_fotos', 'negocio_horarios', 'negocio_limites', 'negocio_pasarela', 'negocio_portal',
    'niveles_fidelizacion', 'notas_internas_cliente', 'objetivos_profesional', 'pagos',
    'planes_ia', 'presupuesto_conceptos', 'presupuestos', 'productos', 'productos_con_stock',
    'profesional_categorias_historial', 'profesionales', 'pruebas_alergia', 'recompensas',
    'recompensas_canjeadas', 'recursos', 'resenas', 'reservas_grupo', 'salon_acceso',
    'service_addons', 'service_category_pricing', 'service_variants', 'servicios',
    'servicios_combinables', 'servicios_sugeridos', 'sesiones_caja', 'tickets_verifactu',
    'turnos_intercambio',
    -- Tablas hijas sin negocio_id escritas por usuarios de salon (9)
    'cobro_lineas', 'horarios_profesional', 'presupuesto_lineas', 'mensajes_conversacion',
    'cita_addons', 'bono_sesiones', 'duraciones_profesional', 'grupo_familiar_miembros',
    'professional_service_overrides'
  ];
  t text;
begin
  foreach t in array v_tablas loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format(
        'drop trigger if exists trg_gate_suscripcion_exige_acceso on public.%I;
         create trigger trg_gate_suscripcion_exige_acceso
           before insert or update or delete
           on public.%I
           for each statement
           execute function public.exige_negocio_con_acceso();',
        t, t
      );
    end if;
  end loop;
end;
$$;

-- 3. Actualizar RPCs del portal publico (crear_cita_publica, disponibilidad_publica, portal_info)
CREATE OR REPLACE FUNCTION public.crear_cita_publica(
  p_slug text,
  p_servicio_id uuid,
  p_profesional_id uuid,
  p_inicio timestamp with time zone,
  p_nombre text,
  p_telefono text,
  p_email text DEFAULT NULL::text,
  p_notas text DEFAULT NULL::text,
  p_canal text DEFAULT 'web'::text,
  p_consiente_ia boolean DEFAULT false,
  p_captcha_token text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_negocio text; v_dur int; v_espera int; v_extra int; v_total int; v_min_ant int;
  v_precio numeric; v_prepago boolean; v_prepago_pct numeric; v_prepago_fijo numeric;
  v_cliente uuid; v_cita uuid; v_fin timestamptz; v_fin_activa timestamptz; v_fin_espera timestamptz;
  v_deposito numeric := 0; v_estado text; v_canal text; v_tz text := 'Europe/Madrid';
  v_nivel_sin_deposito boolean := false;
  v_ip text;
  v_captcha_exigido boolean := false;
  v_tel_clean text;
begin
  v_canal := case when p_canal in ('web','whatsapp','agente_voz','asistente_ia') then p_canal else 'web' end;

  select negocio_id, coalesce(captcha_activo, false)
    into v_negocio, v_captcha_exigido
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;

  if v_negocio is null then raise exception 'Portal no disponible'; end if;

  -- Gate de suscripcion: salon caducado o sin acceso
  if not public.negocio_con_acceso(v_negocio) then
    raise exception 'El servicio de reserva online no esta disponible temporalmente para este salon. Por favor, contacta directamente con el establecimiento.';
  end if;

  -- Rate Limiting por IP para canal web (máx 5 peticiones por minuto)
  if v_canal = 'web' then
    v_ip := public.request_ip();
    if not public.rate_limit_ok('crear_cita_publica_ip', v_ip, 5, interval '1 minute') then
      raise exception 'Demasiados intentos desde esta conexión. Por favor, espera un minuto o contacta con el salón.';
    end if;
  end if;

  -- Validación de Captcha de un solo uso
  if p_captcha_token is not null and length(trim(p_captcha_token)) > 0 then
    if not public.consumir_captcha_token(p_captcha_token) then
      raise exception 'La verificación de seguridad ha caducado o no es válida. Por favor, inténtalo de nuevo.';
    end if;
  end if;

  if exists (select 1 from public.cierres_negocio cn
      where cn.negocio_id = v_negocio and cn.fecha = (p_inicio at time zone v_tz)::date) then
    raise exception 'El salon esta cerrado ese dia';
  end if;

  if coalesce(length(trim(p_nombre)), 0) < 2 then raise exception 'Indica tu nombre.'; end if;

  -- Validación y normalización de teléfono
  v_tel_clean := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 or length(v_tel_clean) < 8 then
    raise exception 'Indica un teléfono móvil válido para la confirmación de la cita.';
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0), precio, coalesce(prepago_requerido,false), prepago_porcentaje, prepago_cantidad_fijo
    into v_dur, v_espera, v_extra, v_min_ant, v_precio, v_prepago, v_prepago_pct, v_prepago_fijo
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;

  if v_dur is null then raise exception 'Servicio no reservable'; end if;

  if not exists (select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio and activo = true)
  then raise exception 'Profesional no valido'; end if;

  -- Override activo = false: ese profesional no realiza este servicio.
  if not public.profesional_ofrece_servicio(p_profesional_id, p_servicio_id) then
    raise exception 'Ese profesional no realiza este servicio';
  end if;

  -- Duracion efectiva: override del profesional por encima del catalogo.
  select d.activa, d.espera, d.extra
    into v_dur, v_espera, v_extra
  from public.duracion_efectiva_profesional(p_servicio_id, p_profesional_id, v_dur, v_espera, v_extra) d;

  if exists (select 1 from public.clientes where negocio_id = v_negocio
      and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) and bloqueado = true) then
    raise exception 'No es posible completar la reserva online con estos datos. Por favor, contacta directamente con el salon.';
  end if;

  if (select count(*) from public.citas c join public.clientes cl on cl.id = c.cliente_id
      where c.negocio_id = v_negocio and public.normalizar_telefono(cl.telefono) = public.normalizar_telefono(p_telefono)
        and c.estado in ('pendiente','confirmada') and c.inicio > now()) >= 3 then
    raise exception 'Ya tienes varias citas pendientes. Para mas reservas, contacta con el salon.';
  end if;

  if v_canal = 'web' and (select count(*) from public.citas where negocio_id = v_negocio and canal = 'web' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'La reserva online no esta disponible en este momento. Llama al salon, por favor.';
  end if;

  v_total := v_dur + v_espera + v_extra;
  v_fin_activa := p_inicio + make_interval(mins => v_dur);
  v_fin_espera := p_inicio + make_interval(mins => v_dur + v_espera);
  v_fin := p_inicio + make_interval(mins => v_total);

  if p_inicio < now() + make_interval(mins => greatest(v_min_ant, 0)) then raise exception 'Fuera de la antelacion minima'; end if;

  if not exists (select 1 from public.horarios_profesional h where h.profesional_id = p_profesional_id
      and h.dia_semana = extract(dow from (p_inicio at time zone v_tz))::int
      and (p_inicio at time zone v_tz)::time >= h.hora_inicio and (v_fin at time zone v_tz)::time <= h.hora_fin)
  then raise exception 'Fuera del horario laboral'; end if;

  -- Comprobación respetando huecos de reposo químico (no solapar fase activa ni extra)
  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < v_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < v_fin
         and c.fin > p_inicio)
      )
  ) then raise exception 'El hueco ya esta ocupado'; end if;

  if exists (select 1 from public.bloqueos_profesional b where b.profesional_id = p_profesional_id
      and b.inicio < v_fin and b.fin > p_inicio) then raise exception 'El profesional no esta disponible'; end if;

  select id into v_cliente from public.clientes where negocio_id = v_negocio
    and public.normalizar_telefono(telefono) = public.normalizar_telefono(p_telefono) limit 1;

  if v_cliente is null then
    insert into public.clientes (
      negocio_id, nombre, telefono, email,
      consiente_ia, consiente_ia_origen, consiente_ia_fecha
    )
    values (
      v_negocio,
      left(trim(p_nombre), 120),
      trim(p_telefono),
      left(nullif(trim(p_email), ''), 200),
      p_consiente_ia,
      case when p_consiente_ia then 'portal' else null end,
      case when p_consiente_ia then now() else null end
    )
    returning id into v_cliente;
  else
    update public.clientes
       set consiente_ia = p_consiente_ia,
           consiente_ia_origen = 'portal',
           consiente_ia_fecha = now()
     where id = v_cliente
       and (consiente_ia is distinct from p_consiente_ia or consiente_ia_origen is null);
  end if;

  v_nivel_sin_deposito := coalesce((public.obtener_nivel_cliente(v_cliente)->'nivel'->>'sin_deposito')::boolean, false);

  if v_nivel_sin_deposito then
    v_deposito := 0;
  else
    if v_prepago then
      if v_prepago_fijo is not null and v_prepago_fijo > 0 then v_deposito := v_prepago_fijo;
      elsif v_prepago_pct is not null and v_prepago_pct > 0 then v_deposito := round(coalesce(v_precio, 0) * v_prepago_pct / 100.0, 2);
      end if;
    end if;

    if coalesce((select (config->>'depositoDinamicoActivo')::boolean from public.negocio_config where negocio_id = v_negocio), false) then
      declare v_tier text; v_factor numeric; v_uf int; v_ua int;
      begin
        select coalesce((config->>'depositoFactorRiesgo')::numeric, 2), coalesce((config->>'depositoUmbralFiableCompletadas')::int, 3), coalesce((config->>'depositoUmbralAltoNoShows')::int, 2)
          into v_factor, v_uf, v_ua from public.negocio_config where negocio_id = v_negocio;
        v_tier := public.perfil_riesgo_cliente(v_cliente, coalesce(v_uf,3), coalesce(v_ua,2));
        if v_tier = 'exento' then v_deposito := 0;
        elsif v_tier = 'riesgo' then v_deposito := least(round(v_deposito * coalesce(v_factor,2), 2), coalesce(v_precio,0));
        elsif v_tier = 'alto' then v_deposito := coalesce(v_precio, 0);
        end if;
      end;
    end if;
  end if;

  v_estado := case when v_deposito > 0 then 'pendiente' else 'confirmada' end;

  insert into public.citas (negocio_id, profesional_id, servicio_id, cliente_id, inicio, fin, fin_activa, fin_espera,
    estado, canal, notas, deposito_requerido, deposito_pagado, deposito_importe, confirmado_por_cliente,
    consentimiento_datos, consentimiento_at)
  values (v_negocio, p_profesional_id, p_servicio_id, v_cliente, p_inicio, v_fin, v_fin_activa, v_fin_espera,
    v_estado, v_canal, left(nullif(trim(p_notas), ''), 500), (v_deposito > 0), false, nullif(v_deposito, 0), true,
    true, now())
  returning id into v_cita;

  return jsonb_build_object('cita_id', v_cita, 'cliente_id', v_cliente, 'estado', v_estado, 'canal', v_canal,
    'deposito_requerido', (v_deposito > 0), 'deposito_importe', v_deposito, 'inicio', p_inicio, 'fin', v_fin);
end;
$$;

CREATE OR REPLACE FUNCTION public.disponibilidad_publica(
  p_slug text,
  p_servicio_id uuid,
  p_fecha date,
  p_profesional_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  profesional_id uuid,
  profesional_nombre text,
  slot timestamp with time zone,
  en_reposo boolean,
  reposo_disponible_min integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text;
  v_rec_tipo  text;
  v_rec_fase  text;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  -- Gate de suscripcion: salon caducado o sin acceso
  if not public.negocio_con_acceso(v_negocio) then
    return;
  end if;

  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid')
    into v_tz
  from public.negocio_config c
  where c.negocio_id = v_negocio;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0),
         recurso_tipo, coalesce(recurso_fase, 'final')
    into v_dur, v_espera, v_extra, v_min_ant,
         v_rec_tipo, v_rec_fase
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  return query
  with profs as (
    select pr.id, pr.nombre, d.total
    from public.profesionales pr
    cross join lateral public.duracion_efectiva_profesional(p_servicio_id, pr.id, v_dur, v_espera, v_extra) d
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
      and public.profesional_ofrece_servicio(pr.id, p_servicio_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin, p.total
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           f.total,
           (g.ts at time zone v_tz) as slot_tz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => f.total),
      interval '15 minutes'
    ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz, reposo.en_reposo, reposo.disponible_min
  from gen
  join profs pr on pr.id = gen.profesional_id
  cross join lateral (
    select
      exists (
        select 1 from public.citas c2
        where c2.profesional_id = gen.profesional_id
          and c2.estado in ('pendiente','confirmada')
          and c2.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and c2.fin    > gen.slot_tz
      ) as en_reposo,
      (
        select min(round(extract(epoch from (
          coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
        )) / 60)::int)
        from public.citas c3
        where c3.profesional_id = gen.profesional_id
          and c3.estado in ('pendiente','confirmada')
          and c3.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and c3.fin    > gen.slot_tz
      ) as disponible_min
  ) reposo
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => gen.total)
        and b.fin    > gen.slot_tz
    )
    and (
      v_rec_tipo is null
      or public.recurso_hay_hueco_negocio(
        v_negocio,
        v_rec_tipo,
        case when v_rec_fase = 'completa' then gen.slot_tz else gen.slot_tz + make_interval(mins => v_dur + v_espera) end,
        gen.slot_tz + make_interval(mins => gen.total)
      )
    )
  order by gen.slot_tz, pr.nombre;
end;
$$;

CREATE OR REPLACE FUNCTION public.portal_info(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  select case when np.negocio_id is null then null else jsonb_build_object(
    'negocio', jsonb_build_object(
      'slug', np.slug, 'nombre', np.nombre_publico, 'logo_url', np.logo_url, 'direccion', np.direccion,
      'telefono', np.telefono, 'web', np.web, 'idioma', np.idioma, 'mostrar_precios', np.mostrar_precios,
      'color_acento', np.color_acento,
      'ciudad', np.ciudad,
      'analytics_config', coalesce(np.analytics_config, '{"enabled": false, "measurementId": "", "consentGiven": false}'::jsonb),
      'captcha_site_key', np.captcha_site_key,
      'fondo_portal_url', np.fondo_portal_url,
      'suscripcion_activa', public.negocio_con_acceso(np.negocio_id)
    ),
    'servicios', case when not public.negocio_con_acceso(np.negocio_id) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nombre', s.nombre, 'descripcion', s.descripcion, 'precio', s.precio,
        'duracion', s.duracion_activa_min + coalesce(s.duracion_espera_min,0) + coalesce(s.duracion_activa_extra_min,0),
        'categoria', s.categoria, 'categoria_id', s.categoria_id, 'categoria_nombre', cs.nombre,
        'categoria_color', cs.color, 'prepago', coalesce(s.prepago_requerido, false), 'foto_url', s.foto_url
      ) order by cs.orden nulls last, s.nombre)
      from public.servicios s left join public.categorias_servicio cs on cs.id = s.categoria_id
      where s.negocio_id = np.negocio_id and s.reservable_online = true and s.activo = true
    ), '[]'::jsonb) end,
    'profesionales', case when not public.negocio_con_acceso(np.negocio_id) then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'color', pr.color) order by pr.nombre)
      from public.profesionales pr where pr.negocio_id = np.negocio_id and pr.activo = true
    ), '[]'::jsonb) end
  ) end
  from public.negocio_portal np where np.slug = p_slug and np.portal_activo = true;
$$;

-- 4. Actualizar vigilancia_bd() con la comprobacion 12 (tablas con negocio_id sin gate de suscripcion)
CREATE OR REPLACE FUNCTION public.vigilancia_bd()
RETURNS TABLE(
  clave text,
  nivel text,
  ambito text,
  titulo text,
  detalle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
declare
  v_publicas text[] := array[
    'crear_solicitud_publica', 'check_landing_rate_limit', 'horas_llamada_ocupadas',
    'salon_directorio_publico', 'salones_externos_publico', 'buscar_salones_publico',
    'presupuesto_publico', 'pago_info_publica', 'aceptar_presupuesto_publico',
    'completar_datos_pago_publico', 'presupuesto_enviar_mensaje_publico',
    'resolver_enlace_pago', 'resolver_enlace_pago_full', 'citas_por_confirmar_telefono',
    'confirmar_cita_cliente', 'confirmar_cita_oferta', 'vigilancia_bd'
  ];
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  return query
  select
    'bd/vault-al-alcance:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() toca el Vault y la puede llamar cualquiera',
    'Es SECURITY DEFINER, lee vault.decrypted_secrets y tiene EXECUTE concedido a ' ||
    'anon o a authenticated, asi que se puede invocar por REST con la publishable key ' ||
    '(publica por diseno). Si devuelve el secreto, se filtra; si solo lo usa, es un ' ||
    'grifo de gasto abierto. Cerrar con: revoke execute on function public.' ||
    p.proname || '(...) from anon, authenticated, public;'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname <> 'vigilancia_bd'
    and p.prorettype <> 'trigger'::regtype
    and pg_get_functiondef(p.oid) ~* 'vault\.decrypted_secrets'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));

  return query
  with guardas as (
    select p.oid, p.proname, p.prosrc,
           p.prosrc ~* '(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor)\s*\(' as atada
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  expandida as (
    select g.oid, g.proname,
           g.atada or exists (
             select 1 from guardas h
             where h.atada and h.proname <> g.proname
               and g.prosrc ~* ('\m' || h.proname || '\M')
           ) as atada
    from guardas g
  )
  select
    'bd/rpc-sin-guard:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() no comprueba quien la llama',
    'Es SECURITY DEFINER, la puede llamar ' ||
    case when has_function_privilege('anon', p.oid, 'execute') then 'anon' else 'authenticated' end ||
    ' por REST (' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')) y ni ella ' ||
    'ni las funciones que usa mencionan auth.uid(), auth.role(), is_staff(), ' ||
    'my_negocio_id_text() ni exige_mi_negocio(). O recibe el ambito por parametro y ' ||
    'basta cambiar un id para operar sobre otro salon, o no lo recibe porque opera ' ||
    'sobre TODOS -- que es el caso peor. Arreglo: perform exige_mi_negocio(...) si la ' ||
    'llama la app, o revoke execute ... from anon, authenticated, public si solo la ' ||
    'llaman n8n y las edge functions con service_role.'
  from expandida e
  join pg_proc p on p.oid = e.oid
  where not e.atada
    and p.prosecdef
    and p.pronargs > 0
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and pg_get_function_identity_arguments(p.oid) !~* 'p_slug'
    and not (p.proname = any (v_publicas));

  return query
  select
    'bd/rls-sin-initplan:' || pol.tablename || '.' || pol.policyname,
    'aviso',
    'rendimiento',
    'La politica "' || pol.policyname || '" de ' || pol.tablename || ' llama a auth sin envolver',
    'Envolverla en (select ...): (select auth.uid()), (select my_negocio_id_text()), ' ||
    '(select is_shared_demo_visitor()). Suelta, Postgres la ejecuta una vez por FILA; ' ||
    'dentro de un subselect, una vez por consulta (InitPlan). is_staff() sin envolver ' ||
    'llego a provocar 24 M de seq scans sobre staff y 456 M de tuplas leidas en citas.'
  from (
    select tablename, policyname,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public'
  ) pol
  where regexp_count(pol.expr, 'auth\.(uid|jwt|role)\(\)')
      > regexp_count(pol.expr, '\( SELECT auth\.(uid|jwt|role)\(\)');

  return query
  select
    'bd/helper-volatil:' || p.proname,
    'bloqueante',
    'rendimiento',
    'El ayudante de RLS ' || p.proname || '() es VOLATILE',
    'Los ayudantes que usan las politicas van STABLE. Volatil, Postgres no puede ' ||
    'cachear el resultado y lo reevalua fila a fila: is_staff() volatil por si sola ' ||
    'provoco 24 M de seq scans. Anadir STABLE a la definicion.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_staff', 'my_negocio_id_text', 'is_shared_demo_visitor', 'exige_mi_negocio')
    and p.provolatile = 'v';

  return query
  with tipos_check as (
    select (regexp_matches(
             (select pg_get_constraintdef(con.oid)
                from pg_constraint con
                join pg_class c on c.oid = con.conrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'solicitudes'
                 and con.conname = 'solicitudes_tipo_check'),
             '''([a-z_]+)''::text', 'g'))[1] as tipo
  ),
  cuerpo_rpc as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'crear_solicitud_publica'
                      limit 1), '') as def
  )
  select
    'bd/solicitud-tipo-huerfano:' || t.tipo,
    'aviso',
    'landing',
    'El tipo de solicitud "' || t.tipo || '" esta en el CHECK y no en crear_solicitud_publica',
    'Anadir un tipo de solicitud obliga a tocar DOS sitios: la funcion ' ||
    'crear_solicitud_publica y el CHECK de la tabla solicitudes. Uno se ha quedado atras.'
  from tipos_check t, cuerpo_rpc c
  where t.tipo is not null and t.tipo <> '' and position(t.tipo in c.def) = 0;

  return query
  with def as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'recompute_referral_discount'
                      limit 1), '') as d
  ),
  leido as (
    select
      substring(d from 'v_tope\s+constant\s+numeric\s*:=\s*(\d+)')  as tope,
      substring(d from 'v_bono\s+constant\s+numeric\s*:=\s*(\d+)')  as bienvenida,
      substring(d from 'when 1 then (\d+)')                          as nivel1,
      substring(d from 'when 2 then (\d+)')                          as nivel2,
      substring(d from 'when 3 then (\d+)')                          as nivel3
    from def
  ),
  esperado(que, valor) as (
    values ('nivel1', '10'), ('nivel2', '4'), ('nivel3', '2'), ('tope', '30'), ('bienvenida', '15')
  )
  select
    'bd/referidos-' || e.que,
    'bloqueante',
    'referidos',
    'recompute_referral_discount() usa ' ||
      coalesce(case e.que
        when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
        when 'tope' then l.tope else l.bienvenida end, '(no se ha podido leer)') ||
      ' para ' || e.que || ' y deberia usar ' || e.valor,
    'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez: esta ' ||
    'funcion, #hermano de la landing, el modal Recomendar de la demo y TabReferidos. ' ||
    'Si la regla ha cambiado de verdad, actualiza tambien TABLA_REFERIDOS en ' ||
    'scripts/vigilantes/referidos.mjs.'
  from esperado e, leido l
  where coalesce(case e.que
          when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
          when 'tope' then l.tope else l.bienvenida end, '') is distinct from e.valor;

  return query
  select
    'bd/vigilancia-agenda-acotada',
    'bloqueante',
    'vigilancia',
    'El cron de vigilar-agenda solo mira el negocio "' ||
      coalesce(substring(j.command from '\"negocio_id\"\s*:\s*\"([^\"]+)\"'), substring(j.command from 'negocio_id''\s*,\s*''([^'']+)'''), '?') || '"',
    'La edge vigilar-agenda recorre todos los salones cuando el cuerpo NO trae ' ||
    'negocio_id. Con el negocio fijado, el resto de la cartera no tiene vigilancia ' ||
    'de agenda: ni solapes, ni retrasos, ni citas fuera de jornada. Quitar el ' ||
    'negocio_id del body del job (o dejar {}) para que vuelva a mirarlos a todos.'
  from cron.job j
  where j.command ~* 'vigilar-agenda'
    and j.active
    and (j.command ~* '\"negocio_id\"\s*:\s*\"[^\"]+\"'
      or j.command ~* 'negocio_id''\s*,\s*''[^'']+''');

  return query
  select
    'bd/vigilancia-agenda-sin-cron',
    'bloqueante',
    'vigilancia',
    'No hay ningun cron activo que dispare vigilar-agenda',
    'La vigilancia de agenda (solapes, retrasos, citas fuera de jornada) la escribe ' ||
    'la edge vigilar-agenda, y quien la despierta es un job de pg_cron. Sin job, ' ||
    'hallazgos_ia no recibe nada de agenda y el panel se queda en verde por silencio.'
  where not exists (select 1 from cron.job j where j.command ~* 'vigilar-agenda' and j.active);

  return query
  with disparadores as (
    select t.tgname, c.oid as tabla_oid, c.relname as tabla, p.proname as funcion, p.prosrc
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and not t.tgisinternal
      and p.prosrc !~* '\mTG_TABLE_NAME\M'
  ),
  campos as (
    select d.*, lower(m[1]) as campo
    from disparadores d,
         lateral regexp_matches(d.prosrc, '\m(?:new|old)\.([a-zA-Z_][a-zA-Z0-9_]*)', 'gi') as m
  )
  select distinct
    'bd/trigger-campo-inexistente:' || f.tabla || '.' || f.campo,
    'bloqueante',
    'seguridad',
    'El trigger ' || f.tgname || ' de ' || f.tabla || ' lee un campo que esa tabla no tiene (' || f.campo || ')',
    'La funcion ' || f.funcion || '() hace new.' || f.campo || ' / old.' || f.campo ||
    ' pero ' || f.tabla || ' no tiene esa columna. En PL/pgSQL eso no devuelve null: lanza ' ||
    '42703, y al ser FOR EACH ROW tumba el INSERT/UPDATE/DELETE entero. Leer la fila ' ||
    'como to_jsonb(coalesce(new, old))->>''campo'' devuelve null y no rompe.'
  from campos f
  where not exists (
    select 1 from pg_attribute a
    where a.attrelid = f.tabla_oid and a.attnum > 0 and not a.attisdropped
      and a.attname = f.campo
  );

  return query
  with multitenant as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'negocio_id'
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  )
  select
    'bd/rls-sin-tenant:' || m.relname || '.' || pol.policyname,
    'bloqueante',
    'seguridad',
    'La politica "' || pol.policyname || '" de ' || m.relname || ' no ata al salon',
    'Es PERMISIVA para ' || pol.roles::text || ' sobre una tabla con negocio_id, y su ' ||
    'expresion (' || left(coalesce(pol.qual, pol.with_check, '?'), 120) || ') no menciona ' ||
    'auth.uid(), is_staff(), my_negocio_id_text() ni exige_mi_negocio(). Multi-tenant roto: ' ||
    'cualquier usuario con sesion ve (o escribe) las filas de todos los salones. Asi estuvo ' ||
    'profiles hasta el 29 ago 2026: using(true) para SELECT, y role=''admin'' -- que mira la ' ||
    'fila DESTINO, no al llamante -- para UPDATE y DELETE.'
  from multitenant m
  join pg_policies pol on pol.schemaname = 'public' and pol.tablename = m.relname
  where pol.permissive = 'PERMISSIVE'
    and (pol.roles::text like '%authenticated%' or pol.roles::text like '%public%')
    and btrim(coalesce(pol.qual, pol.with_check, '')) not in ('false', '(false)')
    and coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') !~*
        '(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor|jornada_contexto|_campana_gestor)';

  return query
  with ventana as (
    select count(*) as total,
           count(*) filter (where status_code is null)  as sin_respuesta,
           count(*) filter (where status_code >= 400)   as errores
    from net._http_response
    where created > now() - interval '6 hours'
  )
  select
    'bd/pgnet-latidos-perdidos',
    case when (sin_respuesta + errores)::numeric / total > 0.5 then 'bloqueante' else 'aviso' end,
    'vigilancia',
    'pg_net pierde el ' ||
      round(100.0 * (sin_respuesta + errores) / total) || ' % de las llamadas',
    'En las ultimas 6 h: ' || total || ' respuestas, ' || sin_respuesta ||
    ' sin llegar (status_code NULL) y ' || errores || ' con error HTTP. Los crons y ' ||
    'los triggers llaman a las edge functions con net.http_post, que no espera ' ||
    'respuesta: pg_cron marca la ejecucion como "succeeded" igual. Si esto sube, la ' ||
    'vigilancia de agenda, los avisos de fin de prueba y los informes periodicos se ' ||
    'pierden sin que nada se ponga en rojo. Mirar net._http_response.error_msg.'
  from ventana
  where total >= 10 and (sin_respuesta + errores)::numeric / total > 0.2;

  -- 12. TABLA CON negocio_id SIN GATE DE SUSCRIPCION.
  return query
  with tablas_negocio as (
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'negocio_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in (
        'profiles', 'soporte_mensajes', 'errores_cliente',
        'audit_log', 'auditoria_registros', 'eventos_negocio',
        'chispa_auditoria', 'agenda_ojos_latido'
      )
  ),
  con_trigger as (
    select distinct tg.event_object_table as table_name
    from information_schema.triggers tg
    where tg.event_object_schema = 'public'
      and tg.action_statement ~* 'exige_negocio_con_acceso'
  )
  select
    'bd/tabla-sin-gate-suscripcion:' || tn.table_name,
    'bloqueante',
    'seguridad',
    'La tabla ' || tn.table_name || ' tiene negocio_id pero no tiene el trigger de gate de suscripcion',
    'Toda tabla con negocio_id debe bloquear escrituras si la suscripcion esta inactiva (trg_gate_suscripcion_exige_acceso). ' ||
    'Si es una tabla exenta de rastro/soporte, anadirla a la lista blanca de vigilancia_bd().'
  from tablas_negocio tn
  left join con_trigger ct on ct.table_name = tn.table_name
  where ct.table_name is null;

end;
$$;