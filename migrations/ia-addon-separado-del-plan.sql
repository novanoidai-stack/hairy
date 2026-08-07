-- IA como addon opcional, separado del plan de software (7 ago 2026).
--
-- Decision de Carlos: cobrar un precio justo por el software y, aparte,
-- opcionalmente, por la capa de IA (WhatsApp y/o telefono). Campañas, lista
-- de espera, señales Stripe y VeriFactu no son IA -- vivian dentro de
-- "Estudio" solo porque estaba todo junto. Bajan al software base; la IA
-- pasa a ser el unico eje de upsell. Ver lib/planes.ts para el cambio
-- correspondiente en el cliente.
--
-- APLICADA en remoto via MCP. No toca nada de facturacion/Stripe (eso sigue
-- siendo P0-002/P0-003, sin aplicar, dominio de Alexandro): esto es solo
-- control de acceso a funciones, igual que 'plan' ya lo era.

begin;

alter table public.profiles
  add column if not exists ia_nivel text not null default 'ninguna';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_ia_nivel_chk') then
    alter table public.profiles
      add constraint profiles_ia_nivel_chk
      check (ia_nivel in ('ninguna', 'whatsapp', 'voz', 'completa'));
  end if;
end $$;

comment on column public.profiles.ia_nivel is
  'Addon de IA contratado, ortogonal al plan de software. ninguna|whatsapp|voz|completa.';

-- Backfill: las cuentas reales que hoy son 'estudio' (o el historico 'full')
-- ya estaban pagando por la IA completa -- no se les quita nada al separar.
update public.profiles
   set ia_nivel = 'completa'
 where plan in ('estudio', 'full')
   and not es_cuenta_demo;

-- guard_profile_identity_columns: ia_nivel es tan de identidad como plan.
-- Sin esto, cualquier update de la propia fila se regala el addon de IA.
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then
    return new;
  end if;
  new.role                   := old.role;
  new.negocio_id             := old.negocio_id;
  new.plan                   := old.plan;
  new.ia_nivel               := old.ia_nivel;
  new.trial_ends_at          := old.trial_ends_at;
  new.stripe_customer_id     := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.suscripcion_estado     := old.suscripcion_estado;
  new.periodo_fin            := old.periodo_fin;
  return new;
end;
$$;

-- sincronizar_plan_negocio: arrastra tambien ia_nivel al equipo, no solo
-- plan. El addon lo contrata el salon (el propietario), igual que el plan.
create or replace function public.sincronizar_plan_negocio(p_negocio_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_salon text;
  ia_salon text;
  tocadas integer := 0;
begin
  if p_negocio_id is null or trim(p_negocio_id) = '' or p_negocio_id = 'demo_salon_001' then
    return 0;
  end if;

  select p.plan, p.ia_nivel into plan_salon, ia_salon
    from public.profiles p
   where p.negocio_id = p_negocio_id
     and p.role = 'owner'
   order by p.created_at asc
   limit 1;
  if plan_salon is null then
    return 0;
  end if;
  ia_salon := coalesce(ia_salon, 'ninguna');

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = plan_salon,
         ia_nivel = ia_salon,
         updated_at = now()
   where negocio_id = p_negocio_id
     and (plan is distinct from plan_salon or ia_nivel is distinct from ia_salon);
  get diagnostics tocadas = row_count;
  return tocadas;
end;
$$;

revoke execute on function public.sincronizar_plan_negocio(text) from anon, authenticated;

-- staff_set_ia_nivel: mismo patron que staff_set_plan (solo staff, arrastra
-- al equipo, deja rastro en eventos_negocio).
create or replace function public.staff_set_ia_nivel(target_user_id uuid, new_nivel text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles;
  nivel_limpio text := lower(trim(coalesce(new_nivel, '')));
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;
  if nivel_limpio not in ('ninguna', 'whatsapp', 'voz', 'completa') then
    raise exception 'nivel_invalido';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set ia_nivel = nivel_limpio,
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  perform public.sincronizar_plan_negocio(prof.negocio_id);
  select * into prof from public.profiles where id = target_user_id;

  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
  values
    (prof.negocio_id, 'ia_nivel_cambiado', 'profiles', target_user_id::text, 'staff',
     format('Addon de IA cambiado a %s', nivel_limpio),
     jsonb_build_object('ia_nivel_nuevo', nivel_limpio, 'por', auth.uid()),
     'panel de staff')
  on conflict do nothing;

  return prof;
end;
$$;

revoke execute on function public.staff_set_ia_nivel(uuid, text) from anon, authenticated;
grant execute on function public.staff_set_ia_nivel(uuid, text) to authenticated;

commit;

-- Comprobacion posterior sugerida:
--   1) select plan, ia_nivel, count(*) from profiles group by 1,2; -- las 7
--      cuentas reales de 'estudio' deben salir con ia_nivel='completa'.
--   2) Los advisors de seguridad de Supabase no deben añadir ERRORes nuevos.
