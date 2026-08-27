-- ────────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN: Modelo de datos POS / Caja (POS-0 — sin pasarela, solo etiquetas)
-- Autor: Carlos + Claude (18 jun 2026)
--
-- Basado en:
-- - ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md (capas demanda vs dinero)
-- - ARQUITECTURA_PAGOS_MECHA.md (tabla pagos ya existente)
-- - Modo gestor de novanoidai (transacciones_pos + caja_registros)
--
-- Reglas de coherencia:
-- 1. Una cita es el evento (demanda) — NUNCA se vuelve dinero
-- 2. Un cobro es el dinero (caja) — fuente única de facturación real
-- 3. El cobro liquida la cita vía cita_id (máx. un cobro liquidador por cita)
-- 4. Señal online (pagos.tipo='senal') se DESCUENTA del total, nunca se suma
-- 5. Dinero nunca se suma desde dos capas
--
-- ────────────────────────────────────────────────────────────────────────────────

-- ===============================================================================
-- 1. LIBRO DE COBROS (cabecera)
--    Cada cobro liquida 0..1 citas (o un grupo familiar)
-- ===============================================================================
create table if not exists cobros (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,

  -- Enlace a la cita que se cobra (null = walk-in sin cita previa)
  cita_id uuid references citas(id) on delete set null,

  -- Profesional que cobra
  profesional_id text,

  -- Cliente (opcional — walk-in puede no tener cliente creado)
  cliente_id uuid references clientes(id) on delete set null,

  -- Importes (en céntimos para evitar floating point)
  total_cents integer not null,              -- total final de la operación
  propina_cents integer not null default 0,  -- propina (seña del profesional)
  descuento_cents integer not null default 0, -- descuento aplicado

  -- Método de pago (SOLO ETIQUETA en POS-0 — cobro real en POS-2)
  metodo text not null check (metodo in ('efectivo','datafono','online','bizum','mixto'))
    default 'efectivo',

  -- Desglose por método (para mixto)
  efectivo_cents integer not null default 0,
  datafono_cents integer not null default 0,
  online_cents integer not null default 0,  -- parte ya pagada vía pagos (señal)

  -- Origen del cobro
  origen text not null default 'manual'
    check (origen in ('manual','pos','portal','whatsapp','voz','buxi','ocr_tpv')),

  -- Estado
  estado text not null default 'completado'
    check (estado in ('completado','anulado','reembolsado')),

  -- Idempotencia (para evitar doble cobro de misma operación)
  idempotency_key text unique,

  -- Timestamps
  cobrado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- RLS: cada negocio solo ve sus cobros
  constraint cobros_negocio_check check (negocio_id is not null)
);

-- Índice único: máximo un cobro liquidador por cita completada
-- (si se anula, se puede crear otro)
create unique index if not exists cobros_cita_unico
  on cobros(negocio_id, cita_id)
  where cita_id is not null and estado = 'completado';

-- Índices de consulta
create index if not exists cobros_negocio_fecha on cobros(negocio_id, cobrado_at desc);
create index if not exists cobros_profesional on cobros(negocio_id, profesional_id, cobrado_at desc);

-- ===============================================================================
-- 2. LÍNEAS DE COBRO (detalle)
--    Un cobro puede tener varias líneas (servicios + productos)
-- ===============================================================================
create table if not exists cobro_lineas (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references cobros(id) on delete cascade,

  -- Tipo de línea
  tipo text not null check (tipo in ('servicio','producto','suplemento'))
    default 'servicio',

  -- Referencia al servicio/producto (snapshot del precio en ese momento)
  ref_id text,              -- servicio_id / producto_id
  nombre text not null,     -- snapshot del nombre (por si se renombra después)
  precio_cents integer not null,
  cantidad integer not null default 1,

  created_at timestamptz not null default now()
);

-- Índice para recuperar líneas de un cobro
create index if not exists cobro_lineas_cobro on cobro_lineas(cobro_id);

-- ===============================================================================
-- 3. ENLACE CITA → COBRO
--    Añadimos columnas a citas para marcarla como cobrada
-- ===============================================================================

-- Columna booleana para consultas rápidas (¿está cobrada?)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'citas' and column_name = 'cobrada'
  ) then
    alter table citas add column cobrada boolean default false;
  end if;
