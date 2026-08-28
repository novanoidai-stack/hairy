-- 29 ago 2026. Segunda tanda de la regla del parametro, y la peor de las dos.
--
-- La migracion del 28 (20260828211000_cerrar_rpc_que_se_fian_del_parametro.sql)
-- cerro diecisiete funciones que reciben el negocio POR PARAMETRO. Esta cierra
-- una clase distinta que aquella no podia ver: funciones SECURITY DEFINER que
-- NO reciben ningun negocio -- porque devuelven o tocan los de TODOS -- y que
-- estaban concedidas a `anon` y a `authenticated`.
--
-- Son las RPC de tiro (cron-pull) que consume n8n y las que escribe el webhook
-- de Stripe. Estan pensadas para que las llame el backend con la service_role.
-- Nadie les quito el grant por defecto de Supabase, que incluye anon.
--
-- COMPROBADO EJECUTANDOLAS CON `set local role anon` (28 ago 2026), no deducido.
-- Ninguna dio 42501: todas se ejecutaron. Lo que devolvieron en ese instante:
--   lista_espera_avisos_pendientes(5)   -> 2 FILAS REALES, con los campos
--       nombre, telefono, salon, servicio, fecha, hora. O sea: nombre y movil de
--       clientas de otros salones, servidos por REST a quien tenga la publishable
--       key, que es publica por diseno. Esto no es un riesgo teorico, es una fuga
--       de datos personales en produccion.
--   notificaciones_hallazgos_pendientes(5) -> 2 filas reales (negocio_id, tipo,
--       resumen): el estado operativo interno de otros salones.
--   notificaciones_pendientes(500, 24), campanas_destinatarios_pendientes(500),
--   presupuestos_pendientes_envio(500), cumpleanos_para_felicitar(hoy)
--       -> ejecutaron y devolvieron array VACIO, porque en ese momento la cola
--       estaba vacia. Es la misma fuga con otra suerte: notificaciones_pendientes
--       es la cola de WhatsApp de TODOS los salones (nombre, telefono, servicio,
--       hora de la cita) y la sirve a cualquiera en cuanto haya algo encolado.
--   expirar_citas_sin_senal(0)          -> ejecuto y devolvio
--       {"ok":true,"canceladas":[]}. Con el parametro de minutos a cero cancela
--       las citas con senal pendiente de CUALQUIER salon. Que en ese instante no
--       hubiera ninguna candidata es suerte, no una defensa.
--
-- NO estan en esta lista, y es a proposito: jornada_estado, jornada_registro,
-- jornada_totales, listar_correcciones_jornada, solicitar_correccion_jornada,
-- resolver_correccion_jornada, fichar_jornada, campana_contar/encolar/cancelar y
-- recurso_hay_hueco tambien salian en el primer barrido, pero SI se atan al
-- llamante: lo hacen un nivel mas abajo, en jornada_contexto() y en
-- _campana_gestor(), que resuelven auth.uid(). Comprobado como anon:
-- devuelven {"ok":false,"error":"no_autenticado"}. Las llama la app con sesion.
--
-- POR QUE vigilancia_bd() no las vio: su comprobacion 2 exige que el NOMBRE DE
-- UN PARAMETRO case con (p_)?(negocio_id|negocio|cobro_id|factura_id|cliente_id|
-- presupuesto_id|profile_id). Estas reciben p_limit, p_minutos, p_pago_id,
-- p_cita_id... El caso peor -- no recibir ningun ambito porque se opera sobre
-- todos -- caia justo fuera del regex. Se corrige abajo, en la version 2 de la
-- comprobacion: el invariante no es "recibe un negocio", es "la puede llamar
-- cualquiera y no comprueba a quien la llama".
--
-- QUIEN LAS LLAMA DE VERDAD (comprobado una a una, en el repo y en pg_proc):
--   - Ningun `.rpc(...)` de app/, lib/ o components/ las nombra. Las dos
--     menciones en lib/campanas.ts son COMENTARIOS que documentan que el envio
--     lo hace el motor de n8n, no el navegador.
--   - Sus llamantes dentro de Postgres son todos SECURITY DEFINER de postgres
--     (crear_cita_publica, handle_new_user, staff_salud_envios, los triggers de
--     referidos...), y dentro de un definer el permiso se comprueba contra el
--     DUENO, no contra anon: no pierden nada.
--   - n8n, el webhook de Stripe y las edge functions llaman con service_role,
--     que conserva su EXECUTE.
--
-- Se revoca por NOMBRE, recorriendo todas las sobrecargas, para que un cambio de
-- firma no deje una version suelta (asi se colo la tanda anterior).

