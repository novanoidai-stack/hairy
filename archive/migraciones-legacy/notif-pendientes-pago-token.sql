-- Paso 1 endurecimiento de pagos (spec 2026-06-30): notificaciones_pendientes emite
-- pago_token para la rama 'senal' (subquery correlacionada; la funcion sigue STABLE).
-- Aplicada al remoto como migracion `notif_pendientes_pago_token`.
CREATE OR REPLACE FUNCTION public.notificaciones_pendientes(p_limit integer DEFAULT 50, p_recordatorio_horas integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    where c.estado = 'confirmada' and c.confirmacion_enviada = false and c.inicio > now()
    union all
    select c.id, 'recordatorio', 'recordatorio_cita',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 3
    from public.citas c
    left join public.negocio_config nc on nc.negocio_id = c.negocio_id
    where c.estado = 'confirmada' and c.recordatorio_enviado = false
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
