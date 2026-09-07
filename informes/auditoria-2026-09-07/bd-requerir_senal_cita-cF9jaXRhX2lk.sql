CREATE OR REPLACE FUNCTION public.requerir_senal_cita(p_cita_id uuid)
 RETURNS pagos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_total int;
  v_pago public.pagos;
begin
  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_not_found'; end if;

  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;

  if v_cita.grupo_id is not null then
    select coalesce(sum(public.importe_senal_servicio(c.servicio_id)), 0)
      into v_total
      from public.citas c where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1;
  else
    -- Cobra el deposito_importe ya calculado (client-aware). Sin importe pero con
    -- deposito_requerido -> senal plana del servicio. Sin deposito -> 0 (no cobra).
    if v_cita.deposito_importe is not null then
      v_total := round(v_cita.deposito_importe * 100)::int;
    elsif coalesce(v_cita.deposito_requerido, false) then
      v_total := public.importe_senal_servicio(v_cita.servicio_id);
    else
      v_total := 0;
    end if;
    v_cabecera := v_cita.id;
  end if;

  if coalesce(v_total, 0) <= 0 then
    return null;
  end if;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pendiente'
    limit 1;

  if found then
    update public.pagos set importe_cents = v_total, updated_at = now()
      where id = v_pago.id returning * into v_pago;
  else
    insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado)
    values (v_cita.negocio_id, v_cabecera, v_cita.cliente_id, 'senal', v_total, 'pendiente')
    returning * into v_pago;
  end if;

  return v_pago;
end;
$function$
