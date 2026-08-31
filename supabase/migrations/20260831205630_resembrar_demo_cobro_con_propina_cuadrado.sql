-- La demo fabricaba un cobro descuadrado AL DIA.
--
-- El vigilante de invariantes de caja (20260831000000) daba 7 bloqueantes, todos
-- iguales: total_cents = 1800, propina_cents = 200, datafono_cents = 2000. Uno
-- por dia, del 24 al 31 de agosto, siempre a las 20:00 UTC. No eran datos
-- historicos sucios: es `resembrar_demo()`, el cron que regenera la demo cada 2 h,
-- creando uno nuevo cada dia. Sin tocar el generador, el panel iba a acumular un
-- bloqueante diario para siempre.
--
-- LA CONVENCION, que estaba escrita al reves aqui
--
-- En Mecha `total_cents` YA INCLUYE la propina, y los metodos suman el total:
--
--   efectivo + datafono + online + bizum = total_cents
--
-- No es una opinion: de los 1.188 cobros completados, 1.181 la cumplen y los 7
-- que no son exactamente los que fabrica esta funcion. La semilla ponia la
-- propina DENTRO de datafono_cents pero NO dentro de total_cents, asi que el
-- cobro no sumaba y el arqueo del dia salia 2 EUR corto.
--
-- Los 7 ya emitidos NO se pueden arreglar: `cobros_prevent_financial_updates`
-- prohibe tocar los importes de un cobro registrado (Ley Antifraude 11/2021), y
-- esta bien que lo prohiba. Se corrige el generador y se van solos en cuanto la
-- resiembra los reemplace.
--
-- POR QUE UN PARCHE POR ANCLA Y NO UN CREATE OR REPLACE ENTERO
--
-- `resembrar_demo()` son 17 KB y **su SQL no esta en el repo**: es la misma
-- deriva ya documentada con vigilancia_bd_rendimiento y migraciones_sin_aplicar.
-- Reescribirla entera de memoria es como se pierden las otras 400 lineas que
-- nadie esta revisando hoy. Se parchea el trozo exacto y se COMPRUEBA que el
-- ancla existe: si algun dia el texto cambia, esto falla a gritos en vez de
-- aplicarse a medias -- que es la regla de los vigilantes (un ancla perdida es
-- un hallazgo, no un verde).

do $$
declare
  v_def   text;
  v_old_a text;
  v_new_a text;
  v_old_b text := 'returning id, cita_id, total_cents';
  v_new_b text := 'returning id, cita_id, (total_cents - propina_cents) as total_cents';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'resembrar_demo';

  if v_def is null then
    raise exception 'resembrar_demo() no existe: nada que parchear';
  end if;

  -- (a) La propina entra tambien en total_cents y en la columna del metodo.
  v_old_a :=
    'select v_negocio, x.id, x.profesional_id, x.cliente_id, x.cents,' || E'\n' ||
    '           case when x.n = 1 then 200 else 0 end,' || E'\n' ||
    '           case when x.n % 2 = 1 then ''datafono'' else ''efectivo'' end,' || E'\n' ||
    '           case when x.n % 2 = 1 then 0 else x.cents end,' || E'\n' ||
    '           case when x.n % 2 = 1 then x.cents + (case when x.n = 1 then 200 else 0 end) else 0 end,';

  v_new_a :=
    'select v_negocio, x.id, x.profesional_id, x.cliente_id,' || E'\n' ||
    '           x.cents + (case when x.n = 1 then 200 else 0 end),' || E'\n' ||
    '           case when x.n = 1 then 200 else 0 end,' || E'\n' ||
    '           case when x.n % 2 = 1 then ''datafono'' else ''efectivo'' end,' || E'\n' ||
    '           case when x.n % 2 = 1 then 0 else x.cents + (case when x.n = 1 then 200 else 0 end) end,' || E'\n' ||
    '           case when x.n % 2 = 1 then x.cents + (case when x.n = 1 then 200 else 0 end) else 0 end,';

  if position(v_old_a in v_def) = 0 then
    raise exception 'Ancla (a) no encontrada en resembrar_demo(): el generador de cobros ha cambiado, revisar a mano antes de parchear';
  end if;

  -- (b) La linea del cobro sigue valiendo el SERVICIO, no el total con propina.
  --     Se re-aliasa a total_cents para no tocar el insert de cobro_lineas.
  if position(v_old_b in v_def) = 0 then
    raise exception 'Ancla (b) no encontrada en resembrar_demo()';
  end if;

  v_def := replace(v_def, v_old_a, v_new_a);
  v_def := replace(v_def, v_old_b, v_new_b);

  execute v_def;
end
$$;

comment on function public.resembrar_demo() is
  'Regenera la demo (cron cada 2 h). Sus cobros cumplen el invariante de caja: efectivo + datafono + online + bizum = total_cents, con la propina DENTRO del total. Parcheado el 31 ago 2026: antes metia la propina solo en datafono_cents y fabricaba un cobro descuadrado al dia.';
