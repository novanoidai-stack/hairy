-- =====================================================================
-- Mecha · Red de referidos multinivel (arbol genealogico) — SEGURA
-- =====================================================================
-- Sustituye a `referidos-y-recomendaciones.sql` (NUNCA se aplico y, ademas,
-- referenciaba columnas inexistentes: business_name/plan_type/metrics y una
-- funcion is_admin() que no existe). Esta version esta hecha contra el schema
-- REAL de profiles (id, negocio_id, email, nombre, nombre_negocio, plan, ...).
--
-- Modelo:
--   * Cada salon (profile) tiene un `codigo_referido` opaco y unico.
--   * Quien se da de alta con ?ref=CODIGO queda enganchado a su padre via
--     `referido_por` (uuid -> profiles.id). Se forma un ARBOL.
--   * Recompensa MULTINIVEL y DECRECIENTE, atada a referidos que PAGAN (plan
--     'full'), no a meros registros (evita el farming de altas gratis):
--       Nivel 1 (directo)      -> +10 puntos de descuento por cada uno que paga
--       Nivel 2                -> +4
--       Nivel 3                -> +2
--       Nivel 4+               -> 0 (se corta la profundidad para acotar margen)
--     + Bono de bienvenida: si te uniste con un codigo, +15 (incentivo a entrar).
--     * TOPE GLOBAL por salon: descuento total acotado a 40 (protege el margen;
--       un descuento compuesto sin tope arruinaria la unit-economics).
--   * `descuento_pct` = descuento GANADO/ELEGIBLE (lo calcula el motor).
--     `descuento_referido_aplicado` = lo activa el equipo/Alexandro en la
--     facturacion (Stripe). El motor NO mueve dinero: solo calcula elegibilidad.
--
-- Seguridad:
--   * Nada de politicas USING(true) de escritura (la version vieja filtraba
--     todos los emails al rol anon: aqui NO existe esa tabla).
--   * No se abre SELECT de profiles entre tenants: el arbol se sirve por RPCs
--     `security definer` con datos minimos (sin emails de terceros).
--   * Las columnas sensibles (codigo, referido_por, descuento) NO las puede
--     tocar el cliente: un trigger las congela salvo en contexto interno.
--   * Anti-ciclo y anti-autoreferencia al enganchar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Columnas de referido en profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists codigo_referido text,
  add column if not exists referido_por uuid references public.profiles(id) on delete set null,
  add column if not exists referido_en timestamptz,
  add column if not exists descuento_pct numeric(5,2) not null default 0,
  add column if not exists descuento_referido_aplicado boolean not null default false;

-- ---------------------------------------------------------------------
-- 2) Generador de codigo opaco unico (alfabeto sin 0/O/1/I/L ambiguos)
-- ---------------------------------------------------------------------
create or replace function public.gen_referral_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code  text;
  v_i     int;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    -- Reintenta si ya existe (colision improbable: 31^7 ~ 27.5 mil millones)
    exit when not exists (select 1 from public.profiles where codigo_referido = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Backfill: un codigo para cada profile existente (antes del guard)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from public.profiles where codigo_referido is null loop
    update public.profiles set codigo_referido = public.gen_referral_code() where id = r.id;
  end loop;
end $$;

create unique index if not exists profiles_codigo_referido_key
  on public.profiles (codigo_referido) where codigo_referido is not null;

-- ---------------------------------------------------------------------
-- 4) BEFORE INSERT: asigna codigo a cada profile nuevo (cualquier via)
-- ---------------------------------------------------------------------
create or replace function public.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.codigo_referido is null then
    new.codigo_referido := public.gen_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_referral_code on public.profiles;
create trigger trg_set_referral_code
  before insert on public.profiles
  for each row execute function public.set_referral_code();

-- ---------------------------------------------------------------------
-- 5) Helpers de arbol: descendientes (downline) y ascendientes (upline)
--    No se conceden a clientes (solo se usan dentro de RPCs definer).
-- ---------------------------------------------------------------------
create or replace function public.referral_downline(p_root uuid, p_max_depth int default 3)
returns table(id uuid, nivel int)
language sql
stable
security definer
set search_path to 'public'
as $$
  with recursive dl as (
    select p.id, 1 as nivel
    from public.profiles p
    where p.referido_por = p_root
    union all
    select p.id, dl.nivel + 1
    from public.profiles p
    join dl on p.referido_por = dl.id
    where dl.nivel < p_max_depth
  )
  select id, nivel from dl;
