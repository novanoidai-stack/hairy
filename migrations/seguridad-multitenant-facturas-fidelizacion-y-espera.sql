-- =====================================================================
-- Mecha · Segunda tanda del cierre multi-tenant: facturas, fidelizacion,
--         lista de espera y objetivos
-- =====================================================================
-- Continua `seguridad-multitenant-rpcs-que-se-fiaban-del-parametro.sql`, que
-- introdujo el guard `exige_mi_negocio` y cerro las cinco mas graves.
-- Aqui van las que quedaban con el mismo patron: reciben un id (cobro,
-- factura, cliente) o el propio negocio POR PARAMETRO y nunca comprueban que
-- quien llama pertenezca a ese salon.
--
-- LAS TRES FISCALES SON LAS QUE MAS PESAN
--   crear_factura_borrador      Emitia un borrador de factura a partir de
--                               CUALQUIER cobro, de cualquier salon.
--   generar_registro_alta       Asignaba numero y HUELLA a una factura ajena.
--   generar_registro_anulacion  Anulaba una factura ajena y encadenaba su
--                               huella.
--   Las dos ultimas escriben en la cadena de huellas encadenadas de VeriFactu,
--   que es un registro con valor ante la AEAT y por diseño no se puede
--   rehacer: meter un eslabon en la cadena de otro salon no se arregla luego.
--   Hoy no las llama nadie (ni cliente ni edge) — la caja fiscal esta a medias
--   — asi que cerrarlas ahora no rompe nada y evita estrenarlas abiertas.
--
-- EL RESTO
--   obtener_nivel_cliente / obtener_logros_desbloqueados /
--   verificar_logros_cliente   Leen (y la ultima escribe) la fidelizacion de
--                              un cliente de otro salon.
--   revisar_hueco_lista_espera Podia lanzar ofertas de hueco en la lista de
--                              espera de otro salon: avisos reales a clientas
--                              que no son tuyas.
--   objetivo_valor_actual      Devolvia la facturacion de un profesional
--                              ajeno. Esta NO se guarda: se revoca. La llaman
--                              solo mis_objetivos_progreso y
--                              objetivos_negocio_progreso, que ya se atan a
--                              auth.uid(), y el cliente no la llama nunca.
--                              Como son `security definer`, siguen pudiendo
--                              llamarla aunque authenticated ya no pueda.
--
-- NOTA SOBRE obtener_nivel_cliente
--   La llaman crear_cita_publica, crear_cita_publica_cadena y
--   lista_espera_unirse_publica, que son anonimas. Por eso el guard deja pasar
--   el uid nulo: esas rutas entran por su propia puerta, no por esta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Facturacion / VeriFactu
-- ---------------------------------------------------------------------
create or replace function public.crear_factura_borrador(
  p_cobro_id uuid,
  p_tipo text default 'F2',
  p_nif_receptor text default null,
  p_nombre_receptor text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cobro public.cobros; v_cfg public.config_fiscal;
  v_base int; v_cuota int; v_id uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'Cobro no encontrado'; end if;
  -- Sin rol: facturar un cobro es operativa de mostrador, no solo de direccion.
  perform public.exige_mi_negocio(v_cobro.negocio_id);
  if v_cobro.estado <> 'completado' then raise exception 'Solo se factura un cobro completado'; end if;

  select * into v_cfg from public.config_fiscal where negocio_id = v_cobro.negocio_id;
  if not found or v_cfg.nif is null then raise exception 'config_fiscal/NIF no configurado'; end if;

  v_base := round(v_cobro.total_cents / (1 + v_cfg.tipo_iva_defecto/100.0));
  v_cuota := v_cobro.total_cents - v_base;

  insert into public.facturas (
    negocio_id, cobro_id, estado, operacion, tipo, serie, ejercicio,
    fecha_expedicion, id_emisor, nif_receptor, nombre_receptor,
    base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents, entorno
  ) values (
    v_cobro.negocio_id, p_cobro_id, 'borrador', 'alta', coalesce(p_tipo,'F2'),
    v_cfg.serie_defecto, extract(year from now())::int,
    current_date, v_cfg.nif, p_nif_receptor, p_nombre_receptor,
    v_base, v_cfg.tipo_iva_defecto, v_cuota, v_cobro.total_cents, v_cfg.entorno_aeat
  ) returning id into v_id;
  return v_id;
end; $function$;

create or replace function public.generar_registro_alta(p_factura_id uuid)
returns table(numero integer, huella text, num_serie_completo text, fechahora_gen timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f public.facturas; cfg public.config_fiscal;
  v_num int; v_prev text; v_nsc text; v_fhg timestamptz;
  v_fhg_str text; v_fecha_str text; v_cuota_str text; v_importe_str text; v_cadena text; v_huella text;
begin
  select * into f from public.facturas where id = p_factura_id;
  if not found then raise exception 'Factura no encontrada'; end if;
  -- Antes de tocar la cadena de huellas: que sea de tu salon.
  perform public.exige_mi_negocio(f.negocio_id);
  if f.estado <> 'borrador' then raise exception 'La factura no esta en borrador'; end if;
  select * into cfg from public.config_fiscal where negocio_id = f.negocio_id;

  -- Serializa TODA la generacion de este negocio (numero + cadena de huella)
  perform pg_advisory_xact_lock(hashtext('verifactu_gen:' || f.negocio_id));

  -- 1) Numero sin huecos entre registros GENERADOS (numero not null) de serie+ejercicio
  select coalesce(max(facturas.numero),0)+1 into v_num
    from public.facturas
    where negocio_id=f.negocio_id and serie=f.serie and ejercicio=f.ejercicio and facturas.numero is not null;

  -- 2) NumSerieFactura (formato del negocio; por defecto SERIE/EJERCICIO/NUMERO6)
  v_nsc := replace(replace(replace(cfg.num_serie_formato,
             '{serie}', f.serie), '{ejercicio}', f.ejercicio::text),
             '{numero6}', lpad(v_num::text, 6, '0'));

  -- 3) Huella del registro inmediatamente anterior del negocio (cadena unica por negocio)
  select facturas.huella into v_prev from public.facturas
    where negocio_id=f.negocio_id and facturas.huella is not null
    order by facturas.fechahora_gen desc, facturas.numero desc limit 1;
  v_prev := coalesce(v_prev, '');   -- vacio si es el primero

  -- 4) FechaHoraHusoGenRegistro en ISO 8601 con huso (+01:00). OF da '+01'; se normaliza a '+01:00'.
  v_fhg := now();
  v_fhg_str := to_char(v_fhg, 'YYYY-MM-DD"T"HH24:MI:SS') ||
               regexp_replace(to_char(v_fhg, 'OF'), '^([+-]\d{2})$', '\1:00');
  -- (si OF ya trae minutos, p.ej. '+05:30', el regexp lo deja igual)
  if v_fhg_str !~ '[+-]\d{2}:\d{2}$' then
    v_fhg_str := v_fhg_str || ':00';
  end if;

  v_fecha_str  := to_char(f.fecha_expedicion, 'DD-MM-YYYY');
  v_cuota_str  := to_char(f.cuota_iva_cents/100.0, 'FM999999990.00');   -- '.' es literal
  v_importe_str:= to_char(f.total_cents/100.0,    'FM999999990.00');

  -- 5) Cadena EXACTA (orden y separadores oficiales) + SHA-256 mayusculas
  v_cadena :=
    'IDEmisorFactura='        || f.id_emisor ||
    '&NumSerieFactura='       || v_nsc ||
    '&FechaExpedicionFactura='|| v_fecha_str ||
    '&TipoFactura='           || f.tipo ||
    '&CuotaTotal='            || v_cuota_str ||
    '&ImporteTotal='          || v_importe_str ||
    '&Huella='                || v_prev ||
    '&FechaHoraHusoGenRegistro=' || v_fhg_str;
  v_huella := upper(encode(extensions.digest(convert_to(v_cadena,'UTF8'),'sha256'),'hex'));

  -- 6) Fijar en la factura (permitido: estado sigue 'borrador' hasta este UPDATE)
  update public.facturas set
    numero=v_num, num_serie_completo=v_nsc, fechahora_gen=v_fhg,
    huella=v_huella, huella_anterior=nullif(v_prev,''), estado='generada'
  where id=p_factura_id;

  return query select v_num, v_huella, v_nsc, v_fhg;
