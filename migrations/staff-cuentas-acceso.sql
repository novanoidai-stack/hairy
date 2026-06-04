-- Panel de staff: ver cuentas registradas y dar acceso completo.
-- Aplicada en Supabase (proyecto vtrggiogjrhqtwbhbgia) el 2026-06-04.

-- 1) El equipo (staff) puede leer todas las cuentas registradas.
--    Se suma a la policy existente "Users can view own profile":
--    las policies se combinan con OR, asi que un usuario normal sigue
--    viendo solo su propia fila.
drop policy if exists "Staff can view all profiles" on public.profiles;
create policy "Staff can view all profiles" on public.profiles
  for select to authenticated
  using (is_staff());

-- 2) RPC para dar acceso completo a una cuenta tras la auditoria.
--    Sube el plan (free -> full) y asegura un negocio_id propio
--    (saca la cuenta del tenant demo compartido demo_salon_001).
--    Solo ejecutable por staff (guarda con is_staff()).
create or replace function public.staff_grant_full_access(
  target_user_id uuid,
  new_negocio_id text default null,
  new_plan text default 'full'
)
returns public.profiles
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Determinar el negocio_id destino
  if new_negocio_id is not null and length(trim(new_negocio_id)) > 0 then
    -- el equipo asigna uno explicito: se respeta tal cual (normalizado)
    candidate := lower(regexp_replace(trim(new_negocio_id), '\s+', '_', 'g'));
    candidate := regexp_replace(candidate, '[^a-z0-9_]', '', 'g');
  elsif prof.negocio_id is null or trim(prof.negocio_id) = '' or prof.negocio_id = 'demo_salon_001' then
    -- la cuenta esta en el tenant demo compartido: generar uno propio
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
    -- ya tiene su propio negocio_id: conservarlo
    candidate := prof.negocio_id;
  end if;

  if candidate = '' or candidate = 'demo_salon_001' then
    candidate := 'salon_' || substr(md5(random()::text), 1, 5);
    generated := true;
  end if;

  -- Para los generados, garantizar que no choquen con otro negocio existente
  if generated and exists (
    select 1 from public.profiles where negocio_id = candidate and id <> target_user_id
  ) then
    candidate := candidate || '_' || substr(md5(random()::text), 1, 5);
  end if;

  update public.profiles
     set plan = coalesce(nullif(trim(new_plan), ''), 'full'),
         negocio_id = candidate,
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  return prof;
end;
$function$;

revoke all on function public.staff_grant_full_access(uuid, text, text) from public, anon;
grant execute on function public.staff_grant_full_access(uuid, text, text) to authenticated;
