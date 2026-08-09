-- ─────────────────────────────────────────────────────────────────────────────
-- CONTROL HORARIO LEGAL — RPCs de registro de jornada
-- Carlos + Claude, 9 ago 2026. Complementa control-horario-legal.sql.
--
-- Todo pasa por aqui (security definer) para que:
--   · la hora del asiento sea la del SERVIDOR, nunca la del navegador;
--   · la secuencia de marcas sea coherente (no dos entradas seguidas);
--   · un empleado solo vea lo suyo y un gestor vea todo el centro, decidido en
--     el servidor y no en la UI.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Helper interno: contexto del usuario logueado
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.jornada_contexto()
returns table (uid uuid, negocio_id text, role text, es_gestor boolean, profesional_id uuid, nombre text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.negocio_id,
    p.role,
    p.role in ('owner', 'admin'),
    (select pr.id from public.profesionales pr
      where pr.profile_id = p.id and pr.negocio_id = p.negocio_id limit 1),
    trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, ''))
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 0-bis. ACCESO COMPARTIDO: quien esta delante de la tablet
-- ═════════════════════════════════════════════════════════════════════════════
-- En el modo "un salon, un correo" (salon_acceso.modo = 'compartido') la sesion
-- es siempre la del jefe, asi que auth.uid() NO dice quien esta fichando: lo
-- dice el selector "¿quien eres?" y llega por parametro. Aqui se comprueba lo
-- unico comprobable en el servidor: que esa ficha es de ESTE salon y que quien
-- la pide tiene derecho a hablar por ella. Mismo patron que mi_jornada_resumen.
--
-- Devuelve NULL = denegado (o "no tienes ficha", si no se pidio ninguna).
create or replace function public.jornada_resolver_profesional(
  p_uid uuid, p_negocio text, p_es_gestor boolean, p_mi_ficha uuid, p_pedido uuid
) returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_compartido boolean;
begin
  if p_pedido is null then return p_mi_ficha; end if;
  if p_pedido = p_mi_ficha then return p_pedido; end if;

  if not exists (select 1 from public.profesionales pr
                  where pr.id = p_pedido and pr.negocio_id = p_negocio) then
    return null;
  end if;

  if p_es_gestor then return p_pedido; end if;

  select true into v_compartido from public.salon_acceso sa
   where sa.negocio_id = p_negocio and sa.modo = 'compartido';
  if coalesce(v_compartido, false) then return p_pedido; end if;

  -- Un empleado con cuenta propia solo responde por si mismo.
  return null;
end;
$$;

revoke execute on function public.jornada_resolver_profesional(uuid, text, boolean, uuid, uuid)
  from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. jornada_tramos — de marcas sueltas a intervalos de trabajo y de pausa
