-- Un salon SIEMPRE tiene un titular, y hay una sola forma de saber quien es.
--
-- QUE PASABA (medido el 30 ago 2026 en produccion)
-- Cinco de los siete salones no tenian ninguna cuenta con role='owner'. Nadie lo
-- habia cambiado desde el panel (no hay ni un 'rol_cambiado' en eventos_negocio):
-- nacieron asi. Y "salon sin propietario" no es un detalle cosmetico, porque
-- media docena de subsistemas deducen al titular por su cuenta con la misma
-- consulta copiada, `role = 'owner' order by created_at limit 1`, y cuando no
-- encuentran a nadie NO fallan: devuelven un cero razonable y siguen.
--
--   plan_del_negocio()          -> 'free' para los cinco, mientras sus filas
--                                  decian 'estudio'. El servidor y la fila no
--                                  contaban lo mismo.
--   sincronizar_plan_negocio()  -> `return 0` nada mas empezar. Cambiar el plan
--                                  de uno de esos salones desde el panel NO se
--                                  propagaba a su equipo.
--   caducar_pruebas_vencidas()  -> filtraba por role='owner', asi que TRES
--                                  pruebas con fecha de fin no iban a caducar
--                                  jamas. Acceso gratis indefinido, sin aviso.
--   staff_set_cobro_manual()    -> 'no_es_owner': imposible marcarlos como que
--                                  pagan por transferencia.
--   recompute_referral_*        -> solo cuentan owners: esos salones valian 0
--                                  para quien los hubiera traido.
--   el panel de staff           -> esconde el selector de Cobro porque exige
--                                  p.role === 'owner'.
--
-- Cinco cosas rotas y cero senales. Esta migracion hace tres cosas: define al
-- titular UNA vez, repara los salones que se quedaron sin el, e impide que se
-- vuelva a quedar ninguno.

-- ---------------------------------------------------------------------------
-- 1) La definicion unica de titular
-- ---------------------------------------------------------------------------
--
-- Devuelve al propietario mas antiguo. Si el salon no tiene ninguno --que no
-- deberia pasar nunca despues de esta migracion, pero el dato ya nos ha
-- ensenado que puede-- devuelve la cuenta mas antigua del salon en vez de null.
--
-- Esa es la diferencia que importa: null hacia que cinco funciones se apagaran
-- en silencio. Un titular "de emergencia" hace que sigan funcionando sobre
-- alguien real, y la incoherencia sale por el otro lado, en la vigilancia
-- (`bd/salon-sin-titular`), que es donde debe salir.
create or replace function public.titular_del_negocio(p_negocio_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
    from public.profiles p
   where p.negocio_id = p_negocio_id
   order by (p.role = 'owner') desc, p.created_at asc, p.id asc
   limit 1
$$;

-- Se fia de su parametro A PROPOSITO: es un ayudante interno que solo llaman
-- otras funciones security definer que ya han comprobado quien las llama. La
-- defensa es quitarle el permiso, no atarla (misma solucion que las diecisiete
-- del 28 ago 2026).
revoke all on function public.titular_del_negocio(text) from public, anon, authenticated;

comment on function public.titular_del_negocio(text) is
  'Quien contrata este salon. Propietario mas antiguo; si no hay ninguno, la cuenta mas antigua. Nunca null si el salon tiene cuentas.';

-- ---------------------------------------------------------------------------
-- 2) Reparar los salones que ya se quedaron sin titular
-- ---------------------------------------------------------------------------
--
-- Idempotente: solo toca salones donde HOY no hay ningun owner. Volver a
-- ejecutarla no hace nada. El salon de la demo queda fuera (ahi conviven dos
-- cuentas owner a proposito y no hay plan que contratar).
--
-- Ojo: `role` acaba de quedar congelado de verdad por el trigger de identidad
-- (20260830103000), asi que hay que abrir identity_ctx igual que hacen las RPC.
do $$
declare
  r        record;
  v_email  text;
  v_total  int := 0;
