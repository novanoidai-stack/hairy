-- El alta guarda tambien apellido y codigo postal.
--
-- El registro de la app nativa (app/login.tsx) pide nombre, APELLIDO, negocio y
-- CODIGO POSTAL. Pero el perfil lo crea el trigger handle_new_user, que solo
-- leia nombre/salon/telefono, asi que la pantalla intentaba completar los dos
-- que faltaban con un UPDATE justo despues del signUp. Si el proyecto pide
-- confirmar el correo, en ese momento todavia no hay sesion: RLS tumbaba el
-- UPDATE, el catch se lo tragaba en silencio y el apellido y el CP se perdian
-- para siempre.
--
-- La solucion es que viajen en la metadata del alta y que los lea el trigger,
-- que corre como SECURITY DEFINER y no depende de que haya sesion.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, nombre, apellido, codigo_postal, nombre_negocio, negocio_id, phone, role, plan)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    nullif(btrim(new.raw_user_meta_data->>'apellido'), ''),
    nullif(btrim(new.raw_user_meta_data->>'codigo_postal'), ''),
    nullif(btrim(new.raw_user_meta_data->>'salon'), ''),
    'demo_salon_001',
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    'free'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Backfill: cuentas ya existentes que llevan el dato en la metadata pero lo
-- tienen vacio en el perfil (las que perdieron el UPDATE por no tener sesion).
update public.profiles p
   set apellido = coalesce(p.apellido, nullif(btrim(u.raw_user_meta_data->>'apellido'), '')),
       codigo_postal = coalesce(p.codigo_postal, nullif(btrim(u.raw_user_meta_data->>'codigo_postal'), ''))
  from auth.users u
 where u.id = p.id
   and (p.apellido is null or p.codigo_postal is null)
   and (u.raw_user_meta_data ? 'apellido' or u.raw_user_meta_data ? 'codigo_postal');
