-- 29 ago 2026. La campana de avisos era, de largo, lo que mas base de datos
-- consumia de todo el producto.
--
-- lib/hooks/useAvisos.ts lanzaba ~14 consultas en TRES viajes de red encadenados
-- (Promise.all de 8, luego los nombres de cliente, luego Promise.all de 5), cada
-- 45 segundos, por pestana abierta y por usuario.
--
-- La aritmetica que importa no es la de una vuelta, es la del techo:
--   14 x 80 vueltas/hora = 1.120 consultas por hora y por pestana.
--   Un salon con tres personas trabajando: 3.400/hora.
--   Cien salones a tres pestanas: mas de 8 millones al dia, solo para pintar
--   el numerito de la campana.
-- Se ve ya en las estadisticas con CUATRO salones: en 151 dias, negocio_config
-- 167.315 llamadas, conversaciones 151.260, clientes 146.464, profesionales
-- 145.486, citas 144.825. Todas de aqui.
--
-- Esta funcion devuelve exactamente los MISMOS datos crudos, en una sola llamada:
-- un viaje de red en vez de tres, una evaluacion de RLS en vez de catorce, una
-- conexion en vez de catorce. El cliente sigue haciendo el mismo calculo con lo
-- que recibe (cumpleanos, ineficiencias, construirItems): no se ha movido ni una
-- regla de negocio al servidor, solo el transporte.
--
-- REGLA DEL PARAMETRO: no recibe negocio. Lo deduce de auth.uid(), asi que no hay
-- ningun id que cambiar para leer otro salon.
create or replace function public.avisos_del_negocio()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid       uuid := auth.uid();
  v_negocio   text;
  v_role      text;
  v_es_gestor boolean;
  v_es_demo   boolean;
  v_ahora     timestamptz := now();
  v_en48h     timestamptz := now() + interval '48 hours';
  v_hoy0      timestamptz;
  v_manana0   timestamptz;
  v_zona      text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_autenticado');
  end if;

  select p.negocio_id, p.role into v_negocio, v_role
    from public.profiles p where p.id = v_uid;

  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'sin_negocio');
  end if;

  v_es_gestor := v_role in ('owner', 'admin');
  v_es_demo   := v_negocio = 'demo_salon_001';

  -- El dia del salon, en su zona: el cliente calcula "hoy" con el reloj del
  -- navegador y aqui hay que llegar a la misma franja o los avisos de agenda
  -- saldrian corridos una o dos horas.
  v_zona := coalesce(
    (select nullif(c.config->>'timezone', '') from public.negocio_config c where c.negocio_id = v_negocio),
    'Europe/Madrid');
  v_hoy0    := date_trunc('day', v_ahora at time zone v_zona) at time zone v_zona;
  v_manana0 := v_hoy0 + interval '1 day';

  return jsonb_build_object(
    'ok', true,
    'negocio_id', v_negocio,
    'es_gestor', v_es_gestor,

    -- 1. Citas confirmadas que la clienta no ha confirmado, en las proximas 48 h.
    --    Mismo predicado que esSinConfirmar48h (lib/citasMetrics).
    'sin_confirmar', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'inicio', c.inicio, 'cliente_id', c.cliente_id)
                       order by c.inicio)
      from public.citas c
      where c.negocio_id = v_negocio
        and c.estado = 'confirmada'
        and c.confirmada_cliente = false
        and c.oculta_en_calendario = false
        and c.inicio > v_ahora and c.inicio <= v_en48h), '[]'::jsonb),

    -- 2. Clientes con fecha de nacimiento (el cliente calcula los proximos 7 dias).
    'clientes_cumple', coalesce((
      select jsonb_agg(jsonb_build_object('id', cl.id, 'nombre', cl.nombre, 'fecha_nacimiento', cl.fecha_nacimiento))
      from public.clientes cl
      where cl.negocio_id = v_negocio and cl.fecha_nacimiento is not null), '[]'::jsonb),

    -- 3. Bandeja sin leer.
    'mensajes_sin_leer', (
      select count(*) from public.conversaciones cv
      where cv.negocio_id = v_negocio and cv.leido_at is null),

    -- 4. Clientes en riesgo de fuga: solo el CONTEO, que es lo unico que usa la
    --    campana. Solo gestores, y nunca en la demo.
    'clientes_fuga', case
      when v_es_gestor and not v_es_demo
        then (select count(*) from public.clientes_en_riesgo_fuga())
      else 0 end,

    -- 5. Hallazgos abiertos del escaneo proactivo. La demo no persiste.
    'hallazgos', case when v_es_demo then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(h)) from public.hallazgos_del_negocio(false) h), '[]'::jsonb) end,

    -- 6. Citas de hoy, para el analisis de ineficiencias que hace el cliente.
    'citas_hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'inicio', c.inicio, 'fin', c.fin,
               'fin_activa', c.fin_activa, 'fin_espera', c.fin_espera,
               'profesional_id', c.profesional_id, 'cliente_id', c.cliente_id,
               'estado', c.estado, 'grupo_id', c.grupo_id, 'servicio_id', c.servicio_id))
      from public.citas c
      where c.negocio_id = v_negocio
        and c.oculta_en_calendario = false
        and c.estado in ('pendiente', 'confirmada')
        and c.inicio >= v_hoy0 and c.inicio < v_manana0), '[]'::jsonb),

    'profesionales', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'categoria', pr.categoria))
      from public.profesionales pr
      where pr.negocio_id = v_negocio and pr.activo = true), '[]'::jsonb),

    -- 7. Citas pasadas sin cobrar. Ya con el nombre resuelto, como las pinta la UI.
    -- El orden de esta lista no es cargante: construirItems() reordena todos los
    -- avisos por urgencia y cercania antes de pintarlos. Lo que importa aqui es
    -- QUE 15 filas entran, y de eso se encarga el order by + limit de dentro.
    'cobros_pendientes', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
                 'id', c.id, 'inicio', c.inicio,
                 'clienteNombre', coalesce(cl.nombre, 'Cliente'),
                 'servicioNombre', coalesce(s.nombre, 'Servicio'),
                 'precio', coalesce(s.precio, 0)) as x
        from public.citas c
        left join public.clientes cl on cl.id = c.cliente_id
        left join public.servicios s on s.id = c.servicio_id
        where c.negocio_id = v_negocio
          and c.cobrada = false
          and c.oculta_en_calendario = false
          and c.estado in ('confirmada', 'completada', 'finalizada')
          and c.inicio <= v_ahora
        order by c.inicio desc
        limit 15) t), '[]'::jsonb),

    -- 8. Nombres de cliente de las dos listas de citas, en un mapa.
    --    Antes era una consulta EXTRA en serie, despues del Promise.all.
    'nombres_clientes', coalesce((
      select jsonb_object_agg(cl.id::text, cl.nombre)
      from public.clientes cl
      where cl.negocio_id = v_negocio
        and cl.id in (
          select c.cliente_id from public.citas c
          where c.negocio_id = v_negocio and c.cliente_id is not null
            and c.oculta_en_calendario = false
            and ((c.estado = 'confirmada' and c.confirmada_cliente = false
                  and c.inicio > v_ahora and c.inicio <= v_en48h)
              or (c.estado in ('pendiente','confirmada')
                  and c.inicio >= v_hoy0 and c.inicio < v_manana0)))), '{}'::jsonb),

    -- 9. Contexto de agenda (antes: el segundo Promise.all de cinco consultas).
    'bloqueos', coalesce((
      select jsonb_agg(jsonb_build_object('profesional_id', b.profesional_id, 'inicio', b.inicio, 'fin', b.fin))
      from public.bloqueos_profesional b where b.negocio_id = v_negocio), '[]'::jsonb),

    'horarios', coalesce((
      select jsonb_agg(jsonb_build_object('dia_semana', h.dia_semana, 'abierto', h.abierto,
                                          'apertura', h.apertura, 'cierre', h.cierre))
      from public.negocio_horarios h where h.negocio_id = v_negocio), '[]'::jsonb),

    -- horarios_profesional NO tiene negocio_id: se llega por profesional_id.
    'horarios_profesional', coalesce((
      select jsonb_agg(jsonb_build_object('profesional_id', hp.profesional_id, 'dia_semana', hp.dia_semana,
                                          'hora_inicio', hp.hora_inicio, 'hora_fin', hp.hora_fin, 'turno', hp.turno))
      from public.horarios_profesional hp
      join public.profesionales pr on pr.id = hp.profesional_id
      where pr.negocio_id = v_negocio), '[]'::jsonb),

    'cierres', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', ci.fecha))
      from public.cierres_negocio ci where ci.negocio_id = v_negocio), '[]'::jsonb),

    'config', coalesce(
      (select c.config from public.negocio_config c where c.negocio_id = v_negocio), '{}'::jsonb)
  );
end;
$fn$;

revoke all on function public.avisos_del_negocio() from public, anon;
grant execute on function public.avisos_del_negocio() to authenticated, service_role;

comment on function public.avisos_del_negocio() is
  'Todo lo que necesita la campana de avisos (useAvisos) en UNA llamada, en vez de '
  'las ~14 consultas en tres viajes que hacia antes cada 45 s por pestana. Deduce el '
  'negocio de auth.uid(); no recibe ningun id. El calculo (cumpleanos, ineficiencias, '
  'orden de los avisos) sigue en el cliente: aqui solo cambia el transporte.';
