-- Migracion: resenas / valoraciones — C3
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Captura publica de valoraciones (estrellas + comentario) por slug del portal,
-- y display agregado (media, total, ultimas). Gestion interna por negocio_id.
-- El "pedir la resena" tras la cita (envio del enlace) es de Alexandro; aqui
-- queda la captura y el display, que es la parte de frontend/datos ligera.

create table if not exists public.resenas (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     text not null references public.negocio_portal(negocio_id) on delete cascade,
  cliente_id     uuid references public.clientes(id) on delete set null,
  cita_id        uuid references public.citas(id) on delete set null,
  profesional_id uuid references public.profesionales(id) on delete set null,
  servicio_id    uuid references public.servicios(id) on delete set null,
  puntuacion     smallint not null check (puntuacion between 1 and 5),
  comentario     text,
  autor_nombre   text,
  fuente         text not null default 'web' check (fuente in ('web','manual')),
  visible        boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.resenas enable row level security;

drop policy if exists resenas_negocio_all on public.resenas;
create policy resenas_negocio_all on public.resenas
  for all to authenticated
  using (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()))
  with check (negocio_id = (select p.negocio_id from public.profiles p where p.id = auth.uid()));

create index if not exists resenas_negocio_idx on public.resenas (negocio_id, visible, created_at desc);

-- Crear resena (anon, por slug del portal)
create or replace function public.crear_resena_publica(
  p_slug          text,
  p_puntuacion    smallint,
  p_comentario    text,
  p_autor_nombre  text,
  p_profesional_id uuid default null,
  p_servicio_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_id uuid;
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then raise exception 'Portal no disponible'; end if;
  if p_puntuacion is null or p_puntuacion < 1 or p_puntuacion > 5 then raise exception 'Puntuacion invalida'; end if;

  if p_profesional_id is not null and not exists (
    select 1 from public.profesionales where id = p_profesional_id and negocio_id = v_negocio
  ) then p_profesional_id := null; end if;
  if p_servicio_id is not null and not exists (
    select 1 from public.servicios where id = p_servicio_id and negocio_id = v_negocio
  ) then p_servicio_id := null; end if;

  insert into public.resenas (negocio_id, profesional_id, servicio_id, puntuacion, comentario, autor_nombre, fuente, visible)
  values (v_negocio, p_profesional_id, p_servicio_id, p_puntuacion, nullif(trim(p_comentario), ''), nullif(trim(p_autor_nombre), ''), 'web', true)
  returning id into v_id;

  return jsonb_build_object('resena_id', v_id, 'ok', true);
end;
$$;

-- Resumen publico de resenas por slug (media, total, ultimas 10 visibles)
create or replace function public.resenas_publicas(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_media numeric;
  v_total int;
  v_ultimas jsonb;
begin
  select negocio_id into v_negocio from public.negocio_portal where slug = p_slug and portal_activo = true;
  if v_negocio is null then return null; end if;

  select coalesce(round(avg(puntuacion)::numeric, 1), 0), count(*)
    into v_media, v_total
  from public.resenas where negocio_id = v_negocio and visible;

  select coalesce(jsonb_agg(jsonb_build_object(
           'puntuacion', puntuacion, 'comentario', comentario, 'autor', autor_nombre, 'fecha', created_at
         )), '[]'::jsonb)
    into v_ultimas
  from (
    select puntuacion, comentario, autor_nombre, created_at
    from public.resenas
    where negocio_id = v_negocio and visible
    order by created_at desc limit 10
  ) x;

  return jsonb_build_object('media', v_media, 'total', v_total, 'ultimas', v_ultimas);
end;
$$;

revoke all on function public.crear_resena_publica(text, smallint, text, text, uuid, uuid) from public;
grant execute on function public.crear_resena_publica(text, smallint, text, text, uuid, uuid) to anon, authenticated;
revoke all on function public.resenas_publicas(text) from public;
grant execute on function public.resenas_publicas(text) to anon, authenticated;
