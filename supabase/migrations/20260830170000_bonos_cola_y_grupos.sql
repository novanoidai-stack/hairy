-- ===========================================================================
-- Migración: Bonos Calendarizados, Cola del Día (Walk-in) y Reservas de Grupo
-- Specs 6, 7 y 8
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- SPEC 6: BONO CON CALENDARIO DE SESIONES (bono_sesiones)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.bono_sesiones (
  id             uuid primary key default gen_random_uuid(),
  bono_id        uuid not null references public.bonos(id) on delete cascade,
  numero         smallint not null,
  cita_id        uuid references public.citas(id) on delete set null,
  prevista_para  timestamptz,
  consumida_at   timestamptz,
  notas          text,
  created_at     timestamptz not null default now(),
  unique (bono_id, numero)
);

create index if not exists idx_bono_sesiones_bono on public.bono_sesiones (bono_id);
create index if not exists idx_bono_sesiones_cita on public.bono_sesiones (cita_id);

alter table public.bono_sesiones enable row level security;

drop policy if exists bono_sesiones_tenant_all on public.bono_sesiones;
create policy bono_sesiones_tenant_all on public.bono_sesiones
  for all
  using (
    exists (
      select 1 from public.bonos b
      where b.id = bono_sesiones.bono_id
        and b.negocio_id = (select public.my_negocio_id_text())
    )
  )
  with check (
    exists (
      select 1 from public.bonos b
      where b.id = bono_sesiones.bono_id
        and b.negocio_id = (select public.my_negocio_id_text())
    )
  );

-- RPC para crear bono con calendario de N sesiones periódicas
create or replace function public.crear_bono_con_sesiones(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_precio_cents integer,
  p_sesiones_totales integer,
  p_inicio_primera timestamptz default null,
  p_cadencia_dias integer default 28,
  p_profesional_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_bono_id uuid;
  v_cursor timestamptz;
  v_dur_min int;
  v_cita_id uuid;
  i int;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select coalesce(duracion, 30) into v_dur_min
  from public.servicios
  where id = p_servicio_id;

  -- Crear el bono
  insert into public.bonos (
    negocio_id,
    cliente_id,
    servicio_id,
    precio_cents,
    sesiones_totales,
    sesiones_disponibles,
    estado,
    fecha_caducidad
  ) values (
    v_negocio,
    p_cliente_id,
    p_servicio_id,
    p_precio_cents,
    p_sesiones_totales,
    p_sesiones_totales,
    'activo',
    case when p_inicio_primera is not null
      then p_inicio_primera + make_interval(days => (p_sesiones_totales * p_cadencia_dias) + 30)
      else now() + interval '1 year'
    end
  )
  returning id into v_bono_id;

  -- Generar sesiones proyectadas
  if p_inicio_primera is not null then
    v_cursor := p_inicio_primera;
    for i in 1..p_sesiones_totales loop
      -- Crear la cita agendada
      insert into public.citas (
        negocio_id,
        cliente_id,
        servicio_id,
        profesional_id,
        inicio,
        fin,
        estado,
        notas
      ) values (
        v_negocio,
        p_cliente_id,
        p_servicio_id,
        p_profesional_id,
        v_cursor,
        v_cursor + make_interval(mins => v_dur_min),
        'confirmada',
        'Sesión ' || i || ' de ' || p_sesiones_totales || ' (Bono)'
      )
      returning id into v_cita_id;

      insert into public.bono_sesiones (
        bono_id,
        numero,
        cita_id,
        prevista_para
      ) values (
        v_bono_id,
        i,
        v_cita_id,
        v_cursor
      );

      v_cursor := v_cursor + make_interval(days => p_cadencia_dias);
    end loop;
  else
    for i in 1..p_sesiones_totales loop
      insert into public.bono_sesiones (bono_id, numero)
      values (v_bono_id, i);
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'bono_id', v_bono_id,
    'sesiones_creadas', p_sesiones_totales
  );
end;
$$;

