-- Anular un cobro NO-online (efectivo/datafono/bizum manual/mixto) por si el staff se equivoca.
-- Aplicado al remoto via MCP como `anular_cobro_local`. Respeta la inmutabilidad fiscal: no borra,
-- marca el cobro 'anulado' (estado ya permitido en cobros_estado_check) y descobra la cita. Los
-- cobros con pasarela Stripe (idempotency_key 'pago:%') van por Reembolsar, no por aqui.
create or replace function public.anular_cobro(p_cita_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_neg text; v_role text; v_cobro public.cobros;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','recepcion','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;

  select * into v_cobro from public.cobros
    where cita_id = p_cita_id and estado = 'completado'
    order by created_at desc limit 1;
  if not found or v_cobro.negocio_id <> v_neg then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_encontrado');
  end if;
  if v_cobro.idempotency_key like 'pago:%' then
    return jsonb_build_object('ok', false, 'error', 'usa_reembolso');
  end if;

  update public.cobros set estado = 'anulado' where id = v_cobro.id;
  update public.citas set cobrada = false, cobro_id = null where id = p_cita_id;
  return jsonb_build_object('ok', true);
end $function$;

grant execute on function public.anular_cobro(uuid) to authenticated;
