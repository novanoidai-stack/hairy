-- Compresion de servicios (informe #2: "alargar reposo a costa de comprimir la Cita C").
-- Aplicada en remoto el 2026-07-16.
--
-- Cuanto se puede acortar este servicio cuando hace falta hueco. NULL = NO se comprime,
-- que es el default deliberado: el sistema no acorta el trabajo de nadie salvo que el
-- salon lo diga explicitamente. Lo decide cada salon, no Mecha (mismo criterio que
-- agendaMaxAdelantoMin: "al final es eleccion de cada salon").
alter table public.servicios
  add column if not exists duracion_minima_min integer;

comment on column public.servicios.duracion_minima_min is
  'Duracion activa minima (min) a la que se puede comprimir este servicio para hacer hueco. NULL = no se comprime.';

-- Un minimo mayor que la duracion normal no tiene sentido, y 0 significaria "el servicio
-- puede desaparecer". Se valida en BD para que ninguna UI futura pueda meter un absurdo.
alter table public.servicios
  drop constraint if exists servicios_duracion_minima_check;
alter table public.servicios
  add constraint servicios_duracion_minima_check
  check (
    duracion_minima_min is null
    or (duracion_minima_min > 0 and duracion_minima_min <= duracion_activa_min)
  );
