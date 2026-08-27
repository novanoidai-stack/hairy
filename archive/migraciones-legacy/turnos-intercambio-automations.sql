-- =====================================================================
-- MIGRATION: Shift Trade Automations
-- Swaps appointments and inserts blockages when a shift trade is approved.
-- =====================================================================

create or replace function public.responder_intercambio_gestor(
  p_id uuid,
  p_aprobar boolean,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_negocio text;
  v_role text;
  v_row record;
begin
  if v_uid is null then raise exception 'no_autenticado'; end if;
  select negocio_id, role into v_negocio, v_role from profiles where id = v_uid;
  if v_role not in ('owner','admin') then raise exception 'solo_gestor'; end if;

  select * into v_row from turnos_intercambio where id = p_id and negocio_id = v_negocio;
  if v_row is null then raise exception 'no_encontrado'; end if;
  if v_row.estado <> 'pendiente_gestor' then raise exception 'estado_invalido'; end if;

  -- Update shift trade request state
  update turnos_intercambio
    set estado = case when p_aprobar then 'aprobado' else 'rechazado' end,
        respondido_gestor_at = now(),
        respondido_gestor_por = v_uid,
        nota_rechazo = case when p_aprobar then null else p_nota end
    where id = p_id;

  -- If approved, execute actual shift trade in schedules/citas
  if p_aprobar then
    -- 1. Swap appointments on the solicitante's date (assign to companero)
    update public.citas
       set profesional_id = v_row.companero_id
     where negocio_id = v_negocio
       and profesional_id = v_row.solicitante_id
       and estado in ('pendiente','confirmada')
       and inicio::date = v_row.fecha_solicitante;

    -- 2. Swap appointments on the companero's date (assign to solicitante)
    update public.citas
       set profesional_id = v_row.solicitante_id
     where negocio_id = v_negocio
       and profesional_id = v_row.companero_id
       and estado in ('pendiente','confirmada')
       and inicio::date = v_row.fecha_companero;

    -- 3. Create blockage for Solicitante on their original day (since they are off)
    insert into public.bloqueos_profesional (negocio_id, profesional_id, inicio, fin, tipo, motivo)
    select v_negocio, v_row.solicitante_id,
           (v_row.fecha_solicitante + h.hora_inicio)::timestamptz,
           (v_row.fecha_solicitante + h.hora_fin)::timestamptz,
           'descanso',
           'Intercambio de turno'
      from public.horarios_profesional h
     where h.profesional_id = v_row.solicitante_id
       and h.dia_semana = extract(dow from v_row.fecha_solicitante)::int;

    -- 4. Create blockage for Compañero on their original day (since they are off)
    insert into public.bloqueos_profesional (negocio_id, profesional_id, inicio, fin, tipo, motivo)
    select v_negocio, v_row.companero_id,
           (v_row.fecha_companero + h.hora_inicio)::timestamptz,
           (v_row.fecha_companero + h.hora_fin)::timestamptz,
           'descanso',
           'Intercambio de turno'
      from public.horarios_profesional h
     where h.profesional_id = v_row.companero_id
       and h.dia_semana = extract(dow from v_row.fecha_companero)::int;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.responder_intercambio_gestor(uuid,boolean,text) from public, anon;
grant execute on function public.responder_intercambio_gestor(uuid,boolean,text) to authenticated;
