-- Solucion de no-shows (IA en la agenda 1.2): el enabler que faltaba.
-- El perfil de riesgo (perfil-riesgo-vip-exento.sql) YA cuenta citas en estado
-- 'no_show'/'no_presentada' para exigir deposito a clientes de riesgo, y el CHECK de
-- citas.estado YA los permite -- pero nada marcaba nunca una cita como no_show, asi
-- que esa cadena estaba muerta. Esta RPC la activa. La recolocacion de huecos por
-- CANCELACION (futura) ya la cubre el motor de lista de espera; un no_show es una cita
-- pasada, no libera hueco futuro.

create or replace function public.marcar_cita_no_show(p_cita_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_neg text; v_role text; v_cita public.citas;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin','recepcion','direccion') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  select * into v_cita from public.citas where id = p_cita_id;
  if v_cita.id is null or v_cita.negocio_id <> v_neg then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada');
  end if;
  if v_cita.inicio > now() then
    return jsonb_build_object('ok', false, 'error', 'cita_futura');  -- no-show solo para citas ya pasadas
  end if;
  if v_cita.estado not in ('confirmada', 'completada') then
    return jsonb_build_object('ok', false, 'error', 'estado_no_valido');
  end if;
  update public.citas set estado = 'no_show', modificado_at = now() where id = p_cita_id;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'cliente_id', v_cita.cliente_id);
end $function$;

revoke execute on function public.marcar_cita_no_show(uuid) from public, anon;
grant execute on function public.marcar_cita_no_show(uuid) to authenticated;