-- ═════════════════════════════════════════════════════════════════════════════
-- Un tramo de TRABAJO va de 'entrada'/'pausa_fin' a 'salida'/'pausa_inicio'.
-- Un tramo de PAUSA va de 'pausa_inicio' a 'pausa_fin' y NO computa como
-- trabajo efectivo (lo exige el borrador de RD: pausas no computables aparte).
-- Un tramo abierto (marca de apertura sin cierre) se marca `en_curso`: si es de
-- hoy cuenta hasta ahora; si es de un dia pasado es una INCIDENCIA (olvido de
-- fichar la salida) y no se inventa una hora de fin.
create or replace function public.jornada_tramos(
  p_negocio text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_profesional uuid default null,
  p_zona text default 'Europe/Madrid'
)
returns table (
  profesional_id uuid,
  dia date,
  clase text,          -- 'trabajo' | 'pausa'
  ini timestamptz,
  fin timestamptz,
  minutos numeric,
  en_curso boolean,
  incidencia boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with marcas as (
    select
      f.profesional_id,
      f.tipo,
      f.marcado_at,
      lead(f.tipo)       over (partition by f.profesional_id order by f.marcado_at) as sig_tipo,
      lead(f.marcado_at) over (partition by f.profesional_id order by f.marcado_at) as sig_at
    from public.fichajes f
    where f.negocio_id = p_negocio
      and f.estado = 'valido'
      and (p_profesional is null or f.profesional_id = p_profesional)
      -- Se traen marcas de un dia antes y despues para poder emparejar tramos
      -- que cruzan el borde del rango pedido.
      and f.marcado_at >= p_desde - interval '1 day'
      and f.marcado_at <  p_hasta + interval '1 day'
  ),
  tramos as (
    select
      m.profesional_id,
      case when m.tipo in ('entrada', 'pausa_fin') then 'trabajo' else 'pausa' end as clase,
      m.marcado_at as ini,
      case
        when m.tipo in ('entrada', 'pausa_fin') and m.sig_tipo in ('salida', 'pausa_inicio') then m.sig_at
        when m.tipo = 'pausa_inicio' and m.sig_tipo = 'pausa_fin' then m.sig_at
        else null
      end as fin
    from marcas m
    where m.tipo in ('entrada', 'pausa_fin', 'pausa_inicio')
  )
  select
    t.profesional_id,
    (t.ini at time zone p_zona)::date as dia,
    t.clase,
    t.ini,
    t.fin,
    round(
      extract(epoch from (
        coalesce(t.fin, case when (t.ini at time zone p_zona)::date = (now() at time zone p_zona)::date
                             then now() else t.ini end)
        - t.ini
      )) / 60.0
    , 2) as minutos,
    t.fin is null and (t.ini at time zone p_zona)::date = (now() at time zone p_zona)::date as en_curso,
    t.fin is null and (t.ini at time zone p_zona)::date < (now() at time zone p_zona)::date as incidencia
  from tramos t
  where t.ini >= p_desde and t.ini < p_hasta;
$$;

revoke execute on function public.jornada_tramos(text, timestamptz, timestamptz, uuid, text) from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. fichar_jornada — la unica forma de crear un asiento desde la app
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.fichar_jornada(
  p_tipo text,
  p_modalidad text default 'presencial',
  p_profesional_id uuid default null,
  p_nota text default null,
  p_origen text default 'app',
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_prof uuid;
  v_ultimo text;
  v_id uuid;
  v_at timestamptz;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null or c.negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'Tu cuenta no esta asociada a ningun salon.');
  end if;

  if p_tipo not in ('entrada', 'salida', 'pausa_inicio', 'pausa_fin') then
    return jsonb_build_object('ok', false, 'error', 'Tipo de fichaje no valido.');
  end if;
  if p_modalidad not in ('presencial', 'remoto') then
    return jsonb_build_object('ok', false, 'error', 'La modalidad debe ser presencial o remoto.');
  end if;

  -- Identificacion exacta de la persona trabajadora. Con cuenta compartida la
  -- identidad activa (selector "¿quien eres?") llega en p_profesional_id.
  if p_profesional_id is not null and p_profesional_id is distinct from c.profesional_id then
    v_prof := public.jornada_resolver_profesional(
      c.uid, c.negocio_id, c.es_gestor, c.profesional_id, p_profesional_id);
    if v_prof is null then
      return jsonb_build_object('ok', false, 'error',
        'Solo puedes fichar por ti. Pidele al responsable que lo haga por ti si hace falta.');
    end if;
  else
    v_prof := c.profesional_id;
  end if;

  if v_prof is null then
    return jsonb_build_object('ok', false, 'error',
      'Para fichar hace falta una ficha de profesional vinculada. Pideselo al responsable en Equipo.');
  end if;

  -- Estado actual segun la ultima marca valida de esa persona.
  select f.tipo into v_ultimo
  from public.fichajes f
  where f.negocio_id = c.negocio_id and f.profesional_id = v_prof and f.estado = 'valido'
  order by f.marcado_at desc
  limit 1;

  if p_tipo = 'entrada' and v_ultimo in ('entrada', 'pausa_fin', 'pausa_inicio') then
    return jsonb_build_object('ok', false, 'error', 'Ya tienes una entrada abierta: ficha primero la salida.');
  end if;
  if p_tipo = 'salida' and (v_ultimo is null or v_ultimo = 'salida') then
    return jsonb_build_object('ok', false, 'error', 'No puedes fichar salida sin haber fichado entrada.');
  end if;
  -- coalesce: sin marcas previas v_ultimo es NULL y `not in` daria NULL, no true.
  if p_tipo = 'pausa_inicio' and coalesce(v_ultimo, '') not in ('entrada', 'pausa_fin') then
    return jsonb_build_object('ok', false, 'error', 'Solo puedes iniciar una pausa mientras estas trabajando.');
  end if;
  if p_tipo = 'pausa_fin' and v_ultimo is distinct from 'pausa_inicio' then
    return jsonb_build_object('ok', false, 'error', 'No estas en pausa.');
  end if;

  v_at := now();
  insert into public.fichajes (
    negocio_id, profesional_id, user_id, tipo, marcado_at, nota,
    modalidad, origen, dispositivo
  ) values (
    c.negocio_id, v_prof, c.uid, p_tipo, v_at, nullif(trim(coalesce(p_nota, '')), ''),
    p_modalidad,
    case when p_origen in ('app', 'movil', 'quiosco') then p_origen else 'app' end,
    left(nullif(trim(coalesce(p_dispositivo, '')), ''), 200)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'tipo', p_tipo, 'marcado_at', v_at);
end;
$$;

revoke execute on function public.fichar_jornada(text, text, uuid, text, text, text) from public, anon;
grant execute on function public.fichar_jornada(text, text, uuid, text, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. jornada_estado — que esta haciendo ahora mismo esta persona
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.jornada_estado(p_profesional_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_prof uuid;
  v_zona text;
  v_ultimo record;
  v_estado text;
  v_min_hoy numeric := 0;
  v_min_pausa numeric := 0;
  v_marcas jsonb := '[]'::jsonb;
  v_hoy_ini timestamptz;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null then return jsonb_build_object('ok', false, 'error', 'no_autenticado'); end if;

  v_zona := coalesce((public.jornada_config()->>'zona'), 'Europe/Madrid');
  v_prof := public.jornada_resolver_profesional(
    c.uid, c.negocio_id, c.es_gestor, c.profesional_id, p_profesional_id);
  if v_prof is null and p_profesional_id is not null then
    return jsonb_build_object('ok', false, 'error', 'Solo puedes consultar tu propia jornada.');
  end if;
  if v_prof is null then
    return jsonb_build_object('ok', true, 'vinculado', false, 'estado', 'sin_ficha',
      'minutos_hoy', 0, 'minutos_pausa_hoy', 0, 'marcas', '[]'::jsonb);
  end if;

  v_hoy_ini := date_trunc('day', now() at time zone v_zona) at time zone v_zona;

  select f.tipo, f.marcado_at, f.modalidad into v_ultimo
  from public.fichajes f
  where f.negocio_id = c.negocio_id and f.profesional_id = v_prof and f.estado = 'valido'
  order by f.marcado_at desc limit 1;

  v_estado := case
    when v_ultimo.tipo in ('entrada', 'pausa_fin') then 'trabajando'
    when v_ultimo.tipo = 'pausa_inicio' then 'en_pausa'
    else 'fuera'
  end;

  select
    coalesce(sum(t.minutos) filter (where t.clase = 'trabajo'), 0),
    coalesce(sum(t.minutos) filter (where t.clase = 'pausa'), 0)
  into v_min_hoy, v_min_pausa
  from public.jornada_tramos(c.negocio_id, v_hoy_ini, v_hoy_ini + interval '1 day', v_prof, v_zona) t;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tipo', f.tipo, 'marcado_at', f.marcado_at, 'modalidad', f.modalidad, 'origen', f.origen
  ) order by f.marcado_at), '[]'::jsonb)
  into v_marcas
  from public.fichajes f
  where f.negocio_id = c.negocio_id and f.profesional_id = v_prof and f.estado = 'valido'
    and f.marcado_at >= v_hoy_ini and f.marcado_at < v_hoy_ini + interval '1 day';

  return jsonb_build_object(
    'ok', true,
    'vinculado', true,
    'profesional_id', v_prof,
    'estado', v_estado,
    'modalidad', coalesce(v_ultimo.modalidad, 'presencial'),
    'desde', v_ultimo.marcado_at,
    'minutos_hoy', round(v_min_hoy),
    'minutos_pausa_hoy', round(v_min_pausa),
    'marcas', v_marcas
  );
