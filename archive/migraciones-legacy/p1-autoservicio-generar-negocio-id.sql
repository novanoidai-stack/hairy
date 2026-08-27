-- Autoservicio · La generacion del negocio_id UNICO deja de estar incrustada en
-- staff_grant_full_access para que el alta automatica (handle_new_user) use
-- EXACTAMENTE la misma regla. Dos copias de esta logica divergen seguro.
--
-- Reglas (identicas a las de p0-005): minusculas, espacios a '_', fuera todo lo
-- que no sea [a-z0-9_], sufijo con el codigo postal si lo hay o 5 hex si no, y
-- sufijo aleatorio extra si el candidato ya existe en otro perfil.
--
-- p_excluir_id existe para que el perfil que se esta dando de alta (o
-- actualizando) no cuente como su propia colision.
--
-- staff_grant_full_access NO se reescribe ahora para llamar a esta funcion: esta
-- en produccion y funciona, y tocarla añade riesgo sin beneficio inmediato. Si en
-- algun momento hay que cambiar la regla del slug, hay que cambiarla en LOS DOS
-- sitios (aqui y en p0-005) o los negocio_id divergiran.

create or replace function public.generar_negocio_id_unico(
  p_nombre_negocio text,
  p_codigo_postal text default null,
  p_excluir_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := lower(regexp_replace(coalesce(nullif(trim(p_nombre_negocio), ''), 'salon'), '\s+', '_', 'g'));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if base = '' then base := 'salon'; end if;

  if coalesce(trim(p_codigo_postal), '') <> '' then
    candidate := base || '_' || regexp_replace(lower(p_codigo_postal), '[^a-z0-9]', '', 'g');
  else
    candidate := base || '_' || substr(md5(random()::text), 1, 5);
  end if;

  -- Nunca devolver el tenant de la demo compartida: seria dar de alta a alguien
  -- dentro del escaparate, con acceso a sus datos.
  if candidate = '' or candidate = 'demo_salon_001' then
    candidate := 'salon_' || substr(md5(random()::text), 1, 5);
  end if;

  if exists (
    select 1 from public.profiles
     where negocio_id = candidate
       and (p_excluir_id is null or id <> p_excluir_id)
  ) then
    candidate := candidate || '_' || substr(md5(random()::text), 1, 5);
  end if;

  return candidate;
end;
$$;

-- Funcion interna: solo la llaman otras funciones security definer (el trigger de
-- alta). Desde el round 4 las funciones nuevas no nacen ejecutables por anon.
revoke all on function public.generar_negocio_id_unico(text, text, uuid) from public, anon, authenticated;
