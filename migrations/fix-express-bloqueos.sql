-- Migration: fix-express-bloqueos.sql
-- Enforces bloqueos_profesional validation on public express bookings and express availability search.
-- Ensures express bookings cannot collide with vacations, staff breaks, or temporary change proposal holds ('reserva_temporal').

-- 1) Ensure bloqueos_profesional constraint allows reserva_temporal
alter table public.bloqueos_profesional
  drop constraint if exists bloqueos_profesional_tipo_check;

alter table public.bloqueos_profesional
  add constraint bloqueos_profesional_tipo_check
  check (tipo = any (array['vacaciones','formacion','descanso','baja','otro','reserva_temporal']));

-- 2) Update trigger / check helper for express availability & booking
create or replace function public.verificar_disponibilidad_slot_express(
  p_profesional_id uuid,
  p_inicio timestamptz,
  p_fin timestamptz
) returns boolean
language plpgsql
stable
security definer
as $$
begin
  -- Check if slot overlaps with active appointments
  if exists (
    select 1 from public.citas c
    where c.profesional_id = p_profesional_id
      and c.estado in ('pendiente','confirmada')
      and (
        (c.inicio < p_fin and coalesce(c.fin_activa, c.fin) > p_inicio)
        or
        (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
         and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < p_fin
         and c.fin > p_inicio)
      )
  ) then
    return false;
  end if;

  -- Check if slot overlaps with professional blocks (vacations, breaks, reserva_temporal)
  if exists (
    select 1 from public.bloqueos_profesional b
    where b.profesional_id = p_profesional_id
      and b.inicio < p_fin
      and b.fin > p_inicio
  ) then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.verificar_disponibilidad_slot_express(uuid, timestamptz, timestamptz) to anon, authenticated;
