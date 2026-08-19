-- fix-obtener-nivel-cliente-acceso-express.sql
-- Aplicada en remoto via MCP (proyecto vtrggiogjrhqtwbhbgia) el 20 ago 2026.
--
-- BUG (42703 undefined_column): "record v_nivel has no field acceso_express" en cada
-- carga de agenda / apertura de ficha de cita. El nivel de fidelizacion de la clienta
-- nunca se resolvia (el cliente captura el error, asi que la agenda no se rompe, pero
-- el badge de nivel no aparece nunca).
--
-- CAUSA: migrations/lista-espera-acceso-abierto.sql retiro el concepto de "cita expres"
-- y ejecuto `alter table niveles_fidelizacion drop column if exists acceso_express`,
-- pero NO reescribio obtener_nivel_cliente, que venia de
-- migrations/fidelidad-beneficios-override.sql leyendo v_nivel.acceso_express (v_nivel es
-- un %rowtype: al desaparecer la columna, plpgsql falla en ejecucion, no al crear).
--
-- ARREGLO: misma funcion, misma logica (override manual gana al calculo por umbrales),
-- sin la referencia muerta. sin_deposito SI sigue vivo (lo consume crear_cita_publica)
-- y se mantiene en el JSON de salida. Idempotente: create or replace.

create or replace function public.obtener_nivel_cliente(p_cliente_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_negocio_id text;
  v_visitas integer;
  v_gastado_cents integer;
  v_override uuid;
  v_nivel niveles_fidelizacion%rowtype;
  v_encontrado boolean := false;
begin
  select negocio_id, nivel_fidelizacion_override into v_negocio_id, v_override
  from clientes where id = p_cliente_id;
  if v_negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Cliente no encontrado');
  end if;

  select count(*) into v_visitas from citas
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id and estado = 'completada';
  select coalesce(sum(total_cents), 0) into v_gastado_cents from cobros
  where cliente_id = p_cliente_id and negocio_id = v_negocio_id;

  -- Override manual: solo vale si apunta a un nivel ACTIVO del mismo negocio.
  if v_override is not null then
    select * into v_nivel from niveles_fidelizacion
    where id = v_override and negocio_id = v_negocio_id and activo = true;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    select * into v_nivel from niveles_fidelizacion
    where negocio_id = v_negocio_id and activo = true
      and (v_visitas >= umbral_visitas or v_gastado_cents >= umbral_gastado_cents)
    order by orden desc limit 1;
    v_encontrado := found;
  end if;

  if not v_encontrado then
    return jsonb_build_object(
      'ok', true,
      'nivel', jsonb_build_object('nombre', 'Nuevo', 'color', '#9ca3af', 'orden', 0, 'sin_deposito', false),
      'visitas', v_visitas, 'gastado_cents', v_gastado_cents
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'nivel', jsonb_build_object(
      'id', v_nivel.id, 'nombre', v_nivel.nombre, 'color', v_nivel.color,
      'icono', v_nivel.icono, 'orden', v_nivel.orden,
      'sin_deposito', v_nivel.sin_deposito
    ),
    'visitas', v_visitas, 'gastado_cents', v_gastado_cents
  );
end;
$function$;
