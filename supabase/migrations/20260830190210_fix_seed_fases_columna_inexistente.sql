-- PASO 1 de la reparacion del 30 ago 2026.
--
-- seed_fases_from_cita() hacia `select fases into ... from public.servicios`,
-- y public.servicios NO tiene columna `fases`. En PL/pgSQL eso no devuelve null:
-- lanza 42703 en tiempo de ejecucion, y al ser un trigger FOR EACH ROW sobre
-- citas tumbaba el INSERT entero. Resultado: no se podia crear NINGUNA cita
-- (agenda, portal, agente de WhatsApp) ni resembrar la demo.
--
-- Es la misma trampa ya documentada con agenda_ojos_notify, y se arregla igual:
-- leyendo la fila con to_jsonb(...)->'campo', que devuelve null si la columna
-- no existe en vez de romper. Asi el dia que se anada servicios.fases esta rama
-- empieza a funcionar sola, y mientras tanto no estorba.
--
-- OJO: esta funcion vuelve a reescribirse en 20260830191032, que saca la
-- descomposicion a sembrar_fases_de_cita(). Esta migracion se conserva porque
-- es la que devolvio el servicio; la definicion que manda hoy es la de alli.

create or replace function public.seed_fases_from_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_srv     jsonb;
  v_srv_fases jsonb;
  v_fase    jsonb;
  v_cursor  timestamptz;
  v_dur     int;
  v_orden   smallint := 1;
begin
  -- Solo se ejecuta si la cita no tiene fases creadas todavia
  if exists (select 1 from public.cita_fases where cita_id = new.id) then
    return new;
  end if;

  -- Fases estructuradas en catalogo, SI algun dia existe esa columna.
  -- to_jsonb sobre la fila entera: si no hay columna, sale null y no revienta.
  select to_jsonb(s) into v_srv from public.servicios s where s.id = new.servicio_id;
  v_srv_fases := v_srv -> 'fases';

  if v_srv_fases is not null
     and jsonb_typeof(v_srv_fases) = 'array'
     and jsonb_array_length(v_srv_fases) > 0 then
    v_cursor := new.inicio;
    for v_fase in select * from jsonb_array_elements(v_srv_fases) loop
      v_dur := coalesce((v_fase->>'min')::int, 0);
      if v_dur > 0 then
        insert into public.cita_fases (
          negocio_id, cita_id, orden, tipo, inicio, fin,
          profesional_id, recurso_tipo, etiqueta
        ) values (
          new.negocio_id, new.id, v_orden,
          coalesce(v_fase->>'tipo', 'activa'),
          v_cursor, v_cursor + make_interval(mins => v_dur),
          new.profesional_id, v_fase->>'recurso_tipo', v_fase->>'etiqueta'
        );
        v_cursor := v_cursor + make_interval(mins => v_dur);
        v_orden := v_orden + 1;
      end if;
    end loop;
  else
    -- Descomposicion clasica a partir de fin_activa / fin_espera
    if new.fin_activa is not null and new.fin_espera is not null
       and new.fin_espera > new.fin_activa then
      insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
      values (new.negocio_id, new.id, 1, 'activa', new.inicio, new.fin_activa, new.profesional_id, 'Aplicacion');

      insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
      values (new.negocio_id, new.id, 2, 'reposo', new.fin_activa, new.fin_espera, new.profesional_id, 'Reposo tecnico');

      if new.fin > new.fin_espera then
        insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
        values (new.negocio_id, new.id, 3, 'activa', new.fin_espera, new.fin, new.profesional_id, 'Lavado y peinado');
      end if;
    else
      insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
      values (new.negocio_id, new.id, 1, 'activa', new.inicio, new.fin, new.profesional_id, 'Servicio');
    end if;
  end if;

  return new;
end;
$$;
