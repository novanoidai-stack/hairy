-- Fases de una cita SIEMPRE escritas (18 ago 2026).
--
-- Una cita ocupa a su profesional en [inicio, fin_activa) y en [fin_espera, fin), y lo
-- deja libre durante el reposo [fin_activa, fin_espera). Todo el producto (agenda, RPC
-- del portal, organizador) deriva la disponibilidad de esas cuatro marcas.
--
-- El problema: `fin_espera` llegaba a NULL en citas sembradas e importadas cuyo servicio
-- SI tiene reposo (276 filas). Ahi cada consumidor tenia que adivinar, y adivinaban
-- distinto: el SQL del portal lo lee como `coalesce(fin_espera, fin_activa)` (la cita
-- ocupa entera, conservador) y el cliente lo leia como `fin_espera ?? fin` (todo el tramo
-- posterior a fin_activa es reposo, o sea LIBRE). Con esa segunda lectura la agenda
-- ofrecia las 10:30 sobre un color que seguia hasta las 11:20 y dejaba crear la cita
-- encima; luego el repartidor de carriles las pintaba en dos columnas.
--
-- Aqui se cierra por abajo: se rellenan las fases que faltan desde el catalogo y un
-- trigger garantiza que no vuelvan a nacer a NULL ni desordenadas.
-- Idempotente: se puede repasar despues de importar citas.

begin;

-- 1) fin_activa que falta. Con duracion_activa_min del catalogo, recortada al fin real
--    de la cita (una cita acortada a mano no puede tener la fase activa mas larga que
--    ella misma). Sin dato utilizable, la cita se considera activa de principio a fin.
update public.citas c
   set fin_activa = greatest(c.inicio,
         least(c.inicio + make_interval(mins => s.duracion_activa_min), c.fin))
  from public.servicios s
 where s.id = c.servicio_id
   and c.fin_activa is null
   and coalesce(s.duracion_activa_min, 0) > 0;

update public.citas
   set fin_activa = fin
 where fin_activa is null;

-- 2) fin_espera que falta = fin de la fase activa + el reposo del catalogo, recortado al
--    fin de la cita. Si el servicio no tiene reposo queda fin_espera = fin_activa, o sea
--    "sin hueco aprovechable", que es justo lo que hay que asumir cuando no consta.
update public.citas c
   set fin_espera = greatest(c.fin_activa,
         least(c.fin_activa + make_interval(mins => coalesce(s.duracion_espera_min, 0)), c.fin))
  from public.servicios s
 where s.id = c.servicio_id
   and c.fin_espera is null;

update public.citas
   set fin_espera = fin_activa
 where fin_espera is null;

-- 3) Ordenar lo que estuviera torcido: inicio <= fin_activa <= fin_espera <= fin.
update public.citas
   set fin_activa = greatest(inicio, least(fin_activa, fin))
 where fin_activa < inicio or fin_activa > fin;

update public.citas
   set fin_espera = greatest(fin_activa, least(fin_espera, fin))
 where fin_espera < fin_activa or fin_espera > fin;

-- 4) Red de seguridad permanente. Todo lo que escriba en `citas` (PostgREST desde la app,
--    las RPC del portal, importar_citas_csv, los agentes de IA) sale con las cuatro
--    marcas puestas y en orden, sin tener que acordarse en cada sitio.
create or replace function public.citas_normalizar_fases()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_activa int;
  v_espera int;
begin
  if new.inicio is null or new.fin is null then
    return new;
  end if;

  if new.fin_activa is null or new.fin_espera is null then
    select coalesce(duracion_activa_min, 0), coalesce(duracion_espera_min, 0)
      into v_activa, v_espera
      from public.servicios
     where id = new.servicio_id;

    if new.fin_activa is null then
      new.fin_activa := case
        when coalesce(v_activa, 0) > 0
          then least(new.inicio + make_interval(mins => v_activa), new.fin)
        else new.fin
      end;
    end if;

    if new.fin_espera is null then
      new.fin_espera := least(
        new.fin_activa + make_interval(mins => coalesce(v_espera, 0)), new.fin);
    end if;
  end if;

  new.fin_activa := greatest(new.inicio, least(new.fin_activa, new.fin));
  new.fin_espera := greatest(new.fin_activa, least(new.fin_espera, new.fin));
  return new;
end;
$$;

comment on function public.citas_normalizar_fases() is
  'Rellena y ordena inicio <= fin_activa <= fin_espera <= fin en citas. Sin fin_espera no se puede afirmar que haya reposo, asi que por defecto la cita ocupa entera.';

drop trigger if exists trg_citas_normalizar_fases on public.citas;
create trigger trg_citas_normalizar_fases
before insert or update of inicio, fin, fin_activa, fin_espera, servicio_id
on public.citas
for each row
execute function public.citas_normalizar_fases();

commit;
