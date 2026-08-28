-- Registro de las corridas de vigilancia y sus hallazgos.
--
-- Deliberadamente SEPARADO de errores_cliente. Son dos cosas distintas:
--   errores_cliente = se rompio en casa de un cliente real, ya paso, hay alguien esperando.
--   vigilancia_*    = lo cazo un vigilante, normalmente antes de que llegue a nadie.
-- Mezclarlas entierra el crash de un salon que paga bajo 66 exports muertos.

create table if not exists public.vigilancia_ejecuciones (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  origen      text        not null check (origen in ('ci', 'canario', 'local', 'panel')),
  commit_sha  text,
  rama        text,
  duracion_ms integer,
  total       integer     not null default 0,
  bloqueantes integer     not null default 0,
  avisos      integer     not null default 0,
  vigilantes  jsonb       not null default '[]'::jsonb,
  ok          boolean generated always as (bloqueantes = 0) stored
);

create index if not exists ix_vig_ejec_creado on public.vigilancia_ejecuciones (creado_en desc);
create index if not exists ix_vig_ejec_origen on public.vigilancia_ejecuciones (origen, creado_en desc);

create table if not exists public.vigilancia_hallazgos (
  id           bigint generated always as identity primary key,
  ejecucion_id bigint not null references public.vigilancia_ejecuciones(id) on delete cascade,
  creado_en    timestamptz not null default now(),
  clave        text   not null,
  nivel        text   not null check (nivel in ('bloqueante', 'aviso')),
  ambito       text   not null,
  titulo       text   not null,
  detalle      text,
  fichero      text,
  linea        integer,
  -- Mismo ciclo de vida que errores_cliente, para que el panel se lea igual.
  estado       text   not null default 'nuevo'
               check (estado in ('nuevo', 'en_revision', 'resuelto', 'ignorado')),
  notas_staff  text,
  revisado_por text,
  revisado_en  timestamptz
);

create index if not exists ix_vig_hall_ejec  on public.vigilancia_hallazgos (ejecucion_id);
create index if not exists ix_vig_hall_clave on public.vigilancia_hallazgos (clave, creado_en desc);

alter table public.vigilancia_ejecuciones enable row level security;
alter table public.vigilancia_hallazgos   enable row level security;

-- Sin politicas a proposito: nadie toca estas tablas directamente. Se leen por
-- RPC de staff y se escriben con la clave de servicio desde la edge function.

-- ---------------------------------------------------------------------------
-- Lectura para el panel
-- ---------------------------------------------------------------------------

