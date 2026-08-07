-- P0-007 · La prueba se acaba de verdad.
--
-- Hasta ahora staff_grant_full_access ARRANCABA el mes gratis pero nada lo
-- terminaba: pasados los 30 dias el salon conservaba Chispa, voz, señales y
-- campañas sin haber pagado nunca.
--
-- El corte va por `plan`, no por una comprobacion nueva: todo lo que ya gatea por
-- plan (el menu lateral, withPlanGate y el 402 de la edge agenda-asistente) corta
-- solo en cuanto el plan baja a 'free'. Añadir una segunda regla de acceso seria
-- otra cosa que mantener sincronizada.
--
-- Volver a contratar restaura el plan sin intervencion: el webhook lo deduce del
-- price_ pagado (planDePrecio) y lo propaga al equipo.
--
-- Depende de p0-003b (estado 'caducada' admitido por el CHECK).

begin;

create or replace function public.caducar_pruebas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocios text[];
  v_neg text;
begin
  -- Las columnas de suscripcion estan congeladas por guard_profile_identity_columns.
  perform set_config('mecha.identity_ctx', '1', true);

  with vencidos as (
    select id
      from public.profiles
     where role = 'owner'
       and suscripcion_estado = 'prueba'
       and trial_ends_at is not null
       and trial_ends_at < now()
       -- El salon de la demo compartida esta exento de planes por diseño.
       and coalesce(negocio_id, '') <> 'demo_salon_001'
  ), actualizados as (
    update public.profiles p
       set suscripcion_estado = 'caducada',
           plan = 'free',
           updated_at = now()
      from vencidos v
     where p.id = v.id
    returning p.negocio_id
  )
  select array_agg(distinct negocio_id) into v_negocios from actualizados;

  if v_negocios is null then
    return 0;
  end if;

  -- El equipo hereda el plan del owner: sin esto los trabajadores se quedarian
  -- dentro con el plan viejo.
  foreach v_neg in array v_negocios loop
    perform public.sincronizar_plan_negocio(v_neg);
  end loop;

  return coalesce(array_length(v_negocios, 1), 0);
end;
$$;

-- Solo el cron. Nunca desde el cliente.
revoke all on function public.caducar_pruebas_vencidas() from public, anon, authenticated;

-- 03:20 UTC: fuera de horario de salon, y despues del corte de dia.
select cron.schedule(
  'mecha_caducar_pruebas',
  '20 3 * * *',
  $cron$select public.caducar_pruebas_vencidas();$cron$
);

commit;