begin
  perform set_config('mecha.identity_ctx', '1', true);

  for r in
    select p.negocio_id,
           (array_agg(p.id order by p.created_at asc, p.id asc))[1] as candidato
      from public.profiles p
     where p.negocio_id is not null
       and btrim(p.negocio_id) <> ''
       and p.negocio_id <> 'demo_salon_001'
     group by p.negocio_id
    having count(*) filter (where p.role = 'owner') = 0
  loop
    select email into v_email from public.profiles where id = r.candidato;

    update public.profiles
       set role = 'owner', updated_at = now()
     where id = r.candidato;

    insert into public.eventos_negocio
      (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
    values
      (r.negocio_id, 'rol_cambiado', 'profiles', r.candidato::text, 'sistema',
       format('Ascendida a Propietario: el salon no tenia ninguno (%s)', v_email),
       jsonb_build_object('rol_nuevo', 'owner', 'automatico', true),
       'reparacion 20260830103500_titular_del_salon');

    v_total := v_total + 1;
  end loop;

  raise notice 'Salones sin titular reparados: %', v_total;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Que no se vuelva a quedar ninguno
-- ---------------------------------------------------------------------------
--
-- set_member_role() (la que usa el propio salon) ya se negaba a degradar al
-- ultimo propietario. staff_set_role() --la que usa el panel de Mecha-- no, y es
-- justo la que tiene mas alcance: cambia el rol de cualquier cuenta de cualquier
-- salon. Se le pone la misma regla.
create or replace function public.staff_set_role(target_user_id uuid, new_role text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  prof     public.profiles;
  rol      text := lower(btrim(coalesce(new_role, '')));
  v_owners int;
begin
  if not is_staff() then
    raise exception 'not_authorized';
  end if;
  if rol not in ('owner', 'admin', 'recepcion', 'employee') then
    raise exception 'rol_invalido';
  end if;

  select * into prof from public.profiles where id = target_user_id;
  if not found then
    raise exception 'profile_not_found';
  end if;

  -- Degradar al unico propietario deja el salon sin titular, y con el se apagan
  -- el plan, la caducidad de la prueba, el cobro manual y los referidos. El
  -- salon de la demo esta exento: alli no hay nada que contratar.
  if prof.role = 'owner' and rol <> 'owner'
     and coalesce(prof.negocio_id, '') not in ('', 'demo_salon_001') then
    select count(*) into v_owners
      from public.profiles
     where negocio_id = prof.negocio_id and role = 'owner';
    if v_owners <= 1 then
      raise exception 'ultimo_propietario';
    end if;
  end if;

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set role = rol, updated_at = now()
   where id = target_user_id
   returning * into prof;

  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
  values
    (prof.negocio_id, 'rol_cambiado', 'profiles', target_user_id::text, 'staff',
     format('Rol cambiado a %s', rol),
     jsonb_build_object('rol_nuevo', rol, 'por', auth.jwt() ->> 'email'),
     'panel de staff');

  return prof;
end;
$$;

grant execute on function public.staff_set_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Que las cinco funciones dejen de deducir al titular por su cuenta
-- ---------------------------------------------------------------------------

create or replace function public.plan_del_negocio(p_negocio_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.plan from public.profiles p
      where p.id = public.titular_del_negocio(p_negocio_id)),
    'free');
$$;

revoke all on function public.plan_del_negocio(text) from public, anon, authenticated;

create or replace function public.sincronizar_plan_negocio(p_negocio_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_salon text;
  ia_salon   text;
  tocadas    integer := 0;
begin
  if p_negocio_id is null or trim(p_negocio_id) = '' or p_negocio_id = 'demo_salon_001' then
    return 0;
  end if;

  -- Antes: `where role = 'owner' order by created_at limit 1`. Sin owner, esta
  -- funcion devolvia 0 y el equipo se quedaba con el plan viejo para siempre.
  select p.plan, p.ia_nivel into plan_salon, ia_salon
    from public.profiles p
   where p.id = public.titular_del_negocio(p_negocio_id);

  if plan_salon is null then
    return 0;
  end if;
  ia_salon := coalesce(ia_salon, 'ninguna');

  perform set_config('mecha.identity_ctx', '1', true);
  update public.profiles
     set plan = plan_salon,
         ia_nivel = ia_salon,
         updated_at = now()
   where negocio_id = p_negocio_id
     and (plan is distinct from plan_salon or ia_nivel is distinct from ia_salon);
  get diagnostics tocadas = row_count;
  return tocadas;
end;
$$;

revoke all on function public.sincronizar_plan_negocio(text) from public, anon, authenticated;

create or replace function public.caducar_pruebas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocios text[];
  v_neg      text;
begin
  perform set_config('mecha.identity_ctx', '1', true);

  with vencidos as (
    select p.id, p.negocio_id
      from public.profiles p
     where p.suscripcion_estado = 'prueba'
       and p.trial_ends_at is not null
       and p.trial_ends_at < now()
       and coalesce(p.negocio_id, '') not in ('', 'demo_salon_001')
       -- Antes: `role = 'owner'`. Tres pruebas de salones sin propietario
       -- llevaban camino de no caducar nunca.
       and p.id = public.titular_del_negocio(p.negocio_id)
  ), actualizados as (
    update public.profiles p
       set suscripcion_estado = 'caducada',
           plan = 'free',
           updated_at = now()
      from vencidos v
     where p.id = v.id
    returning p.negocio_id
  )
  select array_agg(distinct negocio_id) into v_negocios from actualizados;

  if v_negocios is null then
    return 0;
  end if;

  foreach v_neg in array v_negocios loop
    perform public.sincronizar_plan_negocio(v_neg);
  end loop;

  return coalesce(array_length(v_negocios, 1), 0);
end;
$$;

-- La ejecuta el cron 9 de pg_cron (`select public.caducar_pruebas_vencidas()`),
-- que corre como superusuario. No pinta nada que la pueda llamar por REST
-- cualquier visitante anonimo, y hasta hoy podia.
revoke all on function public.caducar_pruebas_vencidas() from public, anon, authenticated;

notify pgrst, 'reload schema';
