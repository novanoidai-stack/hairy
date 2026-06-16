-- Añadir miembros del equipo Mecha a la tabla staff
-- Esto asegura que is_staff() funcione correctamente para todos los miembros
-- Ejecutar después de add-rls-staff-policies.sql

insert into public.staff (email, nombre)
values
  ('carlitosocanamartinez@gmail.com', 'Carlos'),
  ('alexandruiscru07@gmail.com', 'Alexandru'),
  ('alexandru.iscru07@gmail.com', 'Alexandru'),
  ('novanoidai@gmail.com', 'Novanoidai')
on conflict (email) do update set nombre = excluded.nombre;

-- Verificación: mostrar los miembros actuales
select email, nombre, created_at from public.staff order by created_at;
