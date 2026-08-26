-- =====================================================================
-- Mecha · Ciclo de confirmacion de citas por WhatsApp
-- =====================================================================
-- Traspaso de Carlos del 14 ago 2026. Desde que toda cita nace en `pendiente`
-- (antes la app pisaba el default y las creaba `confirmada`), el estado
-- `confirmada` dejo de ser el punto de partida y paso a ser un paso explicito.
-- Eso dejo inertes tres cosas que lo usaban como llave: no daban error, es que
-- simplemente no saltaban.
--
--   1. `notificaciones_pendientes` -> una cita nueva no recibia ni confirmacion
--      ni recordatorio (los dos filtraban por `estado = 'confirmada'`).
--   2. `citas_riesgo_no_show` -> no veia ninguna cita nueva.
--   3. `esSinConfirmar48h` en el front -> lo mueve Carlos, no va aqui.
--
-- Y faltaba el agujero de fondo: NO existia ningun camino por el que la clienta
-- confirmase desde WhatsApp. El mensaje era informativo y la unica funcion que
-- ponia `confirmada_cliente` era `confirmar_cita_oferta`, solo para ofertas de
-- lista de espera.
--
-- EL FLUJO QUE QUEDA
--   Con senal:  creada -> pendiente -> enlace de pago -> paga -> CONFIRMADA
--   Sin senal:  creada -> pendiente -> mensaje de confirmacion -> la clienta
--               responde -> CONFIRMADA; si no responde, cuenta como riesgo.
--
-- `pendiente` significa dos cosas (esperando senal / esperando confirmacion) y
-- se distinguen por `deposito_requerido`. Decidido el 26 ago 2026 NO separarlo
-- en dos estados: la distincion ya se puede expresar y un estado nuevo
-- arrastraria el CHECK de citas, los filtros del front, los colores de la agenda
-- y el vocabulario de KPIs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) DRENAR LA COLA ANTES DE NADA  <-- no quitar este paso
--
--    El paso 1 hace que MUCHAS mas citas sean notificables de golpe, y el motor
--    de n8n tira cada 2 minutos. Al aplicarlo en produccion el 26 ago 2026 habia
--    48 confirmaciones y 8 recordatorios esperando, 10 de ellas de clientas
--    REALES de un salon: sin este paso les habrian llegado mensajes inesperados
--    en los dos minutos siguientes.
--
--    No es una regresion silenciarlas: hoy tampoco reciben nada. Lo que hace es
--    que el cambio empiece a contar desde las citas NUEVAS.
--
--    Se drenan TODAS las futuras, no solo las de la ventana de recordatorio: una
--    cita a tres dias vista disparia el recordatorio al entrar en ventana.
-- ---------------------------------------------------------------------
update public.citas c
   set confirmacion_enviada = true,
       recordatorio_enviado = true
 where c.estado = 'pendiente'
   and c.inicio > now()
   and not (coalesce(c.deposito_requerido, false) and not coalesce(c.deposito_pagado, false))
   and (c.confirmacion_enviada = false or c.recordatorio_enviado = false);

