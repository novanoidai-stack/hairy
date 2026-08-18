-- El servidor revalida tambien el CIERRE del salon (18 ago 2026).
--
-- `disponibilidad_publica` y `portal_dias_disponibles` ya ocultan los dias con fila en
-- `cierres_negocio` (festivos, vacaciones del salon, dias sueltos), pero las RPC que
-- ESCRIBEN no lo miraban: bastaba una pestaña abierta de antes de marcar el festivo —o
-- el agente de WhatsApp, que llama a `crear_cita_publica` con canal='whatsapp'— para
-- meter una cita un dia que el salon tiene cerrado. Comprobado antes del arreglo: la RPC
-- la creaba tan tranquila.
--
-- Regla del proyecto: esconder la opcion en la UI no es un control de acceso; lo que vale
-- es lo que revalida el servidor. Se cierra en las tres puertas de escritura del portal
-- (alta simple, alta de grupo y reagendado) con el mismo criterio de fecha LOCAL del
-- salon que usan las de lectura.
--
-- La insercion es TEXTUAL sobre la definicion vigente, justo detras del ancla
-- "Portal no disponible": asi el resto del cuerpo de cada funcion queda intacto (se
-- verifico comparando la definicion nueva, quitando el bloque, con la anterior: identica
-- byte a byte). Idempotente: si ya esta puesto, no toca nada.

do $do$
declare
  v_def text;
  v_ancla text := $anchor$if v_negocio is null then raise exception 'Portal no disponible'; end if;$anchor$;
  v_check text;
begin
  -- crear_cita_publica y crear_cita_publica_grupo reciben la hora en p_inicio
  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('crear_cita_publica','crear_cita_publica_grupo')
  loop
    if position('cierres_negocio' in v_def) = 0 then
      v_check := v_ancla || E'\n\n  if exists (select 1 from public.cierres_negocio cn\n      where cn.negocio_id = v_negocio and cn.fecha = (p_inicio at time zone v_tz)::date) then\n    raise exception ''El salon esta cerrado ese dia'';\n  end if;';
      execute replace(v_def, v_ancla, v_check);
    end if;
  end loop;

  -- modificar_cita_publica la recibe en p_nuevo_inicio
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'modificar_cita_publica';

  if position('cierres_negocio' in v_def) = 0 then
    v_check := v_ancla || E'\n\n  if exists (select 1 from public.cierres_negocio cn\n      where cn.negocio_id = v_negocio and cn.fecha = (p_nuevo_inicio at time zone v_tz)::date) then\n    raise exception ''El salon esta cerrado ese dia'';\n  end if;';
    execute replace(v_def, v_ancla, v_check);
  end if;
end
$do$;

-- `create or replace` conserva los grants, pero se reafirman por si esta migracion se
-- aplica sobre una base recreada (round 4: ninguna funcion nueva nace ejecutable por anon).
grant execute on function public.crear_cita_publica(text, uuid, uuid, timestamptz, text, text, text, text, text, boolean, boolean, text) to anon, authenticated;
grant execute on function public.modificar_cita_publica(text, uuid, text, timestamptz, uuid, text) to anon, authenticated;
grant execute on function public.crear_cita_publica_grupo(text, timestamptz, text, text, text, jsonb, boolean, text) to anon, authenticated;