$$;

create or replace function public.referral_upline(p_node uuid, p_max_depth int default 3)
returns table(id uuid, nivel int)
language sql
stable
security definer
set search_path to 'public'
as $$
  with recursive ul as (
    select p.referido_por as id, 1 as nivel
    from public.profiles p
    where p.id = p_node and p.referido_por is not null
    union all
    select p.referido_por, ul.nivel + 1
    from public.profiles p
    join ul on p.id = ul.id
    where p.referido_por is not null and ul.nivel < p_max_depth
  )
  select id, nivel from ul where id is not null;
$$;

-- ---------------------------------------------------------------------
-- 6) Motor de recompensa: recalcula el descuento elegible de un salon
--    descuento = min(TOPE, bienvenida + sum(recompensa por descendiente que paga))
-- ---------------------------------------------------------------------
create or replace function public.recompute_referral_discount(p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_earned   numeric := 0;
  v_welcome  numeric := 0;
  v_pct      numeric := 0;
  v_referido uuid;
begin
  if p_profile is null then return; end if;

  -- Ganado por la red (3 niveles, solo descendientes que PAGAN plan 'full')
  select coalesce(sum(case d.nivel when 1 then 10 when 2 then 4 when 3 then 2 else 0 end), 0)
    into v_earned
  from public.referral_downline(p_profile, 3) d
  join public.profiles pr on pr.id = d.id
  where pr.plan = 'full';

  -- Bono de bienvenida por haberse unido con un codigo
  select referido_por into v_referido from public.profiles where id = p_profile;
  if v_referido is not null then v_welcome := 15; end if;

  v_pct := least(40, v_earned + v_welcome);

  -- Contexto interno: autoriza tocar columnas sensibles en el guard
  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles set descuento_pct = v_pct where id = p_profile;
end;
$$;

-- Recalcula el salon afectado y a toda su cadena de ascendientes (3 niveles)
create or replace function public.recompute_referral_chain(p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare a record;
begin
  perform public.recompute_referral_discount(p_profile);
  for a in select id from public.referral_upline(p_profile, 3) loop
    perform public.recompute_referral_discount(a.id);
  end loop;
end;
$$;

-- Trigger: cuando un salon empieza/deja de pagar o cambia de padre, recalcula.
create or replace function public.on_profile_referral_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.recompute_referral_chain(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profile_referral_event on public.profiles;
create trigger trg_profile_referral_event
  after insert or update of plan, referido_por on public.profiles
  for each row execute function public.on_profile_referral_event();

-- ---------------------------------------------------------------------
-- 7) Recalculo inicial de toda la base (antes del guard)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.recompute_referral_discount(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) Guard: el cliente NO puede tocar columnas sensibles de referido.
--    Solo el contexto interno (set_config mecha.referral_ctx='1') puede.
--    Se crea AL FINAL para no estorbar al backfill/recalculo de arriba.
-- ---------------------------------------------------------------------
create or replace function public.guard_referral_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if current_setting('mecha.referral_ctx', true) = '1' then
    return new; -- cambio interno autorizado (motor / claim / staff)
  end if;
  -- Cliente normal: congela las columnas sensibles a su valor anterior
  new.codigo_referido               := old.codigo_referido;
  new.referido_por                  := old.referido_por;
  new.referido_en                   := old.referido_en;
  new.descuento_pct                 := old.descuento_pct;
  new.descuento_referido_aplicado   := old.descuento_referido_aplicado;
  return new;
end;
$$;

drop trigger if exists trg_guard_referral_columns on public.profiles;
create trigger trg_guard_referral_columns
  before update on public.profiles
  for each row execute function public.guard_referral_columns();

-- ---------------------------------------------------------------------
-- 9) handle_new_user: ademas de crear el profile, engancha el referido
--    si el alta trae ?ref=CODIGO en la metadata ('ref').
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ref_code text := nullif(btrim(upper(new.raw_user_meta_data->>'ref')), '');
  v_ref_id   uuid;
begin
  if v_ref_code is not null then
    select id into v_ref_id from public.profiles where codigo_referido = v_ref_code limit 1;
  end if;

  insert into public.profiles (id, email, nombre, nombre_negocio, negocio_id, phone, role, plan, referido_por, referido_en)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nombre'), ''),
      nullif(btrim(new.raw_user_meta_data->>'name'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
      'Usuario'
    ),
    nullif(btrim(new.raw_user_meta_data->>'salon'), ''),
    'demo_salon_001',
    nullif(btrim(new.raw_user_meta_data->>'telefono'), ''),
    'owner',
    'free',
    -- no permitir autoreferencia (mismo id)
    case when v_ref_id is not null and v_ref_id <> new.id then v_ref_id else null end,
    case when v_ref_id is not null and v_ref_id <> new.id then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 10) RPC claim_referral: engancha al referido tras el alta (cubre Google
--     OAuth y el alta por edge function). Idempotente y validado.
-- ---------------------------------------------------------------------
create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_code text := nullif(btrim(upper(p_code)), '');
  v_ref  uuid;
  v_cur  uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'no_auth'); end if;
  if v_code is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;

  select referido_por into v_cur from public.profiles where id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_profile'); end if;
  if v_cur is not null then return jsonb_build_object('ok', false, 'reason', 'already_referred'); end if;

  select id into v_ref from public.profiles where codigo_referido = v_code limit 1;
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_ref = v_uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- Anti-ciclo: el referente no puede colgar de mi propia downline
  if exists (select 1 from public.referral_downline(v_uid, 50) d where d.id = v_ref) then
    return jsonb_build_object('ok', false, 'reason', 'cycle');
  end if;

  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles set referido_por = v_ref, referido_en = now() where id = v_uid;
  -- el trigger trg_profile_referral_event recalcula descuentos
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 11) RPC get_my_referrals: arbol propio (3 niveles), datos minimos, sin
--     emails de terceros. Para el panel de progreso de referidos.
-- ---------------------------------------------------------------------
create or replace function public.get_my_referrals()
returns table(nivel int, nombre_negocio text, created_at timestamptz, plan text, paga boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    d.nivel,
    coalesce(nullif(btrim(p.nombre_negocio), ''), 'Salon nuevo')::text,
    p.created_at,
    coalesce(p.plan, 'free')::text,
    (p.plan = 'full')
  from public.referral_downline(auth.uid(), 3) d
  join public.profiles p on p.id = d.id
  order by d.nivel asc, p.created_at desc;
$$;

-- Resumen agregado para la cabecera del panel
create or replace function public.get_my_referral_stats()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'codigo',              p.codigo_referido,
    'descuento_pct',       p.descuento_pct,
    'descuento_aplicado',  p.descuento_referido_aplicado,
    'total',               coalesce(r.total, 0),
    'nivel1',              coalesce(r.n1, 0),
    'nivel2',              coalesce(r.n2, 0),
    'nivel3',              coalesce(r.n3, 0),
    'pagando',             coalesce(r.pagando, 0)
  )
  from public.profiles p
  left join lateral (
    select
      count(*)                                         as total,
      count(*) filter (where d.nivel = 1)              as n1,
      count(*) filter (where d.nivel = 2)              as n2,
      count(*) filter (where d.nivel = 3)              as n3,
      count(*) filter (where pr.plan = 'full')         as pagando
    from public.referral_downline(p.id, 3) d
    join public.profiles pr on pr.id = d.id
  ) r on true
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 12) RPC de staff: marca el descuento como aplicado en facturacion.
--     (La aplicacion real en Stripe es de Alexandro; esto es el gate.)
-- ---------------------------------------------------------------------
create or replace function public.staff_set_referral_applied(p_profile uuid, p_applied boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles set descuento_referido_aplicado = coalesce(p_applied, false) where id = p_profile;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 13) Permisos: cerrar helpers internos, abrir solo los RPCs seguros.
-- ---------------------------------------------------------------------
revoke all on function public.gen_referral_code()            from public, anon, authenticated;
revoke all on function public.referral_downline(uuid, int)   from public, anon, authenticated;
revoke all on function public.referral_upline(uuid, int)     from public, anon, authenticated;
revoke all on function public.recompute_referral_discount(uuid) from public, anon, authenticated;
revoke all on function public.recompute_referral_chain(uuid) from public, anon, authenticated;

grant execute on function public.claim_referral(text)            to authenticated;
grant execute on function public.get_my_referrals()              to authenticated;
grant execute on function public.get_my_referral_stats()         to authenticated;
grant execute on function public.staff_set_referral_applied(uuid, boolean) to authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
