-- S5 (mono-cuenta por salon): cada negocio cobra en SU cuenta Stripe. Aplicado al remoto via MCP
-- como `s5_pasarela_stripe_por_negocio`. La secret key y el webhook secret se guardan CIFRADOS en
-- Supabase Vault (nombres 'stripe_sk_<negocio>' / 'stripe_whsec_<negocio>'). La publishable key (no
-- secreta) y el flag 'configurado' viven en negocio_pasarela. Las edges leen la clave via accesores
-- service_role-only; si el negocio no la tiene, hacen fallback a la clave de plataforma (STRIPE_SECRET_KEY).

create table if not exists public.negocio_pasarela (
  negocio_id text primary key,
  proveedor text not null default 'stripe',
  publishable_key text,
  configurado boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.negocio_pasarela enable row level security;
drop policy if exists "negocio ve su pasarela" on public.negocio_pasarela;
create policy "negocio ve su pasarela" on public.negocio_pasarela
  for select using (negocio_id = public.my_negocio_id_text());

-- El owner guarda sus claves Stripe. Las secretas van a Vault; la publishable a la tabla.
create or replace function public.guardar_pasarela_stripe(
  p_secret_key text, p_webhook_secret text default null, p_publishable_key text default null
) returns jsonb language plpgsql security definer set search_path = public
as $function$
declare
  v_neg text; v_role text; v_sk_name text; v_wh_name text; v_id uuid;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if p_secret_key is null or length(trim(p_secret_key)) < 10 then
    return jsonb_build_object('ok', false, 'error', 'clave_invalida');
  end if;

  v_sk_name := 'stripe_sk_' || v_neg;
  v_wh_name := 'stripe_whsec_' || v_neg;

  select id into v_id from vault.secrets where name = v_sk_name;
  if v_id is not null then
    perform vault.update_secret(v_id, p_secret_key, v_sk_name, 'Stripe secret key de ' || v_neg);
  else
    perform vault.create_secret(p_secret_key, v_sk_name, 'Stripe secret key de ' || v_neg);
  end if;

  if p_webhook_secret is not null and length(trim(p_webhook_secret)) > 5 then
    select id into v_id from vault.secrets where name = v_wh_name;
    if v_id is not null then
      perform vault.update_secret(v_id, p_webhook_secret, v_wh_name, 'Stripe webhook secret de ' || v_neg);
    else
      perform vault.create_secret(p_webhook_secret, v_wh_name, 'Stripe webhook secret de ' || v_neg);
    end if;
  end if;

  insert into public.negocio_pasarela (negocio_id, proveedor, publishable_key, configurado, updated_at)
  values (v_neg, 'stripe', p_publishable_key, true, now())
  on conflict (negocio_id) do update set
    publishable_key = coalesce(excluded.publishable_key, public.negocio_pasarela.publishable_key),
    configurado = true, updated_at = now();

  return jsonb_build_object('ok', true);
end $function$;
grant execute on function public.guardar_pasarela_stripe(text,text,text) to authenticated;

-- Accesores para las edges (service_role). Leen la clave descifrada de Vault; null si no hay.
create or replace function public.pasarela_stripe_secret(p_negocio_id text)
returns text language plpgsql security definer set search_path = public as $function$
declare v_val text;
begin
  select decrypted_secret into v_val from vault.decrypted_secrets where name = 'stripe_sk_' || p_negocio_id;
  return v_val;
end $function$;

create or replace function public.pasarela_stripe_webhook_secret(p_negocio_id text)
returns text language plpgsql security definer set search_path = public as $function$
declare v_val text;
begin
  select decrypted_secret into v_val from vault.decrypted_secrets where name = 'stripe_whsec_' || p_negocio_id;
  return v_val;
end $function$;

revoke execute on function public.pasarela_stripe_secret(text) from anon, authenticated, public;
revoke execute on function public.pasarela_stripe_webhook_secret(text) from anon, authenticated, public;
grant execute on function public.pasarela_stripe_secret(text) to service_role;
grant execute on function public.pasarela_stripe_webhook_secret(text) to service_role;
