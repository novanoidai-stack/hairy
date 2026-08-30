-- Ecosistema de cuentas: coherencia del modo de acceso, limites que el salon no
-- se pueda subir solo, y saber cual de nuestros salones es de verdad.
--
-- TRES COSAS QUE SE COMPROBARON EN PRODUCCION EL 30 AGO 2026
--
-- 1) El modo de acceso y las cuentas se contradicen sin que nada chille.
--    florent_surez_peluqueros_15004 esta en modo 'compartido' --un solo correo,
--    selector de "quien eres" y PIN-- Y ADEMAS tiene una segunda cuenta
--    individual (rol employee) que entra por su cuenta. Las dos formas de entrar
--    a la vez. Ni set_acceso_salon_modo() mira cuantas cuentas hay al encender el
--    modo, ni crear-acceso-empleado mira el modo al invitar. Son dos modelos de
--    identidad distintos conviviendo en el mismo salon: en compartido el rol
--    efectivo lo elige quien esta delante de la tablet (lib/identidadActiva.ts),
--    y en individual lo dice profiles.role. Con los dos encendidos, "quien es
--    esta persona" no tiene una sola respuesta.
--
-- 2) El tope de profesionales que pone Mecha se lo sube el propio salon.
--    Vivia en negocio_config.config->>'limiteProfesionales', y negocio_config
--    tiene una politica RLS que deja a cualquier miembro del salon escribir el
--    blob entero. Comprobado con la sesion del propietario de Florent: 15 -> 999
--    en un solo insert ... on conflict do update. El tope del panel era decorado.
--
-- 3) Seis de los siete salones son nuestros y el panel los cuenta como cartera.
--    demo, dos salones de pruebas, dos cuentas @novanoidai.com y un "Testv3".
--    "9 cuentas en 7 negocios, 3 pruebas activas" no describe el mercado, y no
--    habia ninguna forma de marcar un salon como interno.

-- ===========================================================================
-- 1) LIMITES DEL SALON, FUERA DEL ALCANCE DEL SALON
-- ===========================================================================

create table if not exists public.negocio_limites (
  negocio_id        text primary key,
  -- null = usar el valor por defecto de abajo. Se guardan como override para
  -- que subirle el tope a un salon grande sea un acto explicito y con nota.
  max_profesionales int check (max_profesionales is null or (max_profesionales between 1 and 500)),
  -- Cuentas de ACCESO (correos que entran), que no es lo mismo que fichas de la
  -- agenda: una ficha sirve para dar citas aunque esa persona no entre nunca.
  max_cuentas       int check (max_cuentas is null or (max_cuentas between 1 and 500)),
  nota              text,
  actualizado_por   uuid,
  actualizado_en    timestamptz not null default now()
);

alter table public.negocio_limites enable row level security;
-- Sin politicas A PROPOSITO: a esta tabla se llega solo por las RPC de staff de
-- mas abajo. Ese es justo el punto -- el fallo que arregla es que el limite
-- viviera en una tabla que el cliente puede escribir.

comment on table public.negocio_limites is
  'Topes por salon que solo puede tocar el equipo de Mecha. Antes vivian en negocio_config, que el propio salon escribe.';

-- Valores por defecto. 15 profesionales es el que ya habia; 15 cuentas de acceso
-- es nuevo y hoy no le aprieta a nadie (el salon mas grande tiene 2). No se
-- reparten por plan a proposito: la landing anuncia "profesionales ilimitados"
-- y meter aqui un tope por plan seria prometer una cosa y hacer otra, que es
-- exactamente lo que vigila scripts/vigilantes/planes.mjs.
create or replace function public.limite_negocio(p_negocio_id text, p_clave text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case p_clave
              when 'profesionales' then l.max_profesionales
              when 'cuentas'       then l.max_cuentas
            end
       from public.negocio_limites l where l.negocio_id = p_negocio_id),
    case p_clave when 'profesionales' then 15 when 'cuentas' then 15 else 15 end
  );
$$;

-- Ayudante interno: se fia del parametro porque solo lo llaman funciones definer
-- que ya han comprobado quien llama. La defensa es quitarle el permiso.
revoke all on function public.limite_negocio(text, text) from public, anon, authenticated;

-- El trigger que limita las fichas deja de leer negocio_config.
create or replace function public.limitar_profesionales_por_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activos int;
  v_max     int;
