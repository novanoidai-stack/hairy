-- Migracion: limite de 3 visitas a la demo por cuenta free
-- Proyecto Supabase Hairy: vtrggiogjrhqtwbhbgia
-- Cada cuenta con plan 'free' puede entrar a la demo real (solo-lectura) 3 veces.
-- Los planes de pago no tienen limite.

-- contador de visitas consumidas
alter table public.profiles
  add column if not exists demo_visits_used int not null default 0;

-- limite configurable en un solo sitio
create or replace function public.demo_visit_limit()
returns int language sql immutable as $$ select 3 $$;

-- Consume una visita de demo de forma atomica. Devuelve jsonb:
--   { allowed: bool, remaining: int|null, limit: int|null, used: int, plan: text }
-- remaining/limit = null significa "sin limite" (planes de pago).
create or replace function public.use_demo_visit()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_limit int := public.demo_visit_limit();
  v_plan  text;
  v_used  int;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'no_auth');
  end if;

  select plan, coalesce(demo_visits_used, 0)
    into v_plan, v_used
  from public.profiles
  where id = auth.uid();

  if not found then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'no_profile');
  end if;

  -- los planes de pago no tienen limite de demo
  if v_plan is distinct from 'free' then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null, 'used', v_used, 'plan', v_plan);
  end if;

  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'limit', v_limit, 'used', v_used, 'plan', v_plan);
  end if;

  update public.profiles
    set demo_visits_used = coalesce(demo_visits_used, 0) + 1,
        updated_at = now()
  where id = auth.uid();

  return jsonb_build_object(
    'allowed', true,
    'remaining', v_limit - (v_used + 1),
    'limit', v_limit,
    'used', v_used + 1,
    'plan', v_plan
  );
end;
$$;

-- Consulta el estado de visitas sin consumir ninguna.
create or replace function public.demo_visits_status()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_limit int := public.demo_visit_limit();
  v_plan  text;
  v_used  int;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'no_auth');
  end if;

  select plan, coalesce(demo_visits_used, 0)
    into v_plan, v_used
  from public.profiles
  where id = auth.uid();

  if not found then
    return jsonb_build_object('allowed', false, 'remaining', 0, 'reason', 'no_profile');
  end if;

  if v_plan is distinct from 'free' then
    return jsonb_build_object('allowed', true, 'remaining', null, 'limit', null, 'used', v_used, 'plan', v_plan);
  end if;

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'remaining', greatest(0, v_limit - v_used),
    'limit', v_limit,
    'used', v_used,
    'plan', v_plan
  );
end;
$$;

revoke all on function public.use_demo_visit() from public, anon;
revoke all on function public.demo_visits_status() from public, anon;
grant execute on function public.use_demo_visit() to authenticated;
grant execute on function public.demo_visits_status() to authenticated;
