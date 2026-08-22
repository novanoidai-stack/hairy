-- migrations/errores-sistema-integral.sql
-- Ampliación de telemetría de errores del sistema y panel de staff Mecha.
-- 1. Permite tipos: 'excepcion', 'operativo', 'ia', 'creditos', 'red'.
-- 2. Permite orígenes: 'app', 'portal', 'landing', 'marketplace', 'edge_function'.
-- 3. Añade flujo de resolución: 'nuevo', 'en_revision', 'resuelto', 'ignorado' con notas y timestamp.
-- 4. Actualiza registrar_error_cliente y staff_errores_cliente.
-- 5. Añade staff_marcar_error para resolver incidencias desde el panel.

-- A) Eliminar constraints antiguos si existen y crear los nuevos
alter table public.errores_cliente
  drop constraint if exists errores_cliente_tipo_check,
  drop constraint if exists errores_cliente_origen_check;

alter table public.errores_cliente
  add constraint errores_cliente_tipo_check
    check (tipo in ('excepcion', 'operativo', 'ia', 'creditos', 'red'));

alter table public.errores_cliente
  add constraint errores_cliente_origen_check
    check (origen in ('app', 'portal', 'landing', 'marketplace', 'edge_function'));

alter table public.errores_cliente
  add column if not exists estado text not null default 'nuevo'
    check (estado in ('nuevo', 'en_revision', 'resuelto', 'ignorado')),
  add column if not exists resuelto_en timestamptz,
  add column if not exists resuelto_por text,
  add column if not exists notas_staff text;

create index if not exists idx_errores_cliente_estado on public.errores_cliente(estado, creado_en desc);
create index if not exists idx_errores_cliente_huella on public.errores_cliente(huella);

-- B) Borrar versiones previas de las funciones para permitir nuevas firmas
drop function if exists public.registrar_error_cliente(text, text, text, text, text, text);
drop function if exists public.staff_errores_cliente(int, int);
drop function if exists public.staff_errores_cliente(int, int, text, text, text);
drop function if exists public.staff_marcar_error(text, text, text);

-- C) Función para registrar errores desde cualquier punto (anon y authenticated)
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
  v_ip        text := public.request_ip();
  v_mensaje   text := left(btrim(coalesce(p_mensaje, '')), 500);
  v_origen    text := lower(coalesce(p_origen, 'app'));
  v_tipo      text := lower(coalesce(p_tipo, 'excepcion'));
  v_lower_msg text;
begin
  if v_mensaje = '' then return; end if;

  -- Clasificación inteligente si viene como operativo/excepcion genérica pero es de IA o créditos
  v_lower_msg := lower(v_mensaje || ' ' || coalesce(p_pila, ''));
  if v_tipo in ('excepcion', 'operativo') then
    if v_lower_msg ~* 'key limit|403|quota|credits?|insufficient_quota|balance|payment required|billing|402' then
      v_tipo := 'creditos';
    elsif v_lower_msg ~* 'openrouter|chispa|model_not_found|edge function|tokens|completions' then
      v_tipo := 'ia';
    elsif v_lower_msg ~* 'failed to fetch|networkerror|fetch failed|err_network|timeout|connection' then
      v_tipo := 'red';
    end if;
  end if;

  -- Validar que caiga en los dominios permitidos
  if v_origen not in ('app', 'portal', 'landing', 'marketplace', 'edge_function') then
    v_origen := 'app';
  end if;
  if v_tipo not in ('excepcion', 'operativo', 'ia', 'creditos', 'red') then
    v_tipo := 'excepcion';
  end if;

  -- Rate limit por IP para no saturar BD
  if v_ip <> '' and not public.check_rate_limit('errores_cliente', v_ip, 40, 60) then
    return;
  end if;

  insert into public.errores_cliente (
    negocio_id,
    user_id,
    origen,
    ruta,
    mensaje,
    pila,
    navegador,
    huella,
    tipo,
    estado
  )
  values (
    public.my_negocio_id_text(),
    auth.uid(),
    v_origen,
    left(coalesce(p_ruta, ''), 200),
    v_mensaje,
    left(coalesce(p_pila, ''), 2000),
    left(coalesce(p_navegador, ''), 200),
    md5(v_mensaje || coalesce(left(p_ruta, 200), '')),
    v_tipo,
    'nuevo'
  );
end;
$$;

grant execute on function public.registrar_error_cliente(text, text, text, text, text, text) to anon, authenticated;

-- D) Función para que el staff consulte errores con filtros
create or replace function public.staff_errores_cliente(
  p_dias      int default 7,
  p_limit     int default 50,
  p_estado    text default null,
  p_origen    text default null,
  p_tipo      text default null
)
returns table (
  huella        text,
  mensaje       text,
  ruta          text,
  origen        text,
  tipo          text,
  estado        text,
  veces         int,
  salones       int,
  primera_vez   timestamptz,
  ultima_vez    timestamptz,
  pila          text,
  resuelto_en   timestamptz,
  resuelto_por  text,
  notas_staff   text
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
         min(e.mensaje) as mensaje,
         min(e.ruta) as ruta,
         min(e.origen) as origen,
         min(e.tipo) as tipo,
         (array_agg(e.estado order by e.creado_en desc))[1] as estado,
         count(*)::int as veces,
         count(distinct e.negocio_id)::int as salones,
         min(e.creado_en) as primera_vez,
         max(e.creado_en) as ultima_vez,
         (array_agg(e.pila order by e.creado_en desc))[1] as pila,
         max(e.resuelto_en) as resuelto_en,
         (array_agg(e.resuelto_por order by e.resuelto_en desc nulls last))[1] as resuelto_por,
         (array_agg(e.notas_staff order by e.resuelto_en desc nulls last))[1] as notas_staff
    from public.errores_cliente e
   where e.creado_en > now() - make_interval(days => greatest(p_dias, 1))
     and (p_estado is null or p_estado = '' or e.estado = p_estado)
     and (p_origen is null or p_origen = '' or e.origen = p_origen)
     and (p_tipo is null or p_tipo = '' or e.tipo = p_tipo)
   group by e.huella
   order by max(e.creado_en) desc
   limit greatest(p_limit, 1);
end;
$$;

grant execute on function public.staff_errores_cliente(int, int, text, text, text) to authenticated;

-- E) Función para marcar / resolver errores por huella
create or replace function public.staff_marcar_error(
  p_huella text,
  p_estado text,
  p_notas  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_count      int;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  if p_estado not in ('nuevo', 'en_revision', 'resuelto', 'ignorado') then
    raise exception 'Estado no valido';
  end if;

  select email into v_user_email from public.profiles where id = auth.uid();

  update public.errores_cliente
     set estado = p_estado,
         resuelto_en = case when p_estado in ('resuelto', 'ignorado') then now() else null end,
         resuelto_por = case when p_estado in ('resuelto', 'ignorado') then coalesce(v_user_email, auth.uid()::text) else null end,
         notas_staff = coalesce(p_notas, notas_staff)
   where huella = p_huella;

  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'actualizados', v_count, 'estado', p_estado);
end;
$$;

grant execute on function public.staff_marcar_error(text, text, text) to authenticated;

notify pgrst, 'reload schema';
