-- Ecosistema de cuentas: propietario + trabajadores del mismo salon.
--
-- Problemas que cierra esta migracion (auditoria 3 ago 2026):
--
--  1. profiles.plan lo podia cambiar el propio usuario. El trigger que congela
--     la identidad protegia role y negocio_id, pero NO el plan: cualquiera podia
--     hacer `update profiles set plan='estudio' where id = auth.uid()` y abrir
--     Chispa, campanas, senales y lista de espera sin pagar. Los gates del
--     servidor (edge agenda-asistente) leen ese mismo campo, asi que tampoco
--     frenaban nada.
--
--  2. El plan vivia por CUENTA y no por SALON. Un trabajador invitado nacia con
--     plan 'full' (= Estudio) aunque su salon pagara Esencial, y bajar el plan al
--     propietario dejaba a su equipo con los extras puestos. El plan lo contrata
--     el salon: la fuente de verdad es el propietario y el resto lo hereda.
--
--  3. No habia forma de saber si un trabajador habia aceptado la invitacion.
--     El perfil se crea al invitar, asi que "tiene cuenta" no significa "puede
--     entrar". equipo_cuentas() devuelve el estado real leyendo auth.users.
--
--  4. Cualquier miembro del salon (incluido un profesional) podia crear o
--     borrar fichas de profesional. Gestionar el equipo es de Direccion para
--     arriba (RN-EQ-040..043, lib/permissions.ts).

-- ---------------------------------------------------------------------------
-- 1. El plan tampoco se toca desde el cliente
-- ---------------------------------------------------------------------------
-- Mismo patron que role/negocio_id: solo cambia dentro de una funcion
-- SECURITY DEFINER que haya marcado mecha.identity_ctx.
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then
    return new;
  end if;
  new.role := old.role;
  new.negocio_id := old.negocio_id;
  new.plan := old.plan;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. El plan es del salon: lo marca el propietario
-- ---------------------------------------------------------------------------
-- Plan contratado de un salon = el del propietario mas antiguo. Si no hay
-- propietario (dato roto) se asume 'free'.
create or replace function public.plan_del_negocio(p_negocio_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.plan
       from public.profiles p
      where p.negocio_id = p_negocio_id
        and p.role = 'owner'
      order by p.created_at asc
      limit 1),
    'free');
$$;

comment on function public.plan_del_negocio(text) is
  'Plan contratado por un salon (el del propietario). El resto del equipo lo hereda.';

-- Funcion interna: nadie la llama desde el navegador (round 4 de seguridad).
revoke execute on function public.plan_del_negocio(text) from anon, authenticated;

