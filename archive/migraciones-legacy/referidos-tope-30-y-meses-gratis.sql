-- =====================================================================
-- Mecha · Referidos: tope 30 %, meses gratis por encima y arreglo de "quien paga"
-- =====================================================================
-- Sustituye la tabla de premios de `referidos-arbol-multinivel.sql` (jun 2026).
-- NO redefine handle_new_user: esa la manda `p1-autoservicio-alta-con-prueba.sql`
-- (19 ago 2026), que es posterior. Si alguien vuelve a ejecutar la migracion
-- vieja de referidos, se cargara el alta autoservicio -- no ejecutarla.
--
-- POR QUE ESTA MIGRACION
--
-- 1. EL MOTOR NO CONTABA A NADIE. La recompensa se calculaba sobre
--    `pr.plan = 'full'`, y 'full' es un valor HISTORICO: desde
--    `planes-esencial-estudio.sql` los planes reales son 'esencial' y 'estudio'
--    (lib/planes.ts lo dice: 'full' se lee como 'estudio' por compatibilidad).
--    O sea que la red podia estar llena de salones pagando y el descuento salia
--    0 para todo el mundo, en silencio. Ademas 'plan' por si solo no dice que
--    alguien PAGUE: un salon en prueba tambien tiene plan 'esencial'. Lo que
--    dice si paga es `suscripcion_estado`.
--
-- 2. TRES SITIOS CONTABAN COSAS DISTINTAS. La BD daba tope 40, el modal de la
--    demo anunciaba -30 % y la landing prometia "2 meses gratis" sin hablar de
--    porcentajes. Aqui se fija UNA tabla y los tres textos se alinean a ella.
--
-- TABLA DE PREMIOS (fuente unica)
--
--   Por cada salon de tu red que PAGUE:
--     Nivel 1 (los que traes tu) -> +10 puntos de descuento
--     Nivel 2 (los que traen ellos) -> +4
--     Nivel 3 -> +2
--     Nivel 4+ -> 0 (se corta la profundidad para acotar el margen)
--   Bono de bienvenida: si TU entraste con el codigo de alguien, +15.
--   TOPE: 30 % de descuento sobre tu cuota. Es el limite duro.
--   POR ENCIMA DEL TOPE: cada salon de pago que sigue entrando ya no suma
--     porcentaje (no queda sitio) -> suma 1 MES GRATIS. Asi la red sigue
--     mereciendo la pena cuando ya no cabe mas descuento, sin comerse el margen
--     de forma indefinida.
--
--   Lo que gana quien ENTRA con tu enlace: su 15 % de bienvenida + la
--   configuracion y la migracion sin coste (eso ultimo no vive aqui: es
--   operativa, y es lo que promete la landing).
--
-- LO QUE ESTA MIGRACION NO HACE
--   No mueve dinero. Calcula ELEGIBILIDAD. Aplicar el descuento y canjear los
--   meses en Stripe es de Alexandro: `descuento_referido_aplicado` y
--   `meses_gratis_canjeados` son los interruptores que marca el equipo.
-- =====================================================================

-- Sin `begin`/`commit` explicitos: se aplica con apply_migration, que ya envuelve
-- todo en su propia transaccion (un `commit` aqui dentro la cerraria a medias).

-- ---------------------------------------------------------------------
-- 1) Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists meses_gratis_ganados   integer not null default 0,
  add column if not exists meses_gratis_canjeados integer not null default 0;

comment on column public.profiles.meses_gratis_ganados is
  'Meses gratis ELEGIBLES por referidos de pago que entraron con el descuento ya al tope (30 %). Lo calcula recompute_referral_discount; no lo toca nadie a mano.';
comment on column public.profiles.meses_gratis_canjeados is
  'Meses ya aplicados en facturacion por el equipo. Los pendientes son ganados - canjeados. Protege lo ya concedido si alguien de la red deja de pagar.';
comment on column public.profiles.descuento_pct is
  'Descuento GANADO sobre la cuota, en puntos porcentuales. Tope 30. Lo calcula el motor; aplicarlo en Stripe es otra cosa (descuento_referido_aplicado).';

