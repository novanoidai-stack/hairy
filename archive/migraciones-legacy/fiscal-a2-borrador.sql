-- migrations/fiscal-a2-borrador.sql
-- Crea la factura en estado 'borrador' derivada del cobro: desglosa IVA, fija emisor/serie/ejercicio.
-- NO asigna numero ni huella (eso ocurre al GENERAR, para no dejar huecos).
create or replace function public.crear_factura_borrador(
  p_cobro_id uuid, p_tipo text default 'F2',
  p_nif_receptor text default null, p_nombre_receptor text default null
) returns uuid as $$
declare
  v_cobro public.cobros; v_cfg public.config_fiscal;
  v_base int; v_cuota int; v_id uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'Cobro no encontrado'; end if;
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
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.crear_factura_borrador(uuid,text,text,text) from public, anon;
