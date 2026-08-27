-- Señal por WhatsApp: el motor de notificaciones manda el enlace de pago (plantilla
-- enlace_pago_senal) a las citas pendientes de señal, y un cron libera el hueco si no se
-- paga a tiempo. Aplicada en remoto (vtrggiogjrhqtwbhbgia) via Supabase MCP el 2026-06-17.

-- 1) Flag para no reenviar el enlace de señal. Backfill a true en lo existente (no spamear retroactivo).
alter table public.citas add column if not exists senal_enviada boolean not null default false;
update public.citas set senal_enviada = true where senal_enviada = false;

-- 2) Añadir el tipo 'senal' a la cola de notificaciones (prio 0 = lo primero; el cliente espera para pagar).
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
    select c.id, 'confirmacion', 'confirmacion_citas',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 1
    from public.citas c
    where c.estado = 'confirmada' and c.confirmacion_enviada = false and c.inicio > now()
    union all
    select c.id, 'recordatorio', 'recordatorio_cita',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 2
    from public.citas c
    where c.estado = 'confirmada' and c.recordatorio_enviado = false
      and c.inicio > now() and c.inicio <= now() + make_interval(hours => greatest(p_recordatorio_horas, 1))
    union all
    select c.id, 'resena', 'peticion_resena',
           c.inicio, c.cliente_id, c.servicio_id, c.profesional_id, c.negocio_id, 3
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
    where cl.telefono is not null and length(trim(cl.telefono)) >= 6
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

-- 3) marcar_notificacion_enviada: añadir el tipo 'senal'.
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
  else
    raise exception 'Tipo de notificacion no valido: %', p_tipo;
  end if;
  return jsonb_build_object('ok', true, 'cita_id', p_cita_id, 'tipo', p_tipo);
end;
$function$;

-- 4) Expiración: cancela citas pendientes de señal no pagadas pasados N minutos (libera el hueco).
--    La llama el workflow n8n "Mecha — Expirar señales" (cron 2 min). service_role only.
create or replace function public.expirar_citas_sin_senal(p_minutos integer DEFAULT 15)
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  with upd as (
    update public.citas c
      set estado = 'cancelada',
          cancelado_por = 'sistema',
          motivo_cancelacion = 'Senal no pagada a tiempo',
          modificado_at = now()
    where c.estado = 'pendiente' and c.deposito_requerido = true and c.deposito_pagado = false
      and c.inicio > now()
      and c.created_at < now() - make_interval(mins => greatest(p_minutos, 1))
    returning c.id
  )
  select jsonb_build_object('ok', true, 'canceladas', coalesce(jsonb_agg(id), '[]'::jsonb)) from upd;
$function$;

grant execute on function public.expirar_citas_sin_senal(integer) to service_role;