create or replace function public.staff_vigilancia_resumen(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ultima  jsonb;
  v_canario jsonb;
  v_ambitos jsonb;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  select to_jsonb(e) into v_ultima
    from public.vigilancia_ejecuciones e
   where e.origen in ('ci', 'local')
   order by e.creado_en desc limit 1;

  select to_jsonb(e) into v_canario
    from public.vigilancia_ejecuciones e
   where e.origen = 'canario'
   order by e.creado_en desc limit 1;

  select coalesce(jsonb_agg(x order by x->>'ambito'), '[]'::jsonb) into v_ambitos
  from (
    select jsonb_build_object(
             'ambito', h.ambito,
             'bloqueantes', count(*) filter (where h.nivel = 'bloqueante'),
             'avisos', count(*) filter (where h.nivel = 'aviso'),
             'ultima_vez', max(h.creado_en)
           ) as x
      from public.vigilancia_hallazgos h
     where h.creado_en > now() - make_interval(days => greatest(p_dias, 1))
       and h.estado in ('nuevo', 'en_revision')
     group by h.ambito
  ) s;

  return jsonb_build_object(
    'ultima_ci', v_ultima,
    'ultimo_canario', v_canario,
    'ambitos', v_ambitos,
    -- Si hace mas de 26 h que no corre el canario, el canario esta muerto y el
    -- verde del panel no significa nada. Decirlo, en vez de enseñar todo verde:
    -- un panel tranquilo porque nadie mira es peor que uno en rojo.
    'canario_mudo', (
      v_canario is null
      or (v_canario->>'creado_en')::timestamptz < now() - interval '26 hours'
    )
  );
end;
$$;

create or replace function public.staff_vigilancia_hallazgos(
  p_dias   integer default 7,
  p_estado text default null,
  p_ambito text default null,
  p_nivel  text default null,
  p_limit  integer default 100
)
returns table(
  clave text, nivel text, ambito text, titulo text, detalle text,
  fichero text, linea integer, estado text, veces integer,
  primera_vez timestamptz, ultima_vez timestamptz,
  notas_staff text, revisado_por text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select h.clave,
         (array_agg(h.nivel   order by h.creado_en desc))[1],
         (array_agg(h.ambito  order by h.creado_en desc))[1],
         (array_agg(h.titulo  order by h.creado_en desc))[1],
         (array_agg(h.detalle order by h.creado_en desc))[1],
         (array_agg(h.fichero order by h.creado_en desc))[1],
         (array_agg(h.linea   order by h.creado_en desc))[1],
         (array_agg(h.estado  order by h.creado_en desc))[1],
         count(*)::int,
         min(h.creado_en),
         max(h.creado_en),
         (array_agg(h.notas_staff  order by h.revisado_en desc nulls last))[1],
         (array_agg(h.revisado_por order by h.revisado_en desc nulls last))[1]
    from public.vigilancia_hallazgos h
   where h.creado_en > now() - make_interval(days => greatest(p_dias, 1))
     and (p_estado is null or p_estado = '' or h.estado = p_estado)
     and (p_ambito is null or p_ambito = '' or h.ambito = p_ambito)
     and (p_nivel  is null or p_nivel  = '' or h.nivel  = p_nivel)
   group by h.clave
   order by
     -- Los bloqueantes primero, luego por reciente.
     (case when (array_agg(h.nivel order by h.creado_en desc))[1] = 'bloqueante' then 0 else 1 end),
     max(h.creado_en) desc
   limit greatest(p_limit, 1);
end;
$$;

create or replace function public.staff_marcar_hallazgo(
  p_clave  text,
  p_estado text,
  p_notas  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_n     int;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_estado not in ('nuevo', 'en_revision', 'resuelto', 'ignorado') then
    raise exception 'Estado no valido';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  update public.vigilancia_hallazgos
     set estado = p_estado,
         revisado_en  = case when p_estado = 'nuevo' then null else now() end,
         revisado_por = case when p_estado = 'nuevo' then null
                             else coalesce(v_email, auth.uid()::text) end,
         notas_staff  = coalesce(p_notas, notas_staff)
   where clave = p_clave;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'actualizados', v_n, 'estado', p_estado);
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritura: solo service_role. La usa la edge function registrar-vigilancia.
-- ---------------------------------------------------------------------------

-- El guard mira auth.role() Y current_user. Solo auth.role() no basta: lee el
-- claim `role` del JWT, y las claves nuevas (sb_secret_...) NO son JWT -- la
-- pasarela resuelve la clave y hace SET LOCAL ROLE service_role, pero el claim
-- puede no estar. Tal cual, el registro habria dejado de funcionar en silencio
-- el dia que se desactive la clave heredada, y justo entonces nadie se enteraria,
-- porque el panel se habria quedado sin datos. Misma idea que la regla 9 de
-- CLAUDE.md: no fiarse del contenido del token, fiarse de lo que la plataforma
-- ya ha resuelto.
create or replace function public.registrar_vigilancia(p_informe jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id   bigint;
  v_bloq int;
  v_avi  int;
begin
  if not (auth.role() = 'service_role' or current_user = 'service_role') then
    raise exception 'solo service_role (rol actual: %, claim: %)',
      current_user, coalesce(auth.role(), '(sin claim)');
  end if;

  select count(*) filter (where h->>'nivel' = 'bloqueante'),
         count(*) filter (where h->>'nivel' = 'aviso')
    into v_bloq, v_avi
    from jsonb_array_elements(coalesce(p_informe->'hallazgos', '[]'::jsonb)) h;

  insert into public.vigilancia_ejecuciones
    (origen, commit_sha, rama, duracion_ms, total, bloqueantes, avisos, vigilantes)
  values (
    coalesce(p_informe->>'origen', 'ci'),
    p_informe->>'commit',
    p_informe->>'rama',
    nullif(p_informe->>'duracion_ms', '')::int,
    coalesce(v_bloq, 0) + coalesce(v_avi, 0),
    coalesce(v_bloq, 0),
    coalesce(v_avi, 0),
    coalesce(p_informe->'vigilantes', '[]'::jsonb)
  )
  returning id into v_id;

  insert into public.vigilancia_hallazgos
    (ejecucion_id, clave, nivel, ambito, titulo, detalle, fichero, linea,
     estado, notas_staff, revisado_por, revisado_en)
  select
    v_id,
    h->>'clave',
    h->>'nivel',
    coalesce(h->>'ambito', 'otros'),
    h->>'titulo',
    h->>'detalle',
    h->>'fichero',
    nullif(h->>'linea', '')::int,
    -- Si este hallazgo ya se marco antes (resuelto/ignorado) y vuelve a salir,
    -- hereda el estado: si no, cada corrida horaria resucitaria lo ignorado y el
    -- panel seria ruido puro a las pocas horas. Comprobado en una prueba con dos
    -- corridas seguidas.
    coalesce(prev.estado, 'nuevo'),
    prev.notas_staff,
    prev.revisado_por,
    prev.revisado_en
  from jsonb_array_elements(coalesce(p_informe->'hallazgos', '[]'::jsonb)) h
  left join lateral (
    select p.estado, p.notas_staff, p.revisado_por, p.revisado_en
      from public.vigilancia_hallazgos p
     where p.clave = h->>'clave'
     order by p.creado_en desc
     limit 1
  ) prev on true;

  return jsonb_build_object('ok', true, 'ejecucion_id', v_id,
                            'bloqueantes', v_bloq, 'avisos', v_avi);
end;
$$;

revoke all on function public.staff_vigilancia_resumen(integer)                              from public, anon;
revoke all on function public.staff_vigilancia_hallazgos(integer, text, text, text, integer) from public, anon;
revoke all on function public.staff_marcar_hallazgo(text, text, text)                        from public, anon;
revoke all on function public.registrar_vigilancia(jsonb)                                    from public, anon, authenticated;

grant execute on function public.staff_vigilancia_resumen(integer)                              to authenticated;
grant execute on function public.staff_vigilancia_hallazgos(integer, text, text, text, integer) to authenticated;
grant execute on function public.staff_marcar_hallazgo(text, text, text)                        to authenticated;
grant execute on function public.registrar_vigilancia(jsonb)                                    to service_role;
