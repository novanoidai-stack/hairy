-- =====================================================================
-- Mecha · Cerrar las RPC que se fiaban del parametro (multi-tenant)
-- =====================================================================
-- DE DONDE SALE ESTO
--
-- Auditando los 250 avisos del linter de Supabase. La inmensa mayoria
-- (`authenticated_security_definer_function_executable`, 227) NO son fallos:
-- son la arquitectura de Mecha — el cliente no toca tablas, llama a RPCs
-- `security definer` que comprueban el permiso por dentro. Arreglar ESO seria
-- apagar la API del producto.
--
-- Pero el aviso indistinguible tapaba lo que si importa. Clasificando las 158
-- funciones abiertas a `authenticated` aparecio un patron: unas cuantas
-- RECIBEN el negocio (o un id del que se deduce) POR PARAMETRO y no comprueban
-- nunca que quien llama pertenezca a ese salon. Multi-tenant roto: cualquier
-- cuenta con sesion podia operar sobre otro salon con solo cambiar un uuid.
--
-- LO QUE SE CIERRA AQUI
--   upsert_config_fiscal        Reescribia el NIF, la razon social y el
--                               domicilio fiscal de CUALQUIER salon. Es lo que
--                               sale impreso en sus facturas.
--   generar_liquidacion         Creaba liquidaciones de comision en un salon
--                               que no era el tuyo.
--   calcular_comisiones_periodo Devolvia la facturacion y la comision de
--                               cualquier profesional de cualquier salon.
--   pasarela_stripe_account     Devolvia el stripe_account_id de otro salon.
--   caducar_propuestas_cambio   Es un cron sin argumentos: cualquiera podia
--                               caducar las propuestas de TODOS los salones.
--
-- Y de paso, dos cosas de higiene que el linter tambien marcaba:
--   · `search_path` fijo en las cuatro funciones que no lo tenian.
--   · Revocar los grants por defecto de anon/authenticated en las 16 tablas
--     internas. Hoy las protege solo que la RLS este activada y sin politicas;
--     con esto hacen falta dos fallos en vez de uno. Comprobado que ningun
--     cliente las lee: solo las tocan edge functions con service_role.
--
-- LO QUE NO SE TOCA (a proposito)
--   Las 35 RPC del portal publico. Se autentican por slug + telefono + token y
--   tienen su antiabuso dentro: es su diseño, no un descuido.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El guard, una sola vez
-- ---------------------------------------------------------------------
create or replace function public.exige_mi_negocio(
  p_negocio_id  text,
  p_solo_gestor boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_neg  text;
  v_role text;
begin
  -- Sin sesion de usuario no hay nada que comprobar, y bloquear aqui romperia
  -- el portal publico. Ninguna funcion que llama a este guard esta concedida a
  -- `anon`, asi que un uid nulo solo puede venir de OTRA funcion definer (las
  -- RPC publicas se llaman entre ellas) o de service_role (edge y crons).
  -- Dicho de otra forma: anon no entra por esta puerta, entra por la suya.
  if v_uid is null then return; end if;

  select negocio_id, role into v_neg, v_role
    from public.profiles where id = v_uid;
  if v_neg is null then
    raise exception 'sin_perfil' using errcode = '42501';
  end if;

  -- El equipo Mecha pasa: para eso tiene sus propias RPC staff_*.
  if public.is_staff() then return; end if;

  if p_negocio_id is null or v_neg is distinct from p_negocio_id then
    raise exception 'otro_negocio' using errcode = '42501';
  end if;

  if p_solo_gestor and coalesce(v_role, '') not in ('owner', 'admin') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

comment on function public.exige_mi_negocio(text, boolean) is
  'Guard multi-tenant para RPCs que reciben el negocio por parametro: exige que quien llama pertenezca a ese salon (y opcionalmente que sea owner/admin). Un uid nulo se deja pasar a proposito: solo puede ser una llamada interna o service_role.';

-- ---------------------------------------------------------------------
-- 2) upsert_config_fiscal — identidad fiscal del salon
--    Cuerpo intacto; solo se antepone el guard. Gestor: el NIF y la razon
--    social son lo que se imprime en las facturas.
-- ---------------------------------------------------------------------
create or replace function public.upsert_config_fiscal(
  p_negocio_id text,
  p_nif text default null,
  p_razon_social text default null,
  p_domicilio_fiscal text default null,
  p_regimen_iva text default null,
  p_tipo_iva_defecto numeric default null,
  p_territorio text default null,
  p_serie_defecto text default null,
  p_modalidad text default null,
  p_aplica_verifactu boolean default null,
  p_proveedor_fiscal text default null
)
returns config_fiscal
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.config_fiscal;
begin
  perform public.exige_mi_negocio(p_negocio_id, true);

  insert into public.config_fiscal as cf (negocio_id, nif, razon_social, domicilio_fiscal,
      regimen_iva, tipo_iva_defecto, territorio, serie_defecto, modalidad, aplica_verifactu, proveedor_fiscal)
  values (p_negocio_id, p_nif, p_razon_social, p_domicilio_fiscal,
      coalesce(p_regimen_iva,'general'), coalesce(p_tipo_iva_defecto,21.0),
      coalesce(p_territorio,'comun'), coalesce(p_serie_defecto,'A'),
      coalesce(p_modalidad,'verifactu'), coalesce(p_aplica_verifactu,true), p_proveedor_fiscal)
  on conflict (negocio_id) do update set
    nif = coalesce(p_nif, cf.nif),
    razon_social = coalesce(p_razon_social, cf.razon_social),
    domicilio_fiscal = coalesce(p_domicilio_fiscal, cf.domicilio_fiscal),
    regimen_iva = coalesce(p_regimen_iva, cf.regimen_iva),
    tipo_iva_defecto = coalesce(p_tipo_iva_defecto, cf.tipo_iva_defecto),
    territorio = coalesce(p_territorio, cf.territorio),
    serie_defecto = coalesce(p_serie_defecto, cf.serie_defecto),
    modalidad = coalesce(p_modalidad, cf.modalidad),
    aplica_verifactu = coalesce(p_aplica_verifactu, cf.aplica_verifactu),
    proveedor_fiscal = coalesce(p_proveedor_fiscal, cf.proveedor_fiscal),
    updated_at = now()
  returning * into v_row;
  return v_row;
