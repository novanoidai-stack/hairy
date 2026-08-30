-- PASO 2b de la reparacion del 30 ago 2026.
--
-- Al quitar la sobrecarga afloro un fallo que llevaba TAPADO desde el 19 ago:
-- crear_cita_publica lee `prepago_cantidad_fijo` y la columna se llama
-- `prepago_cantidad_fija`. Lo introdujo la migracion 20260819195010
-- (canonical_crear_cita_publica_rate_limit) y de ahi se copio a la del gate.
--
-- En PL/pgSQL eso es 42703 en tiempo de ejecucion: la RPC moria SIEMPRE, para
-- cualquier slug valido, justo al leer el servicio. O sea que la reserva de un
-- servicio suelto desde el portal publico llevaba ONCE DIAS sin funcionar; el
-- 30 ago solo cambio el sintoma (300 PGRST203 en vez de 400 42703).
--
-- Nadie se entero porque la unica que escribe citas de canal 'web' a diario es
-- resembrar_demo(), que hace INSERT directo y no pasa por esta RPC. Ninguna
-- prueba del repo reserva de verdad: esa es la leccion, no la errata.
--
-- Se corrige sobre la definicion DESPLEGADA en vez de recopiar 200 lineas a
-- mano: asi es imposible meter una errata nueva en la funcion mas critica del
-- portal. En un replay limpio no hay nada que corregir --20260830190511 ya sale
-- con el nombre bueno-- y esto no hace nada. Es idempotente a proposito.
do $$
declare
  v_def  text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'crear_cita_publica'
    and pg_get_function_identity_arguments(p.oid) =
        'p_slug text, p_servicio_id uuid, p_profesional_id uuid, p_inicio timestamp with time zone, '
        'p_nombre text, p_telefono text, p_email text, p_notas text, p_consiente_ia boolean, '
        'p_captcha_token text, p_canal text';

  if v_def is null then
    raise exception 'no encuentro la firma canonica de crear_cita_publica';
  end if;

  v_nuevo := regexp_replace(v_def, 'prepago_cantidad_fijo\M', 'prepago_cantidad_fija', 'g');

  if v_nuevo = v_def then
    raise notice 'crear_cita_publica ya usaba prepago_cantidad_fija: nada que hacer';
    return;
  end if;

  execute v_nuevo;
end;
$$;