-- ---------------------------------------------------------------------
-- 1) El motor de envios mira tambien las citas pendientes
--
--    Las que esperan senal quedan FUERA de confirmacion y recordatorio: ya
--    reciben su propio mensaje con el enlace de pago y no deben recibir dos.
--    Cuando pagan pasan a `confirmada` y entran por la via normal.
-- ---------------------------------------------------------------------
create or replace function public.notificaciones_pendientes(
  p_limit integer default 50,
  p_recordatorio_horas integer default 24
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select c.id as cita_id, 'senal'::text as tipo, 'enlace_pago_senal'::text as template,
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 0 as prio
    from public.citas c
    where c.estado = 'pendiente' and c.deposito_requerido = true and c.deposito_pagado = false
      and coalesce(c.senal_enviada, false) = false and c.inicio > now()
    union all
    select c.id, 'retraso', 'aviso_retraso',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 1
    from public.citas c
    where coalesce(c.retraso_aviso_pendiente, false) = true and c.inicio > now()
      and c.estado not in ('cancelada','completada')
    union all
    select c.id, 'confirmacion', 'confirmacion_citas',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 2
    from public.citas c
    where c.estado in ('pendiente','confirmada') and c.confirmacion_enviada = false and c.inicio > now()
      and not (coalesce(c.deposito_requerido, false) and not coalesce(c.deposito_pagado, false))
    union all
    select c.id, 'recordatorio', 'recordatorio_cita',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 3
    from public.citas c
    left join public.negocio_config nc on nc.negocio_id = c.negocio_id
    where c.estado in ('pendiente','confirmada') and c.recordatorio_enviado = false
      and not (coalesce(c.deposito_requerido, false) and not coalesce(c.deposito_pagado, false))
      and c.inicio > now()
      and c.inicio <= now() + make_interval(hours =>
            greatest(coalesce((nc.config->>'notifRecordatorioHoras')::int, p_recordatorio_horas, 24), 1))
    union all
    select c.id, 'resena', 'peticion_resena',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 4
    from public.citas c
    where c.estado = 'completada' and coalesce(c.resena_enviada, false) = false
      and c.fin > now() - interval '7 days'
  ),
  rows as (
    select b.cita_id, b.tipo, b.template, b.inicio, b.prio, b.servicio_id,
           cl.telefono,
           split_part(coalesce(cl.nombre, ''), ' ', 1) as nombre,
           coalesce(np.nombre_publico, '') as salon,
           coalesce(s.nombre, '') as servicio,
           coalesce(pr.nombre, '') as profesional,
           np.slug
    from base b
    join public.clientes cl on cl.id = b.cliente_id
    join public.negocio_portal np on np.negocio_id = b.negocio_id and np.portal_activo = true
    left join public.servicios s on s.id = b.servicio_id
    left join public.profesionales pr on pr.id = b.profesional_id
    left join public.negocio_config nc on nc.negocio_id = b.negocio_id
    where cl.telefono is not null and length(trim(cl.telefono)) >= 6
      and (
        (b.tipo = 'senal'        and coalesce((nc.config->>'notifSenalActiva')::boolean, true))
        or (b.tipo = 'retraso'      and coalesce((nc.config->>'notifRetrasoActiva')::boolean, true))
        or (b.tipo = 'confirmacion' and coalesce((nc.config->>'notifConfirmacionActiva')::boolean, true))
        or (b.tipo = 'recordatorio' and coalesce((nc.config->>'notifRecordatorioActiva')::boolean, true))
        or (b.tipo = 'resena'       and coalesce((nc.config->>'notifResenaActiva')::boolean, true))
      )
      and not (
        b.tipo in ('recordatorio','resena')
        and coalesce((nc.config->>'notifNoMolestar')::boolean, false)
        and case
          when coalesce((nc.config->>'notifNoMolestarInicio')::time, '22:00') <=
               coalesce((nc.config->>'notifNoMolestarFin')::time, '08:00')
            then (now() at time zone 'Europe/Madrid')::time >= coalesce((nc.config->>'notifNoMolestarInicio')::time, '22:00')
             and (now() at time zone 'Europe/Madrid')::time <  coalesce((nc.config->>'notifNoMolestarFin')::time, '08:00')
          else (now() at time zone 'Europe/Madrid')::time >= coalesce((nc.config->>'notifNoMolestarInicio')::time, '22:00')
            or (now() at time zone 'Europe/Madrid')::time <  coalesce((nc.config->>'notifNoMolestarFin')::time, '08:00')
        end
      )
    order by b.prio, b.inicio
    limit greatest(p_limit, 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cita_id', cita_id,
    'tipo', tipo,
    'template', template,
    'telefono', telefono,
    'nombre', nombre,
    'salon', salon,
    'servicio', servicio,
    'profesional', profesional,
    'fecha', to_char(inicio at time zone 'Europe/Madrid', 'DD/MM'),
    'hora', to_char(inicio at time zone 'Europe/Madrid', 'HH24:MI'),
    'slug', slug,
    'importe_cents', case when tipo = 'senal' then importe_senal_servicio(servicio_id) else null end,
    'pago_token', case when tipo = 'senal' then (
        select e.token from public.cita_pago_enlaces e
        where e.cita_id = rows.cita_id and e.expira_at > now()
        order by e.created_at desc limit 1
      ) else null end
  )), '[]'::jsonb)
  from rows;
$function$;

