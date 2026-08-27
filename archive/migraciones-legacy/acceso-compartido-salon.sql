-- Acceso compartido: un salon, un correo, varias personas.
--
-- Hasta ahora Mecha solo entendia una forma de entrar: cada persona con SU
-- correo (se le invita, elige contrasena y entra). Eso encaja en un salon con
-- oficina, pero no en la barberia donde hay UNA tablet en el mostrador y el
-- jefe no quiere dar de alta cinco correos.
--
-- Con este modo, el salon entra con el correo del jefe y, antes de tocar nada,
-- la pantalla pregunta QUIEN ERES. Se elige la ficha y el software se comporta
-- como esa persona. Elegir al Propietario pide un PIN: es lo unico que separa
-- al equipo de la caja, los informes y la configuracion.
--
-- QUE ES Y QUE NO ES (importante, no nos engañemos):
-- la sesion del navegador sigue siendo la del propietario, asi que esto es una
-- barrera de USO, no un muro de seguridad: quien elige "Marta" no ve la caja,
-- pero la sesion que tiene debajo es la del jefe. Es exactamente el mismo trato
-- que hace un TPV de tienda con su PIN, y es lo que el salon pide. Para una
-- separacion real de verdad, cada persona necesita su propio correo (modo
-- 'individual', que sigue siendo el de por defecto).

-- ============================================================
-- 1) Modo de acceso y PIN por salon
-- ============================================================

create table if not exists public.salon_acceso (
  negocio_id         text primary key,
  -- 'individual' = cada profesional con su correo (lo de siempre).
  -- 'compartido' = un solo correo + selector de quien eres.
  modo               text not null default 'individual'
                     check (modo in ('individual', 'compartido')),
  -- Hash bcrypt del PIN del propietario. NUNCA sale de la base de datos: no hay
  -- politica de SELECT y solo lo leen las funciones de aqui abajo.
  pin_hash           text,
  pin_actualizado_en timestamptz,
  actualizado_en     timestamptz not null default now(),
  actualizado_por    uuid
);

alter table public.salon_acceso enable row level security;
-- Sin politicas a proposito: a esta tabla se llega SOLO por las RPC de abajo.
-- Si tuviera SELECT para el salon, cualquiera del equipo podria leerse el hash
-- del PIN del jefe y atacarlo con calma en su casa.

-- Rol con el que entra cada ficha cuando el salon esta en modo compartido.
-- Por defecto profesional: ve su agenda y sus clientas, no la caja ni los
-- informes. El que sea 'owner' pedira PIN igual que la entrada de Propietario.
alter table public.profesionales
  add column if not exists rol_acceso text not null default 'employee';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profesionales_rol_acceso_check'
  ) then
    alter table public.profesionales
      add constraint profesionales_rol_acceso_check
      check (rol_acceso in ('owner', 'admin', 'recepcion', 'employee'));
  end if;
end $$;

-- ============================================================
-- 2) Lectura del modo (la app necesita saber si preguntar quien eres)
-- ============================================================

create or replace function public.acceso_salon_estado()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text := public.my_negocio_id_text();
  v_fila    public.salon_acceso%rowtype;
begin
  if v_negocio is null then
    return jsonb_build_object('modo', 'individual', 'tiene_pin', false);
  end if;

  select * into v_fila from public.salon_acceso where negocio_id = v_negocio;

  return jsonb_build_object(
    'modo', coalesce(v_fila.modo, 'individual'),
    -- Solo si HAY PIN, nunca el PIN. Sirve para que el propietario sepa que
    -- todavia no lo ha puesto (y para no pedir un PIN que no existe).
    'tiene_pin', v_fila.pin_hash is not null
  );
end;
$$;

grant execute on function public.acceso_salon_estado() to authenticated;

-- ============================================================
-- 3) PIN del propietario: ponerlo y comprobarlo
-- ============================================================

