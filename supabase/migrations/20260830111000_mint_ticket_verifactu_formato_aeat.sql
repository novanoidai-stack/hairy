-- VeriFactu, paso 2 de 3: el minador emite ya en formato AEAT cuando puede.
--
-- Dos ramas explicitas, y esto es lo importante del cambio:
--
--   aeat_v1     Hay un NIF de emisor de verdad. La huella se calcula con la
--               CADENA OFICIAL de la AEAT (la misma que lib/fiscal/huella.ts) y
--               el ticket nace 'pendiente' de envio, con su URL de cotejo para
--               el QR.
--   interno_v1  No hay NIF configurado. Se sigue emitiendo el libro interno con
--               el formato de siempre, pero **nunca** con el negocio_id metido
--               en el hueco del NIF: `nif_emisor` se queda null y el ticket nace
--               'no_enviado'. Un identificador inventado en una cadena fiscal es
--               peor que no tener cadena.
--
-- Por que no se "arregla" lo viejo: los 1.600 tickets existentes se emitieron
-- contra el negocio_id porque el NIF se leia de `negocio_portal.nif`, que esta
-- vacia en los tres negocios, mientras el NIF real estaba en `config_fiscal`.
-- Reescribir esos hashes es exactamente lo que una cadena inalterable existe
-- para impedir. Se quedan como libro interno y la cadena AEAT arranca limpia
-- --lo hace sola, porque `nif_emisor` forma parte de la clave de cadena--.

-- Formatea el numero segun config_fiscal.num_serie_formato ({serie}/{ejercicio}/{numero6}).
create or replace function public.verifactu_num_serie(
  p_formato text, p_serie text, p_ejercicio int, p_numero int
) returns text
language sql immutable
as $function$
  select replace(replace(replace(replace(
           coalesce(nullif(p_formato, ''), '{serie}-{numero6}'),
           '{serie}', p_serie),
           '{ejercicio}', p_ejercicio::text),
           '{numero6}', lpad(p_numero::text, 6, '0')),
           '{numero}', p_numero::text);
$function$;

-- ISO8601 con huso, tal y como lo quiere FechaHoraHusoGenRegistro: 2026-08-30T12:34:56+02:00.
--
-- No vale `to_char(..., 'OF')`: usa la zona de la SESION (no la del salon) y
-- escribe "+02" en vez de "+02:00" cuando los minutos son cero. Y no vale restar
-- las dos lecturas y pasarlas por to_char: sobre un intervalo se pierde el signo,
-- asi que Canarias (-01:00 respecto a peninsula en el mismo instante no, pero si
-- cualquier zona al oeste de UTC) saldria con el huso cambiado de sentido.
create or replace function public.verifactu_iso8601(p_ts timestamptz, p_tz text)
returns text
language sql immutable
as $function$
  select to_char(p_ts at time zone p_tz, 'YYYY-MM-DD"T"HH24:MI:SS')
      || (case when off < 0 then '-' else '+' end)
      || lpad((abs(off) / 3600)::text, 2, '0') || ':'
      || lpad(((abs(off) % 3600) / 60)::text, 2, '0')
  from (
    select extract(epoch from (p_ts at time zone p_tz) - (p_ts at time zone 'UTC'))::int as off
  ) o;
$function$;

-- URL de cotejo que va dentro del QR del ticket.
--
-- OJO ANTES DE PONER ESTO EN PRODUCCION: el host y el nombre exacto de los
-- parametros los fija el manual tecnico de la AEAT y hay que confirmarlos ahi,
-- no de memoria. Por eso el entorno viaja en config_fiscal.entorno_aeat y por
-- eso lib/fiscal/estadoVerifactu.ts tiene un interruptor aparte para el QR: se
-- genera y se guarda mucho antes de poder anunciarlo.
create or replace function public.verifactu_url_cotejo(
  p_entorno text, p_nif text, p_num_serie text, p_fecha date, p_total_euros text
) returns text
language sql immutable
as $function$
  select case when p_nif is null or p_nif = '' then null else
    (case lower(coalesce(p_entorno, 'preproduccion'))
       when 'produccion' then 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
       else 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'
     end)
    || '?nif=' || p_nif
    || '&numserie=' || replace(replace(p_num_serie, '/', '%2F'), ' ', '%20')
    || '&fecha=' || to_char(p_fecha, 'DD-MM-YYYY')
    || '&importe=' || p_total_euros
  end;