grant execute on function public.crear_bono_con_sesiones(uuid, uuid, integer, integer, timestamptz, integer, uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- SPEC 7: COLA DEL DÍA (WALK-IN) PARA BARBERÍAS (cola_dia)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.cola_dia (
  id              uuid primary key default gen_random_uuid(),
  negocio_id      text not null,
  fecha           date not null default current_date,
  cliente_id      uuid references public.clientes(id) on delete set null,
  cliente_nombre  text not null,
  telefono        text,
  servicio_id     uuid references public.servicios(id) on delete set null,
  profesional_id  uuid references public.profesionales(id) on delete set null,
  llegada_at      timestamptz not null default now(),
  llamado_at      timestamptz,
  atendido_at     timestamptz,
  cancelado_at    timestamptz,
  estado          text not null default 'esperando' check (estado in ('esperando', 'en_atencion', 'completado', 'cancelado', 'no_presentado')),
  notas           text,
  orden           integer not null default 1,
  created_at      timestamptz not null default now()
);

create index if not exists idx_cola_dia_fecha on public.cola_dia (negocio_id, fecha, estado);

alter table public.cola_dia enable row level security;

drop policy if exists cola_dia_tenant_all on public.cola_dia;
create policy cola_dia_tenant_all on public.cola_dia
  for all
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- RPC para unirse a la cola del día
create or replace function public.unirse_cola_dia(
  p_cliente_nombre text,
  p_telefono text default null,
  p_servicio_id uuid default null,
  p_profesional_id uuid default null,
  p_cliente_id uuid default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_orden int;
  v_id uuid;
  v_espera_estimada_min int;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
  from public.cola_dia
  where negocio_id = v_negocio and fecha = current_date;

  insert into public.cola_dia (
    negocio_id,
    fecha,
    cliente_id,
    cliente_nombre,
    telefono,
    servicio_id,
    profesional_id,
    orden,
    notas
  ) values (
    v_negocio,
    current_date,
    p_cliente_id,
    p_cliente_nombre,
    p_telefono,
    p_servicio_id,
    p_profesional_id,
    v_orden,
    p_notas
  )
  returning id into v_id;

  -- Calcular tiempo de espera aproximado: clientes delante * ~25 min
  select (count(*) * 25)::int into v_espera_estimada_min
  from public.cola_dia
  where negocio_id = v_negocio
    and fecha = current_date
    and estado = 'esperando'
    and orden < v_orden;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'posicion', v_orden,
    'espera_estimada_min', coalesce(v_espera_estimada_min, 0)
  );
end;
$$;

grant execute on function public.unirse_cola_dia(text, text, uuid, uuid, uuid, text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- SPEC 8: RESERVAS DE GRUPO (reservas_grupo)
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.reservas_grupo (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          text not null,
  nombre              text not null,
  hora_fin_objetivo   timestamptz not null,
  senal_cents         integer not null default 0,
  senal_pagada        boolean not null default false,
  contacto_nombre     text,
  contacto_telefono   text,
  contacto_email      text,
  estado              text not null default 'confirmada' check (estado in ('pendiente', 'confirmada', 'completada', 'cancelada')),
  notas               text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_reservas_grupo_negocio on public.reservas_grupo (negocio_id, hora_fin_objetivo);

alter table public.reservas_grupo enable row level security;

drop policy if exists reservas_grupo_tenant_all on public.reservas_grupo;
create policy reservas_grupo_tenant_all on public.reservas_grupo
  for all
  using (negocio_id = (select public.my_negocio_id_text()))
  with check (negocio_id = (select public.my_negocio_id_text()));

-- RPC para crear reserva de grupo y planificar citas hacia atrás
create or replace function public.crear_reserva_grupo_hacia_atras(
  p_nombre text,
  p_hora_fin_objetivo timestamptz,
  p_senal_cents integer,
  p_contacto_nombre text,
  p_contacto_telefono text,
  p_lineas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text;
  v_uid uuid := auth.uid();
  v_grupo_id uuid;
  v_linea jsonb;
  v_dur int;
  v_prof_id uuid;
  v_srv_id uuid;
  v_cli_id uuid;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_orden int := 1;
begin
  select p.negocio_id into v_negocio from profiles p where p.id = v_uid;
  if v_negocio is null then
    return jsonb_build_object('ok', false, 'error', 'No autorizado');
  end if;

  insert into public.reservas_grupo (
    negocio_id,
    nombre,
    hora_fin_objetivo,
    senal_cents,
    contacto_nombre,
    contacto_telefono
  ) values (
    v_negocio,
    p_nombre,
    p_hora_fin_objetivo,
    p_senal_cents,
    p_contacto_nombre,
    p_contacto_telefono
  )
  returning id into v_grupo_id;

  -- Crear citas ancladas hacia atras
  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_dur := coalesce((v_linea->>'duracion_min')::int, 45);
    v_prof_id := (v_linea->>'profesional_id')::uuid;
    v_srv_id := (v_linea->>'servicio_id')::uuid;
    v_cli_id := (v_linea->>'cliente_id')::uuid;

    -- Si se especifica desfase relativo en minutos respecto al fin
    v_fin := coalesce(
      (v_linea->>'fin')::timestamptz,
      p_hora_fin_objetivo - make_interval(mins => coalesce((v_linea->>'desfase_antes_fin_min')::int, 0))
    );
    v_inicio := v_fin - make_interval(mins => v_dur);

    insert into public.citas (
      negocio_id,
      cliente_id,
      servicio_id,
      profesional_id,
      inicio,
      fin,
      estado,
      grupo_id,
      orden_en_grupo,
      notas
    ) values (
      v_negocio,
      v_cli_id,
      v_srv_id,
      v_prof_id,
      v_inicio,
      v_fin,
      'confirmada',
      v_grupo_id::text,
      v_orden,
      p_nombre || ' (Grupo)'
    );

    v_orden := v_orden + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'grupo_id', v_grupo_id,
    'total_citas', v_orden - 1
  );
end;
$$;

grant execute on function public.crear_reserva_grupo_hacia_atras(text, timestamptz, integer, text, text, jsonb) to authenticated, service_role;
