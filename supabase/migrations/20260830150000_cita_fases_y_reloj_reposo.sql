-- ===========================================================================
-- Migración: Reposos asíncronos múltiples (cita_fases) y Reloj de reposo en vivo
-- Fecha: 2026-08-30 15:00:00
-- Specs 1 y 4
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TABLA CITA_FASES
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.cita_fases (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null,
  cita_id        uuid not null references public.citas(id) on delete cascade,
  orden          smallint not null,
  tipo           text not null check (tipo in ('activa', 'reposo', 'transicion')),
  inicio         timestamptz not null,
  fin            timestamptz not null,
  profesional_id uuid references public.profesionales(id),
  recurso_tipo   text,
  etiqueta       text,
  iniciada_at    timestamptz,
  cerrada_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (cita_id, orden)
);

create index if not exists idx_cita_fases_cita on public.cita_fases (negocio_id, cita_id);
create index if not exists idx_cita_fases_prof_tiempo on public.cita_fases (negocio_id, profesional_id, inicio, fin);
create index if not exists idx_cita_fases_tipo on public.cita_fases (negocio_id, tipo);

-- RLS
alter table public.cita_fases enable row level security;

drop policy if exists cita_fases_tenant_select on public.cita_fases;
create policy cita_fases_tenant_select on public.cita_fases
  for select
  using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists cita_fases_tenant_all on public.cita_fases;
create policy cita_fases_tenant_all on public.cita_fases
  for all
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TRIGGER DE SINCRONIZACIÓN: CITA_FASES -> CITAS (4 MARCAS DE RESUMEN)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.sync_citas_from_fases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cita_id uuid;
  v_ini timestamptz;
  v_fin timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
begin
  v_cita_id := coalesce(new.cita_id, old.cita_id);
  if v_cita_id is null then return null; end if;

  select min(inicio), max(fin)
    into v_ini, v_fin
  from public.cita_fases
  where cita_id = v_cita_id;

  if v_ini is not null then
    -- Fin de la primera fase activa
    select fin into v_fin_activa
    from public.cita_fases
    where cita_id = v_cita_id and tipo = 'activa'
    order by orden asc limit 1;

    -- Fin del primer reposo
    select fin into v_fin_espera
    from public.cita_fases
    where cita_id = v_cita_id and tipo = 'reposo'
    order by orden asc limit 1;

    update public.citas set
      inicio = v_ini,
      fin = v_fin,
      fin_activa = coalesce(v_fin_activa, v_fin),
      fin_espera = coalesce(v_fin_espera, coalesce(v_fin_activa, v_fin))
    where id = v_cita_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_citas_from_fases on public.cita_fases;
create trigger trg_sync_citas_from_fases
after insert or update or delete on public.cita_fases
for each row execute function public.sync_citas_from_fases();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER DE INICIALIZACIÓN: CITAS LEGACY -> CITA_FASES
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.seed_fases_from_cita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_srv_fases jsonb;
  v_fase jsonb;
  v_cursor timestamptz;
  v_dur int;
  v_orden smallint := 1;
