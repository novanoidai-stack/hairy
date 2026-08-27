-- P0-006 · Avisos de fin de prueba (aplicada en remoto via MCP el 10-ago-2026).
--
-- Un cron diario (mecha_avisos_prueba, 03:00 UTC, 20 min ANTES de
-- mecha_caducar_pruebas) dispara la edge avisar-fin-prueba, que manda un email al
-- owner en 4 momentos (dia ~7/21/28/30). A quien/que etapa lo decide
-- avisos_prueba_pendientes, con idempotencia por (profile_id, etapa).

create table if not exists public.avisos_prueba (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  etapa smallint not null,
  enviado_at timestamptz not null default now(),
  primary key (profile_id, etapa)
);
alter table public.avisos_prueba enable row level security;
-- Sin politicas a proposito: nadie del cliente la toca; service_role salta RLS.

-- Hitos por dias restantes: etapa1 (dia ~7) restantes<=23, etapa2 (dia ~21) <=9,
-- etapa3 (dia ~28) <=2, etapa4 (dia 30) <=0. Devuelve la etapa MAS urgente a
-- enviar y TODAS las alcanzadas a marcar (para no soltar avisos atrasados si el
-- cron se salto un dia).
create or replace function public.avisos_prueba_pendientes()
returns table(profile_id uuid, email text, nombre_negocio text, etapa smallint, etapas_marcar smallint[], dias_restantes int)
language sql
security definer
set search_path to 'public'
as $fn$
  with milestones(etapa, umbral) as (
    values (1::smallint, 23), (2::smallint, 9), (3::smallint, 2), (4::smallint, 0)
  ),
  owners as (
    select p.id, p.email, p.nombre_negocio,
           (p.trial_ends_at::date - current_date) as restantes
      from public.profiles p
     where p.role = 'owner'
       and p.suscripcion_estado = 'prueba'
       and p.trial_ends_at is not null
       and coalesce(p.negocio_id, '') <> 'demo_salon_001'
       and coalesce(p.email, '') <> ''
  ),
  reached as (
    select o.id, o.email, o.nombre_negocio, o.restantes, m.etapa, m.umbral
      from owners o
      join milestones m on o.restantes <= m.umbral
     where not exists (
       select 1 from public.avisos_prueba a
        where a.profile_id = o.id and a.etapa = m.etapa
     )
  )
  select r.id,
         r.email,
         r.nombre_negocio,
         (array_agg(r.etapa order by r.umbral asc))[1] as etapa,
         array_agg(r.etapa order by r.etapa)           as etapas_marcar,
         min(r.restantes)                              as dias_restantes
    from reached r
   group by r.id, r.email, r.nombre_negocio;
$fn$;

revoke execute on function public.avisos_prueba_pendientes() from public, anon, authenticated;
grant execute on function public.avisos_prueba_pendientes() to service_role;

select cron.schedule(
  'mecha_avisos_prueba',
  '0 3 * * *',
  $CRON$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/avisar-fin-prueba',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $CRON$
);
