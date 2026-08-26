-- Ojos continuos sobre la agenda (Fase 4 del organizador, ago-2026).
--
-- vigilar-agenda barre cada 15 min por pg_cron; esto añade la reaccion
-- INMEDIATA: un trigger en cada movimiento de agenda (cita creada/movida/
-- cancelada, bloqueo, horario, cierre) llama al edge agenda-optimizador en
-- modo 'ojo' (motor determinista + hallazgos, SIN tokens de LLM).
--
-- Debounce de 60 s por negocio: un drag & drop o una edicion multiple no debe
-- disparar 10 llamadas; con la marca en agenda_ojos_latido solo pasa una.
--
-- Idempotente: todo IF NOT EXISTS / create or replace. La service_role key
-- sale del vault (mismo patron que cron-vigilar-agenda.sql).

begin;

-- Estado del debounce: ultima vez que se aviso a cada negocio.
create table if not exists public.agenda_ojos_latido (
  negocio_id text primary key,
  ultimo_aviso timestamptz not null default now()
);
comment on table public.agenda_ojos_latido is
  'Debounce de los triggers de ojos continuos: un aviso por negocio y minuto. Lo escribe agenda_ojos_notify().';

-- RLS: tabla interna, solo servicio. El trigger corre como postgres (dueño).
alter table public.agenda_ojos_latido enable row level security;
revoke all on public.agenda_ojos_latido from anon, authenticated;

create or replace function public.agenda_ojos_notify() returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_negocio text;
  v_ultimo timestamptz;
begin
  -- Todas las tablas vigiladas tienen negocio_id (lo usa vigilar-agenda).
  v_negocio := coalesce(new.negocio_id, old.negocio_id);

  if v_negocio is null or v_negocio = 'demo_salon_001' then
    return coalesce(new, old);
  end if;

  -- Debounce: max. un aviso por negocio y minuto. El update de la marca NO
  -- dispara triggers (ninguna tabla afectada la escucha).
  select ultimo_aviso into v_ultimo
    from public.agenda_ojos_latido
   where negocio_id = v_negocio;
  if v_ultimo is not null and v_ultimo > now() - interval '60 seconds' then
    return coalesce(new, old);
  end if;

  insert into public.agenda_ojos_latido (negocio_id, ultimo_aviso)
  values (v_negocio, now())
  on conflict (negocio_id) do update set ultimo_aviso = now();

  perform net.http_post(
    url := 'https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/agenda-optimizador',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := jsonb_build_object('ojo', true, 'negocio_id', v_negocio)
  );

  return coalesce(new, old);
end;
$$;
comment on function public.agenda_ojos_notify() is
  'Ojos continuos: en cada cambio de agenda avisa al edge agenda-optimizador (modo ojo, determinista) con debounce de 60 s por negocio.';

-- Triggers: AFTER (el estado ya escrito es el que debe analizarse) y por
-- statement cuando la tabla no expone negocio_id por fila seria util... pero
-- net.http_post por fila seria una llamada por cita en migraciones masivas,
-- asi que en citas se dispara por fila y el debounce absorbe el rafagazo.
drop trigger if exists trg_ojos_citas on public.citas;
create trigger trg_ojos_citas
  after insert or update of inicio, fin, fin_activa, fin_espera, estado, profesional_id or delete
  on public.citas
  for each row execute function public.agenda_ojos_notify();

drop trigger if exists trg_ojos_bloqueos on public.bloqueos_profesional;
create trigger trg_ojos_bloqueos
  after insert or update or delete
  on public.bloqueos_profesional
  for each row execute function public.agenda_ojos_notify();

drop trigger if exists trg_ojos_horarios_prof on public.horarios_profesional;
create trigger trg_ojos_horarios_prof
  after insert or update or delete
  on public.horarios_profesional
  for each row execute function public.agenda_ojos_notify();

drop trigger if exists trg_ojos_cierres on public.cierres_negocio;
create trigger trg_ojos_cierres
  after insert or update or delete
  on public.cierres_negocio
  for each row execute function public.agenda_ojos_notify();

commit;
