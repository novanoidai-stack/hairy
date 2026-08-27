-- Portal de reserva: "¿seguro que no te falta nada?"
--
-- Antes de pasar de servicio a hora, el portal propone los servicios que la
-- clienta suele olvidar (los que da por incluidos: lavado, peinado, matiz...).
-- Si acepta, la reserva pasa a ser una CADENA de citas encadenadas
-- (`grupo_id`), no una cita mas larga: la agenda ya sabe tratarlas asi y cada
-- tramo conserva su servicio, su precio y su duracion.
--
-- De donde salen las sugerencias — TRES fuentes, en este orden de prioridad:
--   1. MANUAL      el dueño lo fija en Ajustes -> Servicios. Manda siempre.
--   2. APRENDIDO   lo deduce el historial del propio salon (ver umbrales abajo).
--   3. (el copy)   un LLM barato solo REDACTA la frase sobre los candidatos ya
--                  elegidos aqui. Nunca elige el servicio: mismo patron que
--                  `lib/upsellCandidato.ts` en Caja.
--
-- El dueño siempre puede vetar: una fila manual con `activo=false` excluye ese
-- par aunque el historial lo proponga.

-- ---------------------------------------------------------------------------
-- 1) Tabla de pares "con este servicio, sugiere este otro"
-- ---------------------------------------------------------------------------
create table if not exists public.servicios_sugeridos (
  id           uuid primary key default gen_random_uuid(),
  negocio_id   text not null,
  servicio_id  uuid not null references public.servicios(id) on delete cascade,
  sugerido_id  uuid not null references public.servicios(id) on delete cascade,
  origen       text not null default 'manual' check (origen in ('manual','aprendido')),
  -- Solo para 'aprendido': cuantas visitas lo respaldan y con que confianza,
  -- para poder explicarlo en Ajustes ("en el 47% de tus colores").
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

-- RLS: cada salon ve y toca lo suyo. Llamadas envueltas en (select ...) para
-- que Postgres las evalue una vez por consulta y no una vez por fila.
drop policy if exists servicios_sugeridos_lectura on public.servicios_sugeridos;
create policy servicios_sugeridos_lectura on public.servicios_sugeridos
  for select to authenticated
  using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists servicios_sugeridos_escritura on public.servicios_sugeridos;
create policy servicios_sugeridos_escritura on public.servicios_sugeridos
  for all to authenticated
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- ---------------------------------------------------------------------------
-- 2) APRENDIZAJE — que tiene que pasar en la agenda para que un servicio
--    llegue solo al portal. Umbrales explicitos y conservadores: mejor no
--    sugerir nada que sugerir algo que descoloque a la clienta.
--
--      ventana        ultimos 180 dias
--      visita         citas del MISMO cliente en el MISMO dia (no canceladas
--                     ni no-shows). Da igual si se reservaron juntas o
--                     sueltas: lo que cuenta es que ocurrieron en la misma
--                     visita al salon.
--      soporte        el servicio base tiene que aparecer en >= 8 visitas
--      confianza      el sugerido acompaña al base en >= 30% de esas visitas
--      elegibilidad   el sugerido tiene que estar activo y reservable online
--      tope           3 sugeridos por servicio, los de mayor confianza
--
--    Con menos de 8 visitas no hay señal: un salon nuevo simplemente no
--    aprende nada y se queda con lo que el dueño configure a mano.
-- ---------------------------------------------------------------------------
create or replace function public.recalcular_sugerencias_servicios(p_negocio text default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas int := 0;
begin
  -- Se apagan primero todos los APRENDIDOS y el insert de abajo vuelve a
  -- encender los que siguen cumpliendo umbrales. Asi el recalculo es
  -- idempotente y un par que deja de cumplir desaparece solo. Los MANUALES no
  -- se tocan en ningun momento.
  update public.servicios_sugeridos
     set activo = false, updated_at = now()
   where origen = 'aprendido'
     and activo
     and (p_negocio is null or negocio_id = p_negocio);

  with visitas as (
    -- Una fila por (visita, servicio). `distinct` porque dos tramos del mismo
    -- servicio en el mismo dia son la misma intencion, no dos señales.
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
    having count(*) >= 8                      -- soporte minimo
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
     where 100.0 * p.visitas_juntos / b.visitas_base >= 30    -- confianza minima
  )
  insert into public.servicios_sugeridos
    (negocio_id, servicio_id, sugerido_id, origen, visitas, confianza, activo)
  select negocio_id, servicio_id, sugerido_id, 'aprendido', visitas_base, confianza, true
    from candidatos
   where puesto <= 3                            -- tope por servicio
  on conflict (servicio_id, sugerido_id) do update
     -- Una fila MANUAL nunca se pisa: el dueño manda sobre el historial.
     set visitas    = excluded.visitas,
         confianza  = excluded.confianza,
         activo     = true,
         updated_at = now()
   where public.servicios_sugeridos.origen = 'aprendido';

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

revoke all on function public.recalcular_sugerencias_servicios(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC PUBLICA del portal: que le proponemos a la clienta.
--    Anonima, por slug, y solo devuelve servicios reservables online. Nunca
--    expone nada que no salga ya en el catalogo del portal.
-- ---------------------------------------------------------------------------
create or replace function public.sugerencias_portal(p_slug text, p_servicio_ids uuid[])
returns table (
  id uuid,
  nombre text,
  descripcion text,
  precio numeric,
  duracion_min int,
  -- prepago del sugerido (ago-2026): sin esto el resumen del portal decia
  -- "pago en el salon" cuando un sugerido requeria senal (la cadena si la
  -- cobra bien en crear_cita_publica_cadena; era solo honestidad en el UI).
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
         -- 'manual' pesa mas que 'aprendido' si el par sale por las dos vias.
         (case when bool_or(ss.origen = 'manual') then 'manual' else 'aprendido' end)::text as motivo
    from public.servicios_sugeridos ss
    join public.servicios s on s.id = ss.sugerido_id
   where ss.negocio_id = v_negocio
     and ss.activo
     and ss.servicio_id = any(p_servicio_ids)
     -- lo que ya lleva en la cesta no se vuelve a sugerir
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

-- Decision 4 del CLAUDE.md: desde el round 4 las funciones nuevas NO nacen
-- ejecutables por anon; toda RPC publica necesita su grant explicito.
grant execute on function public.sugerencias_portal(text, uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) El aprendizaje se recalcula cada noche (04:10). Barato: recorre solo los
--    ultimos 180 dias de citas.
-- ---------------------------------------------------------------------------
-- select cron.schedule('mecha_sugerencias_servicios', '10 4 * * *',
--                      'select public.recalcular_sugerencias_servicios();');

-- Par extra del salon de demo: el recorrido guiado abre el PRIMER servicio de
-- la lista (alfabetico: "Barba express con navaja") para enseñar el paso
-- "¿te falta algo?", asi que ese servicio necesita tener algo que sugerir.
insert into public.servicios_sugeridos (negocio_id, servicio_id, sugerido_id, origen)
select 'demo_salon_001', b.id, s.id, 'manual'
  from public.servicios b
  join public.servicios s on s.negocio_id = 'demo_salon_001'
 where b.negocio_id = 'demo_salon_001'
   and b.nombre = 'Barba express con navaja'
   and s.nombre = 'Corte caballero y peinado'
on conflict (servicio_id, sugerido_id) do nothing;