begin
  if new.activo is not true then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.activo is true
     and old.negocio_id is not distinct from new.negocio_id then
    return new;
  end if;

  -- Antes: negocio_config, que escribe el propio salon.
  v_max := public.limite_negocio(new.negocio_id, 'profesionales');

  perform pg_advisory_xact_lock(hashtext('profesionales_limite:' || new.negocio_id));

  select count(*) into v_activos
    from public.profesionales
   where negocio_id = new.negocio_id
     and activo is true
     and id <> new.id;

  if v_activos >= v_max then
    raise exception 'limite_profesionales'
      using hint = format('Este salon tiene el limite en %s profesionales activos.', v_max);
  end if;

  return new;
end;
$$;

-- Se traen los topes que ya hubiera puestos a mano en negocio_config, para que
-- nadie pierda el suyo al mover la fuente de verdad.
insert into public.negocio_limites (negocio_id, max_profesionales, nota)
select nc.negocio_id,
       nullif(greatest(coalesce((nc.config->>'limiteProfesionales')::int, 0), 0), 0),
       'migrado desde negocio_config el 30 ago 2026'
  from public.negocio_config nc
 where nullif(greatest(coalesce((nc.config->>'limiteProfesionales')::int, 0), 0), 0) is not null
on conflict (negocio_id) do nothing;

