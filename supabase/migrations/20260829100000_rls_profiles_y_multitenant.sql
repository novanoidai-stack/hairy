-- 29 ago 2026. La fuga mas grave de toda la auditoria: `profiles` estaba abierta
-- de par en par a cualquier usuario con sesion, en CUALQUIER salon.
--
-- COMPROBADO ejecutandolo como un usuario real de florent_surez_peluqueros_15004,
-- con `set local role authenticated` y su uid en request.jwt.claims, transaccion
-- revertida:
--   select count(*) from public.profiles                -> 11 filas
--   select count(distinct negocio_id) from profiles     -> 9 salones
--   update profiles set bio=... where id=<admin ajeno>  -> 1 fila MODIFICADA
--   delete from profiles where id=<admin ajeno>         -> 1 fila BORRADA
--
-- POR QUE. Las cuatro politicas de profiles comparaban `role = 'admin'` contra
-- LA FILA DESTINO, no contra quien llama. O sea: "puedes tocar cualquier fila
-- cuyo rol sea admin", que es exactamente lo contrario de lo que se queria decir
-- ("puedes tocar filas si TU eres admin"). Y la de SELECT era directamente
-- `using (true)`.
--
-- QUE SE FILTRABA. profiles tiene email, nombre, apellido, phone, nif, signup_ip,
-- signup_ua, signup_fingerprint, stripe_customer_id, stripe_subscription_id,
-- suscripcion_estado, plan... y pin_gestor / pin_barberia, que son credenciales
-- de acceso. Todo eso, de todos los salones, a cualquiera con una cuenta.
--
-- QUE NECESITA DE VERDAD EL CLIENTE (comprobado uno a uno en el repo):
--   lib/auth.ts                      select * .eq('id', user.id)      -> fila propia
--   configuracion.web.tsx            update  .eq('id', userId)        -> fila propia
--   lib/privacyConsentContext.tsx    update  .eq('id', user.id)       -> fila propia
--   lib/hooks/usePaginaManualVista   update  .eq('id', userId)        -> fila propia
--   components/config/SeccionSuscripcion  select .eq('id', userId)    -> fila propia
--   app/(tabs)/equipo.web.tsx        select  .eq('negocio_id', ...)   -> propio salon
-- Ninguna escritura sobre filas ajenas, ningun borrado. El panel de staff va por
-- RPC `security definer`, que se ejecuta como el dueno y no pasa por RLS.
--
-- Se aprovecha para envolver todo en (select ...) — decision 6, InitPlan — y para
-- aplicar la regla de la demo que el CLAUDE.md daba por hecha y no estaba puesta:
-- el tenant compartido no expone cuentas reales, solo las 4 de atrezzo.

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_staff())
    or (
      negocio_id = (select public.my_negocio_id_text())
      -- demo_salon_001 es el escaparate y ahi nacieron cuentas reales en su dia:
      -- desde dentro de la demo solo se ven las de atrezzo.
      and (negocio_id <> 'demo_salon_001' or coalesce(es_cuenta_demo, false))
    )
  );

drop policy if exists profiles_update_all on public.profiles;
create policy profiles_update_all on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()) or (select public.is_staff()))
  with check (id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists profiles_insert_all on public.profiles;
create policy profiles_insert_all on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) or (select public.is_staff()));

-- Borrar perfiles no es una funcion del producto: ninguna pantalla lo hace.
-- El alta la crea handle_new_user (definer, como postgres) y las invitaciones
-- crear-acceso-empleado (service_role); ninguna de las dos pasa por aqui.
drop policy if exists profiles_delete_all on public.profiles;
create policy profiles_delete_all on public.profiles
  for delete to authenticated
  using ((select public.is_staff()));

-- ── bonos ───────────────────────────────────────────────────────────────────
-- Mismo ambito, pero por el ayudante STABLE en vez de una subconsulta a mano:
-- una llamada por consulta (InitPlan) en lugar de un join a profiles por politica.
drop policy if exists bonos_select_own on public.bonos;
create policy bonos_select_own on public.bonos
  for select using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists bonos_insert_own on public.bonos;
create policy bonos_insert_own on public.bonos
  for insert with check (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists bonos_update_own on public.bonos;
create policy bonos_update_own on public.bonos
  for update using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists bonos_delete_own on public.bonos;
create policy bonos_delete_own on public.bonos
  for delete using (negocio_id = (select public.my_negocio_id_text()));

-- ── contratos y n8n_webhook_config ──────────────────────────────────────────
-- Las dos son back-office de la agencia, no del salon: ni la app de Mecha ni el
-- panel de staff las tocan por REST (comprobado con grep en app/, lib/,
-- components/ y web/). Tenian `for all to authenticated using (true)`.
--   n8n_webhook_config guarda webhook_url: leerlo permite disparar los
--   automatismos de un salon, y ESCRIBIRLO permite desviarlos a otro sitio.
--   contratos guarda firma_token y hash_documento. Hoy tiene 0 filas; la
--   politica estaba abierta esperando a que se llenara.
drop policy if exists auth_all_contratos on public.contratos;
create policy contratos_solo_staff on public.contratos
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists auth_all_n8n_webhook_config on public.n8n_webhook_config;
create policy n8n_webhook_config_solo_staff on public.n8n_webhook_config
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- ── vigilancia_bd(): comprobacion 10 ────────────────────────────────────────
-- El invariante que faltaba. Una tabla con negocio_id + RLS activa cuya politica
-- PERMISIVA para authenticated/public no menciona NADA que ate al llamante es,
-- por definicion, lectura (o escritura) entre salones. Se excluyen las politicas
-- de denegacion explicita (`false`), que son justo lo contrario.
do $$
declare
  v_def text;
  v_ancla text := 'and a.attname = f.campo
  );';
  v_bloque text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'vigilancia_bd';

  if position(v_ancla in v_def) = 0 then
    raise exception 'no se encuentra el ancla de la comprobacion 9 en vigilancia_bd()';
  end if;

  v_bloque := v_ancla || '

  return query
  with multitenant as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = ''negocio_id''
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = ''public'' and c.relkind = ''r'' and c.relrowsecurity
  )
  select
    ''bd/rls-sin-tenant:'' || m.relname || ''.'' || pol.policyname,
    ''bloqueante'',
    ''seguridad'',
    ''La politica "'' || pol.policyname || ''" de '' || m.relname || '' no ata al salon'',
    ''Es PERMISIVA para '' || pol.roles::text || '' sobre una tabla con negocio_id, y su ''
    ''expresion ('' || left(coalesce(pol.qual, pol.with_check, ''?''), 120) || '') no menciona ''
    ''auth.uid(), is_staff(), my_negocio_id_text() ni exige_mi_negocio(). Multi-tenant roto: ''
    ''cualquier usuario con sesion ve (o escribe) las filas de todos los salones. Asi estuvo ''
    ''profiles hasta el 29 ago 2026, con using(true) para SELECT y role=''''admin'''' -- que ''
    ''mira la fila DESTINO, no al llamante -- para UPDATE y DELETE.''
  from multitenant m
  join pg_policies pol on pol.schemaname = ''public'' and pol.tablename = m.relname
  where pol.permissive = ''PERMISSIVE''
    and (pol.roles::text like ''%authenticated%'' or pol.roles::text like ''%public%'')
    and btrim(coalesce(pol.qual, pol.with_check, '''')) not in (''false'', ''(false)'')
    and coalesce(pol.qual, '''') || '' '' || coalesce(pol.with_check, '''') !~*
        ''(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor|jornada_contexto|_campana_gestor)'';';

  execute replace(v_def, v_ancla, v_bloque);
end $$;
