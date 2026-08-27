-- Migration: tickets-verifactu-backfill.sql (Mega-Plan WS-8)
--
-- Los cobros anteriores al trigger de emision (y todos los del periodo en que el
-- hash estuvo roto por el bug de digest(), ver fix-mint-ticket-verifactu-hash)
-- no tienen ticket. Sin esto, la pantalla de Registros sale vacia para todo el
-- historico y no hay forma de comprobar que la cadena funciona.
--
-- HONESTIDAD: se emiten AHORA, no entonces. Por eso cada ticket generado aqui
-- lleva `payload.backfill = true` y `payload.emitido_at`: quien mire el registro
-- tiene que poder distinguir un ticket emitido en el momento del cobro de uno
-- reconstruido despues. La `fecha_emision` se toma del `cobrado_at` real del
-- cobro (no de now()) para que el ticket hable de cuando se cobro de verdad, y
-- se recorren en orden cronologico para que la numeracion y la cadena de hash
-- salgan coherentes.
--
-- Esto NO convierte el registro en fiscal: seguimos sin enviar nada a la AEAT.
-- Es un registro interno inalterable, y asi debe decirlo la UI.

do $$
declare
  v_cobro record;
  v_serie text := 'A';
  v_nif text;
  v_cif text;
  v_numero integer;
  v_hash_ant text;
  v_numero_factura text;
  v_fecha_str text;
  v_total_str text;
  v_payload_str text;
  v_hash text;
  v_n integer := 0;
begin
  for v_cobro in
    select c.id, c.negocio_id, c.total_cents, c.metodo, c.origen, c.cobrado_at
    from public.cobros c
    where c.estado in ('completado', 'pagado')
      and not exists (select 1 from public.tickets_verifactu t where t.cobro_id = c.id)
    order by c.negocio_id, c.cobrado_at, c.id
  loop
    -- Emisor: mismo criterio que mint_ticket_verifactu.
    select nif into v_nif from public.negocio_portal where negocio_id = v_cobro.negocio_id;
    v_cif := coalesce(nullif(btrim(v_nif), ''), v_cobro.negocio_id);

    select coalesce(max(numero), 0) + 1 into v_numero
    from public.tickets_verifactu
    where negocio_id = v_cobro.negocio_id and serie = v_serie;

    select hash into v_hash_ant
    from public.tickets_verifactu
    where negocio_id = v_cobro.negocio_id and serie = v_serie
    order by numero desc limit 1;
    v_hash_ant := coalesce(v_hash_ant, '');

    v_numero_factura := v_serie || '-' || lpad(v_numero::text, 5, '0');
    v_fecha_str := to_char(v_cobro.cobrado_at, 'YYYY-MM-DD"T"HH24:MI:SS');
    v_total_str := ltrim(to_char(v_cobro.total_cents / 100.0, '999999990.00'));

    v_payload_str := v_cif || '|' || v_numero_factura || '|' || v_fecha_str || '|' || v_total_str || '|' || v_hash_ant;
    v_hash := encode(sha256(convert_to(v_payload_str, 'UTF8')), 'hex');

    insert into public.tickets_verifactu (
      negocio_id, cobro_id, serie, numero, hash, hash_anterior, fecha_emision, payload
    ) values (
      v_cobro.negocio_id, v_cobro.id, v_serie, v_numero, v_hash, v_hash_ant, v_cobro.cobrado_at,
      jsonb_build_object(
        'cif_emisor', v_cif,
        'nif_real', v_nif,
        'numero_factura', v_numero_factura,
        'fecha_emision', v_fecha_str,
        'total_euros', v_total_str,
        'total_cents', v_cobro.total_cents,
        'metodo', v_cobro.metodo,
        'origen', v_cobro.origen,
        -- Marca de reconstruccion: este ticket NO se emitio en el momento del cobro.
        'backfill', true,
        'emitido_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS')
      )
    );
    v_n := v_n + 1;
  end loop;

  raise notice 'tickets_verifactu: % tickets reconstruidos', v_n;
end $$;