-- Lo pone el propietario desde Configuracion. 4 a 8 digitos: es un PIN de
-- mostrador, no una contrasena; lo que protege de verdad es el correo.
create or replace function public.set_pin_propietario(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_negocio text := public.my_negocio_id_text();
  v_rol     text;
begin
  if v_negocio is null then
    raise exception 'sin_negocio';
  end if;
  if v_negocio = 'demo_salon_001' then
    raise exception 'demo_no_permitido';
  end if;

  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol is distinct from 'owner' then
    raise exception 'solo_propietario';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'pin_no_valido';
  end if;

  insert into public.salon_acceso (negocio_id, pin_hash, pin_actualizado_en, actualizado_por)
  values (v_negocio, extensions.crypt(p_pin, extensions.gen_salt('bf')), now(), auth.uid())
  on conflict (negocio_id) do update
    set pin_hash = excluded.pin_hash,
        pin_actualizado_en = now(),
        actualizado_en = now(),
        actualizado_por = auth.uid();
end;
$$;

grant execute on function public.set_pin_propietario(text) to authenticated;

-- Comprueba el PIN. Con freno: 6 intentos por salon cada 10 minutos, para que
-- nadie se siente en la tablet a probar los 10.000 posibles.
create or replace function public.verificar_pin_propietario(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_negocio text := public.my_negocio_id_text();
  v_hash    text;
begin
  if v_negocio is null then
    return false;
  end if;

  if not public.check_rate_limit('pin_salon', v_negocio, 6, 10) then
    raise exception 'demasiados_intentos';
  end if;

  select pin_hash into v_hash from public.salon_acceso where negocio_id = v_negocio;
  -- Sin PIN configurado no hay nada que comprobar: lo resuelve la app pidiendo
  -- al propietario que lo ponga.
  if v_hash is null then
    return false;
  end if;

  return v_hash = extensions.crypt(coalesce(p_pin, ''), v_hash);
end;
$$;

grant execute on function public.verificar_pin_propietario(text) to authenticated;

-- ============================================================
-- 4) Panel de staff: elegir el modo y contar profesionales de verdad
-- ============================================================

create or replace function public.staff_set_acceso_modo(p_negocio_id text, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_modo not in ('individual', 'compartido') then
    raise exception 'modo_no_valido';
  end if;
  if p_negocio_id is null or btrim(p_negocio_id) = '' then
    raise exception 'sin_negocio';
  end if;

  insert into public.salon_acceso (negocio_id, modo, actualizado_por)
  values (p_negocio_id, p_modo, auth.uid())
  on conflict (negocio_id) do update
    set modo = excluded.modo,
        actualizado_en = now(),
        actualizado_por = auth.uid();

  return jsonb_build_object('negocio_id', p_negocio_id, 'modo', p_modo);
end;
$$;

grant execute on function public.staff_set_acceso_modo(text, text) to authenticated;

-- Cuantas personas trabajan de verdad en cada salon, tengan correo o no.
-- Sin esto, un salon en modo compartido figuraba en el panel como "1 cuenta" y
-- parecia un autonomo aunque fuesen seis en el local.
create or replace function public.staff_resumen_salones()
returns table (
  negocio_id            text,
  modo                  text,
  tiene_pin             boolean,
  cuentas               int,
  profesionales_activos int,
  profesionales_totales int,
  -- Maximo de fichas activas de ese salon (ver limite-profesionales-configurable.sql)
  limite_profesionales  int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  with negocios as (
    select p.negocio_id as nid from public.profiles p where p.negocio_id is not null
    union
    select pr.negocio_id from public.profesionales pr
  )
  select
    n.nid,
    coalesce(sa.modo, 'individual'),
    sa.pin_hash is not null,
    (select count(*)::int from public.profiles p where p.negocio_id = n.nid),
    (select count(*)::int from public.profesionales pr where pr.negocio_id = n.nid and pr.activo),
    (select count(*)::int from public.profesionales pr where pr.negocio_id = n.nid),
    coalesce((select nullif(greatest(coalesce((nc.config->>'limiteProfesionales')::int, 0), 0), 0)
                from public.negocio_config nc where nc.negocio_id = n.nid), 15)
  from negocios n
  left join public.salon_acceso sa on sa.negocio_id = n.nid
  order by n.nid;
end;
$$;

grant execute on function public.staff_resumen_salones() to authenticated;

notify pgrst, 'reload schema';
