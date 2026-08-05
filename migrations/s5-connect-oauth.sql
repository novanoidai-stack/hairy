-- migrations/s5-connect-oauth.sql
-- S5 revisado (spec docs/superpowers/specs/2026-08-05-s5-connect-oauth-design.md): migrar de
-- BYO-key (el salon pega su sk_live) a Stripe Connect Standard (OAuth). Fase 0 = modelo de datos.
--
-- El salon conecta su cuenta por OAuth y solo guardamos su stripe_account_id (acct_..., NO secreto);
-- los cobros se crean en su cuenta via `new Stripe(PLATFORM_KEY, {stripeAccount: acct_id})`.
-- ADITIVA y NO-breaking: convive con el BYO-key (Vault sk) hasta el corte (Fase 3).

alter table public.negocio_pasarela
  add column if not exists stripe_account_id text,
  add column if not exists stripe_conectado_at timestamptz;

-- Accesor del account_id (no es secreto; lo usa el helper de los edges y el front por cortesia).
create or replace function public.pasarela_stripe_account(p_negocio_id text)
returns text
language sql stable security definer set search_path = public
as $$ select stripe_account_id from public.negocio_pasarela where negocio_id = p_negocio_id $$;
revoke all on function public.pasarela_stripe_account(text) from public, anon;
grant execute on function public.pasarela_stripe_account(text) to authenticated, service_role;

-- Guardar la conexion tras el intercambio de code (lo llama la edge stripe-connect-oauth,
-- que ya valido el `state` firmado con el negocio). service_role only.
create or replace function public.guardar_conexion_stripe(p_negocio_id text, p_account_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if p_negocio_id is null or coalesce(length(trim(p_account_id)), 0) < 5
     or p_account_id not like 'acct_%' then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  insert into public.negocio_pasarela (negocio_id, proveedor, stripe_account_id, configurado, stripe_conectado_at, updated_at)
  values (p_negocio_id, 'stripe', trim(p_account_id), true, now(), now())
  on conflict (negocio_id) do update set
    proveedor = 'stripe',
    stripe_account_id = excluded.stripe_account_id,
    configurado = true,
    stripe_conectado_at = now(),
    updated_at = now();

  return jsonb_build_object('ok', true, 'account_id', trim(p_account_id));
end $$;
revoke all on function public.guardar_conexion_stripe(text, text) from public, anon, authenticated;
grant execute on function public.guardar_conexion_stripe(text, text) to service_role;

-- Desconectar: boton del salon (owner/admin, su negocio) o webhook account.application.deauthorized
-- (service_role, sin auth.uid()). No borra la fila (Redsys puede convivir); limpia lo de Stripe.
create or replace function public.desconectar_stripe(p_negocio_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_neg text; v_role text;
begin
  if auth.uid() is not null then
    select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
    if v_neg is null or v_neg <> p_negocio_id or v_role not in ('owner','admin') then
      return jsonb_build_object('ok', false, 'error', 'no_autorizado');
    end if;
  end if;

  update public.negocio_pasarela set
    stripe_account_id = null,
    stripe_conectado_at = null,
    configurado = false,
    updated_at = now()
  where negocio_id = p_negocio_id;

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.desconectar_stripe(text) from public, anon;
grant execute on function public.desconectar_stripe(text) to authenticated, service_role;