-- ---------------------------------------------------------------------
-- 2) Que significa "paga" — el bug del punto 1
--    Un salon cuenta para la red cuando tiene plan de pago Y una suscripcion
--    viva. 'pago_pendiente' cuenta a proposito: Stripe reintenta varios dias y
--    no vamos a quitarle el descuento a su padrino por un reintento.
--    'full' con estado nulo son las cuentas historicas que preconfiguramos
--    nosotros antes de que existiera suscripcion_estado: siguen contando.
-- ---------------------------------------------------------------------
-- `set search_path` obligatorio: sin el, el advisor `function_search_path_mutable`
-- lo marca (la funcion resolveria nombres con el search_path del rol que llama).
create or replace function public.referral_paga(p_plan text, p_estado text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_plan, '') in ('esencial', 'estudio', 'full')
     and (
       coalesce(p_estado, '') in ('activa', 'pago_pendiente')
       or (coalesce(p_plan, '') = 'full' and p_estado is null)
     );
$$;

-- ---------------------------------------------------------------------
-- 3) Motor de recompensa
--
--    El reparto porcentaje/meses depende del ORDEN en que entro cada salon:
--    los primeros llenan el 30 % y los que llegan despues ya solo pueden ganar
--    meses. Se ordena por `referido_en` (cuando se engancho a la red), con
--    `created_at` de respaldo, para que el resultado sea estable y no dependa
--    del orden de lectura de la tabla.
-- ---------------------------------------------------------------------
create or replace function public.recompute_referral_discount(p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tope     constant numeric := 30;   -- tope duro de descuento
  v_bono     constant numeric := 15;   -- bienvenida por entrar con codigo
  v_earned   numeric := 0;
  v_welcome  numeric := 0;
  v_meses    integer := 0;
  v_pct      numeric := 0;
  v_referido uuid;
begin
  if p_profile is null then return; end if;

  select referido_por into v_referido from public.profiles where id = p_profile;
  if v_referido is not null then v_welcome := v_bono; end if;

  with red as (
    select
      d.nivel,
      pr.id,
      coalesce(pr.referido_en, pr.created_at, now()) as cuando,
      case d.nivel when 1 then 10 when 2 then 4 when 3 then 2 else 0 end as pts
    from public.referral_downline(p_profile, 3) d
    join public.profiles pr on pr.id = d.id
    -- El plan lo contrata el SALON, y la fuente es su propietario: si contaramos
    -- todo el equipo, un salon con seis empleados valdria por seis referidos.
    where pr.role = 'owner'
      and public.referral_paga(pr.plan, pr.suscripcion_estado)
  ),
  ordenada as (
    select
      pts,
      -- Puntos que ya habia acumulados cuando entro este: si con eso el tope ya
      -- estaba lleno, este salon no cabe en el porcentaje y se paga en meses.
      coalesce(
        sum(pts) over (order by cuando, id rows between unbounded preceding and 1 preceding),
        0
      ) as pts_antes
    from red
  )
  select
    coalesce(sum(pts), 0),
    coalesce(count(*) filter (where v_welcome + pts_antes >= v_tope), 0)
  into v_earned, v_meses
  from ordenada;

  v_pct := least(v_tope, v_welcome + v_earned);

  -- Contexto interno: autoriza tocar columnas sensibles en el guard
  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles
     set descuento_pct        = v_pct,
         meses_gratis_ganados = v_meses
   where id = p_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) El trigger tiene que reaccionar tambien al estado de suscripcion
--    Antes solo escuchaba `plan` y `referido_por`. Con la definicion nueva de
--    "paga", un salon que empieza a pagar cambia suscripcion_estado y NO
--    cambia de plan: sin esto, su padrino no se enteraba nunca.
-- ---------------------------------------------------------------------
drop trigger if exists trg_profile_referral_event on public.profiles;
create trigger trg_profile_referral_event
  after insert or update of plan, suscripcion_estado, referido_por, role
  on public.profiles
  for each row execute function public.on_profile_referral_event();

