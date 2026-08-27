-- Envio automatico del informe de Mecha al propietario del salon: PDF semanal
-- (todos los lunes, con la semana ISO que acaba de cerrar) y PDF mensual (dia 1,
-- con el mes que acaba de cerrar). Mismo patron que p0-006 avisos-fin-prueba:
-- cron -> edge function con la service_role key como Bearer (la puerta), RPCs de
-- solo lectura para "a quien" y "que rango de fechas", y una tabla de log para no
-- duplicar el envio si el cron dispara dos veces el mismo periodo.

create table if not exists public.informes_periodicos_enviados (
  id bigint generated always as identity primary key,
  negocio_id text not null,
  tipo text not null check (tipo in ('semanal', 'mensual')),
  periodo_desde date not null,
  enviado_at timestamptz not null default now(),
  unique (negocio_id, tipo, periodo_desde)
);
alter table public.informes_periodicos_enviados enable row level security;
-- Sin politicas a proposito: nadie del cliente la toca; service_role salta RLS.

-- Rango del periodo YA CERRADO (semana o mes anterior completos), calculado en
-- hora de Espana: el cron corre en UTC pero el negocio piensa en local, y el
-- corte de "lunes" o "dia 1" tiene que coincidir con lo que ve en pantalla.
create or replace function public.informe_rango_periodo(p_tipo text)
returns table(desde timestamptz, hasta timestamptz)
language sql
stable
set search_path to 'public'
as $fn$
  select
    case when p_tipo = 'semanal'
      then date_trunc('week', (now() at time zone 'Europe/Madrid') - interval '7 days') at time zone 'Europe/Madrid'
      else date_trunc('month', (now() at time zone 'Europe/Madrid') - interval '1 month') at time zone 'Europe/Madrid'
    end as desde,
    case when p_tipo = 'semanal'
      then (date_trunc('week', (now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid') - interval '1 second'
      else (date_trunc('month', (now() at time zone 'Europe/Madrid')) at time zone 'Europe/Madrid') - interval '1 second'
    end as hasta;
$fn$;

revoke execute on function public.informe_rango_periodo(text) from public, anon, authenticated;
grant execute on function public.informe_rango_periodo(text) to service_role;

-- Propietarios que deben recibir el informe: fuera la demo, fuera quien ya
-- cancelo. No filtramos por estado de prueba/pago porque un salon en prueba
-- tambien quiere ver su actividad.
create or replace function public.informe_periodico_destinatarios()
returns table(profile_id uuid, negocio_id text, email text, nombre_negocio text)
language sql
security definer
set search_path to 'public'
as $fn$
  select p.id, p.negocio_id, p.email, p.nombre_negocio
    from public.profiles p
   where p.role = 'owner'
     and coalesce(p.negocio_id, '') <> 'demo_salon_001'
     and coalesce(p.email, '') <> ''
     and (p.suscripcion_estado is null or p.suscripcion_estado <> 'cancelada');
$fn$;

revoke execute on function public.informe_periodico_destinatarios() from public, anon, authenticated;
grant execute on function public.informe_periodico_destinatarios() to service_role;

select cron.schedule(
  'mecha_informe_semanal',
  '0 6 * * 1',
  $CRON$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/enviar-informe-periodico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"semanal"}'::jsonb
  );
  $CRON$
);

select cron.schedule(
  'mecha_informe_mensual',
  '30 6 1 * *',
  $CRON$
  select net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/enviar-informe-periodico',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"tipo":"mensual"}'::jsonb
  );
  $CRON$
);
