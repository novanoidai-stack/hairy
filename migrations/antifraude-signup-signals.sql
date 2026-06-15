-- =====================================================================
-- Mecha · Anti-fraude de referidos: senales de origen del alta
-- =====================================================================
-- Aplicada en prod (proyecto vtrggiogjrhqtwbhbgia) via MCP el 2026-06-15.
--
-- Para que crear multicuentas y farmear el descuento de referidos no sea
-- viable, registramos (una sola vez, server-side) la IP/dispositivo desde el
-- que se crea cada cuenta. El equipo puede ver racimos de cuentas que comparten
-- origen antes de aplicar descuentos. (El blindaje principal sigue siendo que
-- la recompensa solo cuenta a referidos que PAGAN + el gate humano de staff.)
-- =====================================================================

alter table public.profiles
  add column if not exists signup_ip text,
  add column if not exists signup_ua text,
  add column if not exists signup_fingerprint text;

-- Guard: ademas de las columnas de referido, congelar las senales de alta para
-- que el cliente no las pueda falsear con un update directo a su propio perfil.
create or replace function public.guard_referral_columns()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if current_setting('mecha.referral_ctx', true) = '1' then return new; end if;
  new.codigo_referido := old.codigo_referido;
  new.referido_por := old.referido_por;
  new.referido_en := old.referido_en;
  new.descuento_pct := old.descuento_pct;
  new.descuento_referido_aplicado := old.descuento_referido_aplicado;
  new.signup_ip := old.signup_ip;
  new.signup_ua := old.signup_ua;
  new.signup_fingerprint := old.signup_fingerprint;
  return new;
end; $$;

-- Registra la senal de origen UNA sola vez con la IP/UA que ve el servidor
-- (no lo que diga el cliente). Cubre alta por email y SSO (se llama tras auth).
create or replace function public.record_signup_signal(p_fingerprint text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_ip text; v_ua text; v_headers json;
begin
  if v_uid is null then return; end if;
  begin v_headers := current_setting('request.headers', true)::json; exception when others then v_headers := null; end;
  if v_headers is not null then
    v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1), '');
    v_ua := nullif(v_headers->>'user-agent', '');
  end if;
  perform set_config('mecha.referral_ctx','1', true);
  update public.profiles
    set signup_ip = coalesce(signup_ip, v_ip),
        signup_ua = coalesce(signup_ua, v_ua),
        signup_fingerprint = coalesce(signup_fingerprint, nullif(btrim(p_fingerprint), ''))
  where id = v_uid
    and (signup_ip is null or signup_ua is null or signup_fingerprint is null);
end; $$;

-- Staff: racimos de cuentas que comparten origen (posible multicuenta).
create or replace function public.staff_signup_clusters()
returns table(signal text, tipo text, cuentas int, negocios text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_staff() then return; end if;
  return query
    select p.signup_ip, 'ip'::text, count(*)::int,
           string_agg(coalesce(nullif(btrim(p.nombre_negocio),''),'(sin nombre)'), ', ')
    from public.profiles p where p.signup_ip is not null
    group by p.signup_ip having count(*) >= 2
    union all
    select p.signup_fingerprint, 'dispositivo'::text, count(*)::int,
           string_agg(coalesce(nullif(btrim(p.nombre_negocio),''),'(sin nombre)'), ', ')
    from public.profiles p where p.signup_fingerprint is not null
    group by p.signup_fingerprint having count(*) >= 2;
end; $$;

revoke all on function public.record_signup_signal(text) from public, anon;
revoke all on function public.staff_signup_clusters() from public, anon;
grant execute on function public.record_signup_signal(text) to authenticated;
grant execute on function public.staff_signup_clusters() to authenticated;

notify pgrst, 'reload schema';
