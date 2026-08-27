-- Sesion 15 · Festivos / cierres del salon completo
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Hoy los cierres son POR PROFESIONAL (bloqueos_profesional). Faltan los cierres a
-- nivel NEGOCIO (festivos, vacaciones del salon, dias sueltos). Esta migracion:
--   1) cierres_negocio: un dia completo cerrado para todo el salon. Multi-tenant.
--   2) El portal publico deja de ofrecer huecos esos dias: guard en
--      disponibilidad_publica (dia concreto) y portal_dias_disponibles (mes).
-- La AGENDA interna solo lo PINTA como cerrado (no bloquea al staff: puede seguir
-- creando una cita puntual si hace falta; coherente con el plan S15).
--
-- Los grants existentes de las dos RPC del portal se preservan con CREATE OR REPLACE
-- (no re-otorgamos: la ACL no se reinicia al reemplazar el cuerpo).

-- ─────────────────────────────────────────────────────────────────
-- 1) Tabla
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.cierres_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  fecha date not null,
  motivo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (negocio_id, fecha)
);

create index if not exists idx_cierres_negocio_neg_fecha on public.cierres_negocio (negocio_id, fecha);

alter table public.cierres_negocio enable row level security;

-- Lectura: cualquier miembro del negocio. Escritura: gestor (owner/admin), nunca en
-- el tenant demo compartido (un cierre dejaria la demo sin disponibilidad para todos).
drop policy if exists cierres_negocio_select on public.cierres_negocio;
create policy cierres_negocio_select on public.cierres_negocio
  for select to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

drop policy if exists cierres_negocio_insert on public.cierres_negocio;
create policy cierres_negocio_insert on public.cierres_negocio
  for insert to authenticated
  with check (
    negocio_id <> 'demo_salon_001'
    and negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin'))
  );

drop policy if exists cierres_negocio_delete on public.cierres_negocio;
create policy cierres_negocio_delete on public.cierres_negocio
  for delete to authenticated
  using (
    negocio_id <> 'demo_salon_001'
    and negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin'))
  );

-- ─────────────────────────────────────────────────────────────────
-- 2) Portal: no ofrecer huecos en dias cerrados
-- ─────────────────────────────────────────────────────────────────
create or replace function public.disponibilidad_publica(
  p_slug         text,
  p_servicio_id  uuid,
  p_fecha        date,
  p_profesional_id uuid default null
)
returns table(profesional_id uuid, profesional_nombre text, slot timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_total     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text := 'Europe/Madrid';
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  -- Salon cerrado ese dia (festivo/cierre completo): sin huecos.
  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0)
    into v_dur, v_espera, v_extra, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  v_total := v_dur + v_espera + v_extra;

  return query
  with profs as (
    select pr.id, pr.nombre
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           (g.ts at time zone v_tz) as slot_tz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => v_total),
      interval '15 minutes'
    ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz
  from gen
  join profs pr on pr.id = gen.profesional_id
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and c.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c.fin    > gen.slot_tz
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.slot_tz, pr.nombre;
end;
$function$;

create or replace function public.portal_dias_disponibles(
  p_slug           text,
  p_servicio_id    uuid,
  p_profesional_id uuid default null,
  p_dias           int  default 21
)
returns table(dia date)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_negocio text;
  v_total   int;
  v_min_ant int;
  v_tz      text := 'Europe/Madrid';
  v_hoy     date;
  v_dias    int := least(greatest(coalesce(p_dias, 21), 1), 60);
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select duracion_activa_min + coalesce(duracion_espera_min,0) + coalesce(duracion_activa_extra_min,0),
         coalesce(min_antelacion_min,0)
    into v_total, v_min_ant
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_total is null then return; end if;

  v_hoy := (now() at time zone v_tz)::date;

  return query
  with dias as (
    select gd::date as d
    from generate_series(v_hoy, v_hoy + (v_dias - 1), interval '1 day') gd
    where not exists (
      select 1 from public.cierres_negocio cn
      where cn.negocio_id = v_negocio and cn.fecha = gd::date
    )
  ),
  profs as (
    select pr.id
    from public.profesionales pr
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
  ),
  gen as (
    select d.d,
           p.id as profesional_id,
           (g.ts at time zone v_tz) as slot_tz
    from dias d
    cross join profs p
    join public.horarios_profesional h
      on h.profesional_id = p.id
     and h.dia_semana = extract(dow from d.d)::int
    cross join lateral generate_series(
      (d.d + h.hora_inicio),
      (d.d + h.hora_fin) - make_interval(mins => v_total),
      interval '15 minutes'
    ) as g(ts)
  )
  select distinct gen.d
  from gen
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and c.inicio < gen.slot_tz + make_interval(mins => v_total)
        and c.fin    > gen.slot_tz
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => v_total)
        and b.fin    > gen.slot_tz
    )
  order by gen.d;
end;
$function$;
