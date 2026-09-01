-- El candado P3 (20260831220000) apagaba el diferencial nº1 del producto.
--
-- QUE PASABA
--
-- El constraint se escribio con `tstzrange(inicio, fin)`: el bloque ENTERO de la
-- cita. Pero una cita de color no ocupa su bloque entero -- durante el reposo
-- quimico el profesional esta LIBRE, y encajar ahi a otra clienta es el "tiempo
-- muerto productivo" que vende Mecha. Con el candado tal cual estaba, esa reserva
-- se rechazaba con 23P01.
--
-- Y no era teorico: comprobado en produccion el 1 sep 2026 sobre `demo_salon_001`,
-- con una cita de "Mechas Balayage + Matiz" (activa 07:00-07:40, REPOSO
-- 07:40-08:15, segunda activa 08:15-09:00):
--
--   1. `disponibilidad_publica` OFRECIA el hueco de las 07:45  <- correcto
--   2. `crear_cita_publica` sobre ese mismo hueco -> 23P01     <- el candado
--
-- O sea: el portal enseñaba un hueco y reservarlo fallaba. Por la puerta de la
-- agenda pasaba lo mismo. En el momento de escribir esto habia **17 citas futuras
-- con reposo en la cartera del salon que paga** (39 en toda la base): 17 reposos
-- que ya no se podian rellenar. No consta ningun 23P01 en `errores_cliente`
-- todavia -- el candado llevaba minutos puesto.
--
-- QUE CAMBIA, Y QUE NO
--
-- **No se retira el candado: se le corrige la nocion de "ocupado".** Todo lo demas
-- se queda igual que en 20260831220000, que estaba bien pensado: misma fecha de
-- corte (2026-09-01, los 31 pares historicos siguen exentos por decision de
-- producto), mismas exclusiones (cancelada / grupo / sin profesional) y el mismo
-- 23P01 que `lib/errores.ts` ya traduce como "Ese horario se solapa con otra
-- reserva".
--
-- El rango pasa a ser el MULTIRANGO de las ventanas activas, que es exactamente
-- lo que devuelve `public.ventanas_activas_cita()`:
--
--     ventana 1 = [inicio, coalesce(fin_activa, fin))
--     ventana 2 = [coalesce(fin_espera, coalesce(fin_activa, fin)), fin)
--                 solo si esa marca es anterior a `fin`
--
-- Asi el candado dice lo mismo que la regla de ocupacion que el 1 sep se
-- centralizo en esa funcion (20260901145526, paso 1 de la spec 1). Un candado que
-- contradice a la funcion que decide los huecos es peor que no tener candado: el
-- producto ofrece lo que la base de datos prohibe.
--
-- QUE SIGUE PROTEGIENDO (probado antes de aplicar, sobre una tabla de ensayo)
--
--   encajar en el REPOSO ....................... PASA   <- lo que estaba roto
--   solapar la PRIMERA fase activa ............. 23P01
--   solapar la SEGUNDA fase activa (tras reposo) 23P01  <- ojo, esto tambien
--
-- Esa tercera es la que se perderia si alguien "arreglara" esto acortando el
-- rango a [inicio, fin_activa): se podria doblar la cola de cualquier color.
--
-- SOBRE LA SEGURIDAD DEL CAMBIO
--
-- El constraint nuevo es estrictamente MAS PERMISIVO que el que sustituye (el
-- multirango de ventanas activas esta contenido en `tstzrange(inicio, fin)`, asi
-- que todo solape de ventanas implica solape de bloques, pero no al reves). Toda
-- fila que cumplia el viejo cumple el nuevo: no puede fallar por datos.
--
-- Las expresiones son inmutables (`tstzrange`, `tstzmultirange`, `+`, `case`) y
-- por tanto indexables por gist. `inicio` y `fin` son NOT NULL y el trigger
-- BEFORE `citas_normalizar_fases` garantiza inicio <= fin_activa <= fin_espera <=
-- fin, asi que ningun `tstzrange` puede lanzar "lower bound must be less than or
-- equal to upper bound".

create extension if not exists btree_gist;

-- Guardia, ahora sobre VENTANAS ACTIVAS y no sobre bloques. Debe dar 0: el
-- candado viejo ya impedia cualquier solape de bloque despues del corte, y todo
-- solape de ventanas es un solape de bloque. Si diera >0 seria que alguien colo
-- una fila saltandose el constraint, y entonces hay que mirar antes de seguir.
do $$
declare v_pares integer;
begin
  select count(distinct (a.id, b.id)) into v_pares
  from public.citas a
  join public.citas b
    on a.profesional_id = b.profesional_id
   and a.id < b.id
   and a.estado <> 'cancelada' and b.estado <> 'cancelada'
   and a.grupo_id is null and b.grupo_id is null
   and a.inicio >= timestamptz '2026-09-01 00:00:00+02'
   and b.inicio >= timestamptz '2026-09-01 00:00:00+02'
  join lateral public.ventanas_activas_cita(a.inicio, a.fin_activa, a.fin_espera, a.fin) va on true
  join lateral public.ventanas_activas_cita(b.inicio, b.fin_activa, b.fin_espera, b.fin) vb on true
  where va.desde < vb.hasta and vb.desde < va.hasta;

  if v_pares > 0 then
    raise exception 'Hay % pares de citas con FASES ACTIVAS solapadas despues de la fecha de corte: mirar antes de recrear el candado.', v_pares;
  end if;
end
$$;

alter table public.citas drop constraint if exists citas_solape_profesional_excl;

alter table public.citas
  add constraint citas_solape_profesional_excl
  exclude using gist (
    profesional_id with =,
    ( tstzmultirange(tstzrange(inicio, coalesce(fin_activa, fin)))
      + case when coalesce(fin_espera, coalesce(fin_activa, fin)) < fin
             then tstzmultirange(tstzrange(coalesce(fin_espera, coalesce(fin_activa, fin)), fin))
             else '{}'::tstzmultirange
        end
    ) with &&
  )
  where (estado <> 'cancelada' and grupo_id is null and profesional_id is not null
         and inicio >= timestamptz '2026-09-01 00:00:00+02');

comment on constraint citas_solape_profesional_excl on public.citas is
  'Candado P3, corregido el 1 sep 2026: un profesional no puede tener dos citas vivas (no canceladas, no grupo) cuyas FASES ACTIVAS se solapen. El reposo quimico NO ocupa -- encajar otra clienta ahi es el diferencial del producto y debe pasar. El multirango replica public.ventanas_activas_cita(); si esa regla cambia, este constraint cambia con ella. Fecha de corte 2026-09-01: los 31 pares historicos anteriores quedan exentos y los sigue vigilando vigilancia_bd_invariantes.';
