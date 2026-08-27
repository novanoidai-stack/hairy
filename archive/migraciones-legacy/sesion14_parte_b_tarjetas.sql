-- ==============================================================================
-- 1) TARJETAS REGALO
-- ==============================================================================
create table if not exists public.tarjetas_regalo (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null, -- en Hairy, negocio_id en otras tablas a veces es text, ver profile
  codigo text not null,
  saldo_inicial_cents integer not null check (saldo_inicial_cents > 0),
  saldo_actual_cents integer not null check (saldo_actual_cents >= 0),
  cliente_comprador_id uuid references public.clientes(id) on delete set null,
  fecha_caducidad timestamptz,
  created_at timestamptz not null default now()
);

-- Indice unico para codigo de tarjeta por negocio
create unique index if not exists idx_tarjetas_regalo_codigo on public.tarjetas_regalo(negocio_id, codigo);

create table if not exists public.tarjetas_regalo_movimientos (
  id uuid primary key default gen_random_uuid(),
  tarjeta_id uuid not null references public.tarjetas_regalo(id) on delete cascade,
  cobro_id uuid references public.cobros(id) on delete set null,
  importe_cents integer not null, -- negativo para consumos, positivo para recargas
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- 2) MODIFICACIÓN DE LA TABLA COBROS
-- ==============================================================================
-- Añadimos la columna para el método de pago con tarjeta regalo
alter table public.cobros
add column if not exists tarjeta_regalo_cents integer not null default 0;

-- Ampliamos el constraint:
alter table public.cobros drop constraint if exists cobros_metodo_check;
alter table public.cobros add constraint cobros_metodo_check 
  check (metodo in ('efectivo','datafono','online','bizum','mixto','tarjeta_regalo'));

-- ==============================================================================
-- 3) POLÍTICAS RLS (Multi-tenant)
-- ==============================================================================
alter table public.tarjetas_regalo enable row level security;
alter table public.tarjetas_regalo_movimientos enable row level security;

-- Políticas para tarjetas_regalo
create policy "tarjetas_regalo_select_own" on public.tarjetas_regalo for select
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

create policy "tarjetas_regalo_insert_own" on public.tarjetas_regalo for insert
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

create policy "tarjetas_regalo_update_own" on public.tarjetas_regalo for update
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()))
  with check (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

create policy "tarjetas_regalo_delete_own" on public.tarjetas_regalo for delete
  using (negocio_id = (select negocio_id from public.profiles where id = auth.uid()));

-- Políticas para tarjetas_regalo_movimientos (heredan el negocio_id de la tarjeta)
create policy "tarjetas_regalo_movimientos_select_own" on public.tarjetas_regalo_movimientos for select
  using (exists (select 1 from public.tarjetas_regalo tr where tr.id = tarjetas_regalo_movimientos.tarjeta_id
    and tr.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));

create policy "tarjetas_regalo_movimientos_insert_own" on public.tarjetas_regalo_movimientos for insert
  with check (exists (select 1 from public.tarjetas_regalo tr where tr.id = tarjetas_regalo_movimientos.tarjeta_id
    and tr.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));

create policy "tarjetas_regalo_movimientos_update_own" on public.tarjetas_regalo_movimientos for update
  using (exists (select 1 from public.tarjetas_regalo tr where tr.id = tarjetas_regalo_movimientos.tarjeta_id
    and tr.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));

create policy "tarjetas_regalo_movimientos_delete_own" on public.tarjetas_regalo_movimientos for delete
  using (exists (select 1 from public.tarjetas_regalo tr where tr.id = tarjetas_regalo_movimientos.tarjeta_id
    and tr.negocio_id = (select negocio_id from public.profiles where id = auth.uid())));

-- ==============================================================================
-- 4) RPC vender_tarjeta_regalo
-- ==============================================================================
create or replace function public.vender_tarjeta_regalo(
  p_cliente_id uuid,
  p_precio_cents integer,
  p_metodo text,
  p_codigo text
)
returns void
language plpgsql
security definer
as $$
declare
  v_negocio_id text;
  v_cobro_id uuid;
  v_tarjeta_id uuid;
  v_efectivo_cents integer := 0;
  v_datafono_cents integer := 0;
  v_online_cents integer := 0;
begin
  -- 1. Obtener negocio_id del caller
  select negocio_id into v_negocio_id from public.profiles where id = auth.uid();
  if v_negocio_id is null then
    raise exception 'No autorizado';
  end if;

  if p_precio_cents <= 0 then
    raise exception 'El precio debe ser mayor que 0';
  end if;

  if p_metodo = 'efectivo' then v_efectivo_cents := p_precio_cents;
  elsif p_metodo = 'datafono' then v_datafono_cents := p_precio_cents;
  else v_online_cents := p_precio_cents;
  end if;

  -- 2. Crear cobro asociado a la venta de tarjeta de regalo (tipo=walkin o manual)
  insert into public.cobros (
    negocio_id,
    cliente_id,
    total_cents,
    metodo,
    efectivo_cents,
    datafono_cents,
    online_cents,
    origen,
    estado,
    nota
  ) values (
    v_negocio_id,
    p_cliente_id,
    p_precio_cents,
    p_metodo,
    v_efectivo_cents,
    v_datafono_cents,
    v_online_cents,
    'pos',
    'completado',
    'Venta Tarjeta Regalo: ' || p_codigo
  ) returning id into v_cobro_id;

  -- 3. Crear lineas de cobro (Ticket)
  insert into public.cobro_lineas (
    cobro_id,
    tipo,
    nombre,
    precio_cents,
    cantidad
  ) values (
    v_cobro_id,
    'producto',
    'Tarjeta Regalo',
    p_precio_cents,
    1
  );

  -- 4. Crear registro de la tarjeta de regalo
  insert into public.tarjetas_regalo (
    negocio_id,
    codigo,
    saldo_inicial_cents,
    saldo_actual_cents,
    cliente_comprador_id
  ) values (
    v_negocio_id,
    p_codigo,
    p_precio_cents,
    p_precio_cents,
    p_cliente_id
  ) returning id into v_tarjeta_id;

  -- 5. Registro movimiento inicial
  insert into public.tarjetas_regalo_movimientos (
    tarjeta_id,
    cobro_id,
    importe_cents
  ) values (
    v_tarjeta_id,
    v_cobro_id,
    p_precio_cents
  );

end;
$$;
