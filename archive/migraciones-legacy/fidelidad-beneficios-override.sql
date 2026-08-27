-- Fase D (D1+D2): niveles de fidelizacion ganan 2 beneficios operativos configurables
-- (sin_deposito, acceso_express) y un cliente puede recibir un nivel asignado a mano en
-- vez de calculado por umbrales de visitas/gasto. Mismo patron que el override de riesgo
-- ya existente (clientes.deposito_perfil_override / perfil_riesgo_cliente en
-- migrations/depositos-dinamicos.sql): un override manual gana siempre al calculo
-- automatico, y null vuelve al comportamiento de siempre.
--
-- obtener_nivel_cliente se reescribe para resolver primero el override (si apunta a un
-- nivel ACTIVO — un override colgante a un nivel desactivado no debe devolver datos de un
-- nivel fantasma) y solo si no hay override valido cae al calculo por umbrales de siempre.
-- Su JSON de salida gana sin_deposito/acceso_express: los consume crear_cita_publica en la
-- Task 2 de este plan, y mas adelante la Fase E (gating de acceso_express).

alter table public.niveles_fidelizacion
  add column if not exists sin_deposito boolean not null default false,
  add column if not exists acceso_express boolean not null default false;

alter table public.clientes
  add column if not exists nivel_fidelizacion_override uuid null references public.niveles_fidelizacion(id) on delete set null;

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
      'nivel', jsonb_build_object('nombre', 'Nuevo', 'color', '#9ca3af', 'orden', 0, 'sin_deposito', false, 'acceso_express', false),
      'visitas', v_visitas, 'gastado_cents', v_gastado_cents
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'nivel', jsonb_build_object(
      'id', v_nivel.id, 'nombre', v_nivel.nombre, 'color', v_nivel.color, 'icono', v_nivel.icono, 'orden', v_nivel.orden,
      'sin_deposito', v_nivel.sin_deposito, 'acceso_express', v_nivel.acceso_express
    ),
    'visitas', v_visitas, 'gastado_cents', v_gastado_cents
  );
end;
$function$;
