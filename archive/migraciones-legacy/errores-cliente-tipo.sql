-- Amplia el registro de errores: hasta ahora solo se capturaban excepciones no
-- controladas (pantalla en blanco). La mayoria de fallos que le importan a un
-- salon (cobro rechazado, login fallido, Chispa que no responde, formulario
-- que no valida) se manejan hoy con un mensaje bonito y nunca llegan aqui.
-- 'tipo' distingue el origen para que el staff pueda separar ruido de crashes.

alter table public.errores_cliente
  add column if not exists tipo text not null default 'excepcion'
    check (tipo in ('excepcion', 'operativo', 'ia'));

-- Cambia la firma (parametro nuevo al final) y el shape de retorno de la de
-- lectura: create or replace no permite eso, hay que borrar la version vieja
-- primero. Solo hay una version viva de cada una (sin overloads ambiguos).
drop function if exists public.registrar_error_cliente(text, text, text, text, text);
drop function if exists public.staff_errores_cliente(int, int);

create or replace function public.registrar_error_cliente(
  p_mensaje   text,
  p_ruta      text default null,
  p_pila      text default null,
  p_origen    text default 'app',
  p_navegador text default null,
  p_tipo      text default 'excepcion'
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

  if v_ip <> '' and not public.check_rate_limit('errores_cliente', v_ip, 30, 60) then
    return;
  end if;

  insert into public.errores_cliente (negocio_id, user_id, origen, ruta, mensaje, pila, navegador, huella, tipo)
  values (
    public.my_negocio_id_text(),
    auth.uid(),
    case when p_origen in ('app', 'portal', 'landing') then p_origen else 'app' end,
    left(coalesce(p_ruta, ''), 200),
    v_mensaje,
    left(coalesce(p_pila, ''), 2000),
    left(coalesce(p_navegador, ''), 200),
    md5(v_mensaje || coalesce(left(p_ruta, 200), '')),
    case when p_tipo in ('excepcion', 'operativo', 'ia') then p_tipo else 'excepcion' end
  );
end;
$$;

grant execute on function public.registrar_error_cliente(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.staff_errores_cliente(p_dias int default 7, p_limit int default 50)
returns table (
  huella      text,
  mensaje     text,
  ruta        text,
  origen      text,
  tipo        text,
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
         min(e.tipo),
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

notify pgrst, 'reload schema';
