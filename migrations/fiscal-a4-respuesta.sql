-- migrations/fiscal-a4-respuesta.sql
-- El worker de envio persiste la respuesta de la AEAT. Mapea el estado crudo al estado de la factura.
create or replace function public.registrar_respuesta_aeat(
  p_factura_id uuid, p_aeat_estado text, p_csv text default null,
  p_error_codigo text default null, p_error_desc text default null,
  p_qr_url text default null, p_payload_xml text default null, p_respuesta jsonb default null
) returns void as $$
declare v_estado text;
begin
  v_estado := case upper(coalesce(p_aeat_estado,''))
    when 'CORRECTO' then 'aceptada'
    when 'ACEPTADOCONERRORES' then 'aceptada_con_errores'
    when 'INCORRECTO' then 'rechazada'
    else 'rechazada' end;
  update public.facturas set
    aeat_estado=p_aeat_estado, aeat_csv=p_csv,
    aeat_error_codigo=p_error_codigo, aeat_error_desc=p_error_desc,
    qr_url=coalesce(p_qr_url, qr_url), payload_xml=coalesce(p_payload_xml, payload_xml),
    respuesta=coalesce(p_respuesta, respuesta), estado=v_estado
  where id=p_factura_id and estado='generada';
  if not found then raise exception 'Factura no esta en estado generada'; end if;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.registrar_respuesta_aeat(uuid,text,text,text,text,text,text,jsonb)
  from public, anon, authenticated;   -- solo el worker (service_role) la invoca
