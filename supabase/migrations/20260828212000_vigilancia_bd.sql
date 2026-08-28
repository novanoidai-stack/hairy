-- Vigilancia: las comprobaciones que solo se pueden hacer DENTRO de la base de datos.
--
-- Viven aqui y no en un script de CI a proposito: las RPC y las politicas se
-- crean por migracion aplicada en remoto, no por pull request, asi que un
-- vigilante que solo mirase el repo no las veria nunca. Ademas asi el panel de
-- staff puede preguntar "¿como esta la base de datos AHORA?" sin depender de que
-- haya corrido la CI.
--
-- Nace de un caso real: el 28 ago 2026 el primer pase encontro veinte funciones
-- SECURITY DEFINER abiertas a `anon`, tres de ellas devolviendo la clave secreta
-- de Stripe de cualquier salon. No fue descuido de quien las escribio -- sus
-- migraciones incluian el revoke -- sino que al cambiar la FIRMA de una funcion
-- Postgres crea una entrada nueva en pg_proc con los grants POR DEFECTO, que en
-- Supabase incluyen anon. El revoke de la migracion vieja no viaja con ella.
-- Eso no se arregla una vez: se vigila.
--
-- Dos falsos positivos que ya estan corregidos aqui y conviene no reintroducir:
--   - la funcion se detectaba A SI MISMA, porque su propio texto contiene la
--     cadena 'vault.decrypted_secrets' dentro del regex que la busca;
--   - marcaba funciones `returns trigger`, que PostgREST no expone por REST.

-- chispa_tts_keepwarm() nacio ejecutable por anon (28 ago 2026). Solo la llama el
-- cron mecha_kokoro_keepwarm (*/5, como postgres). Abierta, cualquiera con la
-- publishable key podia dispararla en bucle: cada llamada sintetiza voz en el VPS
-- de Kokoro, o sea dinero.
revoke execute on function public.chispa_tts_keepwarm() from anon, authenticated, public;