end;
$$;

revoke execute on function public.jornada_estado(uuid) from public, anon;
grant execute on function public.jornada_estado(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. jornada_totales — totalizacion diaria y mensual (art. 34.9 ET)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.jornada_totales(
  p_desde date,
  p_hasta date,                       -- inclusive
  p_profesional_id uuid default null  -- null = todo el centro (solo gestor)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_zona text;
  v_prof uuid;
  v_ini timestamptz;
  v_fin timestamptz;
  v_dias jsonb := '[]'::jsonb;
  v_personas jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_pausa numeric := 0;
  v_incid int := 0;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null or c.negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_autenticado');
  end if;

  -- Un empleado solo ve lo suyo, se pida lo que se pida.
  if c.es_gestor then
    v_prof := p_profesional_id;
  else
    v_prof := c.profesional_id;
    if v_prof is null then
      return jsonb_build_object('ok', true, 'dias', '[]'::jsonb, 'personas', '[]'::jsonb,
        'total_minutos', 0, 'total_pausa_minutos', 0, 'incidencias', 0);
    end if;
  end if;

  v_zona := coalesce((public.jornada_config()->>'zona'), 'Europe/Madrid');
  v_ini := (p_desde::timestamp) at time zone v_zona;
  v_fin := ((p_hasta + 1)::timestamp) at time zone v_zona;

  -- Detalle por persona y dia
  select coalesce(jsonb_agg(d order by d->>'dia', d->>'profesional'), '[]'::jsonb)
    into v_dias
  from (
    select jsonb_build_object(
      'profesional_id', t.profesional_id,
      'profesional', coalesce(pr.nombre, 'Sin asignar'),
      'dia', t.dia,
      'minutos', round(coalesce(sum(t.minutos) filter (where t.clase = 'trabajo'), 0)),
      'minutos_pausa', round(coalesce(sum(t.minutos) filter (where t.clase = 'pausa'), 0)),
      'entrada', min(t.ini) filter (where t.clase = 'trabajo'),
      'salida', max(t.fin) filter (where t.clase = 'trabajo'),
      'en_curso', bool_or(t.en_curso),
      'incidencia', bool_or(t.incidencia)
    ) as d
    from public.jornada_tramos(c.negocio_id, v_ini, v_fin, v_prof, v_zona) t
    left join public.profesionales pr on pr.id = t.profesional_id
    group by t.profesional_id, pr.nombre, t.dia
  ) q;

  -- Totales por persona (lo que se entrega con la nomina)
  select coalesce(jsonb_agg(p order by p->>'profesional'), '[]'::jsonb)
    into v_personas
  from (
    select jsonb_build_object(
      'profesional_id', t.profesional_id,
      'profesional', coalesce(pr.nombre, 'Sin asignar'),
      'minutos', round(coalesce(sum(t.minutos) filter (where t.clase = 'trabajo'), 0)),
      'minutos_pausa', round(coalesce(sum(t.minutos) filter (where t.clase = 'pausa'), 0)),
      -- Solo cuenta el dia si hay tiempo efectivo: un dia con una entrada
      -- huerfana (falta la salida) no es un dia trabajado, es una incidencia.
      'dias_trabajados', count(distinct t.dia) filter (where t.clase = 'trabajo' and t.minutos > 0),
      'incidencias', count(*) filter (where t.incidencia)
    ) as p
    from public.jornada_tramos(c.negocio_id, v_ini, v_fin, v_prof, v_zona) t
    left join public.profesionales pr on pr.id = t.profesional_id
    group by t.profesional_id, pr.nombre
  ) q;

  select
    round(coalesce(sum(t.minutos) filter (where t.clase = 'trabajo'), 0)),
    round(coalesce(sum(t.minutos) filter (where t.clase = 'pausa'), 0)),
    count(*) filter (where t.incidencia)
  into v_total, v_pausa, v_incid
  from public.jornada_tramos(c.negocio_id, v_ini, v_fin, v_prof, v_zona) t;

  return jsonb_build_object(
    'ok', true,
    'desde', p_desde, 'hasta', p_hasta, 'zona', v_zona,
    'dias', v_dias,
    'personas', v_personas,
    'total_minutos', v_total,
    'total_pausa_minutos', v_pausa,
    'incidencias', v_incid
  );
end;
$$;

revoke execute on function public.jornada_totales(date, date, uuid) from public, anon;
grant execute on function public.jornada_totales(date, date, uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. jornada_registro — los asientos en crudo (copia para el trabajador y para
--    la Inspeccion de Trabajo)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.jornada_registro(
  p_desde date,
  p_hasta date,
  p_profesional_id uuid default null,
  p_incluir_anulados boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_zona text;
  v_prof uuid;
  v_ini timestamptz;
  v_fin timestamptz;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null or c.negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_autenticado');
  end if;

  if c.es_gestor then
    v_prof := p_profesional_id;
  else
    v_prof := c.profesional_id;
    if v_prof is null then
      return jsonb_build_object('ok', true, 'asientos', '[]'::jsonb);
    end if;
  end if;

  v_zona := coalesce((public.jornada_config()->>'zona'), 'Europe/Madrid');
  v_ini := (p_desde::timestamp) at time zone v_zona;
  v_fin := ((p_hasta + 1)::timestamp) at time zone v_zona;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'secuencia', f.secuencia,
    'profesional_id', f.profesional_id,
    'profesional', coalesce(pr.nombre, 'Sin asignar'),
    'tipo', f.tipo,
    'marcado_at', f.marcado_at,
    'dia', (f.marcado_at at time zone v_zona)::date,
    'hora', to_char(f.marcado_at at time zone v_zona, 'HH24:MI:SS'),
    'modalidad', f.modalidad,
    'origen', f.origen,
    'estado', f.estado,
    'nota', f.nota,
    'anulado_at', f.anulado_at,
    'corrige_a', f.corrige_a,
    'hash', f.hash
  ) order by f.marcado_at, f.secuencia), '[]'::jsonb)
  into v_rows
  from public.fichajes f
  left join public.profesionales pr on pr.id = f.profesional_id
  where f.negocio_id = c.negocio_id
    and (v_prof is null or f.profesional_id = v_prof)
    and f.marcado_at >= v_ini and f.marcado_at < v_fin
    and (p_incluir_anulados or f.estado = 'valido');

  return jsonb_build_object('ok', true, 'zona', v_zona, 'desde', p_desde, 'hasta', p_hasta, 'asientos', v_rows);
end;
$$;

revoke execute on function public.jornada_registro(date, date, uuid, boolean) from public, anon;
grant execute on function public.jornada_registro(date, date, uuid, boolean) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Correcciones con doble conformidad
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.solicitar_correccion_jornada(
  p_tipo_solicitud text,          -- 'anadir' | 'corregir' | 'anular'
  p_motivo text,
  p_fichaje_id uuid default null,
  p_profesional_id uuid default null,
  p_tipo text default null,       -- para anadir/corregir
  p_marcado_at timestamptz default null,
  p_modalidad text default 'presencial'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_prof uuid;
  v_rol text;
  v_id uuid;
  v_f record;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null or c.negocio_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_autenticado');
  end if;
  if p_tipo_solicitud not in ('anadir', 'corregir', 'anular') then
    return jsonb_build_object('ok', false, 'error', 'Tipo de solicitud no valido.');
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    return jsonb_build_object('ok', false, 'error', 'Explica el motivo de la correccion: la ley exige dejarlo por escrito.');
  end if;

  v_rol := case when c.es_gestor then 'empresa' else 'trabajador' end;
  v_prof := coalesce(p_profesional_id, c.profesional_id);

  if p_fichaje_id is not null then
    select * into v_f from public.fichajes where id = p_fichaje_id and negocio_id = c.negocio_id;
    if v_f.id is null then
      return jsonb_build_object('ok', false, 'error', 'Ese fichaje no existe en tu salon.');
    end if;
    if not c.es_gestor and v_f.profesional_id is distinct from c.profesional_id then
      return jsonb_build_object('ok', false, 'error', 'Solo puedes pedir correcciones de tus propios fichajes.');
    end if;
    v_prof := v_f.profesional_id;
  end if;

  if p_tipo_solicitud in ('anadir', 'corregir') then
    if p_tipo is null or p_marcado_at is null then
      return jsonb_build_object('ok', false, 'error', 'Indica el tipo de marca y la hora correcta.');
    end if;
    if p_tipo not in ('entrada', 'salida', 'pausa_inicio', 'pausa_fin') then
      return jsonb_build_object('ok', false, 'error', 'Tipo de marca no valido.');
    end if;
    if p_marcado_at > now() + interval '5 minutes' then
      return jsonb_build_object('ok', false, 'error', 'No se puede registrar una hora futura.');
    end if;
  end if;

  if v_prof is null then
    return jsonb_build_object('ok', false, 'error', 'No se ha podido identificar a la persona trabajadora.');
  end if;
  if not c.es_gestor and v_prof is distinct from c.profesional_id then
    return jsonb_build_object('ok', false, 'error', 'Solo puedes pedir correcciones de tu propia jornada.');
  end if;

  insert into public.jornada_correcciones (
    negocio_id, profesional_id, fichaje_id, tipo_solicitud, propuesta, motivo,
    solicitada_por, solicitada_por_nombre, solicitada_por_rol,
    conforme_empresa, conforme_trabajador
  ) values (
    c.negocio_id, v_prof, p_fichaje_id, p_tipo_solicitud,
    jsonb_strip_nulls(jsonb_build_object('tipo', p_tipo, 'marcado_at', p_marcado_at, 'modalidad', p_modalidad)),
    trim(p_motivo),
    c.uid, nullif(c.nombre, ''), v_rol,
    v_rol = 'empresa', v_rol = 'trabajador'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'mensaje', case when v_rol = 'trabajador'
      then 'Solicitud enviada. Queda pendiente de que la empresa la autorice.'
      else 'Correccion propuesta. Queda pendiente de la conformidad de la persona trabajadora.' end);
end;
$$;

revoke execute on function public.solicitar_correccion_jornada(text, text, uuid, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.solicitar_correccion_jornada(text, text, uuid, uuid, text, timestamptz, text) to authenticated;


-- p_profesional_id = identidad activa (modo compartido): sin esto, la persona
-- trabajadora que esta delante de la tablet no puede dar su conformidad, porque
-- auth.uid() es el jefe.
create or replace function public.resolver_correccion_jornada(
  p_id uuid,
  p_aprobar boolean,
  p_nota text default null,
  p_profesional_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_c record;
  v_puede boolean := false;
  v_nuevo uuid;
  v_yo uuid;
  v_prop_tipo text;
  v_prop_at timestamptz;
  v_prop_mod text;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null then return jsonb_build_object('ok', false, 'error', 'no_autenticado'); end if;

  select * into v_c from public.jornada_correcciones
   where id = p_id and negocio_id = c.negocio_id;
  if v_c.id is null then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud no existe.');
  end if;
  if v_c.estado <> 'pendiente' then
    return jsonb_build_object('ok', false, 'error', 'Esa solicitud ya esta resuelta.');
  end if;

  v_yo := coalesce(
    public.jornada_resolver_profesional(c.uid, c.negocio_id, c.es_gestor, c.profesional_id, p_profesional_id),
    c.profesional_id);

  -- Quien tiene que dar la conformidad que falta: la otra parte.
  if v_c.solicitada_por_rol = 'trabajador' then
    v_puede := c.es_gestor;                                   -- falta la empresa
  else
    v_puede := v_yo is not null and v_yo = v_c.profesional_id; -- falta la persona trabajadora
  end if;
  if not v_puede then
    return jsonb_build_object('ok', false, 'error', 'No te corresponde a ti autorizar esta correccion.');
  end if;

  if not p_aprobar then
    update public.jornada_correcciones
       set estado = 'rechazada',
           resuelta_por = c.uid,
           resuelta_por_nombre = nullif(c.nombre, ''),
           resuelta_at = now(),
           resolucion_nota = nullif(trim(coalesce(p_nota, '')), ''),
           discrepancia = coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Rechazada sin motivo indicado.')
     where id = p_id;
    return jsonb_build_object('ok', true, 'estado', 'rechazada');
  end if;

  -- Aplicar. El asiento original nunca se borra: se anula y queda visible.
  perform set_config('app.jornada_correccion', 'on', true);

  if v_c.tipo_solicitud in ('anular', 'corregir') and v_c.fichaje_id is not null then
    update public.fichajes
       set estado = 'anulado',
           anulado_at = now(),
           anulado_por = c.uid,
           correccion_id = p_id
     where id = v_c.fichaje_id and estado = 'valido';
  end if;

  if v_c.tipo_solicitud in ('anadir', 'corregir') then
    v_prop_tipo := v_c.propuesta->>'tipo';
    v_prop_at   := (v_c.propuesta->>'marcado_at')::timestamptz;
    v_prop_mod  := coalesce(v_c.propuesta->>'modalidad', 'presencial');

    insert into public.fichajes (
      negocio_id, profesional_id, user_id, tipo, marcado_at, nota,
      modalidad, origen, estado, corrige_a, correccion_id
    ) values (
      v_c.negocio_id, v_c.profesional_id,
      (select pr.profile_id from public.profesionales pr where pr.id = v_c.profesional_id),
      v_prop_tipo, v_prop_at,
      'Correccion autorizada: ' || v_c.motivo,
      v_prop_mod, 'correccion', 'valido', v_c.fichaje_id, p_id
    )
    returning id into v_nuevo;
  end if;

  update public.jornada_correcciones
     set estado = 'aprobada',
         conforme_empresa = true,
         conforme_trabajador = true,
         resuelta_por = c.uid,
         resuelta_por_nombre = nullif(c.nombre, ''),
         resuelta_at = now(),
         resolucion_nota = nullif(trim(coalesce(p_nota, '')), ''),
         fichaje_nuevo_id = v_nuevo
   where id = p_id;

  return jsonb_build_object('ok', true, 'estado', 'aprobada', 'fichaje_nuevo_id', v_nuevo);
end;
$$;

drop function if exists public.resolver_correccion_jornada(uuid, boolean, text);
revoke execute on function public.resolver_correccion_jornada(uuid, boolean, text, uuid) from public, anon;
grant execute on function public.resolver_correccion_jornada(uuid, boolean, text, uuid) to authenticated;


create or replace function public.listar_correcciones_jornada(
  p_estado text default null,
  p_limit integer default 100,
  p_profesional_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c record;
  v_rows jsonb := '[]'::jsonb;
  v_yo uuid;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null then return jsonb_build_object('ok', false, 'error', 'no_autenticado'); end if;

  v_yo := coalesce(
    public.jornada_resolver_profesional(c.uid, c.negocio_id, c.es_gestor, c.profesional_id, p_profesional_id),
    c.profesional_id);

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb) into v_rows
  from (
    select k.id, k.tipo_solicitud, k.propuesta, k.motivo, k.estado,
           k.solicitada_por_rol, k.solicitada_por_nombre, k.created_at,
           k.resuelta_por_nombre, k.resuelta_at, k.resolucion_nota, k.discrepancia,
           k.fichaje_id, k.fichaje_nuevo_id,
           k.profesional_id, coalesce(pr.nombre, 'Sin asignar') as profesional,
           f.tipo as fichaje_tipo, f.marcado_at as fichaje_marcado_at,
           -- Le toca actuar a quien mira? (para pintar los botones)
           (k.estado = 'pendiente' and (
              (k.solicitada_por_rol = 'trabajador' and c.es_gestor)
              or (k.solicitada_por_rol = 'empresa' and v_yo = k.profesional_id)
           )) as me_toca
    from public.jornada_correcciones k
    left join public.profesionales pr on pr.id = k.profesional_id
    left join public.fichajes f on f.id = k.fichaje_id
    where k.negocio_id = c.negocio_id
      and (c.es_gestor or k.profesional_id = v_yo or k.solicitada_por = c.uid)
      -- Si el cliente acota a una persona (Mi jornada con identidad activa),
      -- se respeta: ahi solo se ven las correcciones de esa persona.
      and (p_profesional_id is null or k.profesional_id = p_profesional_id)
      and (p_estado is null or k.estado = p_estado)
    order by k.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) q;

  return jsonb_build_object('ok', true, 'solicitudes', v_rows);
end;
$$;

drop function if exists public.listar_correcciones_jornada(text, integer);
revoke execute on function public.listar_correcciones_jornada(text, integer, uuid) from public, anon;
grant execute on function public.listar_correcciones_jornada(text, integer, uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. jornada_verificar_integridad — recalcula la cadena de hash
-- ═════════════════════════════════════════════════════════════════════════════
-- Lo que se le enseña a la Inspeccion para acreditar que el registro no se ha
-- tocado por detras. Si alguien borro o edito un asiento con la service_role
-- key (saltandose RLS), la cadena deja de cuadrar y aqui sale.
create or replace function public.jornada_verificar_integridad()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  c record;
  r record;
  v_prev text := null;
  v_calc text;
  v_total int := 0;
  v_primer_fallo bigint := null;
begin
  select * into c from public.jornada_contexto();
  if c.uid is null or not c.es_gestor then
    return jsonb_build_object('ok', false, 'error', 'Solo el responsable del salon puede verificar el registro.');
  end if;

  for r in
    select * from public.fichajes
     where negocio_id = c.negocio_id and secuencia is not null
     order by secuencia
  loop
    v_total := v_total + 1;
    v_calc := encode(extensions.digest(
      coalesce(v_prev, '') || '|' || r.negocio_id || '|' || r.secuencia::text || '|' ||
      coalesce(r.profesional_id::text, '') || '|' || coalesce(r.user_id::text, '') || '|' ||
      r.tipo || '|' ||
      to_char(r.marcado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
      r.modalidad, 'sha256'), 'hex');

    if v_primer_fallo is null and (r.hash is distinct from v_calc or r.hash_anterior is distinct from v_prev) then
      v_primer_fallo := r.secuencia;
    end if;
    v_prev := r.hash;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'asientos', v_total,
    'integra', v_primer_fallo is null,
    'primer_asiento_alterado', v_primer_fallo,
    'verificado_at', now()
  );
end;
$$;

revoke execute on function public.jornada_verificar_integridad() from public, anon;
grant execute on function public.jornada_verificar_integridad() to authenticated;
