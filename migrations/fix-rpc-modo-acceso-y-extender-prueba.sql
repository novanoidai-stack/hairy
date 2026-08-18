-- FIX: dos RPCs que el front-end llama pero que no existian en el repo.
--
-- 1) set_acceso_salon_modo(p_modo)
--    app/(tabs)/configuracion.web.tsx la llama para que el DUEÑO cambie el modo
--    de acceso de su salon. Solo existia staff_set_acceso_modo (solo staff),
--    asi que el selector de Ajustes > Equipo fallaba siempre (PGRST202).
--
-- 2) staff_extend_trial(target_user_id, extra_days)
--    web/admin.html la llama con { target_user_id, extra_days } desde el boton
--    "+30 dias prueba". No habia CREATE FUNCTION en el repo.
--    Extiende trial_ends_at N dias; si la prueba estaba vencida la reactiva
--    (suscripcion_estado 'caducada' -> 'prueba' + plan 'estudio'), igual que
--    hace staff_grant_full_access en fix-grant-full-access-y-ciudad-portal.sql.

-- ============================================================
-- 1) Modo de acceso configurable por el propietario
-- ============================================================

drop function if exists public.staff_extend_trial(uuid, integer);
drop function if exists public.set_acceso_salon_modo(text);

create or replace function public.set_acceso_salon_modo(p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text := public.my_negocio_id_text();
begin
  if v_negocio is null then
    raise exception 'sin_negocio';
  end if;
  if public.my_app_role() not in ('owner', 'admin') then
    raise exception 'not_authorized';
  end if;
  if p_modo not in ('individual', 'compartido') then
    raise exception 'modo_no_valido';
  end if;

  insert into public.salon_acceso (negocio_id, modo, actualizado_por)
  values (v_negocio, p_modo, auth.uid())
  on conflict (negocio_id) do update
    set modo = excluded.modo,
        actualizado_en = now(),
        actualizado_por = auth.uid();

  return jsonb_build_object('negocio_id', v_negocio, 'modo', p_modo);
end;
$$;

revoke all on function public.set_acceso_salon_modo(text) from public, anon;
grant execute on function public.set_acceso_salon_modo(text) to authenticated;

-- ============================================================
-- 2) Staff: extender / reactivar periodo de prueba
-- ============================================================

create or replace function public.staff_extend_trial(target_user_id uuid, extra_days int)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if extra_days is null or extra_days < 1 or extra_days > 365 then
    raise exception 'dias_invalidos';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  -- p0-002 congela trial_ends_at/suscripcion_estado salvo que se active este
  -- flag de sesion (mismo patron que staff_set_plan en planes-esencial-estudio.sql).
  perform set_config('mecha.identity_ctx', '1', true);

  update public.profiles
     set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now())
                         + (extra_days || ' days')::interval,
         suscripcion_estado = case
           when suscripcion_estado in ('caducada', 'cancelada') then 'prueba'
           else coalesce(suscripcion_estado, 'prueba')
         end,
         plan = case
           when suscripcion_estado in ('caducada', 'cancelada') then 'estudio'
           else plan
         end,
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  return prof;
end;
$$;

revoke all on function public.staff_extend_trial(uuid, int) from public, anon;
grant execute on function public.staff_extend_trial(uuid, int) to authenticated;