end $$;

-- Columna con referencia al cobro (para anulación/reembolso)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'citas' and column_name = 'cobro_id'
  ) then
    alter table citas add column cobro_id uuid references cobros(id) on delete set null;
  end if;
end $$;

-- Índice para buscar citas pendientes de cobro
create index if not exists citas_pendientes_cobro
  on citas(negocio_id, fecha, estado)
  where cobrada = false and estado in ('completada','finalizada');

-- ===============================================================================
-- 4. ENLACE PAGOS → COBRO
--    La tabla pagos (ya existe) referencia el cobro cuando hay cobro electrónico
-- ===============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'pagos' and column_name = 'cobro_id'
  ) then
    alter table pagos add column cobro_id uuid references cobros(id) on delete set null;
  end if;
end $$;

-- ===============================================================================
-- 5. RESTRICCIONES DE NEGOCIO
-- ===============================================================================

-- Trigger: no se puede crear un cobro con cita_id si la cita ya está cobrada
create or replace function cobros_cita_no_doble()
returns trigger as $$
declare
  ya_cobrada boolean;
begin
  if NEW.cita_id is not null then
    select cobrada into ya_cobrada
    from citas
    where id = NEW.cita_id;

    if ya_cobrada = true then
      raise exception 'La cita ya está cobrada. Usa cobro_id existente o anula primero.';
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger cobros_cita_no_doble_trigger
  before insert on cobros
  for each row execute function cobros_cita_no_doble();

-- Trigger: al crear cobro con cita_id, marcar cita como cobrada
create or replace function cobros_marcar_cita()
returns trigger as $$
begin
  if NEW.cita_id is not null and NEW.estado = 'completado' then
    update citas set
      cobrada = true,
      cobro_id = NEW.id
    where id = NEW.cita_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger cobros_marcar_cita_trigger
  after insert on cobros
  for each row execute function cobros_marcar_cita();

-- Trigger: al anular cobro, desmarcar cita
create or replace function cobros_anular_desmarcar_cita()
returns trigger as $$
begin
  if OLD.cita_id is not null and (NEW.estado = 'anulado' or NEW.estado = 'reembolsado') then
    update citas set
      cobrada = false,
      cobro_id = null
    where id = OLD.cita_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger cobros_anular_desmarcar_cita_trigger
  after update on cobros
  for each row
  when (OLD.estado = 'completado' and (NEW.estado = 'anulado' or NEW.estado = 'reembolsado'))
  execute function cobros_anular_desmarcar_cita();

-- ===============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ===============================================================================

-- Habilitar RLS
alter table cobros enable row level security;
alter table cobro_lineas enable row level security;

-- Políticas: solo leer/crear/modificar propios del negocio
create policy cobros_select_own on cobros
  for select using (negocio_id = current_setting('app.negocio_id', true));

create policy cobros_insert_own on cobros
  for insert with check (negocio_id = current_setting('app.negocio_id', true));

create policy cobros_update_own on cobros
  for update using (negocio_id = current_setting('app.negocio_id', true));

create policy cobros_delete_own on cobros
  for delete using (negocio_id = current_setting('app.negocio_id', true));

-- Las líneas heredan seguridad vía FK (cobro_id), pero añadimos explícita:
create policy cobro_lineas_select_own on cobro_lineas
  for select using (
    exists (
      select 1 from cobros
      where cobros.id = cobro_lineas.cobro_id
      and cobros.negocio_id = current_setting('app.negocio_id', true)
    )
  );

-- ===============================================================================
-- 7. VISTAS ÚTILES
-- ===============================================================================

-- Vista: cobros del día con info de cita
create or replace view cobros_dia as
select
  c.*,
  cit.fecha as cita_fecha,
  cit.hora_inicio as cita_hora,
  cli.nombre as cliente_nombre,
  prof.nombre as profesional_nombre
from cobros c
left join citas cit on c.cita_id = cit.id
left join clientes cli on c.cliente_id = cli.id
left join profesionales prof on c.profesional_id = prof.id
where c.estado = 'completado';

