-- P1-020 (captcha, base) — aplicada en remoto via MCP el 10-ago-2026.
--
-- Cierra el agujero de que el captcha era 100% de navegador (saltable llamando al
-- RPC directo). Tokens emitidos por el servidor y de un solo uso: la edge
-- validate-captcha verifica el captcha con el proveedor (Turnstile) y crea un
-- token; los RPCs publicos lo CONSUMEN. Esta migracion es la base reutilizable;
-- la reescritura de validate-captcha, el cableado del frontend y la exigencia en
-- los RPCs se activan cuando haya proveedor configurado (claves de Turnstile).
--
-- Nota P1-020 (rate-limit): crear_solicitud_publica (5/IP/dia + 5/email/dia) y
-- crear_resena_publica (3/IP/salon/dia + 30/salon/dia) YA tienen rate-limit por IP
-- solido; crear_cita_publica tiene 3/telefono + 30/hora/salon. No hacia falta
-- reescribirlos.
create table if not exists public.captcha_tokens (
  id uuid primary key default gen_random_uuid(),
  contexto text not null default 'general',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);
alter table public.captcha_tokens enable row level security;
-- Sin politicas: la edge inserta con service_role (salta RLS) y el consumo va por
-- la RPC security-definer de abajo. Nadie del cliente la toca directamente.

create or replace function public.consumir_captcha_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id uuid; v_ok boolean := false;
begin
  if p_token is null or btrim(p_token) = '' then return false; end if;
  begin
    v_id := p_token::uuid;
  exception when others then
    return false;
  end;
  update public.captcha_tokens
     set used_at = now()
   where id = v_id and used_at is null and expires_at > now()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$fn$;
revoke execute on function public.consumir_captcha_token(text) from public, anon, authenticated;
grant  execute on function public.consumir_captcha_token(text) to service_role;
