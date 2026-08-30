-- Migración: gate_suscripcion_helpers
-- Helpers y funciones de soporte para el gate de suscripcion en el servidor.

-- 1. Indice para rendimiento en busquedas de profiles por negocio_id
create index if not exists idx_profiles_negocio_id on public.profiles(negocio_id);

-- 2. Helper para saber si un salon tiene suscripcion con acceso
create or replace function public.negocio_con_acceso(p_negocio_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as \$\$
  select exists (
    select 1
      from public.profiles t
     where t.id = public.titular_del_negocio(p_negocio_id)
       and (
         t.suscripcion_estado in ('activa', 'pago_pendiente', 'exenta')
         or (t.suscripcion_estado = 'prueba' and t.trial_ends_at > now())
       )
  );
\$\$;

-- 3. Funcion de trigger statement que corta escrituras directas y RPCs si no hay acceso
create or replace function public.exige_negocio_con_acceso()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as \$\$
declare
  v_uid uuid := (select auth.uid());
  v_neg text;
begin
  if v_uid is null then
    return null;
  end if;

  if (select public.is_staff()) then
    return null;
  end if;

  select p.negocio_id into v_neg from public.profiles p where p.id = v_uid;

  -- Sin perfil no hay negocio que comprobar; de cerrarle el paso ya se encarga la RLS.
  if v_neg is null then
    return null;
  end if;

  if not (select public.negocio_con_acceso(v_neg)) then
    raise exception 'suscripcion_inactiva'
      using errcode = '42501',
            hint = 'La suscripcion de este salon no esta activa. Se pueden consultar y exportar los datos, pero no crear ni modificar.';
  end if;

  return null;
end;
\$\$;