create or replace function public.vigilancia_bd()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- 1. FUNCIONES QUE TOCAN EL VAULT Y PUEDE LLAMAR CUALQUIERA.
  -- El riesgo no es solo "devuelve el secreto": chispa_tts_keepwarm no devolvia
  -- nada y aun asi era un grifo de gasto abierto a quien quisiera.
  return query
  select
    'bd/vault-al-alcance:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() toca el Vault y la puede llamar cualquiera',
    'Es SECURITY DEFINER, lee vault.decrypted_secrets y tiene EXECUTE concedido a ' ||
    'anon o a authenticated, asi que se puede invocar por REST con la publishable key ' ||
    '(publica por diseno). Si devuelve el secreto, se filtra; si solo lo usa, es un ' ||
    'grifo de gasto abierto. Cerrar con: revoke execute on function public.' ||
    p.proname || '(...) from anon, authenticated, public;'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.proname <> 'vigilancia_bd'                          -- no detectarse a si misma
    and p.prorettype <> 'trigger'::regtype                    -- PostgREST no expone triggers
    and pg_get_functiondef(p.oid) ~* 'vault\.decrypted_secrets'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));

  -- 2. LA REGLA DEL PARAMETRO (CLAUDE.md, 23 ago 2026).
  -- Una funcion definer que recibe el negocio (o un id del que se deduce) y no lo
  -- ata a quien llama: basta cambiar un uuid para operar sobre otro salon.
  -- Se excluyen las que piden p_slug: son el portal publico, que autoriza con el
  -- slug + el telefono y tiene su propio anti-abuso en servidor.
  return query
  select
    'bd/rpc-sin-guard:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() se fia del parametro que le pasan',
    'Es SECURITY DEFINER, la puede llamar anon o authenticated, recibe el negocio ' ||
    '(' || pg_get_function_identity_arguments(p.oid) || ') y no menciona auth.uid(), ' ||
    'is_staff(), my_negocio_id_text() ni exige_mi_negocio(). Multi-tenant roto: ' ||
    'cambiando un id se opera sobre otro salon. O se le anade ' ||
    'perform public.exige_mi_negocio(<negocio>, <solo_gestor>), o se revoca a anon y ' ||
    'authenticated si solo la llaman edge functions con service_role.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and pg_get_function_identity_arguments(p.oid) ~*
        '\m(p_)?(negocio_id|negocio|cobro_id|factura_id|cliente_id|presupuesto_id|profile_id)\M'
    and pg_get_functiondef(p.oid) !~*
        '(auth\.uid|is_staff|my_negocio_id_text|exige_mi_negocio|auth\.role|auth\.jwt)'
    and pg_get_function_identity_arguments(p.oid) !~* 'p_slug';

  -- 3. RLS SIN InitPlan (CLAUDE.md decision 6, 17 ago 2026).
  -- Postgres normaliza `(select auth.uid())` a `( SELECT auth.uid() AS uid)`. Si
  -- hay mas llamadas a auth.*() que llamadas envueltas, alguna va suelta y se
  -- ejecuta una vez POR FILA. Aviso y no bloqueante: la heuristica puede marcar
  -- alguna que en la practica ya sea un InitPlan por estar dentro de otro
  -- subselect no correlacionado.
  return query
  select
    'bd/rls-sin-initplan:' || pol.tablename || '.' || pol.policyname,
    'aviso',
    'rendimiento',
    'La politica "' || pol.policyname || '" de ' || pol.tablename || ' llama a auth sin envolver',
    'Envolverla en (select ...): (select auth.uid()), (select my_negocio_id_text()), ' ||
    '(select is_shared_demo_visitor()). Suelta, Postgres la ejecuta una vez por FILA; ' ||
    'dentro de un subselect, una vez por consulta (InitPlan). is_staff() sin envolver ' ||
    'llego a provocar 24 M de seq scans sobre staff y 456 M de tuplas leidas en citas.'
  from (
    select tablename, policyname,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'public'
  ) pol
  where regexp_count(pol.expr, 'auth\.(uid|jwt|role)\(\)')
      > regexp_count(pol.expr, '\( SELECT auth\.(uid|jwt|role)\(\)');

  -- 4. AYUDANTES DE RLS QUE NO SON STABLE.
  return query
  select
    'bd/helper-volatil:' || p.proname,
    'bloqueante',
    'rendimiento',
    'El ayudante de RLS ' || p.proname || '() es VOLATILE',
    'Los ayudantes que usan las politicas van STABLE. Volatil, Postgres no puede ' ||
    'cachear el resultado y lo reevalua fila a fila: is_staff() volatil por si sola ' ||
    'provoco 24 M de seq scans. Anadir STABLE a la definicion.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_staff', 'my_negocio_id_text', 'is_shared_demo_visitor', 'exige_mi_negocio')
    and p.provolatile = 'v';

  -- 5. LOS TIPOS DE SOLICITUD VIVEN EN DOS SITIOS.
  -- El CHECK de la tabla y la RPC crear_solicitud_publica. Si se anade un tipo en
  -- uno y no en el otro, el formulario de la landing devuelve un 400 opaco.
  return query
  with tipos_check as (
    select (regexp_matches(
             (select pg_get_constraintdef(con.oid)
                from pg_constraint con
                join pg_class c on c.oid = con.conrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'solicitudes'
                 and con.conname = 'solicitudes_tipo_check'),
             '''([a-z_]+)''::text', 'g'))[1] as tipo
  ),
  cuerpo_rpc as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'crear_solicitud_publica'
                      limit 1), '') as def
  )
  select
    'bd/solicitud-tipo-huerfano:' || t.tipo,
    'aviso',
    'landing',
    'El tipo de solicitud "' || t.tipo || '" esta en el CHECK y no en crear_solicitud_publica',
    'Anadir un tipo de solicitud obliga a tocar DOS sitios: la funcion ' ||
    'crear_solicitud_publica y el CHECK de la tabla solicitudes. Uno se ha quedado atras.'
  from tipos_check t, cuerpo_rpc c
  where t.tipo is not null and t.tipo <> '' and position(t.tipo in c.def) = 0;

  -- 6. LA TABLA DE REFERIDOS QUE APLICA LA BD.
  -- Contrasta con TABLA_REFERIDOS de scripts/vigilantes/referidos.mjs, que a su
  -- vez vigila la landing, la demo y TabReferidos.
  return query
  with def as (
    select coalesce((select pg_get_functiondef(p.oid)
                       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'recompute_referral_discount'
                      limit 1), '') as d
  ),
  leido as (
    select
      substring(d from 'v_tope\s+constant\s+numeric\s*:=\s*(\d+)')  as tope,
      substring(d from 'v_bono\s+constant\s+numeric\s*:=\s*(\d+)')  as bienvenida,
      substring(d from 'when 1 then (\d+)')                          as nivel1,
      substring(d from 'when 2 then (\d+)')                          as nivel2,
      substring(d from 'when 3 then (\d+)')                          as nivel3
    from def
  ),
  esperado(que, valor) as (
    values ('nivel1', '10'), ('nivel2', '4'), ('nivel3', '2'), ('tope', '30'), ('bienvenida', '15')
  )
  select
    'bd/referidos-' || e.que,
    'bloqueante',
    'referidos',
    'recompute_referral_discount() usa ' ||
      coalesce(case e.que
        when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
        when 'tope' then l.tope else l.bienvenida end, '(no se ha podido leer)') ||
      ' para ' || e.que || ' y deberia usar ' || e.valor,
    'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez: esta ' ||
    'funcion, #hermano de la landing, el modal Recomendar de la demo y TabReferidos. ' ||
    'Si la regla ha cambiado de verdad, actualiza tambien TABLA_REFERIDOS en ' ||
    'scripts/vigilantes/referidos.mjs.'
  from esperado e, leido l
  where coalesce(case e.que
          when 'nivel1' then l.nivel1 when 'nivel2' then l.nivel2 when 'nivel3' then l.nivel3
          when 'tope' then l.tope else l.bienvenida end, '') is distinct from e.valor;

end;
$fn$;

revoke all on function public.vigilancia_bd() from public, anon;
grant execute on function public.vigilancia_bd() to authenticated, service_role;

comment on function public.vigilancia_bd() is
  'Vigilantes que solo se pueden ejecutar dentro de Postgres: funciones que tocan el '
  'Vault al alcance de cualquiera, la regla del parametro, RLS sin InitPlan, ayudantes '
  'volatiles, tipos de solicitud y la tabla de referidos. Solo staff o service_role. Ver '
  'docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md';
