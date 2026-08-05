-- Rate limit compartido para las edge functions que puede llamar cualquiera.
--
-- Ya habia dos, cada uno por su cuenta: rate_limit_reset (recuperar contrasena,
-- 3/hora por email) y landing_chat_hits (chat de la landing, 15/hora por IP).
-- Faltaba en las dos puertas mas abiertas del sistema:
--
--   - notificar-solicitud: manda un correo de confirmacion a la direccion que
--     le pases. Sin freno, sirve para llenarle el buzon a quien quieras usando
--     nuestro dominio (y quemando nuestra reputacion de envio).
--   - signup-free: crea cuentas YA confirmadas (sin verificar el buzon). Sin
--     freno, se pueden crear cuentas en bucle.
--
-- En vez de una tabla por caso, una sola con un campo `cubo` que dice de que
-- limite hablamos. La funcion la llama la edge con la service_role: ni anon ni
-- authenticated pueden ejecutarla, y la tabla no tiene politicas RLS a proposito.

create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  cubo      text not null,   -- 'solicitud_ip', 'solicitud_email', 'signup_ip'...
  clave     text not null,   -- la IP, el email... lo que se limita
  creado_en timestamptz not null default now()
);

create index if not exists rate_limit_hits_cubo_clave_ts
  on public.rate_limit_hits (cubo, clave, creado_en desc);

alter table public.rate_limit_hits enable row level security;
-- Sin politicas a proposito: solo service_role (las edges) lee y escribe.

-- Devuelve true si se puede seguir (y apunta el intento), false si toca esperar.
create or replace function public.check_rate_limit(
  p_cubo    text,
  p_clave   text,
  p_max     int,
  p_minutos int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_clave is null or btrim(p_clave) = '' then
    return true; -- sin clave no hay a quien limitar; no bloqueamos por eso
  end if;

  -- Higiene: la tabla no debe crecer. Fuera lo de mas de 24h.
  delete from public.rate_limit_hits where creado_en < now() - interval '24 hours';

  select count(*) into v_count
    from public.rate_limit_hits
   where cubo = p_cubo
     and clave = p_clave
     and creado_en > now() - make_interval(mins => p_minutos);

  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_hits (cubo, clave) values (p_cubo, btrim(p_clave));
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, text, int, int) from public;
revoke execute on function public.check_rate_limit(text, text, int, int) from anon;
revoke execute on function public.check_rate_limit(text, text, int, int) from authenticated;

notify pgrst, 'reload schema';
