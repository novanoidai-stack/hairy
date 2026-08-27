-- S6 (BYOP Redsys): credenciales Redsys por salon. Aplicado al remoto via MCP como
-- `s6_pasarela_redsys` (+ `s6_redsys_entorno` para el flag test/prod). Clave secreta CIFRADA en
-- Vault ('redsys_key_<negocio>'); FUC + terminal + entorno en negocio_pasarela. proveedor='redsys'
-- enruta el checkout a Redsys. Accesor service_role-only. Firma: node-forge 3DES (relleno ceros)
-- + Web Crypto HMAC-SHA256 (node:crypto no soporta des-ede3-cbc en Deno). Verificado contra sandbox.

alter table public.negocio_pasarela
  add column if not exists redsys_fuc text,
  add column if not exists redsys_terminal text,
  add column if not exists redsys_test boolean not null default true;

create or replace function public.guardar_pasarela_redsys(
  p_fuc text, p_terminal text, p_secret_key text, p_test boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $function$
declare v_neg text; v_role text; v_name text; v_id uuid;
begin
  select negocio_id, role into v_neg, v_role from public.profiles where id = auth.uid();
  if v_neg is null or v_role not in ('owner','admin') then
    return jsonb_build_object('ok', false, 'error', 'no_autorizado');
  end if;
  if p_fuc is null or length(trim(p_fuc)) < 6 or p_secret_key is null or length(trim(p_secret_key)) < 10 then
    return jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  end if;

  v_name := 'redsys_key_' || v_neg;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is not null then
    perform vault.update_secret(v_id, p_secret_key, v_name, 'Redsys key de ' || v_neg);
  else
    perform vault.create_secret(p_secret_key, v_name, 'Redsys key de ' || v_neg);
  end if;

  insert into public.negocio_pasarela (negocio_id, proveedor, redsys_fuc, redsys_terminal, redsys_test, configurado, updated_at)
  values (v_neg, 'redsys', trim(p_fuc), coalesce(nullif(trim(p_terminal),''),'1'), coalesce(p_test,true), true, now())
  on conflict (negocio_id) do update set
    proveedor = 'redsys', redsys_fuc = trim(p_fuc),
    redsys_terminal = coalesce(nullif(trim(p_terminal),''),'1'), redsys_test = coalesce(p_test,true),
    configurado = true, updated_at = now();
  return jsonb_build_object('ok', true);
end $function$;
grant execute on function public.guardar_pasarela_redsys(text,text,text,boolean) to authenticated;

create or replace function public.pasarela_redsys_secret(p_negocio_id text)
returns text language plpgsql security definer set search_path = public as $function$
declare v_val text;
begin
  select decrypted_secret into v_val from vault.decrypted_secrets where name = 'redsys_key_' || p_negocio_id;
  return v_val;
end $function$;
revoke execute on function public.pasarela_redsys_secret(text) from anon, authenticated, public;
grant execute on function public.pasarela_redsys_secret(text) to service_role;

-- Ademas: guardar_pasarela_stripe ahora fija proveedor='stripe' tambien en el on-conflict (para
-- poder volver de redsys a stripe). Ver s5-pasarela-stripe-por-negocio.sql (re-aplicado).