end; $function$;

-- ---------------------------------------------------------------------
-- 3) calcular_comisiones_periodo — cuanto factura y cuanto se lleva alguien
--    Mismo negocio. Gestor SALVO que estes mirando lo tuyo: un profesional
--    puede ver su propia comision, no la de su companera.
-- ---------------------------------------------------------------------
create or replace function public.calcular_comisiones_periodo(
  p_profesional_id uuid,
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio_id text; v_config jsonb; v_porcentaje_def numeric(5,2); v_comision_base text;
  v_incluir_addons boolean; v_incluir_propinas boolean; v_base_cents integer; v_comision_cents integer;
  v_addons_cents integer; v_propinas_cents integer; v_detalle jsonb; v_profesional_nombre text;
begin
  select negocio_id into v_negocio_id from profiles where id = p_profesional_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado'); end if;
  perform public.exige_mi_negocio(
    v_negocio_id,
    p_profesional_id is distinct from (select auth.uid())
  );
  select config into v_config from negocio_config where negocio_id = v_negocio_id;
  v_porcentaje_def := coalesce((v_config->>'comisionBase')::numeric, 15.00);
  v_comision_base := coalesce(v_config->>'comisionBaseImporte', 'neto');
  v_incluir_addons := coalesce((v_config->>'comisionAddons')::boolean, true);
  v_incluir_propinas := coalesce((v_config->>'comisionPropinas')::boolean, false);
  select coalesce(comision_pct, v_porcentaje_def) into v_porcentaje_def from profesionales where profile_id = p_profesional_id and negocio_id = v_negocio_id;
  select concat(nombre, ' ', coalesce(apellido, '')) into v_profesional_nombre from profiles where id = p_profesional_id;
  select coalesce(sum(case when estado = 'completado' then total_cents - descuento_cents - case when v_comision_base = 'neto' then trunc((total_cents - descuento_cents) / 1.21) else 0 end else 0 end), 0)
    into v_base_cents from cobros where profesional_id = p_profesional_id and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';
  if not v_incluir_addons then
    select coalesce(sum(precio_cents * cantidad), 0) into v_addons_cents from cobro_lineas cl join cobros c on c.id = cl.cobro_id
      where c.profesional_id = p_profesional_id and c.cobrado_at >= p_desde and c.cobrado_at <= p_hasta and c.estado = 'completado' and cl.tipo = 'suplemento';
    v_base_cents := v_base_cents - coalesce(v_addons_cents, 0);
  end if;
  if v_incluir_propinas then
    select coalesce(sum(propina_cents), 0) into v_propinas_cents from cobros where profesional_id = p_profesional_id and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado';
    v_base_cents := v_base_cents + coalesce(v_propinas_cents, 0);
  end if;
  v_comision_cents := trunc(v_base_cents * v_porcentaje_def / 100);
  v_detalle := jsonb_build_object('profesional_id', p_profesional_id, 'profesional_nombre', v_profesional_nombre, 'periodo_inicio', p_desde, 'periodo_fin', p_hasta,
    'base_cents', v_base_cents, 'porcentaje_aplicado', v_porcentaje_def, 'comision_cents', v_comision_cents, 'comision_base', v_comision_base,
    'incluir_addons', v_incluir_addons, 'incluir_propinas', v_incluir_propinas,
    'num_cobros', (select count(*) from cobros where profesional_id = p_profesional_id and cobrado_at >= p_desde and cobrado_at <= p_hasta and estado = 'completado'));
  return jsonb_build_object('ok', true, 'resultado', v_detalle);
end; $function$;

-- ---------------------------------------------------------------------
-- 4) generar_liquidacion — crea el asiento de comision
--    Siempre gestor: liquidar es una accion de direccion, no de quien cobra.
-- ---------------------------------------------------------------------
create or replace function public.generar_liquidacion(
  p_profesional_id uuid,
  p_periodo_inicio timestamp with time zone,
  p_periodo_fin timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_calculo jsonb; v_negocio_id text; v_liquidacion_id uuid;
begin
  select negocio_id into v_negocio_id from profiles where id = p_profesional_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Profesional no encontrado'); end if;
  perform public.exige_mi_negocio(v_negocio_id, true);
  select calcular_comisiones_periodo(p_profesional_id, p_periodo_inicio, p_periodo_fin) into v_calculo;
  if not (v_calculo->>'ok')::boolean then return v_calculo; end if;
  if exists (select 1 from comisiones where profesional_id = p_profesional_id and periodo_inicio = p_periodo_inicio and periodo_fin = p_periodo_fin and estado != 'anulada') then
    return jsonb_build_object('ok', false, 'error', 'Ya existe una liquidacion para este periodo');
  end if;
  insert into comisiones (negocio_id, profesional_id, periodo_inicio, periodo_fin, base_calculo_cents, porcentaje_aplicado, comision_base, incluir_addons, incluir_propinas, importe_comision_cents, estado, detalles)
  values (v_negocio_id, p_profesional_id, p_periodo_inicio, p_periodo_fin,
    (v_calculo#>'{resultado,base_cents}')::integer, (v_calculo#>'{resultado,porcentaje_aplicado}')::numeric, v_calculo#>>'{resultado,comision_base}',
    (v_calculo#>'{resultado,incluir_addons}')::boolean, (v_calculo#>'{resultado,incluir_propinas}')::boolean, (v_calculo#>'{resultado,comision_cents}')::integer, 'pendiente', v_calculo->'resultado')
  returning id into v_liquidacion_id;
  return jsonb_build_object('ok', true, 'liquidacion_id', v_liquidacion_id, 'importe', (v_calculo#>'{resultado,comision_cents}')::integer, 'calculo', v_calculo->'resultado');
end; $function$;

-- ---------------------------------------------------------------------
-- 5) pasarela_stripe_account — la cuenta Stripe del salon
--    Pasa de `language sql` a plpgsql solo para poder anteponer el guard.
--    Las edge functions la llaman con service_role, que queda exento.
-- ---------------------------------------------------------------------
create or replace function public.pasarela_stripe_account(p_negocio_id text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.exige_mi_negocio(p_negocio_id);
  return (select stripe_account_id from public.negocio_pasarela where negocio_id = p_negocio_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 6) caducar_propuestas_cambio — es un cron, no una RPC
--    Sin argumentos y sin permiso: cualquiera con sesion podia caducar las
--    propuestas pendientes de todos los salones. No la llama nadie desde el
--    cliente ni desde las edge functions: se cierra y punto.
-- ---------------------------------------------------------------------
revoke all on function public.caducar_propuestas_cambio() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) search_path fijo en las cuatro que faltaban
--    Sin el, una funcion resuelve los nombres con el search_path del rol que
--    la llama. Las tres primeras son triggers que blindan registros legales
--    (jornada y cierres de caja): justo donde menos conviene un cabo suelto.
-- ---------------------------------------------------------------------
create or replace function public.normalizar_telefono(p text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  with limpio as (
    select nullif(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00', ''), '') as t
  )
  select case
    when t ~ '^34[6-9][0-9]{8}$' then substring(t from 3)
    else t
  end
  from limpio;
$function$;

create or replace function public.fichajes_bloquear_cambios()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_flag text := coalesce(current_setting('app.jornada_correccion', true), '');
begin
  if v_flag = 'migracion' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Los fichajes no se pueden borrar: el registro de jornada debe conservarse 4 anos (art. 34.9 ET). Usa una correccion para anularlo.'
      using errcode = 'check_violation';
  end if;
  if v_flag <> 'on' then
    raise exception 'Los fichajes no se pueden modificar directamente: usa "solicitar correccion" para dejar constancia de quien, cuando y por que.'
      using errcode = 'check_violation';
  end if;
  if new.negocio_id is distinct from old.negocio_id
     or new.profesional_id is distinct from old.profesional_id
     or new.user_id is distinct from old.user_id
     or new.tipo is distinct from old.tipo
     or new.marcado_at is distinct from old.marcado_at
     or new.modalidad is distinct from old.modalidad
     or new.secuencia is distinct from old.secuencia
     or new.hash is distinct from old.hash
     or new.hash_anterior is distinct from old.hash_anterior then
    raise exception 'Un asiento de jornada es inalterable: solo puede anularse y sustituirse por otro.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

create or replace function public.jornada_correcciones_no_borrar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  raise exception 'El historial de correcciones de jornada es indeleble.'
    using errcode = 'check_violation';
end;
$function$;

create or replace function public.sesiones_caja_inmutable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'cerrada' then
      raise exception 'Un cierre de caja no se borra. Si hay un error, se anota en las notas de la siguiente sesion.';
    end if;
    return old;
  end if;

  if old.estado = 'cerrada' then
    raise exception 'La caja del % ya esta cerrada (Z %). No se puede modificar.',
      to_char(old.cerrada_at, 'DD/MM/YYYY'), old.numero_z;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8) Segundo cerrojo en las 16 tablas internas
--    Tienen RLS activada y CERO politicas, o sea que hoy deniegan todo. Pero
--    conservan el grant por defecto de Supabase (select/insert/update/delete a
--    anon y authenticated): si algun dia alguien desactiva la RLS o crea una
--    politica permisiva, quedan abiertas de par en par. Ninguna se lee desde
--    el cliente — solo las tocan edge functions con service_role, que no pasa
--    por estos grants.
-- ---------------------------------------------------------------------
revoke all on table public.avisos_prueba                from anon, authenticated;
revoke all on table public.captcha_tokens               from anon, authenticated;
revoke all on table public.cita_pago_enlaces            from anon, authenticated;
revoke all on table public.cumpleanos_avisos            from anon, authenticated;
revoke all on table public.errores_cliente              from anon, authenticated;
revoke all on table public.informes_periodicos_enviados from anon, authenticated;
revoke all on table public.landing_chat_hits            from anon, authenticated;
revoke all on table public.latido_envios                from anon, authenticated;
revoke all on table public.lista_espera_avisos          from anon, authenticated;
revoke all on table public.lista_espera_ofertas         from anon, authenticated;
revoke all on table public.rate_limit_hits              from anon, authenticated;
revoke all on table public.rpc_rate_hits                from anon, authenticated;
revoke all on table public.salon_acceso                 from anon, authenticated;
revoke all on table public.salones_externos             from anon, authenticated;
revoke all on table public.soporte_mensajes             from anon, authenticated;
revoke all on table public.stripe_webhook_eventos       from anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) Permisos (round 4: lo nuevo no nace ejecutable)
-- ---------------------------------------------------------------------
revoke all on function public.exige_mi_negocio(text, boolean) from public, anon;
grant execute on function public.exige_mi_negocio(text, boolean) to authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
