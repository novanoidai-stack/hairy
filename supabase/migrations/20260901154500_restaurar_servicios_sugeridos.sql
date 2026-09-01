-- 1 sep 2026. Restaurar "¿te falta algo?" del portal (servicios sugeridos).
--
-- La tabla `servicios_sugeridos`, la RPC `sugerencias_portal` y el aprendizaje
-- `recalcular_sugerencias_servicios` solo existian en
-- archive/migraciones-legacy/portal-servicios-sugeridos.sql: nunca se portaron
-- a esta cadena. Un entorno reconstruido desde supabase/migrations se queda sin
-- la feature y el portal falla la RPC en silencio (getSugerenciasPortal traga
-- el error para no tumbar la reserva), asi que el paso "¿te falta algo?" no
-- aparece nunca. Se copia el SQL legacy tal cual: todo es idempotente
-- (create if not exists / or replace / on conflict do nothing), no rompe nada
-- donde ya exista.
--
-- Fuentes de sugerencia: manual (Ajustes -> Servicios, manda siempre) y
-- aprendido (>= 8 visitas con el servicio base en 180 dias y el sugerido en
-- >= 30% de ellas, tope de 3 por servicio).

-- 1) Tabla de pares "con este servicio, sugiere este otro"
create table if not exists public.servicios_sugeridos (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null,
  servicio_id  uuid not null references public.servicios(id) on delete cascade,
  sugerido_id  uuid not null references public.servicios(id) on delete cascade,
  origen       text not null default 'manual' check (origen in ('manual','aprendido')),
  visitas      int not null default 0,
  confianza    numeric(5,2) not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint servicios_sugeridos_distintos check (servicio_id <> sugerido_id),
  constraint servicios_sugeridos_par_unico unique (servicio_id, sugerido_id)
);

create index if not exists servicios_sugeridos_negocio_idx
  on public.servicios_sugeridos (negocio_id, servicio_id) where activo;

alter table public.servicios_sugeridos enable row level security;

drop policy if exists servicios_sugeridos_lectura on public.servicios_sugeridos;
create policy servicios_sugeridos_lectura on public.servicios_sugeridos
  for select to authenticated
  using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists servicios_sugeridos_escritura on public.servicios_sugeridos;
create policy servicios_sugeridos_escritura on public.servicios_sugeridos
  for all to authenticated
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- 2) APRENDIZAJE (umbrales del legacy: ventana 180d, soporte >= 8 visitas,
--    confianza >= 30%, tope 3 por servicio). Los MANUALES nunca se pisan.
create or replace function public.recalcular_sugerencias_servicios(p_negocio text default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas int := 0;
begin
  update public.servicios_sugeridos
     set activo = false, updated_at = now()
   where origen = 'aprendido'
     and activo
     and (p_negocio is null or negocio_id = p_negocio);

  with visitas as (
    select distinct
           c.negocio_id,
           c.cliente_id,
           (c.inicio at time zone 'Europe/Madrid')::date as dia,
           c.servicio_id
      from public.citas c
     where c.estado not in ('cancelada','no_presentada')
       and c.cliente_id is not null
       and c.servicio_id is not null
       and c.inicio >= now() - interval '180 days'
       and (p_negocio is null or c.negocio_id = p_negocio)
  ),
  base as (
    select negocio_id, servicio_id, count(*) as visitas_base
      from visitas
     group by negocio_id, servicio_id
    having count(*) >= 8
  ),
  pares as (
    select v1.negocio_id,
           v1.servicio_id                       as servicio_id,
           v2.servicio_id                       as sugerido_id,
           count(*)                             as visitas_juntos
      from visitas v1
      join visitas v2
        on v2.negocio_id = v1.negocio_id
       and v2.cliente_id = v1.cliente_id
       and v2.dia        = v1.dia
       and v2.servicio_id <> v1.servicio_id
     group by 1,2,3
  ),
  candidatos as (
    select p.negocio_id, p.servicio_id, p.sugerido_id,
           b.visitas_base,
           round(100.0 * p.visitas_juntos / b.visitas_base, 2) as confianza,
           row_number() over (
             partition by p.negocio_id, p.servicio_id
             order by p.visitas_juntos desc, p.sugerido_id
           ) as puesto
      from pares p
      join base b
        on b.negocio_id = p.negocio_id and b.servicio_id = p.servicio_id
      join public.servicios s
        on s.id = p.sugerido_id and s.activo and s.reservable_online
     where 100.0 * p.visitas_juntos / b.visitas_base >= 30
  )
  insert into public.servicios_sugeridos
    (negocio_id, servicio_id, sugerido_id, origen, visitas, confianza, activo)
  select negocio_id, servicio_id, sugerido_id, 'aprendido', visitas_base, confianza, true
    from candidatos
   where puesto <= 3
  on conflict (servicio_id, sugerido_id) do update
     set visitas    = excluded.visitas,
         confianza  = excluded.confianza,
         activo     = true,
         updated_at = now()
   where public.servicios_sugeridos.origen = 'aprendido';

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

-- Misma Decision 4 del CLAUDE.md que aplico 20260828211000: solo service_role
-- y cron (postgres). El propio 20260828211000 ya la revoca; aqui por si un
-- entorno la crea fresca.
revoke all on function public.recalcular_sugerencias_servicios(text) from public, anon, authenticated;

-- 3) RPC publica del portal: que le proponemos a la clienta. Solo responde
--    por slug con portal activo y solo servicios reservables online.
create or replace function public.sugerencias_portal(p_slug text, p_servicio_ids uuid[])
returns table (
  id uuid,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_min int,
  prepago boolean,
  motivo text
)
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare
  v_negocio text;