-- ---------------------------------------------------------------------
-- 5) Guard: las columnas nuevas tampoco las toca el cliente
--    La policy de UPDATE de profiles no restringe columnas, asi que sin esto
--    cualquiera se regala meses gratis con un update de su propia fila.
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
  new.codigo_referido             := old.codigo_referido;
  new.referido_por                := old.referido_por;
  new.referido_en                 := old.referido_en;
  new.descuento_pct               := old.descuento_pct;
  new.descuento_referido_aplicado := old.descuento_referido_aplicado;
  new.meses_gratis_ganados        := old.meses_gratis_ganados;
  new.meses_gratis_canjeados      := old.meses_gratis_canjeados;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Lecturas para el panel de referidos (sin emails de terceros)
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
    public.referral_paga(p.plan, p.suscripcion_estado)
  from public.referral_downline((select auth.uid()), 3) d
  join public.profiles p on p.id = d.id
  where p.role = 'owner'
  order by d.nivel asc, p.created_at desc;
$$;

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
    'descuento_tope',      30,
    'descuento_aplicado',  p.descuento_referido_aplicado,
    'meses_ganados',       p.meses_gratis_ganados,
    'meses_canjeados',     p.meses_gratis_canjeados,
    'meses_pendientes',    greatest(0, p.meses_gratis_ganados - p.meses_gratis_canjeados),
    'bienvenida',          (p.referido_por is not null),
    'total',               coalesce(r.total, 0),
    'nivel1',              coalesce(r.n1, 0),
    'nivel2',              coalesce(r.n2, 0),
    'nivel3',              coalesce(r.n3, 0),
    'pagando',             coalesce(r.pagando, 0)
  )
  from public.profiles p
  left join lateral (
    select
      count(*)                                            as total,
      count(*) filter (where d.nivel = 1)                 as n1,
      count(*) filter (where d.nivel = 2)                 as n2,
      count(*) filter (where d.nivel = 3)                 as n3,
      count(*) filter (where public.referral_paga(pr.plan, pr.suscripcion_estado)) as pagando
    from public.referral_downline(p.id, 3) d
    join public.profiles pr on pr.id = d.id
    where pr.role = 'owner'
  ) r on true
  where p.id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 7) RPC de staff: apuntar meses ya aplicados en facturacion
-- ---------------------------------------------------------------------
create or replace function public.staff_canjear_meses_referido(p_profile uuid, p_meses integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ganados integer; v_canjeados integer;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'reason', 'not_staff');
  end if;
  if coalesce(p_meses, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'meses_invalidos');
  end if;

  select meses_gratis_ganados, meses_gratis_canjeados
    into v_ganados, v_canjeados
  from public.profiles where id = p_profile;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if v_canjeados + p_meses > v_ganados then
    return jsonb_build_object('ok', false, 'reason', 'sin_meses_pendientes',
                              'ganados', v_ganados, 'canjeados', v_canjeados);
  end if;

  perform set_config('mecha.referral_ctx', '1', true);
  update public.profiles
     set meses_gratis_canjeados = v_canjeados + p_meses
   where id = p_profile;
  return jsonb_build_object('ok', true, 'canjeados', v_canjeados + p_meses, 'ganados', v_ganados);
end;
$$;

-- ---------------------------------------------------------------------
-- 8) Recalculo de toda la base con la tabla nueva
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.recompute_referral_discount(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 9) Permisos (round 4: lo nuevo no nace ejecutable; se abre a mano)
-- ---------------------------------------------------------------------
revoke all on function public.referral_paga(text, text)              from public, anon;
revoke all on function public.recompute_referral_discount(uuid)      from public, anon, authenticated;

grant execute on function public.referral_paga(text, text)           to authenticated;
grant execute on function public.get_my_referrals()                  to authenticated;
grant execute on function public.get_my_referral_stats()             to authenticated;
grant execute on function public.staff_canjear_meses_referido(uuid, integer) to authenticated;

-- Recargar el cache del esquema de PostgREST
notify pgrst, 'reload schema';
