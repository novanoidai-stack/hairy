-- Migration: fix-mint-ticket-verifactu-hash.sql (Mega-Plan, correccion de FASE 0)
--
-- BUG: mint_ticket_verifactu calculaba el hash con digest(text,'sha256') de
-- pgcrypto, pero en este proyecto pgcrypto vive en el esquema `extensions` y la
-- funcion declara `SET search_path TO 'public'`. Resultado: ERROR 42883
-- "function digest(text, unknown) does not exist" en CADA emision.
--
-- Como el trigger cobros_mint_ticket_trigger captura la excepcion con un
-- `raise notice` (por diseno: emitir el ticket no debe tumbar el cobro), el
-- fallo era COMPLETAMENTE SILENCIOSO: la tabla tickets_verifactu llevaba 0
-- filas y nadie se habia enterado.
--
-- SOLUCION: usar sha256() nativo de PostgreSQL (PG 11+, aqui PG 17), que no
-- depende de ninguna extension ni del search_path. convert_to(...,'UTF8')
-- reproduce exactamente el TextEncoder() de JS.
--
-- PARIDAD VERIFICADA (payload 'B12345678|A-00001|2026-08-14T10:30:00|12.50|'):
--   crypto.subtle (lib/caja/verifactuHash.ts) = 2720521268fdc585...f81d6d38
--   extensions.digest(s,'sha256')            = 2720521268fdc585...f81d6d38
--   sha256(convert_to(s,'UTF8'))             = 2720521268fdc585...f81d6d38
--
-- Solo cambia la linea del hash; el resto del cuerpo es identico al desplegado.

create or replace function public.mint_ticket_verifactu(p_cobro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cobro   record;
  v_neg     text;
  v_serie   text := 'A';
  v_nif     text;
  v_cif     text;
  v_numero  integer;
  v_hash_ant text;
  v_numero_factura text;
  v_fecha   timestamptz := now();
  v_fecha_str text;
  v_total_str text;
  v_payload_str text;
  v_hash    text;
  v_existing record;
  v_newid   uuid;
begin
  -- Cargar cobro.
  select negocio_id, total_cents, metodo, origen, estado, created_at
    into v_cobro
  from public.cobros where id = p_cobro_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_encontrado');
  end if;

  -- Solo emitir ticket para cobros en estado terminal pagado.
  if v_cobro.estado not in ('completado','pagado') then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_completado', 'estado', v_cobro.estado);
  end if;

  v_neg := v_cobro.negocio_id;

  -- Idempotencia: si ya existe ticket para este cobro, devolverlo.
  select * into v_existing from public.tickets_verifactu where cobro_id = p_cobro_id;
  if found then
    return jsonb_build_object('ok', true, 'ya_existia', true, 'ticket_id', v_existing.id,
      'serie', v_existing.serie, 'numero', v_existing.numero, 'hash', v_existing.hash);
  end if;

  -- Serializar emision por negocio para evitar huecos/race en max(numero)+1.
  perform pg_advisory_xact_lock(hashtext(v_neg || '|' || v_serie));

  -- Emisor: NIF del negocio si dio de alta datos fiscales; fallback honrado a negocio_id.
  select nif into v_nif from public.negocio_portal where negocio_id = v_neg;
  v_cif := coalesce(nullif(btrim(v_nif), ''), v_neg);

  -- Numero correlativo y hash anterior (cadena por negocio+serie).
  select coalesce(max(numero), 0) + 1 into v_numero
  from public.tickets_verifactu where negocio_id = v_neg and serie = v_serie;

  select hash into v_hash_ant
  from public.tickets_verifactu
  where negocio_id = v_neg and serie = v_serie
  order by numero desc limit 1;
  v_hash_ant := coalesce(v_hash_ant, '');

  -- Inputs del hash (matches lib/caja/verifactuHash.ts).
  v_numero_factura := v_serie || '-' || lpad(v_numero::text, 5, '0');
  v_fecha_str      := to_char(v_fecha, 'YYYY-MM-DD"T"HH24:MI:SS');
  -- totalEuros.toFixed(2): 2 decimales, sin espacios (JS). ltrim quita los espacios de to_char.
  v_total_str      := ltrim(to_char(v_cobro.total_cents / 100.0, '999999990.00'));

  v_payload_str := v_cif || '|' || v_numero_factura || '|' || v_fecha_str || '|' || v_total_str || '|' || v_hash_ant;
  -- sha256 NATIVO: sin pgcrypto, inmune al search_path (ver cabecera).
  v_hash := encode(sha256(convert_to(v_payload_str, 'UTF8')), 'hex');

  insert into public.tickets_verifactu (
    negocio_id, cobro_id, serie, numero, hash, hash_anterior, fecha_emision, payload
  ) values (
    v_neg, p_cobro_id, v_serie, v_numero, v_hash, v_hash_ant, v_fecha,
    jsonb_build_object(
      'cif_emisor', v_cif,
      'nif_real', v_nif,
      'numero_factura', v_numero_factura,
      'fecha_emision', v_fecha_str,
      'total_euros', v_total_str,
      'total_cents', v_cobro.total_cents,
      'metodo', v_cobro.metodo,
      'origen', v_cobro.origen
    )
  ) returning id into v_newid;

  return jsonb_build_object(
    'ok', true, 'ticket_id', v_newid,
    'serie', v_serie, 'numero', v_numero, 'numero_factura', v_numero_factura,
    'hash', v_hash, 'hash_anterior', v_hash_ant
  );
end;
$function$;

-- El trigger seguia siendo silencioso: un fallo de emision solo dejaba un
-- `notice`, que no aparece en los logs por defecto. Se sube a `warning` para que
-- cualquier futuro fallo sea VISIBLE sin volver a bloquear el cobro.
create or replace function public.cobros_mint_ticket_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    perform public.mint_ticket_verifactu(NEW.id);
  exception when others then
    raise warning 'tickets_verifactu: emision omitida para cobro % (%)', NEW.id, sqlerrm;
  end;
  return null; -- trigger AFTER: retorno ignorado.
end;
$function$;
