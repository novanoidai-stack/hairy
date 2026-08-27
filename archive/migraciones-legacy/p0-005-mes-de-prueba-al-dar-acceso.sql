-- P0-005 · El mes de prueba empieza cuando el salon recibe su negocio propio.
--
-- Por que aqui y no en el alta: las cuentas nuevas nacen en demo_salon_001 con plan
-- 'free', y 'free' no incluye ninguna funcion. Sellar trial_ends_at en el signup daria
-- un "mes gratis" de la demo, no del producto. El momento en que el salon pasa a tener
-- producto entero es este: staff_grant_full_access.
--
-- Solo cambia el UPDATE. El resto de la funcion (generacion del negocio_id, colision,
-- sincronizacion del plan) queda igual que en produccion a 2026-08-07.
--
-- El trigger guard_profile_identity_columns congela trial_ends_at y suscripcion_estado
-- y solo lo salta mecha.identity_ctx = '1', que esta funcion ya activa mas abajo. Sin
-- eso el update se revertiria en silencio, sin error.

CREATE OR REPLACE FUNCTION public.staff_grant_full_access(
  target_user_id uuid,
  new_negocio_id text DEFAULT NULL::text,
  new_plan text DEFAULT 'full'::text
)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  prof public.profiles;
  base text;
  candidate text;
  generated boolean := false;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  if new_negocio_id is not null and length(trim(new_negocio_id)) > 0 then
    candidate := lower(regexp_replace(trim(new_negocio_id), '\s+', '_', 'g'));
    candidate := regexp_replace(candidate, '[^a-z0-9_]', '', 'g');
  elsif prof.negocio_id is null or trim(prof.negocio_id) = '' or prof.negocio_id = 'demo_salon_001' then
    base := lower(regexp_replace(coalesce(nullif(trim(prof.nombre_negocio), ''), 'salon'), '\s+', '_', 'g'));
    base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
    if base = '' then base := 'salon'; end if;
    if coalesce(trim(prof.codigo_postal), '') <> '' then
      candidate := base || '_' || regexp_replace(lower(prof.codigo_postal), '[^a-z0-9]', '', 'g');
    else
      candidate := base || '_' || substr(md5(random()::text), 1, 5);
    end if;
    generated := true;
  else
    candidate := prof.negocio_id;
  end if;

  if candidate = '' or candidate = 'demo_salon_001' then
    candidate := 'salon_' || substr(md5(random()::text), 1, 5);
    generated := true;
  end if;

  if generated and exists (
    select 1 from public.profiles where negocio_id = candidate and id <> target_user_id
  ) then
    candidate := candidate || '_' || substr(md5(random()::text), 1, 5);
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = coalesce(nullif(trim(new_plan), ''), 'full'),
         negocio_id = candidate,
         -- P0-005. Las dos columnas van por coalesce a proposito: dar acceso completo
         -- se ejecuta mas de una vez (corregir el negocio_id, cambiar de plan) y la
         -- prueba NO puede reiniciarse en cada pasada.
         trial_ends_at = case
                           when suscripcion_estado is null
                             then coalesce(trial_ends_at, now() + interval '30 days')
                           else trial_ends_at
                         end,
         -- A un salon que ya paga (activa / pago_pendiente / impagada) no se le
         -- devuelve nunca a 'prueba'.
         suscripcion_estado = coalesce(suscripcion_estado, 'prueba'),
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  perform public.sincronizar_plan_negocio(prof.negocio_id);
  select * into prof from public.profiles where id = target_user_id;

  return prof;
end;
$function$;