-- Vista: citas pendientes de cobro (para la pantalla de caja)
create or replace view citas_pendientes_cobro as
select
  cit.*,
  cli.nombre as cliente_nombre,
  cli.apellidos as cliente_apellidos,
  prof.nombre as profesional_nombre,
  srv.nombre as servicio_nombre,
  srv.precio as servicio_precio,
  -- Señas pagadas (para descontar)
  coalesce(pag.total_senal, 0) as sena_pagada
from citas cit
inner join clientes cli on cit.cliente_id = cli.id
inner join profesionales prof on cit.profesional_id = prof.id
left join cita_servicios cs on cs.cita_id = cit.id
left join servicios srv on cs.servicio_id = srv.id
-- Señas pagadas (subquery)
left join lateral (
  select sum(case when tipo = 'senal' then amount_cents else 0 end) as total_senal
  from pagos p
  where p.cita_id = cit.id and p.estado = 'completado'
) pag on true
where cit.cobrada = false
  and cit.estado in ('completada', 'finalizada')
  and cit.negocio_id = current_setting('app.negocio_id', true);

-- ===============================================================================
-- 8. FUNCIONES HELPER
-- ===============================================================================

-- Función: crear cobro desde cita (para el botón "Cobrar" rápido)
-- Devuelve el cobro_id creado
create or replace function crear_cobro_desde_cita(
  p_cita_id uuid,
  p_metodo text default 'efectivo',
  p_propina_cents integer default 0,
  p_descuento_cents integer default 0,
  p_idempotency_key text default null
) returns uuid as $$
declare
  v_negocio_id text;
  v_profesional_id text;
  v_cliente_id uuid;
  v_total_cents integer;
  v_sena_cents integer;
  v_cobro_id uuid;
begin
  -- Obtener datos de la cita
  select
    negocio_id,
    profesional_id,
    cliente_id,
    coalesce(precio_cobrado, 0)
  into v_negocio_id, v_profesional_id, v_cliente_id, v_total_cents
  from citas
  where id = p_cita_id;

  if not found then
    raise exception 'Cita no encontrada';
  end if;

  -- Obtener señas pagadas (para descontar)
  select coalesce(sum(case when tipo = 'senal' then amount_cents else 0 end), 0)
  into v_sena_cents
  from pagos
  where cita_id = p_cita_id and estado = 'completado';

  -- Crear el cobro
  insert into cobros (
    negocio_id, cita_id, profesional_id, cliente_id,
    total_cents, propina_cents, descuento_cents,
    metodo, online_cents, origen, idempotency_key
  ) values (
    v_negocio_id, p_cita_id, v_profesional_id, v_cliente_id,
    v_total_cents - v_sena_cents - p_descuento_cents + p_propina_cents,
    p_propina_cents, p_descuento_cents,
    p_metodo, v_sena_cents, 'manual', p_idempotency_key
  )
  returning id into v_cobro_id;

  -- Crear líneas (servicios de la cita)
  insert into cobro_lineas (cobro_id, tipo, ref_id, nombre, precio_cents, cantidad)
  select
    v_cobro_id, 'servicio',
    cs.servicio_id, srv.nombre, srv.precio, 1
  from cita_servicios cs
  inner join servicios srv on cs.servicio_id = srv.id
  where cs.cita_id = p_cita_id;

  return v_cobro_id;
end;
$$ language plpgsql;

-- ===============================================================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- ===============================================================================

comment on table cobros is 'Libro de cobros del salón (cabecera). Un cobro liquida 0..1 citas.';
comment on table cobro_lineas is 'Líneas de detalle de un cobro (servicios/productos).';
comment on column cobros.cita_id is 'Cita que se cobra (null = walk-in sin cita previa).';
comment on column cobros.metodo is 'Método de pago: efectivo/datafono (etiqueta POS-0), online/bizum (real POS-2).';
comment on column cobros.online_cents is 'Parte ya pagada vía pagos.tipo=senal (se desconta del total).';
comment on column cobros.idempotency_key is 'Clave de idempotencia para evitar doble cobro (ej. reintentos).';
comment on column citas.cobrada is 'True si la cita tiene un cobro completado asociado.';
comment on column citas.cobro_id is 'Referencia al cobro que liquidó esta cita.';