-- Iguala el plan de todo el equipo al del propietario. Se llama despues de
-- cualquier cambio de plan y al aceptar una invitacion.
-- El tenant de la demo queda FUERA a proposito: ahi conviven todas las cuentas
-- nuevas en free y no forman un salon real.
create or replace function public.sincronizar_plan_negocio(p_negocio_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  plan_salon text;
  tocadas integer := 0;
begin
  if p_negocio_id is null or trim(p_negocio_id) = '' or p_negocio_id = 'demo_salon_001' then
    return 0;
  end if;

  -- Sin propietario (dato roto) no hay plan del que heredar: se deja el equipo
  -- como esta en vez de arrastrarlo a 'free'.
  select p.plan into plan_salon
    from public.profiles p
   where p.negocio_id = p_negocio_id
     and p.role = 'owner'
   order by p.created_at asc
   limit 1;
  if plan_salon is null then
    return 0;
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = plan_salon,
         updated_at = now()
   where negocio_id = p_negocio_id
     and role <> 'owner'
     and plan is distinct from plan_salon;
  get diagnostics tocadas = row_count;
  return tocadas;
end;
$$;

revoke execute on function public.sincronizar_plan_negocio(text) from anon, authenticated;

-- staff_set_plan: el plan lo contrata el SALON, no una cuenta suelta.
create or replace function public.staff_set_plan(target_user_id uuid, new_plan text)
returns profiles
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

  -- El equipo del salon hereda el plan del propietario. Si a quien se le cambia
  -- el plan no es el propietario, se reajusta al del salon para que no queden
  -- cuentas con mas extras que el negocio que las paga.
  perform public.sincronizar_plan_negocio(prof.negocio_id);
  select * into prof from public.profiles where id = target_user_id;

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

-- staff_grant_full_access: al dar acceso completo, el equipo tambien lo hereda.
create or replace function public.staff_grant_full_access(target_user_id uuid, new_negocio_id text default null::text, new_plan text default 'full'::text)
returns profiles
language plpgsql
security definer
set search_path to 'public'
as $$
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
         updated_at = now()
   where id = target_user_id
   returning * into prof;

  perform public.sincronizar_plan_negocio(prof.negocio_id);
  select * into prof from public.profiles where id = target_user_id;

  return prof;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Estado real de las cuentas del salon
-- ---------------------------------------------------------------------------
-- El perfil se crea AL INVITAR, asi que su existencia no dice si la persona ya
-- puede entrar. Esto lee auth.users (solo posible con SECURITY DEFINER) y
-- devuelve el estado que la UI necesita para avisar y ofrecer arreglo.
create or replace function public.equipo_cuentas()
returns table (
  id uuid,
  nombre text,
  apellido text,
  email text,
  role text,
  plan text,
  estado text,
  invitada_en timestamptz,
  ultimo_acceso timestamptz,
  profesional_id uuid,
  profesional_nombre text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
-- Las columnas de salida (id, nombre, email, role, plan) se llaman igual que las
-- de profiles: sin esto, cualquier referencia dentro del cuerpo es ambigua.
#variable_conflict use_column
declare
  yo_role text;
  yo_negocio text;
begin
  select pr.role, pr.negocio_id into yo_role, yo_negocio
    from public.profiles pr where pr.id = auth.uid();
  if yo_role is null then raise exception 'no_profile'; end if;
  if yo_role not in ('owner', 'admin') then raise exception 'not_authorized'; end if;
  if yo_negocio is null or trim(yo_negocio) = '' then raise exception 'no_negocio'; end if;

  return query
    select
      p.id,
      p.nombre,
      p.apellido,
      p.email,
      p.role,
      p.plan,
      case when u.last_sign_in_at is not null then 'activa' else 'pendiente' end,
      coalesce(u.invited_at, p.created_at),
      u.last_sign_in_at,
      f.id,
      f.nombre
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.profesionales f on f.profile_id = p.id and f.negocio_id = p.negocio_id
    where p.negocio_id = yo_negocio
      -- En el tenant de la demo conviven prospectos que no son equipo (ver §6).
      and (p.negocio_id <> 'demo_salon_001' or p.es_cuenta_demo)
    order by
      case p.role when 'owner' then 0 when 'admin' then 1 when 'recepcion' then 2 else 3 end,
      coalesce(p.nombre, p.email);
end;
$$;

comment on function public.equipo_cuentas() is
  'Cuentas del salon con estado real de acceso (activa/pendiente) y ficha de profesional vinculada. Solo owner/admin.';

grant execute on function public.equipo_cuentas() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gestionar el equipo es de Direccion para arriba
-- ---------------------------------------------------------------------------
-- La UPDATE ya exigia owner/admin; INSERT y DELETE se habian quedado abiertas a
-- cualquier cuenta del negocio.
drop policy if exists "Users can create professionals in own negocio" on public.profesionales;
create policy "Direccion crea profesionales en su negocio"
  on public.profesionales
  for insert
  to authenticated
  with check (
    negocio_id = public.my_negocio_id_text()
    and public.my_app_role() = any (array['owner', 'admin'])
  );

drop policy if exists "Users can delete professionals in own negocio" on public.profesionales;
create policy "Direccion borra profesionales en su negocio"
  on public.profesionales
  for delete
  to authenticated
  using (
    negocio_id = public.my_negocio_id_text()
    and public.my_app_role() = any (array['owner', 'admin'])
  );

-- ---------------------------------------------------------------------------
-- 5. Reparacion de datos existentes
-- ---------------------------------------------------------------------------
-- Cuentas de equipo que quedaron con mas plan que su salon.
do $$
declare
  n text;
begin
  for n in select distinct negocio_id from public.profiles
            where negocio_id is not null and negocio_id <> 'demo_salon_001'
  loop
    perform public.sincronizar_plan_negocio(n);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. La demo compartida no puede exponer cuentas reales
-- ---------------------------------------------------------------------------
-- FUGA encontrada en la misma auditoria: todas las cuentas nuevas nacen en el
-- tenant de la demo (demo_salon_001) con role 'owner'. La politica de SELECT
-- dejaba que cualquier prospecto registrado -y el propio visitante de la demo-
-- listara nombre, email, telefono y CP del resto de prospectos desde
-- Ajustes -> Accesos y roles. Dentro de la demo solo se ven las cuentas de
-- atrezzo, marcadas explicitamente.
alter table public.profiles
  add column if not exists es_cuenta_demo boolean not null default false;

comment on column public.profiles.es_cuenta_demo is
  'Cuenta de atrezzo del salon demo compartido. Unicas visibles dentro de demo_salon_001.';

update public.profiles
   set es_cuenta_demo = true
 where negocio_id = 'demo_salon_001'
   and lower(email) in (
     'demo.publico@mecha.app',
     'carlitos-admin@mecha.es',
     'carlitos-recepcion@mecha.es',
     'carlitos-empleado@mecha.es'
   );

-- El equipo de atrezzo tenia todos role 'owner': la demo enseñaba cuatro
-- propietarios en vez de la escalera de roles que vende.
do $$
begin
  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles set role = 'admin', updated_at = now()
   where lower(email) = 'carlitos-admin@mecha.es';
  update public.profiles set role = 'recepcion', updated_at = now()
   where lower(email) = 'carlitos-recepcion@mecha.es';
  update public.profiles set role = 'employee', updated_at = now()
   where lower(email) = 'carlitos-empleado@mecha.es';
end;
$$;

drop policy if exists "Direccion ve cuentas de su negocio" on public.profiles;
create policy "Direccion ve cuentas de su negocio"
  on public.profiles
  for select
  to authenticated
  using (
    negocio_id is not null
    and negocio_id = my_negocio_id_text()
    and my_app_role() = any (array['owner', 'admin'])
    and (negocio_id <> 'demo_salon_001' or es_cuenta_demo)
  );

-- equipo_cuentas() es SECURITY DEFINER: repite la misma exclusion (ver arriba,
-- version final aplicada con #variable_conflict use_column y alias cualificados).
