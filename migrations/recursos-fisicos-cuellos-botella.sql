-- Recursos fisicos del salon: lavacabezas, cabinas, sillones, aparatologia.
--
-- El problema que resuelve: la agenda solo sabia si el PROFESIONAL estaba libre.
-- Pero si tres clientas terminan el reposo del tinte a la misma hora y el salon
-- tiene dos lavacabezas, la tercera espera con el tinte pasado de tiempo. Lo
-- mismo con la cabina de estetica: es una, y no admite dos laseres a la vez.
--
-- REGLA DE ORO: un salon que no configure recursos no nota absolutamente nada.
-- Sin filas en `recursos` la capacidad de cada tipo es cero, y cero significa
-- "no lo controlo", nunca "no cabe nadie". Esto no puede convertirse en un
-- salon que de pronto no puede reservar.
--
-- La ocupacion del profesional NO se toca: sigue siendo la de siempre
-- (lib/retrasos.ts y su equivalente SQL). Aqui se responde otra pregunta
-- distinta: cuantos puestos fisicos hay ocupados en un tramo.

-- ───────────────────────── 1. Tabla ─────────────────────────

create table if not exists public.recursos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  nombre text not null,
  tipo text not null check (tipo in ('lavacabezas', 'cabina', 'sillon', 'aparatologia')),
  -- Un mismo registro puede representar varios puestos identicos ("Lavacabezas",
  -- capacidad 3) o uno solo con nombre propio ("Cabina laser").
  capacidad integer not null default 1 check (capacidad between 1 and 50),
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_recursos_negocio_tipo
  on public.recursos (negocio_id, tipo) where activo;

alter table public.recursos enable row level security;

-- Politicas calcadas de `servicios`: mismo dueño, mismas reglas, y las llamadas
-- envueltas en (select ...) para que Postgres las evalue una vez por consulta y
-- no una vez por fila (ver decision 6 de CLAUDE.md).
drop policy if exists "recursos_select_propio_negocio" on public.recursos;
create policy "recursos_select_propio_negocio" on public.recursos
  for select using (
    negocio_id = (select profiles.negocio_id from profiles where profiles.id = (select auth.uid()))
  );

drop policy if exists "recursos_insert_propio_negocio" on public.recursos;
create policy "recursos_insert_propio_negocio" on public.recursos
  for insert with check (
    negocio_id = (select profiles.negocio_id from profiles where profiles.id = (select auth.uid()))
  );

drop policy if exists "recursos_update_propio_negocio" on public.recursos;
create policy "recursos_update_propio_negocio" on public.recursos
  for update using (
    negocio_id = (select profiles.negocio_id from profiles where profiles.id = (select auth.uid()))
  );

drop policy if exists "recursos_delete_propio_negocio" on public.recursos;
create policy "recursos_delete_propio_negocio" on public.recursos
  for delete using (
    negocio_id = (select profiles.negocio_id from profiles where profiles.id = (select auth.uid()))
  );

-- El visitante de la demo mira, no configura.
drop policy if exists "recursos_demo_block_insert" on public.recursos;
create policy "recursos_demo_block_insert" on public.recursos
  as restrictive for insert with check (not (select is_shared_demo_visitor()));

drop policy if exists "recursos_demo_block_update" on public.recursos;
create policy "recursos_demo_block_update" on public.recursos
  as restrictive for update using (not (select is_shared_demo_visitor()))
  with check (not (select is_shared_demo_visitor()));

drop policy if exists "recursos_demo_block_delete" on public.recursos;
create policy "recursos_demo_block_delete" on public.recursos
  as restrictive for delete using (not (select is_shared_demo_visitor()));

-- ────────────── 2. Que recurso pide cada servicio ──────────────