-- ---------------------------------------------------------------------
-- 2) La clienta confirma desde WhatsApp
--
--    Calcada de `confirmar_cita_oferta`, que es el unico precedente de
--    "identificar a la clienta por su telefono", con tres diferencias:
--
--    a) NO toca `confirmacion_enviada`. La de ofertas lo pone en false para que
--       salga un mensaje; aqui el mensaje YA se envio (es lo que provoco esta
--       respuesta) y reabrirlo mandaria un segundo mensaje.
--    b) Responder dos veces "si" no es un error: la segunda vez devuelve ok con
--       `sin_cambios`, para que n8n no reintente ni conteste raro.
--    c) Si esta esperando senal no confirma: un "si" por WhatsApp no puede
--       saltarse el pago. Devuelve el enlace, que es lo util para la clienta.
-- ---------------------------------------------------------------------
create or replace function public.confirmar_cita_cliente(p_cita_id uuid, p_telefono text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cita public.citas;
  v_tel  text;
begin
  select * into v_cita from public.citas where id = p_cita_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cita_no_encontrada');
  end if;

  -- Idempotente: dos "si" seguidos no son un fallo.
  if coalesce(v_cita.confirmada_cliente, false) then
    return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'sin_cambios', true);
  end if;

  if v_cita.estado not in ('pendiente', 'confirmada') then
    return jsonb_build_object('ok', false, 'error', 'estado_no_confirmable', 'estado', v_cita.estado);
  end if;

  if v_cita.inicio <= now() then
    return jsonb_build_object('ok', false, 'error', 'cita_pasada');
  end if;

  -- La identidad es el telefono, igual que en el portal publico.
  select telefono into v_tel from public.clientes where id = v_cita.cliente_id;
  if public.normalizar_telefono(v_tel) is distinct from public.normalizar_telefono(p_telefono) then
    return jsonb_build_object('ok', false, 'error', 'telefono_no_coincide');
  end if;

  if coalesce(v_cita.deposito_requerido, false) and not coalesce(v_cita.deposito_pagado, false) then
    return jsonb_build_object('ok', false, 'needs_payment', true, 'cita_id', p_cita_id,
      'pago_token', coalesce(
        (select e.token from public.cita_pago_enlaces e
          where e.cita_id = p_cita_id and e.expira_at > now()
          order by e.created_at desc limit 1),
        public.enlace_pago_token(p_cita_id)
      ));
  end if;

  update public.citas
     set estado             = 'confirmada',
         confirmada_cliente = true,
         confirmada_at      = now(),
         modificado_at      = now()
   where id = p_cita_id;

  return jsonb_build_object('ok', true, 'cita_id', p_cita_id);
end;
$$;

comment on function public.confirmar_cita_cliente(uuid, text) is
  'La clienta confirma su cita respondiendo por WhatsApp. La llama n8n con service_role. Identidad por telefono, como confirmar_cita_oferta.';

-- Round 4: no nace ejecutable. La llama n8n con la service_role key, que no
-- necesita grant. Si algun dia la llama el portal publico, hara falta abrirla a
-- `anon` EXPLICITAMENTE aqui -- y pensarlo dos veces, porque con el id de una
-- cita y un telefono acertado se confirma sin sesion.
revoke all on function public.confirmar_cita_cliente(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) El riesgo de no-show deja de mirar el estado
--
--    Lo que mide riesgo no es el estado, es que LA CLIENTA no haya confirmado.
--    Con el default nuevo, exigir `confirmada` dejaba fuera justo las citas mas
--    dudosas. Se excluyen las que esperan senal: esas tienen su propio flujo y
--    el cron `expirar_citas_sin_senal` las libera a los 15 minutos.
-- ---------------------------------------------------------------------
create or replace function public.citas_riesgo_no_show(
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone
)
returns table(cita_id uuid, cliente_id uuid, nombre text, inicio timestamp with time zone,
              nivel text, score integer, no_shows integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with mine as (select p.negocio_id from public.profiles p where p.id = auth.uid()),
  riesgo as (select * from public.clientes_riesgo_no_show())
  select c.id as cita_id, c.cliente_id, cl.nombre, c.inicio, r.nivel, r.score, r.no_shows
  from public.citas c
  join mine on mine.negocio_id = c.negocio_id
  join riesgo r on r.cliente_id = c.cliente_id
  join public.clientes cl on cl.id = c.cliente_id
  where coalesce(c.confirmada_cliente, false) = false
    and c.estado in ('pendiente', 'confirmada')
    and not (coalesce(c.deposito_requerido, false) and not coalesce(c.deposito_pagado, false))
    and cl.consiente_ia is distinct from false and c.inicio >= p_desde and c.inicio < p_hasta
  order by r.score desc, c.inicio asc;
$function$;

notify pgrst, 'reload schema';
