-- 4 sep 2026. Anti-abuso REAL para las dos RPC anonimas del cobro online, y de
-- paso deshacer una reversion que se colo con ellas.
--
-- Contexto: 20260901170000_restaurar_cobro_online.sql metio en la cadena
-- canonica una "copia literal" del fichero legacy para que un entorno
-- reconstruido no perdiera el cobro online. Al revisarlo de verdad salieron
-- dos cosas distintas:
--
-- A) SEGURIDAD -- completar_datos_pago_publico escribia sin tope ninguno.
--    Es anonima (grant a anon), y con UN enlace vivo -- que lo ve cualquiera
--    que mire el QR del mostrador o a quien le reenvien el enlace -- cada
--    llamada metia otra fila en consentimientos_cliente: el insert era
--    incondicional, sin upsert ni comprobacion previa. Eso es escritura
--    anonima sin limite sobre el registro de consentimientos (RGPD) de una
--    clienta REAL, con fecha now() y aspecto legitimo.
--    Reproducido en produccion dentro de begin/rollback el 4 sep: 5 llamadas
--    con el mismo token valido = 5 filas nuevas (1 previa -> 6). Con el
--    arreglo salen 1 o 0.
--    Lo que SI tenia y sigue valiendo: el token es la prueba de tenencia (no
--    hay sesion, asi que exige_mi_negocio() no aplica), son 64 hex de dos
--    gen_random_uuid() concatenados (~244 bits: no se adivina), la tabla
--    cita_pago_enlaces tiene RLS con politica false/false para anon y
--    authenticated (no se puede enumerar), caduca a los 7 dias, y los CASE de
--    cada columna impiden pisar datos buenos del salon.
--    Lo que le faltaba y se anade aqui: limite por IP, limite por token,
--    consentimiento idempotente y no escribir sobre una cita ya cobrada.
--
-- B) REGRESION -- esa copia literal es anterior a S4.2 (20260708184905,
--    s4_pago_info_publica_propinas) y la piso: pago_info_publica dejo de
--    devolver propinas_activo/propinas_sugeridas. app/pagar/[token].web.tsx
--    los lee para decidir `tipsActive`, asi que desde el 1 sep el selector de
--    propina NO se pinta en produccion. Aqui se restaura.
--    (Ojo: la MISMA copia literal piso tambien S4.4 -- 20260708192754,
--    s4_cobro_online_grupo -- en registrar_cobro_online, que volvio a crear UN
--    solo cobro en vez de uno por cita del grupo con reparto proporcional.
--    NO se toca aqui a proposito: es via de dinero y del reparto de Alexandro.
--    Queda anotado para que se decida aparte; no hay ningun cobro con
--    origen='portal' en la base, asi que no hay nada fiscal comprometido.)