begin
  -- Solo se ejecuta si la cita no tiene fases creadas todavia
  if exists (select 1 from public.cita_fases where cita_id = new.id) then
    return new;
  end if;

  -- Comprobar si el servicio tiene fases estructuradas en catalogo
  select fases into v_srv_fases
  from public.servicios
  where id = new.servicio_id;

  if v_srv_fases is not null and jsonb_array_length(v_srv_fases) > 0 then
    v_cursor := new.inicio;
    for v_fase in select * from jsonb_array_elements(v_srv_fases) loop
      v_dur := coalesce((v_fase->>'min')::int, 0);
      if v_dur > 0 then
        insert into public.cita_fases (
          negocio_id, cita_id, orden, tipo, inicio, fin,
          profesional_id, recurso_tipo, etiqueta
        ) values (
          new.negocio_id,
          new.id,
          v_orden,
          coalesce(v_fase->>'tipo', 'activa'),
          v_cursor,
          v_cursor + make_interval(mins => v_dur),
          new.profesional_id,
          v_fase->>'recurso_tipo',
          v_fase->>'etiqueta'
        );
        v_cursor := v_cursor + make_interval(mins => v_dur);
        v_orden := v_orden + 1;
      end if;
    end loop;
  else
    -- Descomposicion clasica a partir de fin_activa / fin_espera
    if new.fin_activa is not null and new.fin_espera is not null
       and new.fin_espera > new.fin_activa then
      -- Fase 1: Activa
      insert into public.cita_fases (
        negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta
      ) values (
        new.negocio_id, new.id, 1, 'activa', new.inicio, new.fin_activa, new.profesional_id, 'Aplicación'
      );
      -- Fase 2: Reposo
      insert into public.cita_fases (
        negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta
      ) values (
        new.negocio_id, new.id, 2, 'reposo', new.fin_activa, new.fin_espera, new.profesional_id, 'Reposo técnico'
      );
      -- Fase 3: Activa final (si existe tiempo tras el reposo)
      if new.fin > new.fin_espera then
        insert into public.cita_fases (
          negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta
        ) values (
          new.negocio_id, new.id, 3, 'activa', new.fin_espera, new.fin, new.profesional_id, 'Lavado y peinado'
        );
      end if;
    else
      -- Cita simple de una sola fase activa
      insert into public.cita_fases (
        negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta
      ) values (
        new.negocio_id, new.id, 1, 'activa', new.inicio, new.fin, new.profesional_id, 'Servicio'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seed_fases_from_cita on public.citas;
create trigger trg_seed_fases_from_cita
after insert on public.citas
for each row execute function public.seed_fases_from_cita();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. SPEC 4: RELOJ DE REPOSO EN VIVO (RPCS DE CRONOMETRAJE)
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.iniciar_fase_reposo(
  p_cita_id uuid,
  p_orden smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_fase_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_minutos int;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  -- Buscar la fase de reposo correspondiente
  select id, inicio, fin into v_fase_id, v_inicio, v_fin
  from public.cita_fases
  where negocio_id = v_negocio
    and cita_id = p_cita_id
    and tipo = 'reposo'
    and (p_orden is null or orden = p_orden)
    and cerrada_at is null
  order by orden asc
  limit 1;

  if v_fase_id is null then
    return jsonb_build_object('ok', false, 'error', 'No se encontró fase de reposo activa para esta cita');
  end if;

  update public.cita_fases set
    iniciada_at = now()
  where id = v_fase_id;

  v_minutos := round(extract(epoch from (v_fin - v_inicio)) / 60)::int;

  return jsonb_build_object(
    'ok', true,
    'fase_id', v_fase_id,
    'iniciada_at', now(),
    'duracion_planificada_min', v_minutos
  );
end;
$$;

create or replace function public.finalizar_fase_reposo(
  p_cita_id uuid,
  p_orden smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_fase record;
  v_desvio_min int;
  v_real_min int;
  v_plan_min int;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select * into v_fase
  from public.cita_fases
  where negocio_id = v_negocio
    and cita_id = p_cita_id
    and tipo = 'reposo'
    and (p_orden is null or orden = p_orden)
    and cerrada_at is null
  order by orden asc
  limit 1;

  if v_fase.id is null then
    return jsonb_build_object('ok', false, 'error', 'No hay fase de reposo pendiente de cerrar');
  end if;

  update public.cita_fases set
    cerrada_at = now(),
    iniciada_at = coalesce(v_fase.iniciada_at, v_fase.inicio)
  where id = v_fase.id;

  v_plan_min := round(extract(epoch from (v_fase.fin - v_fase.inicio)) / 60)::int;
  v_real_min := round(extract(epoch from (now() - coalesce(v_fase.iniciada_at, v_fase.inicio))) / 60)::int;
  v_desvio_min := v_real_min - v_plan_min;

  return jsonb_build_object(
    'ok', true,
    'fase_id', v_fase.id,
    'cerrada_at', now(),
    'duracion_real_min', v_real_min,
    'desvio_min', v_desvio_min
  );
end;
$$;

grant execute on function public.iniciar_fase_reposo(uuid, smallint) to authenticated, service_role;
grant execute on function public.finalizar_fase_reposo(uuid, smallint) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. MIGRACIÓN INICIAL DE CITAS EXISTENTES (POBLAR CITA_FASES)
-- ───────────────────────────────────────────────────────────────────────────

insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
select
  c.negocio_id,
  c.id,
  1,
  'activa',
  c.inicio,
  coalesce(c.fin_activa, c.fin),
  c.profesional_id,
  'Servicio'
from public.citas c
where not exists (select 1 from public.cita_fases cf where cf.cita_id = c.id)
on conflict do nothing;

-- Añadir reposo para las que tenían fin_espera > fin_activa
insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
select
  c.negocio_id,
  c.id,
  2,
  'reposo',
  c.fin_activa,
  c.fin_espera,
  c.profesional_id,
  'Reposo técnico'
from public.citas c
where c.fin_activa is not null
  and c.fin_espera is not null
  and c.fin_espera > c.fin_activa
  and not exists (select 1 from public.cita_fases cf where cf.cita_id = c.id and cf.orden = 2)
on conflict do nothing;

-- Añadir fase final para las que tenían fin > fin_espera
insert into public.cita_fases (negocio_id, cita_id, orden, tipo, inicio, fin, profesional_id, etiqueta)
select
  c.negocio_id,
  c.id,
  3,
  'activa',
  c.fin_espera,
  c.fin,
  c.profesional_id,
  'Lavado y peinado'
from public.citas c
where c.fin_activa is not null
  and c.fin_espera is not null
  and c.fin > c.fin_espera
  and not exists (select 1 from public.cita_fases cf where cf.cita_id = c.id and cf.orden = 3)
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. TRIGGER DE DESPLAZAMIENTO: ARRASTRE DE CITAS -> DESPLAZAR CITA_FASES
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.shift_fases_on_cita_move()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta interval;
begin
  if new.inicio is distinct from old.inicio and exists (select 1 from public.cita_fases where cita_id = new.id) then
    v_delta := new.inicio - old.inicio;
    update public.cita_fases set
      inicio = inicio + v_delta,
      fin = fin + v_delta,
      iniciada_at = case when iniciada_at is not null then iniciada_at + v_delta else null end,
      cerrada_at = case when cerrada_at is not null then cerrada_at + v_delta else null end
    where cita_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shift_fases_on_cita_move on public.citas;
create trigger trg_shift_fases_on_cita_move
after update of inicio on public.citas
for each row
when (pg_trigger_depth() < 2)
execute function public.shift_fases_on_cita_move();

