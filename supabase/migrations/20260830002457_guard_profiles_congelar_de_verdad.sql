-- El guarda de identidad de `profiles` no guardaba nada. Restaurado.
--
-- QUE PASABA (comprobado en vivo el 30 ago 2026, con rollback)
-- La version DESPLEGADA de guard_profile_identity_columns() no era la del repo.
-- Alguien la reescribio desde el editor SQL y cambio la asignacion:
--
--     repo:        new.plan := old.plan;              -- congela
--     produccion:  new.plan := COALESCE(new.plan, old.plan);   -- NO congela
--
-- COALESCE solo rellena nulos. Si la fila nueva trae un valor --que es lo que
-- trae cualquier UPDATE-- COALESCE devuelve ESE valor y el guarda lo deja pasar.
-- Ademas se habia perdido la linea de `role` y se habia anadido una salida por
-- auth.role() = 'service_role'.
--
-- Con la politica profiles_update_all (`id = auth.uid()`), eso significaba que
-- CUALQUIER usuario con sesion podia reescribir su propia fila. Medido con
-- `set local role authenticated` y el uid de un empleado real, en una sola
-- sentencia y sin ningun error:
--
--     update public.profiles
--        set role='owner', plan='estudio', ia_nivel='completa',
--            suscripcion_estado='activa', trial_ends_at=now()+interval '3650 days',
--            negocio_id='<el id de OTRO salon>'
--      where id = auth.uid();
--
-- Los seis cambios se guardaron. Lo que abria cada uno:
--   - role='owner'        -> caja, informes, configuracion, set_member_role
--                            (degradar al propietario de verdad), set_pin_propietario
--                            (dejar al jefe fuera de su propio PIN) y revocar
--                            accesos por crear-acceso-empleado. Toma del salon.
--   - plan / ia_nivel     -> todas las funciones de pago y el addon de IA gratis;
--                            el 402 del servidor lee ese mismo campo, asi que no
--                            servia de nada.
--   - suscripcion_estado  -> "activa" para siempre.
--   - trial_ends_at       -> prueba a diez anos vista.
--   - negocio_id          -> LO PEOR: my_negocio_id_text() lee esa columna, y toda
--                            la RLS multi-tenant se apoya en ella. Cambiarla es
--                            entrar en el salon de otro con permiso de lectura y
--                            escritura sobre sus clientas, citas y cobros.
--
-- POR QUE NO LO VIO NADIE
-- El repo estaba BIEN (archive/migraciones-legacy/ia-addon-separado-del-plan.sql).
-- Lo que fallo es que nada compara la definicion DESPLEGADA de una funcion con la
-- del repo: bd-migraciones.mjs compara versiones de migracion, no cuerpos. Una
-- funcion reescrita a mano en produccion es invisible para toda la vigilancia.
-- Esta migracion cierra el agujero; la comprobacion que impide que vuelva a pasar
-- va en vigilancia_bd() (ver 20260830104500_vigilancia_ecosistema_cuentas.sql).

-- ---------------------------------------------------------------------------
-- El guarda, con la semantica del repo: se congela, no se rellena.
-- ---------------------------------------------------------------------------
--
-- `new.x := old.x` a secas. Sin COALESCE, sin excepciones por rol: la UNICA
-- puerta es mecha.identity_ctx, que solo se abre desde dentro de una funcion
-- security definer que ya ha comprobado quien llama (staff_set_plan,
-- staff_set_role, set_member_role, aplicar_suscripcion_stripe,
-- sincronizar_plan_negocio, staff_set_cobro_manual, caducar_pruebas_vencidas).
--
-- Se quita la salida por auth.role() = 'service_role' que tenia produccion. No
-- hace falta y ensancha la puerta: el unico backend que escribe profiles con la
-- clave de servicio es crear-acceso-empleado, y lo hace por INSERT (el usuario
-- se acaba de crear con generateLink, que falla con email_exists si ya existia),
-- y este trigger es BEFORE UPDATE. Las RPC de Stripe y de staff pasan todas por
-- identity_ctx, que sigue funcionando igual.
create or replace function public.guard_profile_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('mecha.identity_ctx', true) = '1' then
    return new;
  end if;

  new.role                   := old.role;
  new.negocio_id             := old.negocio_id;
  new.plan                   := old.plan;
  new.ia_nivel               := old.ia_nivel;
  new.trial_ends_at          := old.trial_ends_at;
  new.stripe_customer_id     := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.suscripcion_estado     := old.suscripcion_estado;
  new.periodo_fin            := old.periodo_fin;

  -- Anadidas ahora. `es_cuenta_demo` decide quien sale en equipo_cuentas() del
  -- tenant compartido, y las tres de cobro_manual son la prueba de que un salon
  -- paga fuera de Stripe: las escribe staff_set_cobro_manual y nadie mas.
  new.es_cuenta_demo         := old.es_cuenta_demo;
  new.cobro_manual           := old.cobro_manual;
  new.cobro_manual_previo    := old.cobro_manual_previo;
  new.cobro_manual_por       := old.cobro_manual_por;
  new.cobro_manual_en        := old.cobro_manual_en;
  new.cobro_manual_nota      := old.cobro_manual_nota;

  -- NO se congelan signup_ip / signup_ua / signup_fingerprint aunque son huellas
  -- forenses: quien las escribe (registrar_senales_signup, en
  -- archive/migraciones-legacy/antifraude-signup-signals.sql) NO marca
  -- identity_ctx, asi que congelarlas aqui las dejaria siempre a null sin que
  -- nadie se entere. Ya son de una sola escritura por su propio coalesce.

  return new;
end;
$$;

-- El trigger ya existe (BEFORE UPDATE ON public.profiles). Se recrea por si en
-- algun entorno se hubiera perdido: sin trigger, la funcion de arriba no vale
-- de nada y ese es justo el fallo silencioso que estamos cerrando.
drop trigger if exists trg_guard_profile_identity on public.profiles;
create trigger trg_guard_profile_identity
  before update on public.profiles
  for each row execute function public.guard_profile_identity_columns();

notify pgrst, 'reload schema';
