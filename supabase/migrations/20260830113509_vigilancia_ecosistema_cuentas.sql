-- Capa 2, familia "ecosistema de cuentas".
--
-- POR QUE ESTO EXISTE, Y POR QUE ES LA COMPROBACION 1
-- El 30 ago 2026 se descubrio que la version DESPLEGADA de
-- guard_profile_identity_columns() no era la del repo. Alguien la habia
-- reescrito desde el editor SQL cambiando `new.plan := old.plan` por
-- `new.plan := COALESCE(new.plan, old.plan)`, que no congela nada -- COALESCE
-- solo rellena nulos --, quitando ademas la linea de `role` y anadiendo una
-- salida por auth.role() = 'service_role'.
--
-- Resultado: cualquier usuario con sesion podia reescribir su propia fila de
-- profiles y darse role='owner', plan='estudio', suscripcion_estado='activa',
-- trial_ends_at a diez anos y --lo peor-- negocio_id apuntando a OTRO salon,
-- que es la columna de la que vive toda la RLS multi-tenant.
--
-- Nada lo vio, y no por falta de vigilantes: es que ninguno miraba ahi.
-- bd-migraciones.mjs compara VERSIONES de migracion, no CUERPOS de funcion. Una
-- funcion critica reescrita a mano en produccion era un punto ciego total.
--
-- La leccion, y la regla que sale de aqui: de las funciones que son un control
-- de seguridad no basta con saber que existen; hay que comprobar que siguen
-- diciendo lo que tienen que decir. Y si el ancla se pierde (la funcion
-- desaparece, o cambia tanto que no se reconoce) eso es un hallazgo BLOQUEANTE,
-- no un verde -- es la regla del ancla perdida de la decision 10.

