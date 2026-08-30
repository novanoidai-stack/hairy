-- ===========================================================================
-- Migración: Recursos en disponibilidad pública, Bizum propio y Series atómicas
-- Fecha: 2026-08-30 13:00:00
-- Specs 9, 10 y 12
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SPEC 9: RECURSOS FÍSICOS EN DISPONIBILIDAD PÚBLICA
-- ───────────────────────────────────────────────────────────────────────────

-- Funciones con negocio explícito para funcionar en llamadas anónimas del portal
create or replace function public.recursos_capacidad_negocio(p_negocio_id text, p_tipo text)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select coalesce(sum(capacidad), 0)::int
  from recursos
  where negocio_id = p_negocio_id
    and tipo = p_tipo
    and activo;
$$;

create or replace function public.recursos_ocupados_negocio(
  p_negocio_id text,
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select count(*)::int
  from citas c
  join servicios s on s.id = c.servicio_id
  where c.negocio_id = p_negocio_id
    and s.recurso_tipo = p_tipo
    and c.estado in ('pendiente', 'confirmada', 'completada')
    and coalesce(c.oculta_en_calendario, false) = false
    and (p_excluir_cita is null or c.id <> p_excluir_cita)
    and (case when s.recurso_fase = 'completa'
              then c.inicio
              else coalesce(c.fin_espera, c.fin_activa, c.inicio) end) < p_hasta
    and c.fin > p_desde;
$$;

create or replace function public.recurso_hay_hueco_negocio(
  p_negocio_id text,
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case
    when p_tipo is null then true
    when p_negocio_id is null then true
    when public.recursos_capacidad_negocio(p_negocio_id, p_tipo) = 0 then true
    else public.recursos_ocupados_negocio(p_negocio_id, p_tipo, p_desde, p_hasta, p_excluir_cita)
         < public.recursos_capacidad_negocio(p_negocio_id, p_tipo)
  end;
$$;

-- Funciones internas no invocables directamente por anon ni clientes autenticados
revoke all on function public.recursos_capacidad_negocio(text, text) from public, anon, authenticated;
revoke all on function public.recursos_ocupados_negocio(text, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.recurso_hay_hueco_negocio(text, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;

grant execute on function public.recursos_capacidad_negocio(text, text) to service_role;
grant execute on function public.recursos_ocupados_negocio(text, text, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.recurso_hay_hueco_negocio(text, text, timestamptz, timestamptz, uuid) to service_role;

-- Delegaciones transparentes para llamadas de cliente autenticado (compatibilidad)
create or replace function public.recursos_capacidad(p_tipo text)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select public.recursos_capacidad_negocio((select my_negocio_id_text()), p_tipo);
$$;

create or replace function public.recursos_ocupados(
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select public.recursos_ocupados_negocio((select my_negocio_id_text()), p_tipo, p_desde, p_hasta, p_excluir_cita);
$$;

create or replace function public.recurso_hay_hueco(
  p_tipo text,
  p_desde timestamptz,
  p_hasta timestamptz,
  p_excluir_cita uuid default null
)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.recurso_hay_hueco_negocio((select my_negocio_id_text()), p_tipo, p_desde, p_hasta, p_excluir_cita);
$$;

-- Actualizar disponibilidad_publica para consultar recursos físicos
create or replace function public.disponibilidad_publica(
  p_slug text,
  p_servicio_id uuid,
  p_fecha date,
  p_profesional_id uuid default null::uuid
)
returns table(
  profesional_id uuid,
  profesional_nombre text,
  slot timestamp with time zone,
  en_reposo boolean,
  reposo_disponible_min integer
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_negocio   text;
  v_dur       int;
  v_espera    int;
  v_extra     int;
  v_min_ant   int;
  v_dow       int := extract(dow from p_fecha)::int;
  v_tz        text;
  v_rec_tipo  text;
  v_rec_fase  text;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return; end if;

  select coalesce(nullif(c.config->>'timezone', ''), 'Europe/Madrid')
    into v_tz
  from public.negocio_config c
  where c.negocio_id = v_negocio;
  v_tz := coalesce(v_tz, 'Europe/Madrid');

  if exists (select 1 from public.cierres_negocio cn where cn.negocio_id = v_negocio and cn.fecha = p_fecha) then
    return;
  end if;

  select duracion_activa_min, coalesce(duracion_espera_min,0), coalesce(duracion_activa_extra_min,0), coalesce(min_antelacion_min,0),
         recurso_tipo, coalesce(recurso_fase, 'final')
    into v_dur, v_espera, v_extra, v_min_ant,
         v_rec_tipo, v_rec_fase
  from public.servicios
  where id = p_servicio_id and negocio_id = v_negocio and reservable_online = true and activo = true;
  if v_dur is null then return; end if;

  return query
  with profs as (
    select pr.id, pr.nombre, d.total
    from public.profesionales pr
    cross join lateral public.duracion_efectiva_profesional(p_servicio_id, pr.id, v_dur, v_espera, v_extra) d
    where pr.negocio_id = v_negocio and pr.activo = true
      and (p_profesional_id is null or pr.id = p_profesional_id)
      and public.profesional_ofrece_servicio(pr.id, p_servicio_id)
  ),
  franjas as (
    select h.profesional_id, h.hora_inicio, h.hora_fin, p.total
    from public.horarios_profesional h
    join profs p on p.id = h.profesional_id
    where h.dia_semana = v_dow
  ),
  gen as (
    select f.profesional_id,
           f.total,
           (g.ts at time zone v_tz) as slot_tz
    from franjas f
    cross join lateral generate_series(
      (p_fecha + f.hora_inicio),
      (p_fecha + f.hora_fin) - make_interval(mins => f.total),
      interval '15 minutes'
    ) as g(ts)
  )
  select gen.profesional_id, pr.nombre, gen.slot_tz, reposo.en_reposo, reposo.disponible_min
  from gen
  join profs pr on pr.id = gen.profesional_id
  cross join lateral (
    select
      exists (
        select 1 from public.citas c2
        where c2.profesional_id = gen.profesional_id
          and c2.estado in ('pendiente','confirmada')
          and c2.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and c2.fin    > gen.slot_tz
      ) as en_reposo,
      (
        select min(round(extract(epoch from (
          coalesce(c3.fin_espera, coalesce(c3.fin_activa, c3.fin)) - gen.slot_tz
        )) / 60)::int)
        from public.citas c3
        where c3.profesional_id = gen.profesional_id
          and c3.estado in ('pendiente','confirmada')
          and c3.inicio < gen.slot_tz + make_interval(mins => gen.total)
          and c3.fin    > gen.slot_tz
      ) as disponible_min
  ) reposo
  where gen.slot_tz >= now() + make_interval(mins => greatest(v_min_ant, 0))
    and not exists (
      select 1 from public.citas c
      where c.profesional_id = gen.profesional_id
        and c.estado in ('pendiente','confirmada')
        and (
          (c.inicio < gen.slot_tz + make_interval(mins => gen.total)
           and coalesce(c.fin_activa, c.fin) > gen.slot_tz)
          or
          (coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < c.fin
           and coalesce(c.fin_espera, coalesce(c.fin_activa, c.fin)) < gen.slot_tz + make_interval(mins => gen.total)
           and c.fin > gen.slot_tz)
        )
    )
    and not exists (
      select 1 from public.bloqueos_profesional b
      where b.profesional_id = gen.profesional_id
        and b.inicio < gen.slot_tz + make_interval(mins => gen.total)
        and b.fin    > gen.slot_tz
    )
    and (
      v_rec_tipo is null
      or public.recurso_hay_hueco_negocio(
        v_negocio,
        v_rec_tipo,
        case when v_rec_fase = 'completa' then gen.slot_tz else gen.slot_tz + make_interval(mins => v_dur + v_espera) end,
        gen.slot_tz + make_interval(mins => gen.total)
      )
    )
  order by gen.slot_tz, pr.nombre;
end;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SPEC 10: BIZUM COMO MÉTODO PROPIO DE PAGO
-- ───────────────────────────────────────────────────────────────────────────

alter table public.cobros add column if not exists bizum_cents integer default 0;
alter table public.sesiones_caja add column if not exists teorico_bizum_cents integer default 0;
alter table public.sesiones_caja add column if not exists contado_bizum_cents integer default null;

-- Actualizar cerrar_caja con soporte para Bizum
create or replace function public.cerrar_caja(
  p_contado_efectivo_cents integer,
  p_contado_datafono_cents integer default null,
  p_notas text default null,
  p_contado_bizum_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_negocio text;
  v_rol text;
  v_sesion sesiones_caja%rowtype;
  v_efectivo integer;
  v_datafono integer;
  v_online integer;
  v_bizum integer;
  v_propinas integer;
  v_teorico_caja integer;
  v_descuadre integer;
  v_z integer;
begin
  select p.negocio_id, p.role into v_negocio, v_rol
  from profiles p where p.id = auth.uid();

  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'Usuario sin salon');
  end if;
  if v_rol not in ('owner', 'admin', 'recepcion') then
    return jsonb_build_object('ok', false, 'error', 'No tienes permiso para cerrar la caja');
  end if;
  if p_contado_efectivo_cents is null or p_contado_efectivo_cents < 0 then
    return jsonb_build_object('ok', false, 'error', 'Cuenta el efectivo antes de cerrar');
  end if;

  select * into v_sesion from sesiones_caja
  where negocio_id = v_negocio and estado = 'abierta' limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No hay ninguna caja abierta');
  end if;

  select
    coalesce(sum(c.efectivo_cents), 0),
    coalesce(sum(c.datafono_cents), 0),
    coalesce(sum(case when coalesce(c.bizum_cents, 0) > 0 then coalesce(c.online_cents, 0) when c.metodo = 'bizum' then 0 else coalesce(c.online_cents, 0) end), 0),
    coalesce(sum(case when coalesce(c.bizum_cents, 0) > 0 then c.bizum_cents when c.metodo = 'bizum' then coalesce(c.online_cents, 0) else 0 end), 0),
    coalesce(sum(c.propina_cents), 0)
  into v_efectivo, v_datafono, v_online, v_bizum, v_propinas
  from cobros c
  where c.sesion_caja_id = v_sesion.id and c.estado = 'completado';

  v_teorico_caja := v_sesion.fondo_inicial_cents + v_efectivo;
  v_descuadre := p_contado_efectivo_cents - v_teorico_caja;

  select coalesce(max(numero_z), 0) + 1 into v_z
  from sesiones_caja
  where negocio_id = v_negocio and ejercicio = v_sesion.ejercicio;

  update sesiones_caja set
    estado = 'cerrada',
    cerrada_at = now(),
    cerrada_por = auth.uid(),
    numero_z = v_z,
    contado_efectivo_cents = p_contado_efectivo_cents,
    contado_datafono_cents = p_contado_datafono_cents,
    contado_bizum_cents = p_contado_bizum_cents,
    teorico_efectivo_cents = v_teorico_caja,
    teorico_datafono_cents = v_datafono,
    teorico_online_cents = v_online,
    teorico_bizum_cents = v_bizum,
    teorico_propinas_cents = v_propinas,
    descuadre_cents = v_descuadre,
    notas = p_notas
  where id = v_sesion.id;

  return jsonb_build_object(
    'ok', true,
    'sesion_id', v_sesion.id,
    'numero_z', v_z,
    'teorico_efectivo_cents', v_teorico_caja,
    'contado_efectivo_cents', p_contado_efectivo_cents,
    'descuadre_cents', v_descuadre,
    'teorico_datafono_cents', v_datafono,
    'teorico_online_cents', v_online,
    'teorico_bizum_cents', v_bizum,
    'teorico_propinas_cents', v_propinas,
    'fondo_inicial_cents', v_sesion.fondo_inicial_cents
  );
end;
$fn$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. SPEC 12: CREACIÓN ATÓMICA DE SERIES DE CITAS EN SERVIDOR
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.crear_serie_citas(
  p_base jsonb,
  p_intervalo_semanas integer default 1,
  p_repeticiones integer default 4,
  p_addon_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_serie_id uuid := gen_random_uuid();
  v_prof_id uuid;
  v_srv_id uuid;
  v_clt_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_fin_activa timestamptz;
  v_fin_espera timestamptz;
  v_dur_min int;
  v_i int;
  v_curr_inicio timestamptz;
  v_curr_fin timestamptz;
  v_curr_activa timestamptz;
  v_curr_espera timestamptz;
  v_citas_creadas uuid[] := array[]::uuid[];
  v_omitidas text[] := array[]::text[];
  v_nueva_cita_id uuid;
  v_choca boolean;
  v_addon_id uuid;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  v_prof_id := (p_base->>'profesional_id')::uuid;
  v_srv_id := (p_base->>'servicio_id')::uuid;
  v_clt_id := (p_base->>'cliente_id')::uuid;
  v_inicio := (p_base->>'inicio')::timestamptz;
  v_fin := (p_base->>'fin')::timestamptz;
  v_fin_activa := (p_base->>'fin_activa')::timestamptz;
  v_fin_espera := (p_base->>'fin_espera')::timestamptz;

  if v_prof_id is null or v_srv_id is null or v_inicio is null or v_fin is null then
    return jsonb_build_object('ok', false, 'error', 'Parámetros base incompletos');
  end if;

  v_dur_min := round(extract(epoch from (v_fin - v_inicio)) / 60)::int;
  if v_dur_min <= 0 or v_dur_min > 720 then
    return jsonb_build_object('ok', false, 'error', 'Duración de cita inválida');
  end if;

  if p_repeticiones < 1 or p_repeticiones > 52 then
    return jsonb_build_object('ok', false, 'error', 'Número de repeticiones debe ser entre 1 y 52');
  end if;

  for v_i in 0..(p_repeticiones - 1) loop
    v_curr_inicio := v_inicio + make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1));
    v_curr_fin := v_fin + make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1));
    v_curr_activa := case when v_fin_activa is not null then v_fin_activa + make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1)) else null end;
    v_curr_espera := case when v_fin_espera is not null then v_fin_espera + make_interval(weeks => v_i * coalesce(p_intervalo_semanas, 1)) else null end;

    -- Verificar que no choque con otra cita del profesional
    select exists (
      select 1 from citas c
      where c.negocio_id = v_negocio
        and c.profesional_id = v_prof_id
        and c.estado in ('pendiente', 'confirmada')
        and c.inicio < v_curr_fin
        and c.fin > v_curr_inicio
    ) into v_choca;

    if v_choca then
      v_omitidas := array_append(v_omitidas, to_char(v_curr_inicio, 'YYYY-MM-DD HH24:MI'));
      continue;
    end if;

    insert into citas (
      negocio_id, profesional_id, servicio_id, cliente_id,
      inicio, fin, fin_activa, fin_espera,
      estado, canal, creado_por, serie_id, notas
    ) values (
      v_negocio, v_prof_id, v_srv_id, v_clt_id,
      v_curr_inicio, v_curr_fin, v_curr_activa, v_curr_espera,
      'pendiente', 'manual', v_uid, v_serie_id, p_base->>'notas'
    ) returning id into v_nueva_cita_id;

    v_citas_creadas := array_append(v_citas_creadas, v_nueva_cita_id);

    if p_addon_ids is not null and array_length(p_addon_ids, 1) > 0 then
      foreach v_addon_id in array p_addon_ids loop
        insert into cita_addons (cita_id, addon_id) values (v_nueva_cita_id, v_addon_id);
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'serie_id', v_serie_id,
    'creadas', array_length(v_citas_creadas, 1),
    'omitidas', v_omitidas,
    'cita_ids', v_citas_creadas
  );
end;
$$;

grant execute on function public.crear_serie_citas(jsonb, integer, integer, uuid[]) to authenticated, service_role;
