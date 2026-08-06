-- Cuando la app peta en casa de un salon, que nos enteremos.
--
-- Hasta ahora, si a una peluquera se le quedaba la pantalla en blanco, lo unico
-- que pasaba era un console.error en SU navegador. Nadie en Mecha se enteraba
-- nunca: ni cuantos, ni donde, ni desde cuando. Para un software que se vende
-- como "no falla", no tener ni idea de si falla es el agujero mas grande de
-- todos, porque tapa a todos los demas.
--
-- Esto es lo minimo honesto: una tabla, una funcion para escribir con freno, y
-- una para que el equipo de Mecha lo lea desde su panel. Sin servicios de
-- terceros, sin datos personales de clientas (se guarda el mensaje del error y
-- un trozo de pila, recortados).

create table if not exists public.errores_cliente (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  negocio_id  text,
  user_id     uuid,
  -- 'app' (el software), 'portal' (pantallas publicas), 'landing'.
  origen      text not null default 'app',
  ruta        text,
  mensaje     text not null,
  pila        text,
  navegador   text,
  -- Para agrupar repeticiones del mismo fallo sin leer texto libre.
  huella      text
);

create index if not exists errores_cliente_ts on public.errores_cliente (creado_en desc);
create index if not exists errores_cliente_huella on public.errores_cliente (huella, creado_en desc);

alter table public.errores_cliente enable row level security;
-- Sin politicas: se escribe por RPC y se lee por RPC (solo staff). Un salon no
-- tiene por que ver los errores de otro.

-- --- Escribir ---------------------------------------------------------------
-- La llama el navegador (autenticado o anonimo). Con freno por IP para que un
-- bucle de renderizado no nos meta diez mil filas en un minuto.
create or replace function public.registrar_error_cliente(
  p_mensaje   text,
  p_ruta      text default null,
  p_pila      text default null,
  p_origen    text default 'app',
  p_navegador text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip      text := public.request_ip();
  v_mensaje text := left(btrim(coalesce(p_mensaje, '')), 500);
begin
  if v_mensaje = '' then return; end if;

  -- 30 errores por hora y por IP: suficiente para ver un fallo repetido, poco
  -- para que sirva de inundacion.
  if v_ip <> '' and not public.check_rate_limit('errores_cliente', v_ip, 30, 60) then
    return;
  end if;

  insert into public.errores_cliente (negocio_id, user_id, origen, ruta, mensaje, pila, navegador, huella)
  values (
    public.my_negocio_id_text(),
    auth.uid(),
    case when p_origen in ('app', 'portal', 'landing') then p_origen else 'app' end,
    left(coalesce(p_ruta, ''), 200),
    v_mensaje,
    left(coalesce(p_pila, ''), 2000),
    left(coalesce(p_navegador, ''), 200),
    md5(v_mensaje || coalesce(left(p_ruta, 200), ''))
  );
end;
$$;

grant execute on function public.registrar_error_cliente(text, text, text, text, text) to anon, authenticated;

-- --- Leer (solo el equipo de Mecha) -----------------------------------------
-- Agrupado por huella: interesa "este fallo ha pasado 40 veces en 3 salones",
-- no cuarenta filas iguales.
create or replace function public.staff_errores_cliente(p_dias int default 7, p_limit int default 50)
returns table (
  huella      text,
  mensaje     text,
  ruta        text,
  origen      text,
  veces       int,
  salones     int,
  primera_vez timestamptz,
  ultima_vez  timestamptz,
  pila        text
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
  select e.huella,
         min(e.mensaje),
         min(e.ruta),
         min(e.origen),
         count(*)::int,
         count(distinct e.negocio_id)::int,
         min(e.creado_en),
         max(e.creado_en),
         (array_agg(e.pila order by e.creado_en desc))[1]
    from public.errores_cliente e
   where e.creado_en > now() - make_interval(days => greatest(p_dias, 1))
   group by e.huella
   order by max(e.creado_en) desc
   limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.staff_errores_cliente(int, int) to authenticated;

-- Higiene: los errores viejos no interesan y la tabla no debe crecer sin fin.
select cron.schedule(
  'mecha_purga_errores_cliente',
  '30 4 * * *',
  $$delete from public.errores_cliente where creado_en < now() - interval '60 days'$$
);

notify pgrst, 'reload schema';
