-- Migración: suscripcion_estado_exenta_y_sin_nulos
-- Normaliza suscripcion_estado eliminando nulos, añade el estado 'exenta'
-- y garantiza que las invitaciones de empleado hereden el estado del titular.

-- 1. Actualizar check constraint en profiles
alter table public.profiles
  drop constraint if exists profiles_suscripcion_estado_chk;

alter table public.profiles
  add constraint profiles_suscripcion_estado_chk
  check (
    (suscripcion_estado in ('prueba', 'activa', 'pago_pendiente', 'impagada', 'cancelada', 'pausada', 'caducada', 'exenta'))
    and (suscripcion_estado <> 'prueba' or trial_ends_at is not null)
  );

-- 2. Normalizar datos existentes: salones internos, demo y piloto pasan a 'exenta'
update public.profiles
   set suscripcion_estado = 'exenta'
 where suscripcion_estado is null
   and coalesce(negocio_id, '') in ('demo_salon_001', 'florent_surez_peluqueros_15004', 'salon_pruebas_alex', 'salon_pruebas_mecha');

update public.profiles
   set suscripcion_estado = 'prueba',
       trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days')
 where suscripcion_estado is null;

-- 3. Restricción NOT NULL
alter table public.profiles
  alter column suscripcion_estado set not null;

-- 4. Trigger de herencia para que crear-acceso-empleado no rompa el NOT NULL
create or replace function public.profiles_hereda_suscripcion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as \$\$
declare
  v_titular uuid;
begin
  if new.suscripcion_estado is not null then
    return new;
  end if;

  v_titular := public.titular_del_negocio(new.negocio_id);

  if v_titular is null then
    new.suscripcion_estado := 'prueba';
    new.trial_ends_at      := coalesce(new.trial_ends_at, now() + interval '30 days');
    return new;
  end if;

  select t.suscripcion_estado,
         coalesce(new.trial_ends_at, t.trial_ends_at),
         coalesce(new.periodo_fin, t.periodo_fin)
    into new.suscripcion_estado, new.trial_ends_at, new.periodo_fin
    from public.profiles t
   where t.id = v_titular;

  -- Titular con estado ilegible: no inventamos nada, pero tampoco dejamos un NULL.
  new.suscripcion_estado := coalesce(new.suscripcion_estado, 'prueba');
  if new.suscripcion_estado = 'prueba' then
    new.trial_ends_at := coalesce(new.trial_ends_at, now() + interval '30 days');
  end if;

  return new;
end;
\$\$;

drop trigger if exists profiles_hereda_suscripcion_trg on public.profiles;
create trigger profiles_hereda_suscripcion_trg
  before insert on public.profiles
  for each row
  execute function public.profiles_hereda_suscripcion();
