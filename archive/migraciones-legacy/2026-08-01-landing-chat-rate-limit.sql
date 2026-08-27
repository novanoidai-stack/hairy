-- Rate limit del chat comercial de la landing (edge chispa-landing).
-- La edge llamaba a check_landing_rate_limit pero la funcion NUNCA existio en la
-- BD: el error se logueaba y el limite quedaba silenciosamente desactivado.
-- 15 mensajes por hora y por IP; los hits se purgan a las 24h.
-- Seguridad (round 4): la funcion NO es ejecutable por anon/authenticated; solo
-- la edge (service_role) la invoca. La tabla queda con RLS y sin politicas.

create table if not exists public.landing_chat_hits (
  id bigint generated always as identity primary key,
  ip text not null,
  creado_en timestamptz not null default now()
);

create index if not exists landing_chat_hits_ip_ts
  on public.landing_chat_hits (ip, creado_en desc);

alter table public.landing_chat_hits enable row level security;
-- Sin politicas a proposito: solo service_role (la edge) lee y escribe.

create or replace function public.check_landing_rate_limit(p_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Higiene: fuera hits de mas de 24h (tabla siempre pequena).
  delete from public.landing_chat_hits where creado_en < now() - interval '24 hours';

  select count(*) into v_count
    from public.landing_chat_hits
   where ip = p_ip
     and creado_en > now() - interval '1 hour';

  if v_count >= 15 then
    return false;
  end if;

  insert into public.landing_chat_hits (ip) values (p_ip);
  return true;
end;
$$;

revoke execute on function public.check_landing_rate_limit(text) from public;
revoke execute on function public.check_landing_rate_limit(text) from anon;
revoke execute on function public.check_landing_rate_limit(text) from authenticated;
