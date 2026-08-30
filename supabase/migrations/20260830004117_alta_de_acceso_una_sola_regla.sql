-- "¿Puede este salon dar de alta otra cuenta de acceso?" -- una sola respuesta.
--
-- crear-acceso-empleado invitaba sin mirar practicamente nada: ni el modo de
-- acceso del salon, ni el plan, ni si la prueba habia caducado, ni cuantas
-- cuentas habia ya. Los cuatro huecos, con lo que dejaban pasar:
--
--   modo de acceso   Un salon en modo 'compartido' (un correo, selector de quien
--                    eres, PIN) podia seguir invitando cuentas individuales. Es
--                    lo que le paso al unico salon real: dos modelos de
--                    identidad a la vez, y el rol efectivo de una persona
--                    dependiendo de por donde entrase.
--   plan             'equipo' esta en PLAN_FUNCIONES (lib/planes.ts) para
--                    esencial y estudio, NO para free. Pero el gate solo existia
--                    en el menu lateral del cliente: por la edge se invitaba
--                    igual con la prueba agotada.
--   suscripcion      Ni se miraba.
--   cuantas          limiteProfesionales limita FICHAS de agenda, no cuentas de
--                    acceso. No habia tope de cuentas: 500 invitaciones eran
--                    500 cuentas.
--
-- Y ademas heredaba el plan buscando `role = 'owner'`, asi que en los cinco
-- salones que se habian quedado sin propietario el invitado nacia en 'free'.
--
-- La regla se escribe UNA vez aqui y la preguntan los dos lados: la edge antes
-- de invitar, y la pantalla de Accesos para saber si ense~ar el boton. Si cada
-- uno la implementara por su cuenta volveriamos al invariante repartido.

create or replace function public.evaluar_alta_de_acceso(p_negocio_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_titular   uuid;
  v_plan      text;
  v_ia        text;
  v_estado    text;
  v_modo      text;
  v_cuentas   int;
  v_max       int;
  v_motivo    text := null;
  v_detalle   text := null;
begin
  if p_negocio_id is null or btrim(p_negocio_id) = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sin_negocio',
      'detalle', 'Esta cuenta no tiene ningun salon asignado.');
  end if;

  v_titular := public.titular_del_negocio(p_negocio_id);
  select p.plan, p.ia_nivel, p.suscripcion_estado
    into v_plan, v_ia, v_estado
    from public.profiles p where p.id = v_titular;

  v_plan    := coalesce(v_plan, 'free');
  v_ia      := coalesce(v_ia, 'ninguna');
  v_modo    := coalesce((select sa.modo from public.salon_acceso sa where sa.negocio_id = p_negocio_id), 'individual');
  v_cuentas := public.cuentas_de_acceso(p_negocio_id);
  v_max     := public.limite_negocio(p_negocio_id, 'cuentas');

  -- El orden importa: se devuelve el motivo que el salon puede ENTENDER y
  -- resolver primero. De nada sirve decirle "tu plan no lo incluye" a quien
  -- ademas tiene el modo de acceso puesto en correo unico.
  if p_negocio_id = 'demo_salon_001' then
    v_motivo  := 'demo_no_permitido';
    v_detalle := 'La demo es un escaparate compartido: ahi no se crean accesos reales.';

  elsif v_modo = 'compartido' then
    v_motivo  := 'modo_compartido';
    v_detalle := 'Este salon entra con un solo correo y elige quien es al abrir. '
              || 'Mientras ese modo este puesto no se invitan cuentas: se anade la persona '
              || 'como ficha en Equipo y aparece en el selector. Si quieres que entre con su '
              || 'propio correo, cambia antes el modo a "cada uno con su correo".';

  elsif v_plan = 'free' then
    v_motivo  := 'plan_sin_equipo';
    v_detalle := 'Dar acceso al equipo entra en los planes Esencial y Estudio. '
              || 'Con la prueba agotada no se pueden crear cuentas nuevas.';

  elsif v_estado in ('caducada', 'cancelada') then
    v_motivo  := 'suscripcion_inactiva';
    v_detalle := 'La suscripcion de este salon no esta activa.';

  elsif v_cuentas >= v_max then
    v_motivo  := 'limite_cuentas';
    v_detalle := format('Este salon tiene %s cuentas de acceso y el tope esta en %s.', v_cuentas, v_max);
  end if;

  return jsonb_build_object(
    'ok',                 v_motivo is null,
    'motivo',             v_motivo,
    'detalle',            v_detalle,
    -- Lo que la edge necesita para crear el perfil bien: el plan del TITULAR,
    -- no el de la primera fila con role='owner' que aparezca.
    'plan',               v_plan,
    'ia_nivel',           v_ia,
    'suscripcion_estado', v_estado,
    'modo',               v_modo,
    'cuentas',            v_cuentas,
    'max_cuentas',        v_max,
    'titular_id',         v_titular
  );
end;
$$;

-- Se fia del parametro a proposito y por eso se le quita el permiso a todo el
-- mundo menos al backend: la app pregunta por mi_alta_de_acceso(), que no
-- recibe negocio y lo saca de la sesion.
revoke all on function public.evaluar_alta_de_acceso(text) from public, anon, authenticated;
grant execute on function public.evaluar_alta_de_acceso(text) to service_role;

create or replace function public.mi_alta_de_acceso()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.evaluar_alta_de_acceso(public.my_negocio_id_text());
$$;

grant execute on function public.mi_alta_de_acceso() to authenticated;

comment on function public.mi_alta_de_acceso() is
  'Si el salon de quien llama puede dar de alta otra cuenta de acceso, y por que no. Misma regla que aplica la edge crear-acceso-empleado.';

notify pgrst, 'reload schema';