-- ───────────────────────────────────────────────────────────────────────────
-- 1) pago_info_publica: cuerpo de S4.2 (con propinas) restaurado. Sin cambios
--    de exposicion -- ver el comentario del grant al final del bloque.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.pago_info_publica(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita_id uuid;
  v_tipo text;
  v_cita public.citas;
  v_importe int;
  v_salon text;
  v_servicio text;
  v_requiere_datos boolean;
  v_cli public.clientes;
  v_prop_activo boolean;
  v_prop_sug jsonb;
begin
  select cita_id, tipo into v_cita_id, v_tipo
    from public.cita_pago_enlaces
    where token = p_token and expira_at > now()
    limit 1;
  if v_cita_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select * into v_cita from public.citas where id = v_cita_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  select coalesce(np.nombre_publico, '') into v_salon
    from public.negocio_portal np where np.negocio_id = v_cita.negocio_id;
  select coalesce(s.nombre, '') into v_servicio
    from public.servicios s where s.id = v_cita.servicio_id;

  -- Importe: el pago pendiente de ese tipo (si existe); si no, 0.
  select importe_cents into v_importe
    from public.pagos
    where cita_id = v_cita_id and tipo = v_tipo and estado = 'pendiente'
    order by created_at desc limit 1;

  select * into v_cli from public.clientes where id = v_cita.cliente_id;
  v_requiere_datos := (v_cli.id is null)
    or coalesce(length(trim(v_cli.nombre)), 0) < 2
    or coalesce(length(public.normalizar_telefono(v_cli.telefono)), 0) < 7;

  -- S4.2: config de propinas del salon, para que la pagina publica pueda
  -- ofrecerla. El % se calcula sobre importe_cents (pendiente, pre-propina).
  select coalesce((config->>'propinasActivo')::boolean, false),
         coalesce(config->'propinasSugeridas', '[5,10,15]'::jsonb)
    into v_prop_activo, v_prop_sug
    from public.negocio_config where negocio_id = v_cita.negocio_id;

  return jsonb_build_object(
    'ok', true,
    'tipo', v_tipo,
    'salon', v_salon,
    'servicio', v_servicio,
    'inicio', v_cita.inicio,
    'importe_cents', coalesce(v_importe, 0),
    'moneda', 'EUR',
    'estado', v_cita.estado,
    'cobrada', coalesce(v_cita.cobrada, false),
    'requiere_datos', v_requiere_datos,
    'propinas_activo', coalesce(v_prop_activo, false),
    'propinas_sugeridas', coalesce(v_prop_sug, '[5,10,15]'::jsonb)
  );
end;
$$;

-- PUBLICA (anon) porque la pinta /app/pagar/[token], que es anonima por
-- definicion: quien escanea el QR del mostrador no tiene sesion.
-- Prueba de tenencia: el token, que aqui ES el control de acceso -- 64 hex de
-- dos gen_random_uuid() (~244 bits, no se adivina), su tabla no es legible por
-- anon (politica false/false) asi que no se puede enumerar, y caduca a los 7d.
-- Anti-abuso: NINGUNO a proposito, y esta es la razon. Es de SOLO LECTURA y no
-- devuelve PII de la clienta (nombre publico del salon, nombre del servicio,
-- hora, importe y dos banderas); el importe se recalcula en servidor. Un cubo
-- de ritmo aqui obligaria a ESCRIBIR una fila en cada carga de la pagina de
-- pago para frenar algo que el token ya hace imposible, y su unico efecto real
-- seria poder dejar sin pagar a una clienta legitima. Si algun dia devuelve
-- datos de la clienta, esta decision hay que rehacerla.
revoke all on function public.pago_info_publica(text) from public;
grant execute on function public.pago_info_publica(text) to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) completar_datos_pago_publico: la que escribe. Aqui esta el arreglo.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.completar_datos_pago_publico(
  p_token text,
  p_nombre text,
  p_telefono text,
  p_email text default null,
  p_acepto boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita_id uuid;
  v_cita public.citas;
  v_cli_id uuid;
  v_ip text := public.request_ip();
begin
  -- Freno por IP, lo PRIMERO: es lo unico que frena a quien va probando tokens
  -- al azar, porque el cubo por token le daria un cubo nuevo a cada intento.
  -- Sin cabecera x-forwarded-for no hay clave y rate_limit_ok deja pasar: es
  -- deliberado, el control duro es el del token y ese no depende de cabeceras.
  if not public.rate_limit_ok('cobro_datos_ip', v_ip, 20, interval '1 hour') then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;

  if not p_acepto then
    return jsonb_build_object('ok', false, 'motivo', 'sin_consentimiento');
  end if;
  if coalesce(length(trim(p_nombre)), 0) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'nombre_invalido');
  end if;
  if coalesce(length(public.normalizar_telefono(p_telefono)), 0) < 7 then
    return jsonb_build_object('ok', false, 'motivo', 'telefono_invalido');
  end if;

  select cita_id into v_cita_id
    from public.cita_pago_enlaces
    where token = p_token and expira_at > now()
    limit 1;
  if v_cita_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  -- Freno por token, DESPUES de validar: quien tiene un enlace vivo (lo ve
  -- cualquiera que mire el QR del mostrador) no puede repetir la escritura
  -- indefinidamente. El flujo legitimo llama una vez; los reintentos por
  -- telefono mal escrito ni llegan aqui, salen arriba sin gastar cupo.
  if not public.rate_limit_ok('cobro_datos_token', p_token, 5, interval '1 hour') then
    return jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  end if;

  select * into v_cita from public.citas where id = v_cita_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'enlace_invalido');
  end if;

  -- El enlace vive 7 dias; la cita no. Si ya esta cobrada no queda nada que
  -- completar, y dejar la escritura abierta solo alarga la ventana de abuso.
  if coalesce(v_cita.cobrada, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ya_cobrada');
  end if;

  v_cli_id := v_cita.cliente_id;
  if v_cli_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_cliente');
  end if;

  -- Rellenar datos minimos que falten (no piso datos ya buenos del salon).
  update public.clientes c set
    nombre   = case when coalesce(length(trim(c.nombre)), 0) < 2 then left(trim(p_nombre), 120) else c.nombre end,
    telefono = case when coalesce(length(public.normalizar_telefono(c.telefono)), 0) < 7 then trim(p_telefono) else c.telefono end,
    email    = coalesce(c.email, left(nullif(trim(p_email), ''), 200))
  where c.id = v_cli_id;

  -- Consentimiento IDEMPOTENTE. Antes el insert era incondicional: N llamadas
  -- con un token valido dejaban N filas fechadas a now() en el registro RGPD
  -- de una clienta real, todas con aspecto legitimo. Un consentimiento es un
  -- ESTADO, no un contador de clics: uno por enlace de pago, no uno por toque
  -- del boton. Si ya hay uno vivo y otorgado no se apunta otro; tras una
  -- revocacion si vuelve a apuntarse, que es justo lo que debe constar.
  -- (La carrera entre dos llamadas simultaneas queda acotada por el cubo del
  -- token: no se pone un indice unico porque esta tabla la escriben tambien
  -- las pantallas del salon y el constraint cambiaria su comportamiento.)
  if not exists (
    select 1 from public.consentimientos_cliente cc
    where cc.cliente_id = v_cli_id
      and cc.negocio_id = v_cita.negocio_id
      and cc.tipo = 'tratamiento_datos'
      and coalesce(cc.aceptado, false) = true
      and coalesce(cc.revocado, false) = false
  ) then
    -- columnas + valores permitidos reales de consentimientos_cliente:
    -- metodo_obtencion en firma_digital|casilla|verbal_registrado|app
    -- -> 'casilla' = checkbox.
    insert into public.consentimientos_cliente (
      negocio_id, cliente_id, tipo, aceptado, revocado, metodo_obtencion, fecha
    ) values (
      v_cita.negocio_id, v_cli_id, 'tratamiento_datos', true, false, 'casilla', now()
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- PUBLICA (anon) porque la invitada que paga por el enlace no tiene sesion y
-- tiene que poder dar su nombre/telefono y aceptar la politica antes de pagar.
-- Prueba de tenencia: el token opaco vivo (64 hex, ~244 bits, tabla no legible
-- por anon, TTL 7 dias). No hay exige_mi_negocio() porque no hay llamante al
-- que atar: el secreto por registro ES la prueba, como en el resto del portal.
-- Anti-abuso REAL (4 sep 2026, antes no habia ninguno):
--   - 20 llamadas/hora por IP (cubo 'cobro_datos_ip'), lo primero de todo,
--     contra el que prueba tokens al azar. Best-effort: sin x-forwarded-for
--     no bloquea.
--   - 5 llamadas/hora por token (cubo 'cobro_datos_token'), contra el que SI
--     tiene un enlace valido. Es el control duro.
--   - el insert de consentimientos_cliente es idempotente: uno vivo por
--     clienta/negocio/tipo, asi que repetir la llamada ya no ensucia el
--     registro RGPD (N llamadas -> 1 fila, o 0 si ya constaba).
--   - se rechaza sobre cita ya cobrada.
-- Lo que sigue siendo cierto por diseno: quien tenga el enlace puede rellenar
-- los huecos vacios de la ficha de esa clienta (nunca pisar lo que ya hay).
revoke all on function public.completar_datos_pago_publico(text, text, text, text, boolean) from public;
grant execute on function public.completar_datos_pago_publico(text, text, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
