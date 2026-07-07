-- Sesion 15 · Felicitacion de cumpleanos por WhatsApp (flag + outbox para el motor)
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Ya existe: columna clientes.fecha_nacimiento + avisos internos de cumpleanos
-- (campana, lib/hooks/useAvisos.ts). Falta el envio automatico por WhatsApp.
--
-- Reparto: la UI de config (toggle + descuento) es de Carlos; el ENVIO real por
-- WhatsApp es de Alexandro (motor n8n). Esta migracion deja el "cable":
--   1) cumpleanos_avisos: outbox (una fila por clienta/ano), como fuga_clientas_avisos
--      y lista_espera_avisos. Solo service_role (el motor). RLS on sin policies publicas.
--   2) cumpleanos_para_felicitar(p_fecha): el motor la llama a diario (cron-pull). Genera
--      las filas pendientes de los cumpleanos de HOY en los salones que tengan el flag
--      notifCumpleanosActiva en negocio_config, y devuelve las pendientes para enviar.
--      Denormaliza nombre/telefono/idioma/descuento para que el motor no cruce tablas.
--   3) marcar_cumpleanos_enviado(ids): el motor marca 'enviado' tras el envio (idempotencia).
--
-- Plantilla Meta a dar de alta (Alexandro): `felicitacion_cumpleanos` con variables
--   {{1}} = nombre de la clienta, {{2}} = nombre del salon, {{3}} = descuento_pct
--   (si descuento_pct = 0, usar la variante sin oferta). Ejemplo de copy:
--   "Feliz cumpleanos, {{1}}! En {{2}} queremos celebrarlo contigo: {{3}}% de
--    descuento en tu proxima visita este mes. Te esperamos."
--
-- Config (negocio_config.config): notifCumpleanosActiva (bool, default false),
--   notifCumpleanosDescuentoPct (int 0-100, default 0).
-- Regla round 4: sin grant a anon; solo service_role (el motor) ejecuta.

create table if not exists public.cumpleanos_avisos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cliente_id uuid not null,
  anio integer not null,
  nombre text,
  telefono text,
  idioma text default 'es',
  descuento_pct integer not null default 0,
  template text not null default 'felicitacion_cumpleanos',
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (negocio_id, cliente_id, anio)
);

alter table public.cumpleanos_avisos enable row level security;
-- Outbox solo para el motor (service_role bypassa RLS): sin policies publicas, como
-- fuga_clientas_avisos / lista_espera_avisos. El staff ve los cumpleanos en la campana,
-- no necesita leer esta cola.

create index if not exists idx_cumpleanos_avisos_pendiente
  on public.cumpleanos_avisos (estado, anio) where estado = 'pendiente';

-- Pull diario del motor: genera pendientes de HOY y devuelve las que quedan por enviar.
create or replace function public.cumpleanos_para_felicitar(p_fecha date default current_date)
returns setof public.cumpleanos_avisos
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.cumpleanos_avisos (negocio_id, cliente_id, anio, nombre, telefono, idioma, descuento_pct)
  select c.negocio_id, c.id, extract(year from p_fecha)::int,
         c.nombre, c.telefono, coalesce(nullif(c.idioma, ''), 'es'),
         greatest(least(coalesce((nc.config->>'notifCumpleanosDescuentoPct')::int, 0), 100), 0)
  from public.clientes c
  join public.negocio_config nc on nc.negocio_id = c.negocio_id
  where c.fecha_nacimiento is not null
    and extract(month from c.fecha_nacimiento) = extract(month from p_fecha)
    and extract(day from c.fecha_nacimiento) = extract(day from p_fecha)
    and coalesce(c.bloqueado, false) = false
    and c.telefono is not null and c.telefono <> ''
    and coalesce((nc.config->>'notifCumpleanosActiva')::boolean, false) = true
  on conflict (negocio_id, cliente_id, anio) do nothing;

  return query
    select * from public.cumpleanos_avisos
    where estado = 'pendiente' and anio = extract(year from p_fecha)::int;
end;
$$;

create or replace function public.marcar_cumpleanos_enviado(p_ids uuid[])
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with u as (
    update public.cumpleanos_avisos set estado = 'enviado', sent_at = now()
    where id = any(p_ids) and estado = 'pendiente'
    returning 1
  )
  select coalesce(count(*), 0)::int from u;
$$;

revoke execute on function public.cumpleanos_para_felicitar(date) from public;
revoke execute on function public.marcar_cumpleanos_enviado(uuid[]) from public;
-- OJO: el default privilege global (round4b) concede execute a authenticated en las
-- funciones nuevas; como estas NO estan scoped al negocio del caller (security definer,
-- devuelven cumpleanos de TODOS los salones) hay que revocarlo explicitamente: son solo
-- del motor (service_role), un usuario autenticado no debe verlas.
revoke execute on function public.cumpleanos_para_felicitar(date) from authenticated;
revoke execute on function public.marcar_cumpleanos_enviado(uuid[]) from authenticated;
grant execute on function public.cumpleanos_para_felicitar(date) to service_role;
grant execute on function public.marcar_cumpleanos_enviado(uuid[]) to service_role;
