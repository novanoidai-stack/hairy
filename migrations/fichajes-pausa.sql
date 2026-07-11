-- Fichaje de PAUSA/descanso: hasta ahora fichajes.tipo solo admitia
-- ('entrada','salida'). Se anaden 'pausa_inicio' y 'pausa_fin' para poder
-- registrar descansos dentro del turno (el tiempo de pausa NO cuenta como
-- horas trabajadas; ver horasDeMarcas en mi-jornada.web.tsx).
-- No cambia RLS ni indices: solo amplia el CHECK del tipo.

alter table public.fichajes drop constraint if exists fichajes_tipo_check;
alter table public.fichajes
  add constraint fichajes_tipo_check
  check (tipo in ('entrada', 'salida', 'pausa_inicio', 'pausa_fin'));