end; $function$;

create or replace function public.generar_registro_anulacion(p_factura_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f public.facturas; v_prev text; v_fhg timestamptz; v_fhg_str text; v_cadena text; v_huella text; v_id uuid;
begin
  select * into f from public.facturas where id=p_factura_id and operacion='alta';
  if not found then raise exception 'Factura de alta no encontrada'; end if;
  perform public.exige_mi_negocio(f.negocio_id);
  if f.estado not in ('aceptada','aceptada_con_errores','generada') then
    raise exception 'Solo se anula una factura ya generada/aceptada'; end if;

  perform pg_advisory_xact_lock(hashtext('verifactu_gen:' || f.negocio_id));
  select huella into v_prev from public.facturas
    where negocio_id=f.negocio_id and huella is not null
    order by fechahora_gen desc, numero desc limit 1;
  v_prev := coalesce(v_prev,'');
  v_fhg := now();
  v_fhg_str := to_char(v_fhg,'YYYY-MM-DD"T"HH24:MI:SS') ||
               regexp_replace(to_char(v_fhg,'OF'),'^([+-]\d{2})$','\1:00');
  if v_fhg_str !~ '[+-]\d{2}:\d{2}$' then v_fhg_str := v_fhg_str || ':00'; end if;

  v_cadena :=
    'IDEmisorFacturaAnulada='         || f.id_emisor ||
    '&NumSerieFacturaAnulada='        || f.num_serie_completo ||
    '&FechaExpedicionFacturaAnulada=' || to_char(f.fecha_expedicion,'DD-MM-YYYY') ||
    '&Huella='                        || v_prev ||
    '&FechaHoraHusoGenRegistro='      || v_fhg_str;
  v_huella := upper(encode(extensions.digest(convert_to(v_cadena,'UTF8'),'sha256'),'hex'));

  insert into public.facturas (
    negocio_id, cobro_id, estado, operacion, factura_anulada_id, tipo, serie, ejercicio,
    num_serie_completo, fecha_expedicion, fechahora_gen, id_emisor,
    base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents,
    huella, huella_anterior, entorno
  ) values (
    f.negocio_id, f.cobro_id, 'generada', 'anulacion', f.id, f.tipo, f.serie, f.ejercicio,
    f.num_serie_completo, f.fecha_expedicion, v_fhg, f.id_emisor,
    f.base_imponible_cents, f.tipo_iva, f.cuota_iva_cents, f.total_cents,
    v_huella, nullif(v_prev,''), f.entorno
  ) returning id into v_id;

  update public.facturas set estado='anulada' where id=f.id and estado in ('aceptada','aceptada_con_errores','generada');
  return v_id;
end; $function$;

-- ---------------------------------------------------------------------
-- 2) Fidelizacion (nivel y logros de una clienta)
-- ---------------------------------------------------------------------
create or replace function public.obtener_nivel_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_negocio_id text;
  v_visitas integer;
  v_gastado_cents integer;
  v_override uuid;
  v_nivel niveles_fidelizacion%rowtype;
  v_encontrado boolean := false;
