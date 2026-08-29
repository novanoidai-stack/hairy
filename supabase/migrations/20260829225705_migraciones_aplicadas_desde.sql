-- El OTRO sentido de la guardia de migraciones.
--
-- Hasta ahora solo se miraba una direccion: ficheros del repo que no constan
-- aplicados. Al mirar la contraria aparecieron SIETE migraciones aplicadas en
-- produccion SIN fichero en el repo, todas refinamientos de `vigilancia_bd()`.
--
-- Esa deriva es peor que la otra, y por eso merece su propia comprobacion:
--
--   - La primera (fichero sin aplicar) se nota cuando algo no funciona.
--   - Esta NO SE NOTA NUNCA. El codigo corre, todo va bien, y el .sql del repo
--     es una version vieja de la misma funcion. Nadie puede revisarla, ni
--     reproducirla en un entorno nuevo, ni saber que hace sin abrir el
--     dashboard. El repo miente y no falla nada.
--
-- Devuelve las aplicadas desde un corte para que el vigilante las cruce con los
-- ficheros. El corte existe porque las historicas viven en
-- archive/migraciones-legacy/ y exigirles fichero aqui seria ruido permanente.

create or replace function public.migraciones_aplicadas_desde(p_desde text)
returns table(version text, name text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  return query
  select m.version::text, m.name::text
  from supabase_migrations.schema_migrations m
  where m.version >= coalesce(p_desde, '0')
  order by m.version;
end;
$$;

revoke all on function public.migraciones_aplicadas_desde(text) from public, anon;
grant execute on function public.migraciones_aplicadas_desde(text) to authenticated, service_role;