do $$
declare
  r record;
  v_nombres text[] := array[
    -- Cola de notificaciones y avisos (n8n, cron-pull cada 2 min)
    'notificaciones_pendientes',
    'marcar_notificacion_enviada',
    'notificaciones_hallazgos_pendientes',
    'marcar_notificacion_hallazgo_enviada',
    'lista_espera_avisos_pendientes',
    'marcar_lista_espera_aviso_enviado',
    '_lista_espera_ofrecer',
    'presupuestos_pendientes_envio',
    'cumpleanos_para_felicitar',
    'marcar_cumpleanos_enviado',
    'campanas_destinatarios_pendientes',
    'campana_marcar_enviado',
    -- Liberacion de huecos por senal impagada (n8n, cron)
    'expirar_citas_sin_senal',
    -- Pasarela de pago: solo el webhook / las edge con service_role
    'registrar_cobro_online',
    'registrar_captura_hold',
    'registrar_hold_colocado',
    'registrar_liberacion_hold',
    'registrar_reembolso',
    'enlace_pago_token',
    -- Referidos: triggers y la edge de sincronizacion
    'recompute_referral_chain',
    'recompute_referral_discount',
    'referral_downline',
    'referral_upline',
    -- Anti-abuso: lo usan por dentro las RPC publicas del portal y las edge.
    -- Abierto, cualquiera podia quemar el cubo de otro o gastar sus captchas.
    'check_rate_limit',
    'rate_limit_ok',
    'consumir_captcha_token',
    -- Ayudantes internos del portal y del alta
    'duracion_efectiva_profesional',
    'profesional_ofrece_servicio',
    'generar_negocio_id_unico'
  ];
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (v_nombres)
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', r.firma);
    raise notice 'revocada %', r.firma;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- vigilancia_bd(): comprobacion 2, version 2.
