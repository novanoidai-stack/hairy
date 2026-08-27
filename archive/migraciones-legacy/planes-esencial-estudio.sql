-- Planes reales: Esencial y Estudio (3 ago 2026).
--
-- Hasta ahora `profiles.plan` solo tenia dos valores de facto ('free' y 'full')
-- y NO limitaba nada: el unico uso en la app era echar a las cuentas free del
-- software. Con dos planes de pago publicados hace falta que cambiar el plan
-- cambie de verdad lo que la cuenta puede hacer.
--
-- Valores canonicos: free | esencial | estudio.
-- 'full' se conserva como sinonimo historico de 'estudio' para no tocar las
-- cuentas existentes (lib/planes.ts lo mapea igual en el cliente).
--
-- Que incluye cada plan vive en lib/planes.ts (fuente unica) y se refleja en la
-- seccion #precios de la landing y en el prompt de chispa-landing.

-- 1. Solo valores conocidos (evita que un typo del panel deje una cuenta en un
--    plan inexistente, que se leeria como 'free' y la dejaria sin acceso).
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles
  add constraint profiles_plan_check
  check (plan is null or plan in ('free', 'esencial', 'estudio', 'full'));

-- 2. Cambiar el plan de una cuenta desde el panel de staff, SIN tocar su
--    negocio_id (para eso ya esta staff_grant_full_access, que ademas le crea
--    su propio negocio al sacarla de la demo).
create or replace function public.staff_set_plan(target_user_id uuid, new_plan text)
returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  prof public.profiles;
  plan_limpio text := lower(trim(coalesce(new_plan, '')));
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;
  if plan_limpio not in ('free', 'esencial', 'estudio') then
    raise exception 'plan_invalido';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = plan_limpio,
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  -- Traza: quien cambio el plan de quien y desde que valor.
  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
  values
    (prof.negocio_id, 'plan_cambiado', 'profiles', target_user_id::text, 'staff',
     format('Plan cambiado a %s', plan_limpio),
     jsonb_build_object('plan_nuevo', plan_limpio, 'por', auth.uid()),
     'panel de staff')
  on conflict do nothing;

  return prof;
end;
$$;

revoke all on function public.staff_set_plan(uuid, text) from public, anon;
grant execute on function public.staff_set_plan(uuid, text) to authenticated;