begin
  select negocio_id, nivel_fidelizacion_override into v_negocio_id, v_override
  from clientes where id = p_cliente_id;
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;
  -- El portal publico la llama por dentro (uid nulo): ese caso pasa a proposito.
  perform public.exige_mi_negocio(v_negocio_id);

  select count(*) into v_visitas from citas
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  -- Override manual: solo vale si apunta a un nivel ACTIVO del mismo negocio.
  if v_override is not null then
    select * into v_nivel from niveles_fidelizacion
    where id = v_override and negocio_id = v_negocio_id and activo = true;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    select * into v_nivel from niveles_fidelizacion
    where negocio_id = v_negocio_id and activo = true
      and (v_visitas >= umbral_visitas or v_gastado_cents >= umbral_gastado_cents)
    order by orden desc limit 1;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    return jsonb_build_object(
      'ok', true,
      'nivel', jsonb_build_object('nombre', 'Nuevo', 'color', '#9ca3af', 'orden', 0, 'sin_deposito', false),
      'visitas', v_visitas, 'gastado_cents', v_gastado_cents
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'nivel', jsonb_build_object(
      'id', v_nivel.id, 'nombre', v_nivel.nombre, 'color', v_nivel.color,
      'icono', v_nivel.icono, 'orden', v_nivel.orden,
      'sin_deposito', v_nivel.sin_deposito
    ),
    'visitas', v_visitas, 'gastado_cents', v_gastado_cents
  );
