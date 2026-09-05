-- El portal le enseñaba "(-30 min libres)" a la clienta.
--
-- `disponibilidad_publica` y `disponibilidad_publica_cadena` devuelven
-- `reposo_disponible_min`, y el portal lo pinta tal cual en la etiqueta del
-- Hueco Express (app/r/[slug].web.tsx): "Aprovecha un hueco entre servicios
-- (N min libres)".
--
-- Ese N salia de `coalesce(c3.fin_espera, ...) - slot`, y `fin_espera` es el
-- final del PRIMER reposo. Para un hueco dentro del SEGUNDO reposo esa marca ya
-- ha pasado, asi que la resta sale NEGATIVA. Medido en produccion sobre una
-- mecha de dos reposos (reposo1 [10:20,10:45), reposo2 [11:15,11:35)):
--
--     slot 10:30 -> reposo_disponible_min = 15   (bien)
--     slot 11:15 -> reposo_disponible_min = -30  (el portal dice "-30 min libres")
--
-- Es el mismo desajuste de siempre —una cuenta que sigue pensando que solo hay
-- un reposo— pero esta vez en la cara de la clienta, no en la base de datos.
--
-- LA CUENTA BUENA, y sale de la costura que ya manda desde el paso 5: los
-- minutos libres son los que van del hueco hasta que la cita VUELVE A TENER
-- TRABAJO. O sea, el inicio de su siguiente ventana de ocupacion; y si no hay
-- ninguna (el hueco cae en el ultimo reposo), hasta que la cita se acaba.
--
-- Para una cita clasica de UN reposo esto da exactamente lo mismo que antes: la
-- ventana siguiente empieza justo en `fin_espera`. Solo cambia donde antes
-- mentia.
--
-- Se parchea por ANCLA, como el paso 5: si la expresion vieja ya no esta donde
-- se la espera, la migracion revienta en vez de dejar una de las dos funciones
-- con la cuenta mala y sin que nadie lo vea.

do $parche$
declare
  r      record;
  v_def  text;
  v_ancla constant text :=
    'coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz';
  v_nueva constant text :=
    'coalesce((select min(v9.desde)'
    || ' from public.ventanas_activas_cita(c3.id, c3.inicio, c3.fin_activa, c3.fin_espera, c3.fin) v9'
    || ' where v9.desde >= gen.slot_tz), c3.fin) - gen.slot_tz';
  v_tocadas int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('disponibilidad_publica', 'disponibilidad_publica_cadena')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position(v_ancla in v_def) = 0 then
      raise exception
        'Ancla perdida en %: la cuenta de minutos libres del reposo ya no esta donde estaba. '
        'Revisar antes de reescribirla.', r.proname;
    end if;

    execute replace(v_def, v_ancla, v_nueva);
    v_tocadas := v_tocadas + 1;
  end loop;

  if v_tocadas <> 2 then
    raise exception 'Se esperaban 2 funciones con la cuenta vieja y se han tocado %', v_tocadas;
  end if;
end;
$parche$;

comment on function public.disponibilidad_publica(text, uuid, date, uuid) is
  'Huecos publicos del portal. `en_reposo` dice que el hueco cae dentro de una cita existente (su reposo) y `reposo_disponible_min` cuantos minutos quedan libres ahi: desde el hueco hasta que esa cita vuelve a tener trabajo, o hasta que se acaba si ya no le queda. Sale de ventanas_activas_cita, asi que vale para cualquier numero de reposos; hasta el 6 sep 2026 se calculaba con fin_espera y para el SEGUNDO reposo devolvia numeros negativos que el portal pintaba tal cual.';