alter table public.servicios
  add column if not exists recurso_tipo text,
  add column if not exists recurso_fase text not null default 'final';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicios_recurso_tipo_check') then
    alter table public.servicios add constraint servicios_recurso_tipo_check
      check (recurso_tipo is null or recurso_tipo in ('lavacabezas', 'cabina', 'sillon', 'aparatologia'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servicios_recurso_fase_check') then
    alter table public.servicios add constraint servicios_recurso_fase_check
      check (recurso_fase in ('completa', 'final'));
  end if;
end $$;

comment on column public.servicios.recurso_tipo is
  'Puesto fisico que hace falta para dar este servicio. NULL = ninguno (lo normal).';
comment on column public.servicios.recurso_fase is
  'Cuando lo ocupa: "completa" toda la cita (cabina de estetica) o "final" solo el tramo de lavado y acabado, despues del reposo (lavacabezas).';

-- ───────────── 3. Tramo en que una cita ocupa su recurso ─────────────

-- Devuelve el hueco [desde, hasta) que una cita ocupa del recurso, o nada si el
-- servicio no pide ninguno.
--
-- El tramo "final" arranca donde acaba el reposo. Se usa el mismo coalesce que
-- el resto del sistema -- coalesce(fin_espera, fin_activa, inicio) -- porque una
-- cita sin fases marcadas no tiene reposo y ocupa desde el principio.
create or replace function public.recurso_tramo_de_cita(p_cita_id uuid)
returns table (tipo text, desde timestamptz, hasta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.recurso_tipo,
    case when s.recurso_fase = 'completa'
      then c.inicio
      else coalesce(c.fin_espera, c.fin_activa, c.inicio)
    end,
    c.fin
  from citas c
  join servicios s on s.id = c.servicio_id
  where c.id = p_cita_id
    -- Es SECURITY DEFINER: sin esto, pasarle el id de una cita ajena devolveria
    -- las horas de un cliente de otro salon.
    and c.negocio_id = (select my_negocio_id_text())
    and s.recurso_tipo is not null;
$$;

-- ───────────── 4. Cuanto sitio queda de un tipo de recurso ─────────────
--
-- Ninguna de estas funciones recibe el negocio por parametro: lo saca del perfil
-- de quien llama. Son SECURITY DEFINER, asi que un negocio_id de entrada seria
-- un agujero -- cualquier usuario podria contar los lavacabezas ocupados del
-- salon de al lado sin mas que cambiar una cadena en la llamada.

-- Puestos totales de un tipo en el salon de quien pregunta. Cero = no lo controla.
create or replace function public.recursos_capacidad(p_tipo text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(capacidad), 0)::int
  from recursos
  where negocio_id = (select my_negocio_id_text())
    and tipo = p_tipo
    and activo;
$$;

-- Puestos de ese tipo ocupados por citas que pisan el tramo [p_desde, p_hasta).
-- Los estados que cuentan son los mismos que bloquean solape en el resto del
-- sistema (pendiente, confirmada, completada): una cancelada libera el puesto.
create or replace function public.recursos_ocupados(
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from citas c
  join servicios s on s.id = c.servicio_id
  where c.negocio_id = (select my_negocio_id_text())
    and s.recurso_tipo = p_tipo
    and c.estado in ('pendiente', 'confirmada', 'completada')
    and coalesce(c.oculta_en_calendario, false) = false
    and (p_excluir_cita is null or c.id <> p_excluir_cita)
    -- Solape a medio abierto: dos tramos que solo se tocan en el borde no chocan.
    and (case when s.recurso_fase = 'completa'
              then c.inicio
              else coalesce(c.fin_espera, c.fin_activa, c.inicio) end) < p_hasta
    and c.fin > p_desde;
$$;

-- La pregunta que hace la agenda: ¿cabe una cita mas de este tipo en este tramo?
-- Sin recursos configurados devuelve true SIEMPRE: no controlar no es no caber.
create or replace function public.recurso_hay_hueco(
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_tipo is null then true
    when public.recursos_capacidad(p_tipo) = 0 then true
    else public.recursos_ocupados(p_tipo, p_desde, p_hasta, p_excluir_cita)
         < public.recursos_capacidad(p_tipo)
  end;
$$;

-- ───────────── 5. Permisos ─────────────
--
-- Desde el round 4 (CLAUDE.md decision 4) las funciones nuevas no nacen
-- ejecutables por anon: hay que concederlo a mano y aqui NO se concede. El
-- portal publico no pregunta por recursos todavia; cuando lo haga sera desde
-- una RPC que ya sepa de que salon habla.
revoke all on function public.recurso_tramo_de_cita(uuid) from public, anon;
revoke all on function public.recursos_capacidad(text) from public, anon;
revoke all on function public.recursos_ocupados(text, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.recurso_hay_hueco(text, timestamptz, timestamptz, uuid) from public, anon;

grant execute on function public.recurso_tramo_de_cita(uuid) to authenticated, service_role;
grant execute on function public.recursos_capacidad(text) to authenticated, service_role;
grant execute on function public.recursos_ocupados(text, timestamptz, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.recurso_hay_hueco(text, timestamptz, timestamptz, uuid) to authenticated, service_role;