create or replace function public.staff_set_limites(
  p_negocio_id text,
  p_max_profesionales int default null,
  p_max_cuentas int default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_negocio_id is null or btrim(p_negocio_id) = '' then
    raise exception 'sin_negocio';
  end if;
  if p_max_profesionales is not null and (p_max_profesionales < 1 or p_max_profesionales > 500) then
    raise exception 'limite_no_valido';
  end if;
  if p_max_cuentas is not null and (p_max_cuentas < 1 or p_max_cuentas > 500) then
    raise exception 'limite_no_valido';
  end if;

  insert into public.negocio_limites
    (negocio_id, max_profesionales, max_cuentas, nota, actualizado_por, actualizado_en)
  values
    (p_negocio_id, p_max_profesionales, p_max_cuentas,
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (negocio_id) do update
    set max_profesionales = coalesce(excluded.max_profesionales, public.negocio_limites.max_profesionales),
        max_cuentas       = coalesce(excluded.max_cuentas, public.negocio_limites.max_cuentas),
        nota              = coalesce(excluded.nota, public.negocio_limites.nota),
        actualizado_por   = auth.uid(),
        actualizado_en    = now();

  return jsonb_build_object(
    'negocio_id', p_negocio_id,
    'max_profesionales', public.limite_negocio(p_negocio_id, 'profesionales'),
    'max_cuentas', public.limite_negocio(p_negocio_id, 'cuentas')
  );
end;
$$;

grant execute on function public.staff_set_limites(text, int, int, text) to authenticated;

-- La vieja sigue existiendo (la llama el panel actual) pero escribe donde toca.
create or replace function public.staff_set_limite_profesionales(p_negocio_id text, p_limite integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  return public.staff_set_limites(p_negocio_id, p_limite, null, null);
end;
$$;

grant execute on function public.staff_set_limite_profesionales(text, int) to authenticated;

-- ===========================================================================
-- 2) CLASIFICACION: cual de estos salones es un cliente de verdad
-- ===========================================================================

create table if not exists public.negocio_clasificacion (
  negocio_id  text primary key,
  -- real    = cliente o prospecto de verdad. Cuenta en las metricas.
  -- interno = nuestro (salon de pruebas del equipo, cuenta de una integracion).
  -- prueba  = alta de QA o de un experimento, se puede borrar sin pena.
  -- demo    = el escaparate compartido.
  tipo        text not null default 'real'
              check (tipo in ('real', 'interno', 'prueba', 'demo')),
  nota        text,
  marcado_por uuid,
  marcado_en  timestamptz not null default now()
);

alter table public.negocio_clasificacion enable row level security;
-- Sin politicas: solo la toca el equipo de Mecha por RPC. Un salon no tiene por
-- que saber --ni poder cambiar-- como lo clasificamos.

comment on table public.negocio_clasificacion is
  'Si un negocio es cartera real o cosa nuestra. Sin esto el panel contaba 7 negocios como mercado cuando 6 eran internos.';

create or replace function public.clasificacion_negocio(p_negocio_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.tipo from public.negocio_clasificacion c where c.negocio_id = p_negocio_id),
    case when p_negocio_id = 'demo_salon_001' then 'demo' else 'real' end);
$$;

revoke all on function public.clasificacion_negocio(text) from public, anon, authenticated;

-- Siembra inicial. Solo marca lo que se puede afirmar con una regla objetiva y
-- deja el resto en 'real': un falso 'interno' esconde un cliente del panel, que
-- es peor que un falso 'real'.
--   - el tenant de la demo,
--   - los salones cuyo identificador ya dice que son de pruebas,
--   - los que pertenecen a alguien del equipo de Mecha o a un correo nuestro.
insert into public.negocio_clasificacion (negocio_id, tipo, nota)
select n.nid,
       'interno',
       'clasificado automaticamente el 30 ago 2026 por regla objetiva'
  from (select distinct negocio_id as nid from public.profiles where negocio_id is not null) n
 where n.nid <> 'demo_salon_001'
   and (
     n.nid ~* '^(salon_pruebas|test|qa|demo|prueba)'
     or n.nid ~* '(pruebas?|_qa_|wizard_qa)'
     or exists (
       select 1 from public.profiles p
        where p.negocio_id = n.nid
          and (lower(p.email) like '%@novanoidai.com'
               or exists (select 1 from public.staff s where lower(s.email) = lower(p.email)))
     )
   )
on conflict (negocio_id) do nothing;

insert into public.negocio_clasificacion (negocio_id, tipo, nota)
values ('demo_salon_001', 'demo', 'el escaparate compartido')
on conflict (negocio_id) do nothing;

create or replace function public.staff_set_clasificacion(p_negocio_id text, p_tipo text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_negocio_id is null or btrim(p_negocio_id) = '' then
    raise exception 'sin_negocio';
  end if;
  if p_tipo not in ('real', 'interno', 'prueba', 'demo') then
    raise exception 'tipo_no_valido';
  end if;

  insert into public.negocio_clasificacion (negocio_id, tipo, nota, marcado_por, marcado_en)
  values (p_negocio_id, p_tipo, nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(), now())
  on conflict (negocio_id) do update
    set tipo = excluded.tipo,
        nota = coalesce(excluded.nota, public.negocio_clasificacion.nota),
        marcado_por = auth.uid(),
        marcado_en = now();

  return jsonb_build_object('negocio_id', p_negocio_id, 'tipo', p_tipo);
end;
$$;

grant execute on function public.staff_set_clasificacion(text, text, text) to authenticated;

-- ===========================================================================
-- 3) EL MODO DE ACCESO NO PUEDE CONTRADECIR A LAS CUENTAS
-- ===========================================================================
--
-- Regla: en modo 'compartido' el salon tiene UNA cuenta de acceso, la del
-- titular. El equipo entra con ella y se identifica con el selector + PIN.
-- Encender el modo teniendo cuentas individuales sueltas deja dos sistemas de
-- identidad a la vez, y entonces "que puede hacer Marta" depende de por donde
-- entro, no de quien es.
create or replace function public.cuentas_de_acceso(p_negocio_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.profiles p where p.negocio_id = p_negocio_id;
$$;

revoke all on function public.cuentas_de_acceso(text) from public, anon, authenticated;

create or replace function public.set_acceso_salon_modo(p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text := public.my_negocio_id_text();
  v_cuentas int;
begin
  if v_negocio is null then
    raise exception 'sin_negocio';
  end if;
  if public.my_app_role() not in ('owner', 'admin') then
    raise exception 'not_authorized';
  end if;
  if p_modo not in ('individual', 'compartido') then
    raise exception 'modo_no_valido';
  end if;

  -- Encender el correo unico con cuentas individuales vivas es la contradiccion
  -- que este bloque existe para impedir. Se dice cuantas hay para que el mensaje
  -- de la app pueda ser util en vez de un "no se pudo".
  if p_modo = 'compartido' then
    v_cuentas := public.cuentas_de_acceso(v_negocio);
    if v_cuentas > 1 then
      raise exception 'hay_cuentas_individuales:%', v_cuentas;
    end if;
  end if;

  insert into public.salon_acceso (negocio_id, modo, actualizado_por)
  values (v_negocio, p_modo, auth.uid())
  on conflict (negocio_id) do update
    set modo = excluded.modo,
        actualizado_en = now(),
        actualizado_por = auth.uid();

  return jsonb_build_object('negocio_id', v_negocio, 'modo', p_modo);
end;
$$;

grant execute on function public.set_acceso_salon_modo(text) to authenticated;

-- La de staff acepta forzar, porque a veces hay que dejar un salon a medio
-- migrar. Forzar no es lo mismo que no mirar: queda escrito en eventos_negocio y
-- el conflicto sigue saliendo en staff_salud_cuentas() hasta que se resuelva.
drop function if exists public.staff_set_acceso_modo(text, text);
create or replace function public.staff_set_acceso_modo(
  p_negocio_id text,
  p_modo text,
  p_forzar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuentas int;
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

  if p_modo = 'compartido' and not coalesce(p_forzar, false) then
    v_cuentas := public.cuentas_de_acceso(p_negocio_id);
    if v_cuentas > 1 then
      raise exception 'hay_cuentas_individuales:%', v_cuentas;
    end if;
  end if;

  insert into public.salon_acceso (negocio_id, modo, actualizado_por)
  values (p_negocio_id, p_modo, auth.uid())
  on conflict (negocio_id) do update
    set modo = excluded.modo,
        actualizado_en = now(),
        actualizado_por = auth.uid();

  insert into public.eventos_negocio
    (negocio_id, tipo, entidad, entidad_id, actor, resumen, datos, motivo)
  values
    (p_negocio_id, 'acceso_modo_cambiado', 'salon_acceso', p_negocio_id, 'staff',
     format('Modo de acceso cambiado a %s%s', p_modo,
            case when coalesce(p_forzar, false) then ' (forzado con cuentas individuales vivas)' else '' end),
     jsonb_build_object('modo', p_modo, 'forzado', coalesce(p_forzar, false), 'por', auth.uid()),
     'panel de staff')
  on conflict do nothing;

  return jsonb_build_object('negocio_id', p_negocio_id, 'modo', p_modo, 'forzado', coalesce(p_forzar, false));
end;
$$;

grant execute on function public.staff_set_acceso_modo(text, text, boolean) to authenticated;

-- ===========================================================================
-- 4) LA SALUD DEL ECOSISTEMA, SALON POR SALON
-- ===========================================================================
--
-- Una sola RPC con todo lo que el panel necesita saber para NO tener que
-- deducirlo en JavaScript. Cada conflicto trae su texto ya escrito: si el panel
-- lo redactara por su cuenta, seria otro invariante repartido de los que fabrican
-- regresiones (decision 10).
create or replace function public.staff_salud_cuentas()
returns table (
  negocio_id            text,
  nombre                text,
  clasificacion         text,
  titular_id            uuid,
  titular_email         text,
  cuentas               int,
  owners                int,
  modo                  text,
  tiene_pin             boolean,
  profesionales_activos int,
  max_profesionales     int,
  max_cuentas           int,
  plan_titular          text,
  suscripcion_estado    text,
  conflictos            jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
-- Los parametros de salida (negocio_id, modo, cuentas, owners...) son variables
-- en plpgsql y chocarian con las columnas del mismo nombre. Se manda la columna.
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  with negocios as (
    select distinct p.negocio_id as nid from public.profiles p where p.negocio_id is not null
    union
    select distinct pr.negocio_id from public.profesionales pr where pr.negocio_id is not null
  ),
  base as (
    select
      n.nid,
      public.titular_del_negocio(n.nid)                                as tit,
      public.clasificacion_negocio(n.nid)                              as clase,
      public.cuentas_de_acceso(n.nid)                                  as n_cuentas,
      (select count(*)::int from public.profiles p
        where p.negocio_id = n.nid and p.role = 'owner')               as n_owners,
      coalesce((select sa.modo from public.salon_acceso sa where sa.negocio_id = n.nid), 'individual') as modo,
      coalesce((select sa.pin_hash is not null from public.salon_acceso sa where sa.negocio_id = n.nid), false) as pin,
      (select count(*)::int from public.profesionales pr
        where pr.negocio_id = n.nid and pr.activo)                     as n_profes,
      public.limite_negocio(n.nid, 'profesionales')                    as lim_profes,
      public.limite_negocio(n.nid, 'cuentas')                          as lim_cuentas
    from negocios n
  ),
  con_titular as (
    select b.*,
           t.email                                     as tit_email,
           t.plan                                      as tit_plan,
           t.ia_nivel                                  as tit_ia,
           t.suscripcion_estado                        as tit_estado,
           t.nombre_negocio                            as tit_nombre
      from base b
      left join public.profiles t on t.id = b.tit
  )
  select
    c.nid,
    coalesce(c.tit_nombre, c.nid),
    c.clase,
    c.tit,
    c.tit_email,
    c.n_cuentas,
    c.n_owners,
    c.modo,
    c.pin,
    c.n_profes,
    c.lim_profes,
    c.lim_cuentas,
    c.tit_plan,
    c.tit_estado,
    (
      -- desc para que 'bloqueante' salga antes que 'aviso'.
      select coalesce(jsonb_agg(x order by x->>'nivel' desc), '[]'::jsonb) from (
        select jsonb_build_object('clave', 'sin_titular', 'nivel', 'bloqueante',
          'texto', 'Nadie es Propietario de este salon. Sin titular no se propaga el plan al equipo, la prueba no caduca, no se puede marcar el cobro fuera de Stripe y no cuenta como referido.') as x
        where c.n_owners = 0 and c.nid <> 'demo_salon_001'
        union all
        select jsonb_build_object('clave', 'modo_compartido_con_cuentas', 'nivel', 'bloqueante',
          'texto', format('Entra con un solo correo, pero hay %s cuentas de acceso. Conviven las dos formas de entrar y el rol efectivo depende de por donde se entre.', c.n_cuentas))
        where c.modo = 'compartido' and c.n_cuentas > 1
        union all
        select jsonb_build_object('clave', 'compartido_sin_pin', 'nivel', 'bloqueante',
          'texto', 'Entra con un solo correo y no hay PIN puesto: cualquiera que abra la tablet puede elegir Propietario y ver caja, informes y configuracion.')
        where c.modo = 'compartido' and not c.pin
        union all
        select jsonb_build_object('clave', 'plan_desincronizado', 'nivel', 'aviso',
          'texto', 'Alguien del equipo tiene un plan distinto al del titular. El plan lo contrata el salon y el equipo lo hereda.')
        where exists (
          select 1 from public.profiles p
           where p.negocio_id = c.nid and c.nid <> 'demo_salon_001'
             and (p.plan is distinct from c.tit_plan or p.ia_nivel is distinct from c.tit_ia))
        union all
        select jsonb_build_object('clave', 'sin_estado_suscripcion', 'nivel', 'aviso',
          'texto', 'El titular no tiene suscripcion_estado. Ni paga ni esta en prueba: nunca caducara y nadie sabe en que situacion esta.')
        where c.tit_estado is null and c.nid <> 'demo_salon_001' and c.clase = 'real'
        union all
        select jsonb_build_object('clave', 'cuentas_sobre_limite', 'nivel', 'aviso',
          'texto', format('%s cuentas de acceso para un tope de %s.', c.n_cuentas, c.lim_cuentas))
        where c.n_cuentas > c.lim_cuentas
        union all
        select jsonb_build_object('clave', 'profesionales_sobre_limite', 'nivel', 'aviso',
          'texto', format('%s profesionales activos para un tope de %s.', c.n_profes, c.lim_profes))
        where c.n_profes > c.lim_profes
        union all
        select jsonb_build_object('clave', 'cuenta_sin_ficha', 'nivel', 'aviso',
          'texto', 'Hay cuentas de profesional sin ficha en la agenda: entran al software y nadie puede darles citas.')
        where exists (
          select 1 from public.profiles p
           where p.negocio_id = c.nid and p.role = 'employee'
             and not exists (select 1 from public.profesionales pr where pr.profile_id = p.id))
      ) s(x)
    )
  from con_titular c
  order by c.clase, c.nid;
end;
$$;

grant execute on function public.staff_salud_cuentas() to authenticated;

-- ===========================================================================
-- 5) El resumen que ya consume el panel, con lo nuevo dentro
-- ===========================================================================

drop function if exists public.staff_resumen_salones();
create or replace function public.staff_resumen_salones()
returns table (
  negocio_id            text,
  modo                  text,
  tiene_pin             boolean,
  cuentas               int,
  profesionales_activos int,
  profesionales_totales int,
  limite_profesionales  int,
  -- nuevo
  limite_cuentas        int,
  clasificacion         text,
  owners                int,
  titular_email         text,
  conflictos            jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select
    s.negocio_id,
    s.modo,
    s.tiene_pin,
    s.cuentas,
    s.profesionales_activos,
    (select count(*)::int from public.profesionales pr where pr.negocio_id = s.negocio_id),
    s.max_profesionales,
    s.max_cuentas,
    s.clasificacion,
    s.owners,
    s.titular_email,
    s.conflictos
  from public.staff_salud_cuentas() s
  order by s.negocio_id;
end;
$$;

grant execute on function public.staff_resumen_salones() to authenticated;

notify pgrst, 'reload schema';
