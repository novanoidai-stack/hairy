-- migrations/endurecer-pasarela-senal.sql
-- Paso 1 endurecimiento de pagos (spec 2026-06-30): tokens opacos para el enlace de senal
-- + idempotencia del webhook Stripe. ADITIVA; segura de aplicar antes que edge/front/n8n.

-- 1) Tabla de tokens opacos (token -> cita). Sellada: RLS on, sin politicas para anon/auth.
create table if not exists public.cita_pago_enlaces (
  token text primary key,
  cita_id uuid not null references public.citas(id) on delete cascade,
  negocio_id text not null,
  created_at timestamptz not null default now(),
  expira_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists idx_cita_pago_enlaces_cita on public.cita_pago_enlaces(cita_id);
alter table public.cita_pago_enlaces enable row level security;
-- sin policies a proposito: solo service_role y funciones security definer la tocan.

-- 2) Bitacora de idempotencia del webhook Stripe.
create table if not exists public.stripe_webhook_eventos (
  event_id text primary key,
  tipo text,
  recibido_at timestamptz not null default now()
);
alter table public.stripe_webhook_eventos enable row level security;

-- 3) cobros.idempotency_key ya existe como columna; blindar con indice unico parcial.
create unique index if not exists uq_cobros_idempotency_key
  on public.cobros(idempotency_key) where idempotency_key is not null;

-- 4) Get-or-create del token vivo de una cita. VOLATILE (inserta).
-- Token = 2x gen_random_uuid() sin guiones (64 hex, ~244 bits). Se usa gen_random_uuid
-- (core, pg_catalog) en vez de gen_random_bytes (pgcrypto, schema extensions) para que
-- resuelva con search_path=public.
create or replace function public.enlace_pago_token(p_cita_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
  v_negocio text;
begin
  select token into v_token
    from public.cita_pago_enlaces
    where cita_id = p_cita_id and expira_at > now()
    order by created_at desc
    limit 1;
  if v_token is not null then
    return v_token;
  end if;

  select negocio_id into v_negocio from public.citas where id = p_cita_id;
  if v_negocio is null then
    raise exception 'cita_not_found';
  end if;

  insert into public.cita_pago_enlaces (token, cita_id, negocio_id)
  values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), p_cita_id, v_negocio)
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.enlace_pago_token(uuid) from public, anon, authenticated;
grant execute on function public.enlace_pago_token(uuid) to service_role;

-- 5) Resolver token -> cita_id (solo lectura). NULL si no existe o caducado.
create or replace function public.resolver_enlace_pago(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cita_id from public.cita_pago_enlaces
  where token = p_token and expira_at > now()
  limit 1;
$$;
revoke all on function public.resolver_enlace_pago(text) from public, anon, authenticated;
grant execute on function public.resolver_enlace_pago(text) to service_role;

-- 6) Trigger: al marcar una cita como que requiere senal (y no pagada), acuna el token.
create or replace function public.tg_acunar_enlace_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.deposito_requerido is true and coalesce(NEW.deposito_pagado, false) = false then
    perform public.enlace_pago_token(NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists citas_acunar_enlace_pago on public.citas;
create trigger citas_acunar_enlace_pago
  after insert or update of deposito_requerido on public.citas
  for each row execute function public.tg_acunar_enlace_pago();
