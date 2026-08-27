-- Limite duro de 15 fichas de profesional por salon.
--
-- El limite vivia SOLO en la pantalla de Equipo (app/(tabs)/equipo.web.tsx: si
-- ya hay 15, el boton avisa y no abre el formulario). Cualquier otra via se lo
-- saltaba: la REST API con la clave publica y una sesion normal, la edge
-- crear-acceso-empleado cuando crea la ficha junto al acceso, o el importador.
-- Un limite que solo existe en el boton no es un limite.
--
-- Aqui se cierra en la base de datos, que es la unica puerta por la que pasan
-- todas las vias. Cuentan solo las fichas ACTIVAS: desactivar a alguien libera
-- su hueco (su historial de citas se queda intacto) y volver a activarla lo
-- vuelve a ocupar. Asi un salon con mucha rotacion no se queda sin sitio por
-- gente que ya no trabaja alli.

-- ============================================================
-- 1) Funcion: cuenta las fichas activas del salon antes de dejar pasar
-- ============================================================

create or replace function public.limitar_profesionales_por_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activos int;
  v_max     constant int := 15;
begin
  -- Una ficha inactiva no ocupa hueco: no hay nada que comprobar.
  if new.activo is not true then
    return new;
  end if;

  -- En un UPDATE que ya estaba activa y sigue en el mismo salon tampoco se
  -- ocupa un hueco nuevo (editar el nombre o el color no cuenta).
  if tg_op = 'UPDATE'
     and old.activo is true
     and old.negocio_id is not distinct from new.negocio_id then
    return new;
  end if;

  -- Dos altas a la vez podrian contar las dos "14 activos" y colarse ambas.
  -- El cerrojo (por salon, y solo hasta el final de la transaccion) las pone en
  -- fila: la segunda cuenta ya con la primera dentro.
  perform pg_advisory_xact_lock(hashtext('profesionales_limite:' || new.negocio_id));

  select count(*) into v_activos
    from public.profesionales
   where negocio_id = new.negocio_id
     and activo is true
     and id <> new.id;

  -- Se lanza como raise_exception (P0001) con un codigo snake_case, que es como
  -- hablan el resto de RPC del proyecto: lib/errores.ts lo traduce a una frase
  -- en cristiano. Con errcode 'check_violation' se colaba como "valor no valido".
  if v_activos >= v_max then
    raise exception 'limite_profesionales'
      using hint = 'Este salon ya tiene 15 profesionales activos en la agenda. Desactiva a alguien para hacer sitio.';
  end if;

  return new;
end;
$$;

-- ============================================================
-- 2) Trigger sobre profesionales (alta y reactivacion)
-- ============================================================

drop trigger if exists trg_limitar_profesionales on public.profesionales;
create trigger trg_limitar_profesionales
  before insert or update on public.profesionales
  for each row execute function public.limitar_profesionales_por_negocio();

-- Contar activos por salon es ahora una consulta caliente (una por alta).
create index if not exists profesionales_negocio_activo
  on public.profesionales (negocio_id) where activo;

-- Nadie llama a la funcion a mano: solo la invoca el trigger.
revoke execute on function public.limitar_profesionales_por_negocio() from public;
revoke execute on function public.limitar_profesionales_por_negocio() from anon;
revoke execute on function public.limitar_profesionales_por_negocio() from authenticated;

notify pgrst, 'reload schema';
