-- Autoservicio · El alta entrega producto, no una sala de espera.
--
-- Hasta ahora toda cuenta nueva nacia en 'demo_salon_001' con plan 'free', y
-- 'free' no habilita NINGUNA funcion (lib/planes.ts). Es decir: nadie podia usar
-- Mecha sin que un humano del staff pulsase staff_grant_full_access. Eso hacia
-- imposible el autoservicio.
--
-- A partir de aqui el alta crea el salon propio y arranca la prueba de 30 dias
-- en el mismo acto. No se anade ninguna regla de acceso nueva: la cuenta queda en
-- plan 'esencial' con suscripcion_estado 'prueba', asi que TODO lo que ya gatea
-- por plan (menu lateral, withPlanGate, el 402 de agenda-asistente) funciona sin
-- cambios, y caducar_pruebas_vencidas() (p0-007) ya la devuelve a 'free' al vencer.
--
-- 'free' pasa a significar una sola cosa: prueba agotada.
--
-- OJO, EL CUERPO SE COPIA DE LA VERSION QUE HAY EN PRODUCCION, no de la que
-- estaba en el repo. La del repo (referidos-arbol-multinivel.sql) fue sobrescrita
-- despues por handle-new-user-apellido-cp.sql: la version viva incluye apellido y
-- codigo_postal y NO engancha referidos. Copiar la del repo habria borrado
-- apellido y codigo_postal de todas las altas nuevas. El historial remoto manda.
--
-- Este trigger dispara en el INSERT sobre auth.users: el guard
-- guard_profile_identity_columns solo dispara en UPDATE (trg_guard_profile_identity,
-- tgtype 19 = before update row), asi que aqui NO hace falta mecha.identity_ctx.
--
-- Depende de p1-autoservicio-generar-negocio-id.sql.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_salon   text := nullif(btrim(new.raw_user_meta_data->>'salon'), '');
  v_cp      text := nullif(btrim(new.raw_user_meta_data->>'codigo_postal'), '');
  v_negocio text;
begin
  -- INVITACION DE EMPLEADO: aqui no se crea perfil. Lo crea despues la edge
  -- crear-acceso-empleado, con el negocio_id y el plan HEREDADOS del salon que
  -- invita. Si lo insertaramos nosotros, ese upsert pasaria a ser un UPDATE y
  -- guard_profile_identity_columns le revertiria negocio_id, role y plan EN
  -- SILENCIO (revierte tambien para service_role: solo lo salta identity_ctx),
  -- dejando al trabajador con un salon propio y una prueba que no le tocan.
  --
  -- invited_at lo sella el servidor de Auth al generar el enlace de invitacion;
  -- el cliente no puede falsearlo, a diferencia de raw_user_meta_data. Por eso la
  -- distincion va por aqui y no por un campo de metadata.
  if new.invited_at is not null then
    return new;
  end if;

  -- Salon propio desde el minuto cero. Si el alta no trae nombre (p. ej. Google
  -- OAuth), generar_negocio_id_unico cae en 'salon_<hex>': el negocio_id es una
  -- clave interna y NO se renombra despues, aunque luego se rellene el nombre.
  v_negocio := public.generar_negocio_id_unico(v_salon, v_cp, new.id);

  insert into public.profiles (
    id, email, nombre, apellido, codigo_postal, nombre_negocio, negocio_id,
    phone, role, plan, suscripcion_estado, trial_ends_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    nullif(btrim(new.raw_user_meta_data->>'apellido'), ''),
    v_cp,
    v_salon,
    v_negocio,
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    'esencial',
    'prueba',
    now() + interval '30 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;