end;
$function$;

create or replace function public.obtener_logros_desbloqueados(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_negocio_id text; v_resultado jsonb;
begin
  select negocio_id into v_negocio_id from clientes where id = p_cliente_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); end if;
  perform public.exige_mi_negocio(v_negocio_id);
  select jsonb_agg(jsonb_build_object('logro_id', ld.logro_id, 'logro_nombre', l.nombre, 'logro_descripcion', l.descripcion, 'logro_tipo', l.tipo, 'logro_icono', l.icono, 'logro_color', l.color, 'desbloqueado_en', ld.desbloqueado_en))
  into v_resultado from logros_desbloqueados ld join logros l on l.id = ld.logro_id where ld.cliente_id = p_cliente_id and ld.negocio_id = v_negocio_id;
  return jsonb_build_object('ok', true, 'logros', coalesce(v_resultado, '[]'::jsonb));
end; $function$;

create or replace function public.verificar_logros_cliente(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_negocio_id text; v_visitas integer; v_gastado_cents integer; v_logro record; v_cumple boolean; v_condicion jsonb; v_desbloqueados integer := 0;
begin
  select negocio_id into v_negocio_id from clientes where id = p_cliente_id;
  if v_negocio_id is null then return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado'); end if;
  perform public.exige_mi_negocio(v_negocio_id);
  select count(*) into v_visitas from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros where cliente_id = p_cliente_id and negocio_id = v_negocio_id;
  for v_logro in select * from logros where negocio_id = v_negocio_id and activo = true loop
    if exists (select 1 from logros_desbloqueados where cliente_id = p_cliente_id and logro_id = v_logro.id) then continue; end if;
    v_cumple := false; v_condicion := v_logro.condicion;
    case v_logro.tipo
      when 'primera_visita' then v_cumple := v_visitas >= 1;
      when 'visitas_multiple' then v_cumple := v_visitas >= coalesce((v_condicion->>'visitas')::integer, 0);
      when 'gastado_total' then v_cumple := v_gastado_cents >= coalesce((v_condicion->>'gastado_cents')::integer, 0);
      when 'sin_noshow' then v_cumple := not exists (select 1 from citas where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'no_presentada' and inicio >= now() - (coalesce((v_condicion->>'meses_sin_noshow')::integer, 6) || ' months')::interval);
      else v_cumple := false;
    end case;
    if v_cumple then
      insert into logros_desbloqueados (negocio_id, cliente_id, logro_id, desbloqueado_en) values (v_negocio_id, p_cliente_id, v_logro.id, now());
      v_desbloqueados := v_desbloqueados + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'desbloqueados', v_desbloqueados, 'visitas', v_visitas, 'gastado_cents', v_gastado_cents);
end; $function$;

