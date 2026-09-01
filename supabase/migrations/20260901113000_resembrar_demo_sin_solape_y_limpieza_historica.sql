-- P3 del informe ISSUES-AUDITORIA-VIGILANCIA-2026-08-31: la demo fabricaba un
-- SOLAPE DE CITAS AL DIA.
--
-- El vigilante de invariantes (vector agenda-solapada) llevaba 77 pares vivos en
-- demo_salon_001 acumulados desde febrero: uno por dia. La causa esta en
-- `resembrar_demo()`: en el bloque del ancla, Maria tenia a la vez
--
--   mechas de Carmen   ancla      .. ancla + 75
--   lavado de Sara     ancla + 45 .. ancla + 75   <- 30 min de solape
--
-- (el `fin_activa` de las mechas es ancla+40, asi que en la agenda "se veia"
-- razonable, pero inicio/fin se pisan). La cita se completaba, se cobraba, y el
-- delete de la funcion solo borra desde HOY: el par quedaba vivo para siempre.
-- Los 77 historicos son ese mismo defecto de esta y anteriores versiones del
-- seed. Con el candado P3 (20260831220000) a la vuelta de la esquina, hay que
-- arreglar el generador ANTES de limpiar, o vuelve a nacer roto cada 2 h.
--
-- ARREGLO: el lavado de Sara pasa a ancla+75 .. ancla+105 (justo al terminar
-- las mechas). Sigue dentro del bloque de 140 min del ancla (que ya evita la
-- pausa y el cierre) y no toca a nadie mas: Maria no tiene otra cita entre
-- ancla+75 y ancla+140.
--
-- POR QUE UN PARCHE POR ANCLA Y NO UN CREATE OR REPLACE ENTERO
--
-- Mismo motivo que 20260831205630 y 20260901090000: el SQL de resembrar_demo()
-- NO esta en el repo y son 17 KB. Se parchea el trozo exacto y se EXIGE que el
-- ancla exista: si el texto cambia, esto falla a gritos en vez de aplicarse a
-- medias (un ancla perdida es un hallazgo, no un verde).
--
-- LIMPIEZA: los 77 pares historicos de la demo (inicio < hoy) se borran con sus
-- cobros, igual que hace la propia funcion cada 2 h con los de hoy (update
-- cobro_id = null -> cobro_lineas -> cobros -> citas). Es un tenant escaparate:
-- sus datos se regeneran a diario. Los 30 del salon real (florent_surez...,
-- todos del 08-ago, SUSANA, cliente_id NULL, cobros a 0) NO se tocan aqui:
-- decision de Carlos, documentada en el informe.

do $$
declare
  v_def   text;
  v_old   text;
  v_new   text;
  v_borradas int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'resembrar_demo';

  if v_def is null then
    raise exception 'resembrar_demo() no existe: nada que parchear';
  end if;

  -- El lavado de Sara dejaba de pisar las mechas de Carmen.
  v_old := '(v_sara,  v_lavado,    v_maria,' || E'\n' ||
           '       v_ancla + interval ''45 minutes'',  v_ancla + interval ''75 minutes'',';
  v_new := '(v_sara,  v_lavado,    v_maria,' || E'\n' ||
           '       v_ancla + interval ''75 minutes'',  v_ancla + interval ''105 minutes'',';

  if position(v_old in v_def) = 0 then
    raise exception 'Ancla no encontrada en resembrar_demo(): el bloque del ancla ha cambiado, revisar a mano antes de parchear';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end
$$;

comment on function public.resembrar_demo() is
  'Regenera la demo (cron cada 2 h). Parcheado el 1 sep 2026: antes ponia el lavado de Sara (maria) a ancla+45 pisando las mechas de Carmen (ancla..ancla+75), fabricando un par de citas solapadas al dia que quedaba vivo para siempre. Ahora va a ancla+75..ancla+105.';

-- Limpieza de los historicos de la demo: todas las citas VIVAS que participan
-- en un solape con inicio anterior a hoy (las de hoy las regenera la funcion).
-- El orden (cobro_id a null -> cobro_lineas -> cobros -> citas) es el mismo que
-- usa la propia resembrar_demo() cada 2 h con los datos de hoy, probado en
-- produccion a diario. Temp table para que el conjunto no cambie a mitad.
create temp table tmp_demo_solapadas on commit drop as
select distinct c.id
  from public.citas c
  join public.citas d
    on d.negocio_id = c.negocio_id
   and d.profesional_id = c.profesional_id
   and d.id <> c.id
   and d.estado <> 'cancelada'
   and c.estado <> 'cancelada'
   and d.grupo_id is null
   and c.grupo_id is null
   and tstzrange(c.inicio, c.fin) && tstzrange(d.inicio, d.fin)
 where c.negocio_id = 'demo_salon_001'
   and c.inicio < (now() at time zone 'Europe/Madrid')::date;

update public.citas set cobro_id = null
 where id in (select id from tmp_demo_solapadas);

delete from public.cobro_lineas cl
 where cl.cobro_id in (select co.id from public.cobros co
                        where co.negocio_id = 'demo_salon_001'
                          and co.cita_id in (select id from tmp_demo_solapadas));

delete from public.cobros co
 where co.negocio_id = 'demo_salon_001'
   and co.cita_id in (select id from tmp_demo_solapadas);

delete from public.citas c
 where c.id in (select id from tmp_demo_solapadas);
