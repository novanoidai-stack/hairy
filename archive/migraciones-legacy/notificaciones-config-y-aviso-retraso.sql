-- Config de notificaciones por salon + aviso de retraso al cliente.
-- El motor (notificaciones_pendientes, cron-pull de n8n) pasa a leer negocio_config y:
--   - omite los tipos que el salon tenga desactivados,
--   - usa la ventana de recordatorio de cada salon,
--   - respeta el horario "no molestar" (solo recordatorio y resena),
--   - emite un tipo nuevo `retraso` (plantilla aviso_retraso) para las citas marcadas.
-- Claves en negocio_config.config (ausente = default ON / sin no-molestar):
--   notifConfirmacionActiva, notifRecordatorioActiva, notifRecordatorioHoras (int, 24),
--   notifResenaActiva, notifSenalActiva, notifRetrasoActiva,
--   notifNoMolestar (bool), notifNoMolestarInicio/Fin ('HH:MM').
-- Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-21.

-- 1) Flag de cita pendiente de aviso de retraso (lo pone la cascada de la agenda).
alter table public.citas add column if not exists retraso_aviso_pendiente boolean not null default false;

-- 2) notificaciones_pendientes: gating por salon + ventana + no-molestar + tipo retraso.
create or replace function public.notificaciones_pendientes(p_limit integer DEFAULT 50, p_recordatorio_horas integer DEFAULT 24)
 returns jsonb
 language sql
 stable security definer
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
      -- on/off por tipo (clave ausente = activo)
      and (
        (b.tipo = 'senal'        and coalesce((nc.config->>'notifSenalActiva')::boolean, true))
        or (b.tipo = 'retraso'      and coalesce((nc.config->>'notifRetrasoActiva')::boolean, true))
        or (b.tipo = 'confirmacion' and coalesce((nc.config->>'notifConfirmacionActiva')::boolean, true))
        or (b.tipo = 'recordatorio' and coalesce((nc.config->>'notifRecordatorioActiva')::boolean, true))
        or (b.tipo = 'resena'       and coalesce((nc.config->>'notifResenaActiva')::boolean, true))
      )
      -- no molestar: excluye recordatorio y resena dentro de la franja (Europe/Madrid)
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
    'importe_cents', case when tipo = 'senal' then importe_senal_servicio(servicio_id) else null end
  )), '[]'::jsonb)
  from rows;
$function$;

-- 3) marcar_notificacion_enviada: anadir el tipo 'retraso'.
create or replace function public.marcar_notificacion_enviada(p_cita_id uuid, p_tipo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_tipo = 'confirmacion' then
    update public.citas set confirmacion_enviada = true where id = p_cita_id;
  elsif p_tipo = 'recordatorio' then
    update public.citas set recordatorio_enviado = true where id = p_cita_id;
  elsif p_tipo = 'resena' then
    update public.citas set resena_enviada = true where id = p_cita_id;
  elsif p_tipo = 'senal' then
    update public.citas set senal_enviada = true where id = p_cita_id;
  elsif p_tipo = 'retraso' then
    update public.citas set retraso_aviso_pendiente = false where id = p_cita_id;
  else
    raise exception 'Tipo de notificacion no valido: %', p_tipo;
  end if;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'tipo', p_tipo);
end;
$function$;
