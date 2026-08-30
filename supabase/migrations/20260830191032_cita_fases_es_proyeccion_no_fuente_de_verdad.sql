-- PASO 5 (adelantado) de la reparacion del 30 ago 2026.
--
-- Va ANTES de restaurar los datos a proposito: mientras el enganche de vuelta
-- siguiera puesto, cualquier restauracion se deshacia sola en cuanto alguien
-- tocase una fase.
--
-- QUE PASABA. cita_fases nacio como SEGUNDA fuente de verdad, sincronizada en
-- un solo sentido a medias:
--   * sync_citas_from_fases (AFTER I/U/D en cita_fases) reescribia
--     citas.inicio/fin/fin_activa/fin_espera a partir de las fases.
--   * shift_fases_on_cita_move solo miraba `inicio`, asi que un cambio de
--     DURACION no llegaba nunca a las fases.
-- Consecuencias medidas:
--   1) El backfill de la propia migracion se comio el reposo de las 2.011
--      citas de la base: al insertar la fase 1 el sync ya bajaba citas.fin a
--      fin_activa, y los dos INSERT siguientes (reposo y fase final) filtraban
--      por `fin_espera > fin_activa` / `fin > fin_espera`, que ya no casaban.
--      "Color Raiz + Peinado" paso de 90 min a 30. "Mechas Balayage" de 120 a 40.
--   2) Alargar una cita se revertia solo: 15:15 -> 15:45 -> 15:15 en cuanto se
--      arrancaba el reloj de reposo.
--
-- DECISION. citas sigue siendo la FUENTE DE VERDAD -- es lo que leen la agenda,
-- la disponibilidad, el portal y las RPC publicas. cita_fases pasa a ser una
-- PROYECCION derivada de ella, de un solo sentido. iniciar/finalizar_fase_reposo
-- solo escriben iniciada_at/cerrada_at, que no alimentan nada aguas arriba, asi
-- que no se pierde ninguna funcion del reloj de reposo.
--
-- Ademas la descomposicion en fases deja de estar escrita en dos sitios: vive
-- una sola vez, en sembrar_fases_de_cita().

-- 1. Fuera el enganche de vuelta y el desplazamiento parcial.
drop trigger if exists trg_sync_citas_from_fases on public.cita_fases;
drop function if exists public.sync_citas_from_fases();
drop trigger if exists trg_shift_fases_on_cita_move on public.citas;
drop function if exists public.shift_fases_on_cita_move();

-- 2. La descomposicion, en un solo sitio.
create or replace function public.sembrar_fases_de_cita(p_cita_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c         public.citas%rowtype;
  v_srv     jsonb;
  v_fases   jsonb;
  v_fase    jsonb;
  v_cursor  timestamptz;
  v_dur     int;
  v_orden   smallint := 1;
begin
  select * into c from public.citas where id = p_cita_id;
  if not found then return; end if;

  delete from public.cita_fases where cita_id = p_cita_id;

  -- Fases estructuradas de catalogo, SI algun dia existe servicios.fases.
  -- to_jsonb sobre la fila: si la columna no esta, sale null y no revienta.
  select to_jsonb(s) into v_srv from public.servicios s where s.id = c.servicio_id;
  v_fases := v_srv -> 'fases';

  if v_fases is not null and jsonb_typeof(v_fases) = 'array' and jsonb_array_length(v_fases) > 0 then
    v_cursor := c.inicio;
    for v_fase in select * from jsonb_array_elements(v_fases) loop
      v_dur := coalesce((v_fase->>'min')::int, 0);
      if v_dur > 0 then
        insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, recurso_tipo, etiqueta)
        values (c.negocio_id, c.id, v_orden, coalesce(v_fase->>'tipo','activa'),
                v_cursor, v_cursor + make_interval(mins => v_dur),
                c.profesional_id, v_fase->>'recurso_tipo', v_fase->>'etiqueta');
        v_cursor := v_cursor + make_interval(mins => v_dur);
        v_orden := v_orden + 1;
      end if;
    end loop;
    return;
  end if;

  if c.fin_activa is not null and c.fin_espera is not null and c.fin_espera > c.fin_activa then
    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 1, 'activa', c.inicio, c.fin_activa, c.profesional_id, 'Aplicacion');

    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 2, 'reposo', c.fin_activa, c.fin_espera, c.profesional_id, 'Reposo tecnico');

    if c.fin > c.fin_espera then
      insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
      values (c.negocio_id, c.id, 3, 'activa', c.fin_espera, c.fin, c.profesional_id, 'Lavado y peinado');
    end if;
  else
    insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
    values (c.negocio_id, c.id, 1, 'activa', c.inicio, c.fin, c.profesional_id, 'Servicio');
  end if;
end;
$$;

revoke all on function public.sembrar_fases_de_cita(uuid) from public, anon, authenticated;
grant execute on function public.sembrar_fases_de_cita(uuid) to service_role;

-- 3. Al crear la cita: sembrar.
create or replace function public.seed_fases_from_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sembrar_fases_de_cita(new.id);
  return null;
end;
$$;

drop trigger if exists trg_seed_fases_from_cita on public.citas;
create trigger trg_seed_fases_from_cita
after insert on public.citas
for each row execute function public.seed_fases_from_cita();

-- 4. Al mover, alargar, acortar o reasignar la cita: re-proyectar, conservando
--    el cronometraje real que ya se hubiera tomado (iniciada_at / cerrada_at).
create or replace function public.resync_fases_de_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_marcas jsonb;
begin
  if new.inicio         is not distinct from old.inicio
 and new.fin            is not distinct from old.fin
 and new.fin_activa     is not distinct from old.fin_activa
 and new.fin_espera     is not distinct from old.fin_espera
 and new.profesional_id is not distinct from old.profesional_id then
    return null;
  end if;

  select jsonb_object_agg(orden::text, jsonb_build_object('i', iniciada_at, 'c', cerrada_at))
    into v_marcas
  from public.cita_fases
  where cita_id = new.id and (iniciada_at is not null or cerrada_at is not null);

  perform public.sembrar_fases_de_cita(new.id);

  if v_marcas is not null then
    update public.cita_fases f
       set iniciada_at = nullif(v_marcas -> f.orden::text ->> 'i', '')::timestamptz,
           cerrada_at  = nullif(v_marcas -> f.orden::text ->> 'c', '')::timestamptz
     where f.cita_id = new.id
       and v_marcas ? f.orden::text;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_resync_fases_de_cita on public.citas;
create trigger trg_resync_fases_de_cita
after update of inicio, fin, fin_activa, fin_espera, profesional_id on public.citas
for each row execute function public.resync_fases_de_cita();
