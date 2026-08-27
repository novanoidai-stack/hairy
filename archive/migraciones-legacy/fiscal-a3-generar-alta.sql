-- migrations/fiscal-a3-generar-alta.sql
-- Genera el registro de ALTA: asigna numero (sin huecos), fija fechahora_gen, construye la
-- cadena de huella con el formato EXACTO de la AEAT, calcula SHA-256 y encadena. Atomico por negocio.
create or replace function public.generar_registro_alta(p_factura_id uuid)
returns table(numero int, huella text, num_serie_completo text, fechahora_gen timestamptz) as $$
declare
  f public.facturas; cfg public.config_fiscal;
  v_num int; v_prev text; v_nsc text; v_fhg timestamptz;
  v_fhg_str text; v_fecha_str text; v_cuota_str text; v_importe_str text; v_cadena text; v_huella text;
begin
  select * into f from public.facturas where id = p_factura_id;
  if not found then raise exception 'Factura no encontrada'; end if;
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
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.generar_registro_alta(uuid) from public, anon;