$function$;

create or replace function public.mint_ticket_verifactu(p_cobro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cobro    record;
  v_neg      text;
  v_cfg      record;
  v_nif      text;
  v_serie    text;
  v_tz       text;
  v_aeat     boolean;
  v_numero   integer;
  v_hash_ant text;
  v_num_serie text;
  v_fecha    timestamptz := now();
  v_fecha_local timestamptz;
  v_total_str text;
  v_cuota_str text;
  v_base_cents  integer;
  v_cuota_cents integer;
  v_iva      numeric;
  v_cadena   text;
  v_hash     text;
  v_formato  text;
  v_estado   text;
  v_qr       text;
  v_existing record;
  v_newid    uuid;
begin
  select negocio_id, total_cents, propina_cents, metodo, origen, estado, created_at
    into v_cobro
  from public.cobros where id = p_cobro_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_encontrado');
  end if;
  if v_cobro.estado not in ('completado','pagado') then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_completado', 'estado', v_cobro.estado);
  end if;

  v_neg := v_cobro.negocio_id;

  select * into v_existing from public.tickets_verifactu where cobro_id = p_cobro_id;
  if found then
    return jsonb_build_object('ok', true, 'ya_existia', true, 'ticket_id', v_existing.id,
      'serie', v_existing.serie, 'numero', v_existing.numero, 'hash', v_existing.hash,
      'formato_huella', v_existing.formato_huella);
  end if;

  select cf.nif, cf.serie_defecto, cf.num_serie_formato, cf.tipo_iva_defecto,
         cf.aplica_verifactu, cf.activo, cf.entorno_aeat
    into v_cfg
  from public.config_fiscal cf where cf.negocio_id = v_neg;

  -- El NIF sale de config_fiscal, que es donde vive. `negocio_portal.nif` se
  -- consulta solo como respaldo: leerlo A EL era el fallo que dejo 1.600 tickets
  -- encadenados contra el negocio_id.
  v_nif := nullif(btrim(coalesce(v_cfg.nif,
             (select nif from public.negocio_portal where negocio_id = v_neg))), '');

  -- Forma de NIF/NIE/CIF espanol. Si no la tiene, NO se inventa: rama interna.
  if v_nif is not null and v_nif !~* '^[A-Z0-9][0-9]{7}[A-Z0-9]$' then
    v_nif := null;
  end if;

  v_serie := coalesce(nullif(v_cfg.serie_defecto, ''), 'A');
  v_iva   := coalesce(v_cfg.tipo_iva_defecto, 21);
  v_aeat  := v_nif is not null;
  v_formato := case when v_aeat then 'aeat_v1' else 'interno_v1' end;

  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid') into v_tz
  from public.negocio_config c where c.negocio_id = v_neg;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  -- La cadena va por emisor: al rellenar el NIF, `nif_emisor` cambia y la cadena
  -- nueva arranca sola con huella vacia, que es el primer registro del emisor.
  perform pg_advisory_xact_lock(hashtext(v_neg || '|' || coalesce(v_nif, '') || '|' || v_serie));

  select coalesce(max(numero), 0) + 1 into v_numero
  from public.tickets_verifactu
  where negocio_id = v_neg and coalesce(nif_emisor, '') = coalesce(v_nif, '') and serie = v_serie;

  select hash into v_hash_ant
  from public.tickets_verifactu
  where negocio_id = v_neg and coalesce(nif_emisor, '') = coalesce(v_nif, '') and serie = v_serie
  order by numero desc limit 1;
  v_hash_ant := coalesce(v_hash_ant, '');

  -- La propina no es contraprestacion del servicio: no lleva IVA y no entra en la
  -- base imponible. El total del registro es lo cobrado por el servicio.
  v_base_cents  := round(v_cobro.total_cents / (1 + v_iva / 100.0));
  v_cuota_cents := v_cobro.total_cents - v_base_cents;
  v_total_str   := to_char(v_cobro.total_cents / 100.0, 'FM999999990.00');
  v_cuota_str   := to_char(v_cuota_cents / 100.0, 'FM999999990.00');
  v_fecha_local := v_fecha;

  if v_aeat then
    v_num_serie := public.verifactu_num_serie(
      v_cfg.num_serie_formato, v_serie, extract(year from v_fecha at time zone v_tz)::int, v_numero);

    -- CADENA OFICIAL. Tiene que ser byte a byte la misma que lib/fiscal/huella.ts:
    -- lo comprueba scripts/vigilantes/huella-verifactu.test.mjs.
    v_cadena :=
      'IDEmisorFactura=' || v_nif ||
      '&NumSerieFactura=' || v_num_serie ||
      '&FechaExpedicionFactura=' || to_char(v_fecha at time zone v_tz, 'DD-MM-YYYY') ||
      '&TipoFactura=F2' ||
      '&CuotaTotal=' || v_cuota_str ||
      '&ImporteTotal=' || v_total_str ||
      '&Huella=' || v_hash_ant ||
      '&FechaHoraHusoGenRegistro=' || public.verifactu_iso8601(v_fecha, v_tz);
    v_hash := upper(encode(sha256(convert_to(v_cadena, 'UTF8')), 'hex'));

    v_qr := public.verifactu_url_cotejo(
      v_cfg.entorno_aeat, v_nif, v_num_serie, (v_fecha at time zone v_tz)::date, v_total_str);

    -- 'pendiente' solo si el salon tiene VeriFactu activo de verdad. Si no, se
    -- guarda con formato bueno pero sin cola: el worker no lo tocara.
    v_estado := case when coalesce(v_cfg.aplica_verifactu, false) and coalesce(v_cfg.activo, false)
                     then 'pendiente' else 'no_enviado' end;
  else
    -- Libro interno, formato de siempre, SIN meter el negocio_id donde va un NIF.
    v_num_serie := v_serie || '-' || lpad(v_numero::text, 5, '0');
    v_cadena := coalesce(v_nif, v_neg) || '|' || v_num_serie || '|' ||
                to_char(v_fecha, 'YYYY-MM-DD"T"HH24:MI:SS') || '|' || v_total_str || '|' || v_hash_ant;
    v_hash   := encode(sha256(convert_to(v_cadena, 'UTF8')), 'hex');
    v_qr     := null;
    v_estado := 'no_enviado';
  end if;

  insert into public.tickets_verifactu (
    negocio_id, cobro_id, serie, numero, hash, hash_anterior, fecha_emision, payload,
    nif_emisor, formato_huella, tipo_factura, base_cents, cuota_cents, qr_url, estado_envio
  ) values (
    v_neg, p_cobro_id, v_serie, v_numero, v_hash, v_hash_ant, v_fecha,
    jsonb_build_object(
      'numero_factura', v_num_serie,
      'fecha_emision', to_char(v_fecha at time zone v_tz, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'total_euros', v_total_str,
      'total_cents', v_cobro.total_cents,
      'cuota_euros', v_cuota_str,
      'tipo_iva', v_iva,
      'metodo', v_cobro.metodo,
      'origen', v_cobro.origen,
      'zona', v_tz
    ),
    v_nif, v_formato, case when v_aeat then 'F2' else null end,
    v_base_cents, v_cuota_cents, v_qr, v_estado
  ) returning id into v_newid;

  return jsonb_build_object(
    'ok', true, 'ticket_id', v_newid, 'serie', v_serie, 'numero', v_numero,
    'numero_factura', v_num_serie, 'hash', v_hash, 'hash_anterior', v_hash_ant,
    'formato_huella', v_formato, 'estado_envio', v_estado, 'nif_emisor', v_nif
  );
end;
$function$;

comment on function public.mint_ticket_verifactu(uuid) is
  'Emite el ticket de un cobro. Con NIF de emisor valido usa la cadena oficial de la AEAT (aeat_v1) y lo deja pendiente de envio; sin NIF emite libro interno y NUNCA pone el negocio_id en el hueco del NIF.';