begin
  select negocio_id into v_negocio
    from public.negocio_portal
   where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  return query
  select s.id,
         s.nombre,
         s.descripcion,
         s.precio,
         (coalesce(s.duracion_activa_min,0) + coalesce(s.duracion_espera_min,0)
            + coalesce(s.duracion_activa_extra_min,0))::int as duracion_min,
         coalesce(s.prepago_requerido, false) as prepago,
         (case when bool_or(ss.origen = 'manual') then 'manual' else 'aprendido' end)::text as motivo
    from public.servicios_sugeridos ss
    join public.servicios s on s.id = ss.sugerido_id
   where ss.negocio_id = v_negocio
     and ss.activo
     and ss.servicio_id = any(p_servicio_ids)
     and not (ss.sugerido_id = any(p_servicio_ids))
     and s.activo
     and s.reservable_online
   group by s.id, s.nombre, s.descripcion, s.precio,
            s.duracion_activa_min, s.duracion_espera_min, s.duracion_activa_extra_min,
            s.prepago_requerido
   order by (case when bool_or(ss.origen = 'manual') then 0 else 1 end),
            max(ss.confianza) desc
   limit 3;
end;
$$;

-- RPC publica del portal de reservas: nace ejecutable por anon (Decision 4:
-- grant explicito) porque la clienta no tiene sesion.
grant execute on function public.sugerencias_portal(text, uuid[]) to anon, authenticated;

-- 4) Cron nocturno del aprendizaje (04:10), igual que en el legacy. Descomentar
--    si el proyecto tiene pg_cron habilitado:
-- select cron.schedule('mecha_sugerencias_servicios', '10 4 * * *',
--                      'select public.recalcular_sugerencias_servicios();');

-- 5) Par de demo para el recorrido guiado (el primer servicio de la lista
--    necesita algo que sugerir para ensenar el paso).
insert into public.servicios_sugeridos (negocio_id, servicio_id, sugerido_id, origen)
select 'demo_salon_001', b.id, s.id, 'manual'
  from public.servicios b
  join public.servicios s on s.negocio_id = 'demo_salon_001'
 where b.negocio_id = 'demo_salon_001'
   and b.nombre = 'Barba express con navaja'
   and s.nombre = 'Corte caballero y peinado'
on conflict (servicio_id, sugerido_id) do nothing;