--
-- La v1 buscaba "definer + abierta a anon/authenticated + recibe un parametro
-- que SE LLAMA como un negocio + no menciona un guard". Tres problemas:
--   a) el caso peor no recibe ningun ambito (opera sobre todos los salones) y
--      por tanto no casaba nunca -- son las 28 de arriba;
--   b) p_pago_id y p_cita_id derivan el negocio igual que p_cobro_id, y no
--      estaban en la lista;
--   c) solo miraba el cuerpo de la propia funcion, asi que marcaba como rotas
--      las que se atan un nivel mas abajo (jornada_contexto, _campana_gestor)
--      y habria dado nueve falsos positivos.
--
-- La v2 comprueba el invariante de verdad: "la puede llamar cualquiera y NO
-- comprueba a quien la llama", siguiendo UN NIVEL de indireccion. Las RPC del
-- portal publico siguen exentas por su p_slug (se autorizan con slug+telefono y
-- tienen su propio anti-abuso), y ademas hay una allowlist explicita para las
-- pocas publicas que no llevan slug.
create or replace function public.vigilancia_bd()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  -- Publicas de verdad, sin p_slug: se llaman desde la landing / el portal sin
  -- sesion y su autorizacion es otra (token de un solo uso, IP, captcha).
  v_publicas text[] := array[
    'crear_solicitud_publica', 'check_landing_rate_limit', 'horas_llamada_ocupadas',
    'salon_directorio_publico', 'salones_externos_publico', 'buscar_salones_publico',
    'presupuesto_publico', 'pago_info_publica', 'aceptar_presupuesto_publico',
    'completar_datos_pago_publico', 'presupuesto_enviar_mensaje_publico',
    'resolver_enlace_pago', 'resolver_enlace_pago_full', 'citas_por_confirmar_telefono',
    'confirmar_cita_cliente', 'confirmar_cita_oferta', 'vigilancia_bd'
  ];
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- 1. FUNCIONES QUE TOCAN EL VAULT Y PUEDE LLAMAR CUALQUIERA.
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
    and p.proname <> 'vigilancia_bd'
    and p.prorettype <> 'trigger'::regtype
    and pg_get_functiondef(p.oid) ~* 'vault\.decrypted_secrets'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));

  -- 2. LA REGLA DEL PARAMETRO, v2: definer + al alcance de cualquiera + sin
  --    ninguna atadura al llamante, ni suya ni de las funciones que llama.
  return query
  with guardas as (
    select p.oid, p.proname, p.prosrc,
           p.prosrc ~* '(auth\.uid|auth\.role|auth\.jwt|is_staff|my_negocio_id_text|exige_mi_negocio|is_shared_demo_visitor)\s*\(' as atada
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  -- Un nivel de indireccion: jornada_estado() no nombra auth.uid(), pero llama a
  -- jornada_contexto(), que si. Sin esto la comprobacion daria falsos positivos
  -- y acabaria ignorada, que es como muere un vigilante.
  expandida as (
    select g.oid, g.proname,
           g.atada or exists (
             select 1 from guardas h
             where h.atada and h.proname <> g.proname
               and g.prosrc ~* ('\m' || h.proname || '\M')
           ) as atada
    from guardas g
  )
  select
    'bd/rpc-sin-guard:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() no comprueba quien la llama',
    'Es SECURITY DEFINER, la puede llamar ' ||
    case when has_function_privilege('anon', p.oid, 'execute') then 'anon' else 'authenticated' end ||
    ' por REST (' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')) y ni ella ' ||
    'ni las funciones que usa mencionan auth.uid(), auth.role(), is_staff(), ' ||
    'my_negocio_id_text() ni exige_mi_negocio(). O recibe el ambito por parametro y ' ||
    'basta cambiar un id para operar sobre otro salon, o no lo recibe porque opera ' ||
    'sobre TODOS -- que es el caso peor. Arreglo: perform exige_mi_negocio(...) si la ' ||
    'llama la app, o revoke execute ... from anon, authenticated, public si solo la ' ||
    'llaman n8n y las edge functions con service_role.'
  from expandida e
  join pg_proc p on p.oid = e.oid
  where not e.atada
    and p.prosecdef
    and p.pronargs > 0
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and pg_get_function_identity_arguments(p.oid) !~* 'p_slug'
    and not (p.proname = any (v_publicas));

  -- 3. RLS SIN InitPlan (CLAUDE.md decision 6, 17 ago 2026).
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

  -- 7. LOS OJOS DE LA AGENDA MIRANDO A UN SOLO SALON.
  -- vigilar-agenda sabe recorrer TODOS los negocios cuando no le pasas
  -- negocio_id. El cron que lo dispara llevaba desde su creacion con
  -- body := {"negocio_id":"prueba_46980"} incrustado: 4.144 ejecuciones en
  -- verde, todas mirando un tenant de pruebas vacio, y cero hallazgos de agenda
  -- escritos en toda la vida del sistema. Un cron verde que no vigila nada es
  -- exactamente el canario mudo contra el que existe todo esto.
  -- Dos formas de escribir el mismo body, y el job real usa la segunda:
  --   body := '{"negocio_id":"x"}'::jsonb        -> JSON literal
  --   body := jsonb_build_object('negocio_id','x') -> comillas simples de SQL
  -- La primera version de esta comprobacion solo miraba la forma JSON y por eso
  -- daba verde sobre el job que precisamente la motivo. Ancla perdida = ciego.
  return query
  select
    'bd/vigilancia-agenda-acotada',
    'bloqueante',
    'vigilancia',
    'El cron "' || j.jobname || '" de vigilar-agenda solo mira el negocio "' ||
      coalesce(
        substring(j.command from '"negocio_id"\s*:\s*"([^"]+)"'),
        substring(j.command from 'negocio_id''\s*,\s*''([^'']+)'''),
        '?') || '"',
    'La edge vigilar-agenda recorre todos los salones cuando el cuerpo NO trae ' ||
    'negocio_id. Con el negocio fijado, el resto de la cartera no tiene vigilancia ' ||
    'de agenda: ni solapes, ni retrasos, ni citas fuera de jornada. Quitar el ' ||
    'negocio_id del body del job (o dejar {}) para que vuelva a mirarlos a todos.'
  from cron.job j
  where j.command ~* 'vigilar-agenda'
    and j.active
    and (j.command ~* '"negocio_id"\s*:\s*"[^"]+"'
      or j.command ~* 'negocio_id''\s*,\s*''[^'']+''');

  -- Y si el job desaparece del todo, tampoco hay ojos. Un cron ausente da el
  -- mismo verde que un cron correcto si nadie pregunta por el.
  return query
  select
    'bd/vigilancia-agenda-sin-cron',
    'bloqueante',
    'vigilancia',
    'No hay ningun cron activo que dispare vigilar-agenda',
    'La vigilancia de agenda (solapes, retrasos, citas fuera de jornada) la escribe ' ||
    'la edge vigilar-agenda, y quien la despierta es un job de pg_cron. Sin job, ' ||
    'hallazgos_ia no recibe nada de agenda y el panel se queda en verde por silencio.'
  where not exists (select 1 from cron.job j where j.command ~* 'vigilar-agenda' and j.active);

end;
$fn$;

revoke all on function public.vigilancia_bd() from public, anon;
grant execute on function public.vigilancia_bd() to authenticated, service_role;

comment on function public.vigilancia_bd() is
  'Vigilantes que solo se pueden ejecutar dentro de Postgres: funciones que tocan el '
  'Vault al alcance de cualquiera, la regla del parametro (v2: sin atadura al llamante, '
  'siguiendo un nivel de indireccion), RLS sin InitPlan, ayudantes volatiles, tipos de '
  'solicitud, la tabla de referidos y el alcance del cron de vigilar-agenda. Solo staff '
  'o service_role. Ver docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md';