create or replace function public.vigilancia_bd_ecosistema()
returns table (clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard text;
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- ==========================================================================
  -- 1. EL GUARDA DE IDENTIDAD DE `profiles`, PALABRA POR PALABRA
  -- ==========================================================================
  select pg_get_functiondef(p.oid) into v_guard
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guard_profile_identity_columns'
   limit 1;

  -- Ancla perdida: sin funcion no hay nada que comprobar, y eso NO es verde.
  if v_guard is null then
    return query select
      'bd/guarda-identidad-ausente',
      'bloqueante',
      'cuentas',
      'guard_profile_identity_columns() no existe',
      'Es el unico freno entre la politica profiles_update_all (que deja a cada usuario '
      'escribir SU fila) y las columnas que deciden quien eres y que has contratado: role, '
      'negocio_id, plan, ia_nivel, suscripcion_estado, trial_ends_at y los ids de Stripe. '
      'Sin el, cualquiera con sesion se asciende a Propietario y se cambia de salon.';
    return;
  end if;

  -- La forma correcta es `new.x := old.x`. COALESCE(new.x, old.x) SOLO rellena
  -- nulos: si la fila nueva trae un valor -- que es lo que trae cualquier
  -- UPDATE -- lo deja pasar tal cual. Es el fallo exacto del 30 ago 2026.
  return query
  select
    'bd/guarda-identidad-con-coalesce',
    'bloqueante',
    'cuentas',
    'guard_profile_identity_columns() usa COALESCE y por tanto NO congela nada',
    'COALESCE(new.x, old.x) devuelve new.x siempre que no sea null, asi que deja pasar '
    'cualquier UPDATE. La forma que congela de verdad es `new.x := old.x` a secas. '
    'Con COALESCE, un empleado se pone role=''owner'' y negocio_id=''<otro salon>'' en una '
    'sola sentencia REST y se lleva por delante el multi-tenant entero. '
    'Comprobado en vivo el 30 ago 2026 con `set local role authenticated`.'
  where v_guard ~* 'coalesce\s*\(\s*new\.';

  -- Las columnas que TIENEN que estar congeladas. Si falta una, esa columna es
  -- escribible por su dueno: `role` se habia caido de la lista sin que nadie lo
  -- notara, y es la que abre la caja, los informes y el PIN del propietario.
  return query
  with obligatorias(col, porque) as (
    values
      ('role',                   'Decide que puede hacer esa persona: caja, informes, configuracion, set_member_role, set_pin_propietario y revocar accesos ajenos.'),
      ('negocio_id',             'De esta columna vive my_negocio_id_text(), o sea TODA la RLS multi-tenant. Escribirla es entrar en el salon de otro.'),
      ('plan',                   'Las funciones de pago y el 402 del servidor leen este campo.'),
      ('ia_nivel',               'El addon de IA que se cobra aparte.'),
      ('suscripcion_estado',     'Es la unica columna que dice si un salon paga.'),
      ('trial_ends_at',          'Sin congelar, la prueba se puede estirar a diez anos.'),
      ('stripe_customer_id',     'Ata el perfil a un cliente de Stripe.'),
      ('stripe_subscription_id', 'Ata el perfil a una suscripcion de Stripe.')
  )
  select
    'bd/guarda-identidad-sin-' || o.col,
    'bloqueante',
    'cuentas',
    'guard_profile_identity_columns() ya no congela ' || o.col,
    o.porque || E'\n\nAnadir `new.' || o.col || ' := old.' || o.col || ';` al guarda. '
    'Si el cambio es a proposito, este vigilante es lo que hay que actualizar -- pero '
    'entonces explica en el commit quien puede escribir esa columna y por que.'
  from obligatorias o
  where v_guard !~* ('new\.' || o.col || '\s*:=\s*old\.' || o.col);

  -- La unica puerta legitima es mecha.identity_ctx, que se abre DENTRO de una
  -- funcion definer que ya ha comprobado quien llama. Una salida por rol la
  -- ensancha a todo lo que tenga esa clave.
  return query
  select
    'bd/guarda-identidad-puerta-por-rol',
    'aviso',
    'cuentas',
    'guard_profile_identity_columns() tiene una salida por auth.role()',
    'La version rota que estuvo en produccion salia por auth.role() = ''service_role''. '
    'No hace falta: los caminos legitimos (staff_set_plan, staff_set_role, set_member_role, '
    'aplicar_suscripcion_stripe, sincronizar_plan_negocio, staff_set_cobro_manual, '
    'caducar_pruebas_vencidas) abren mecha.identity_ctx, y crear-acceso-empleado escribe '
    'por INSERT, que este trigger ni ve. Cada salida extra es una puerta mas que vigilar.'
  where v_guard ~* 'auth\.role\(\)\s*=\s*''(service_role|supabase_admin)''';

  -- Un guarda perfecto sin trigger que lo dispare no guarda nada.
  return query
  select
    'bd/guarda-identidad-sin-trigger',
    'bloqueante',
    'cuentas',
    'Nadie dispara guard_profile_identity_columns() en profiles',
    'La funcion existe pero no hay ningun trigger BEFORE UPDATE sobre public.profiles que '
    'la ejecute, asi que no se aplica nunca. Es la forma mas silenciosa posible de perder '
    'un control de seguridad: la funcion sigue ahi y parece que todo esta bien.'
  where not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and c.relname = 'profiles'
      and not t.tgisinternal
      and p.proname = 'guard_profile_identity_columns'
  );

  -- ==========================================================================
  -- 2. SALONES SIN TITULAR
  -- ==========================================================================
  return query
  select
    'bd/salon-sin-titular:' || x.nid,
    'bloqueante',
    'cuentas',
    'El salon "' || x.nid || '" no tiene ningun Propietario',
    'Media docena de subsistemas deducen al titular con `role = ''owner''` y, cuando no lo '
    'encuentran, NO fallan: devuelven un cero razonable y siguen. plan_del_negocio() dice '
    '"free" aunque las filas digan otra cosa, sincronizar_plan_negocio() no propaga nada al '
    'equipo, caducar_pruebas_vencidas() no caduca su prueba NUNCA, staff_set_cobro_manual() '
    'contesta "no_es_owner" y el motor de referidos lo cuenta como cero. Habia CINCO salones '
    'asi el 30 ago 2026 y no se habia notado. Arreglo: ascender a alguien a Propietario '
    '(panel de staff -> Cuentas -> Rol).'
  from (
    select p.negocio_id as nid
      from public.profiles p
     where p.negocio_id is not null and btrim(p.negocio_id) <> ''
       and p.negocio_id <> 'demo_salon_001'
     group by p.negocio_id
    having count(*) filter (where p.role = 'owner') = 0
  ) x;

  -- ==========================================================================
  -- 3. EL MODO DE ACCESO CONTRADICE A LAS CUENTAS
  -- ==========================================================================
  return query
  select
    'bd/modo-compartido-con-cuentas:' || sa.negocio_id,
    'bloqueante',
    'cuentas',
    'El salon "' || sa.negocio_id || '" entra con un solo correo y tiene ' ||
      public.cuentas_de_acceso(sa.negocio_id) || ' cuentas de acceso',
    'Son dos modelos de identidad a la vez. En modo compartido el rol efectivo lo elige '
    'quien esta delante de la tablet (lib/identidadActiva.ts); en individual lo dice '
    'profiles.role. Con los dos encendidos, "que puede hacer esta persona" depende de por '
    'donde entro, no de quien es. Arreglo: retirar los accesos que sobren desde el salon '
    '(Ajustes -> Accesos y roles), o devolver el modo a "cada uno con su correo".'
  from public.salon_acceso sa
  where sa.modo = 'compartido'
    and public.cuentas_de_acceso(sa.negocio_id) > 1;

  return query
  select
    'bd/compartido-sin-pin:' || sa.negocio_id,
    'bloqueante',
    'cuentas',
    'El salon "' || sa.negocio_id || '" entra con un solo correo y no tiene PIN',
    'El PIN es lo UNICO que separa al equipo de la caja, los informes y la configuracion '
    'cuando todos comparten la cuenta del jefe. Sin el, cualquiera que abra la tablet elige '
    '"Propietario" y entra. Lo pone el propietario en Ajustes -> Accesos y roles.'
  from public.salon_acceso sa
  where sa.modo = 'compartido' and sa.pin_hash is null
    -- Un salon SIN NINGUNA cuenta no tiene a nadie a quien dejar entrar, asi que
    -- no hay nada que proteger. Salio en el estreno: `salon_b3189` es un resto
    -- de un alta borrada que conserva su fila en salon_acceso y en
    -- negocio_config, y un vigilante que grita por un tenant fantasma se deja
    -- de mirar igual que uno que grita en falso por cualquier otra cosa.
    and public.cuentas_de_acceso(sa.negocio_id) > 0;

  -- ==========================================================================
  -- 4. TOPES QUE EL PROPIO CLIENTE SE PUEDE SUBIR
  -- ==========================================================================
  --
  -- El tope de profesionales vivia en negocio_config.config->>'limiteProfesionales',
  -- y negocio_config tiene una politica RLS que deja a cualquier miembro del
  -- salon escribir el blob entero: 15 -> 999 en un solo insert ... on conflict.
  -- Un limite que pone Mecha no puede vivir en una tabla que escribe el cliente.
  return query
  select
    'bd/limite-en-tabla-del-cliente',
    'bloqueante',
    'cuentas',
    'El tope de profesionales vuelve a leerse de negocio_config',
    'limitar_profesionales_por_negocio() lee negocio_config, que el propio salon puede '
    'escribir por RLS (politica "Users see own negocio config", FOR ALL). Comprobado el 30 '
    'ago 2026: el propietario se subio su tope de 15 a 999 con una sola sentencia. Los topes '
    'que pone Mecha van en public.negocio_limites, que no tiene politicas y solo tocan las '
    'RPC de staff. Leerlo con public.limite_negocio(negocio_id, ''profesionales'').'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'limitar_profesionales_por_negocio'
    and pg_get_functiondef(p.oid) ~* 'negocio_config';

  -- Y que la tabla de topes siga sin puertas.
  return query
  select
    'bd/limites-con-politica:' || pol.policyname,
    'bloqueante',
    'cuentas',
    'negocio_limites tiene una politica RLS ("' || pol.policyname || '")',
    'Esa tabla existe justo para estar fuera del alcance del cliente. Cualquier politica '
    'que la abra a authenticated devuelve el problema al punto de partida: el salon '
    'subiendose su propio tope. Se llega a ella solo por staff_set_limites().'
  from pg_policies pol
  where pol.schemaname = 'public' and pol.tablename = 'negocio_limites'
    and pol.roles::text ~* '(authenticated|anon|public)';

  -- ==========================================================================
  -- 5. EL EQUIPO NO HEREDA LO QUE PAGA SU TITULAR
  -- ==========================================================================
  return query
  select
    'bd/plan-desincronizado:' || x.nid,
    'aviso',
    'cuentas',
    'En "' || x.nid || '" hay cuentas con un plan distinto al del titular',
    'El plan y el addon de IA los contrata el SALON y el equipo los hereda '
    '(sincronizar_plan_negocio). Una cuenta descolgada ve funciones que su salon no ha '
    'pagado, o al reves no ve las que si. Suele venir de un salon que estuvo sin titular: '
    'entonces sincronizar_plan_negocio() devolvia 0 sin tocar nada.'
  from (
    select p.negocio_id as nid
      from public.profiles p
      join public.profiles t on t.id = public.titular_del_negocio(p.negocio_id)
     where p.negocio_id is not null
       and p.negocio_id <> 'demo_salon_001'
       and (p.plan is distinct from t.plan or p.ia_nivel is distinct from t.ia_nivel)
     group by p.negocio_id
  ) x;

  -- ==========================================================================
  -- 6. MENSAJES DE SOPORTE QUE NO SE PUEDEN RASTREAR
  -- ==========================================================================
  return query
  select
    'bd/soporte-sin-tenant',
    'aviso',
    'cuentas',
    x.n || ' mensajes de soporte no estan atados a ningun salon',
    'crear_mensaje_soporte() guardaba `nombre_negocio` (el rotulo, texto libre) dentro de la '
    'columna `negocio_id`, asi que el join con profiles no casaba nunca y caia al coalesce: '
    'en pantalla se veia bien por accidente. Sin el id no se puede saber si quien pide ayuda '
    'paga, en que plan esta ni si es un salon nuestro de pruebas.'
  from (
    select count(*)::int as n
      from public.soporte_mensajes m
     where m.negocio_id is not null
       and not exists (select 1 from public.profiles p where p.negocio_id = m.negocio_id)
  ) x
  where x.n > 0;

end;
$$;

-- No recibe parametros y comprueba is_staff() por dentro, igual que
-- vigilancia_bd(). Se cierra a anon de todos modos: no tiene nada que hacer
-- ahi y cada funcion menos al alcance de anon es una menos que auditar.
revoke all on function public.vigilancia_bd_ecosistema() from public, anon;
grant execute on function public.vigilancia_bd_ecosistema() to authenticated, service_role;

comment on function public.vigilancia_bd_ecosistema() is
  'Capa 2, familia ecosistema de cuentas: guarda de identidad intacto, salones con titular, modo de acceso coherente y topes fuera del alcance del cliente.';

notify pgrst, 'reload schema';
