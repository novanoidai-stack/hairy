-- Canal directo salon -> Mecha. Hasta ahora "escribirnos" era un mailto: que
-- abre el cliente de correo del salon (sigue existiendo, esta bien para quien
-- lo prefiera). Esto es el otro camino: un mensaje que aterriza al instante en
-- el panel de staff, sin depender de que el navegador tenga un cliente de
-- correo configurado ni de que el salon se acuerde de darle a "enviar".

create table if not exists public.soporte_mensajes (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  negocio_id  text,
  user_id     uuid,
  autor_nombre text,
  autor_email  text,
  asunto      text not null,
  mensaje     text not null,
  estado      text not null default 'nuevo' check (estado in ('nuevo', 'leido', 'resuelto')),
  leido_en    timestamptz,
  resuelto_en timestamptz
);

create index if not exists soporte_mensajes_ts on public.soporte_mensajes (creado_en desc);
create index if not exists soporte_mensajes_estado on public.soporte_mensajes (estado, creado_en desc);

alter table public.soporte_mensajes enable row level security;
-- Sin politicas: se escribe y se lee por RPC. Un salon no ve los mensajes de otro.

-- --- Escribir ---------------------------------------------------------------
create or replace function public.crear_mensaje_soporte(p_asunto text, p_mensaje text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asunto  text := left(btrim(coalesce(p_asunto, '')), 200);
  v_mensaje text := left(btrim(coalesce(p_mensaje, '')), 4000);
  v_uid     uuid := auth.uid();
  v_nombre  text;
  v_email   text;
  v_negocio text;
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'not_authorized';
  end if;
  if v_asunto = '' or v_mensaje = '' then
    raise exception 'faltan_datos';
  end if;
  if not public.check_rate_limit('soporte_mensajes', v_uid::text, 10, 60) then
    raise exception 'demasiados_mensajes';
  end if;

  select nombre_negocio, coalesce(nombre || ' ' || coalesce(apellido, ''), email), email
    into v_negocio, v_nombre, v_email
    from public.profiles where id = v_uid;

  insert into public.soporte_mensajes (negocio_id, user_id, autor_nombre, autor_email, asunto, mensaje)
  values (v_negocio, v_uid, btrim(v_nombre), v_email, v_asunto, v_mensaje)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.crear_mensaje_soporte(text, text) to authenticated;

-- --- Leer / gestionar (solo el equipo de Mecha) ------------------------------
create or replace function public.staff_mensajes_soporte(p_estado text default null, p_limit int default 100)
returns table (
  id            bigint,
  creado_en     timestamptz,
  negocio_id    text,
  negocio_nombre text,
  autor_nombre  text,
  autor_email   text,
  asunto        text,
  mensaje       text,
  estado        text
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
  select m.id, m.creado_en, m.negocio_id,
         coalesce((select p.nombre_negocio from public.profiles p where p.negocio_id = m.negocio_id and p.role = 'owner' limit 1), m.negocio_id),
         m.autor_nombre, m.autor_email, m.asunto, m.mensaje, m.estado
    from public.soporte_mensajes m
   where p_estado is null or m.estado = p_estado
   order by m.creado_en desc
   limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.staff_mensajes_soporte(text, int) to authenticated;

create or replace function public.staff_marcar_soporte(p_id bigint, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_estado not in ('nuevo', 'leido', 'resuelto') then
    raise exception 'estado_no_valido';
  end if;

  update public.soporte_mensajes
     set estado = p_estado,
         leido_en = case when p_estado = 'leido' and leido_en is null then now() else leido_en end,
         resuelto_en = case when p_estado = 'resuelto' then now() else resuelto_en end
   where id = p_id;
end;
$$;

grant execute on function public.staff_marcar_soporte(bigint, text) to authenticated;

notify pgrst, 'reload schema';
