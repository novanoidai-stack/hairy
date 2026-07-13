-- migrations/fiscal-a5-anulacion.sql
create or replace function public.generar_registro_anulacion(p_factura_id uuid)
returns uuid as $$
declare
  f public.facturas; v_prev text; v_fhg timestamptz; v_fhg_str text; v_cadena text; v_huella text; v_id uuid;
begin
  select * into f from public.facturas where id=p_factura_id and operacion='alta';
  if not found then raise exception 'Factura de alta no encontrada'; end if;
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
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.generar_registro_anulacion(uuid) from public, anon;