-- ---------------------------------------------------------------------
-- 3) Lista de espera: ofrecer un hueco avisa a clientas de verdad
--    El guard va como primera sentencia. Ojo: esta funcion tiene un
--    `exception when others` deliberado para no romper el movimiento de cita
--    que ya se aplico, asi que un intento de otro salon vuelve como
--    {ok:false, motivo:'error', error:'otro_negocio'} en vez de reventar.
--    La accion queda bloqueada igual y el motivo se lee en `error`.
-- ---------------------------------------------------------------------
create or replace function public.revisar_hueco_lista_espera(
  p_origen_cita_id uuid, p_negocio_id text, p_servicio_id uuid, p_profesional_id uuid,
  p_slot_inicio timestamp with time zone, p_slot_fin timestamp with time zone,
  p_slot_fin_activa timestamp with time zone, p_slot_fin_espera timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg jsonb;
  v_activo boolean;
  v_ventana integer;
  v_maxbloq integer;
  v_antel integer;
  v_pidesenal boolean;
  v_cand uuid;
  v_oferta uuid;
begin
  perform public.exige_mi_negocio(p_negocio_id);

  -- Sin servicio no hay matching posible (no sabemos la duracion/categoria).
  if p_servicio_id is null or p_profesional_id is null then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'sin_servicio_o_profesional');
  end if;

  cfg := (select config from public.negocio_config where negocio_id = p_negocio_id);
  v_activo := coalesce((cfg->>'listaEsperaMatchingActivo')::boolean, false);

  -- Si el salon no tiene el matching de lista de espera activo, no hacemos nada.
  -- Es el mismo guard que procesar_lista_espera; respeta la decision del salon.
  if not v_activo then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'matching_inactivo');
  end if;

  v_ventana  := greatest(coalesce((cfg->>'listaEsperaVentanaMin')::int, 30), 1);
  v_maxbloq  := greatest(coalesce((cfg->>'listaEsperaMaxBloqueoHoras')::int, 2), 1);
  v_antel    := greatest(coalesce((cfg->>'listaEsperaAntelacionMinHoras')::int, 4), 0);
  v_pidesenal := coalesce((cfg->>'listaEsperaOfertaPideSenal')::boolean, false);

  -- Mismo filtro de antelacion que el motor: si el hueco es inminente, no da
  -- tiempo a avisar a nadie ni a que confirme.
  if p_slot_inicio < now() + make_interval(hours => v_antel) then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'demasiado_pronto');
  end if;

  -- Mejor candidato para ese servicio/profesional/inicio (sin excluir a nadie
  -- aun: es el primer aviso sobre este hueco).
  v_cand := public._lista_espera_mejor_candidato(p_negocio_id, p_servicio_id, p_profesional_id, p_slot_inicio, array[]::uuid[]);
  if v_cand is null then
    return jsonb_build_object('ok', true, 'avisados', 0, 'motivo', 'sin_candidatos');
  end if;

  -- Crea la oferta (reserva el hueco) y ofrece al candidato: cita tentativa +
  -- marca avisado + encarga el WhatsApp via el outbox lista_espera_avisos.
  insert into public.lista_espera_ofertas(
    negocio_id, origen_cita_id, profesional_id, servicio_id,
    inicio, fin, fin_activa, fin_espera, estado, candidato_id, expira_at, bloqueo_hasta, avisados)
  values (
    p_negocio_id, p_origen_cita_id, p_profesional_id, p_servicio_id,
    p_slot_inicio, p_slot_fin, p_slot_fin_activa, p_slot_fin_espera, 'activa', v_cand,
    now() + make_interval(mins => v_ventana), now() + make_interval(hours => v_maxbloq), array[v_cand])
  returning id into v_oferta;

  perform public._lista_espera_ofrecer(v_oferta, v_cand, v_pidesenal, v_ventana);

  return jsonb_build_object('ok', true, 'avisados', 1, 'oferta_id', v_oferta, 'candidato_id', v_cand);
exception
  -- Cualquier fallo (helper caido, constraint...) no debe romper el movimiento
  -- de cita que ya se ha aplicado: lo tragamos y lo reportamos como motivo.
  when others then
    return jsonb_build_object('ok', false, 'avisados', 0, 'motivo', 'error', 'error', sqlerrm);
end;
$function$;

-- ---------------------------------------------------------------------
-- 4) objetivo_valor_actual: no se guarda, se cierra
--    Solo la llaman mis_objetivos_progreso y objetivos_negocio_progreso, que
--    ya se atan a auth.uid(). Son `security definer`, asi que siguen pudiendo
--    llamarla aunque `authenticated` deje de poder.
-- ---------------------------------------------------------------------
revoke all on function public.objetivo_valor_actual(text, uuid, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
