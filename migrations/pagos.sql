-- Modelo de datos de pagos: senal/deposito online (anti no-show) y pagos
-- asociados a una cita. AGNOSTICO de pasarela (stripe/redsys/manual).
-- NO es la caja fiscal (tickets VeriFactu/arqueo) — eso es modulo aparte.
--
-- Reutiliza los helpers SECURITY DEFINER de roles-permisos.sql
-- (my_negocio_id_text, my_app_role). Aditiva, bajo riesgo.

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cita_id uuid references public.citas(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo text not null default 'senal' check (tipo in ('senal','total','reembolso')),
  importe_cents integer not null check (importe_cents >= 0),
  moneda text not null default 'EUR',
  estado text not null default 'pendiente'
    check (estado in ('pendiente','pagado','fallido','reembolsado','cancelado')),
  pasarela text,                  -- 'stripe' | 'redsys' | 'manual' | ...
  pasarela_ref text,              -- payment_intent / referencia externa
  metodo text,                    -- 'tarjeta' | 'efectivo' | 'bizum' | ...
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_pagos_negocio on public.pagos(negocio_id);
create index if not exists idx_pagos_cita on public.pagos(cita_id);
create index if not exists idx_pagos_estado on public.pagos(negocio_id, estado);

alter table public.pagos enable row level security;

-- Lectura: cualquier miembro autenticado del negocio ve sus pagos.
drop policy if exists "Negocio ve sus pagos" on public.pagos;
create policy "Negocio ve sus pagos" on public.pagos
  for select to authenticated
  using (negocio_id = public.my_negocio_id_text());

-- Escritura desde la app: recepcion/direccion/propietario. El motor de la
-- pasarela escribe con service_role (salta RLS).
drop policy if exists "Recepcion gestiona pagos" on public.pagos;
create policy "Recepcion gestiona pagos" on public.pagos
  for all to authenticated
  using (negocio_id = public.my_negocio_id_text() and public.my_app_role() in ('owner','admin','recepcion'))
  with check (negocio_id = public.my_negocio_id_text());

-- Calcula el importe de la senal (en centimos) de un servicio segun su config
-- de prepago. Devuelve 0 si el servicio no requiere prepago.
create or replace function public.importe_senal_servicio(p_servicio_id uuid)
returns integer
language sql stable
as $function$
  select case
    when s.prepago_requerido is not true then 0
    when coalesce(s.prepago_cantidad_fija, 0) > 0
      then round(s.prepago_cantidad_fija * 100)::int
    when coalesce(s.prepago_porcentaje, 0) > 0
      then round(coalesce(s.precio, 0) * s.prepago_porcentaje / 100.0 * 100)::int
    else 0
  end
  from public.servicios s
  where s.id = p_servicio_id;
$function$;

-- Requiere la senal de una reserva: calcula el total (sumando los servicios del
-- encadenado si la cita pertenece a un grupo) y crea/actualiza un pago pendiente
-- ligado a la cita cabecera del grupo. Idempotente. Devuelve el pago (o NULL si
-- la reserva no requiere senal). Pensada para llamarse al confirmar la reserva.
create or replace function public.requerir_senal_cita(p_cita_id uuid)
returns public.pagos
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cita public.citas;
  v_cabecera uuid;
  v_total int;
  v_pago public.pagos;
begin
  select * into v_cita from public.citas where id = p_cita_id;
  if not found then raise exception 'cita_not_found'; end if;

  -- Solo el negocio dueño (o el service_role, sin auth.uid()) puede pedirla.
  if auth.uid() is not null and v_cita.negocio_id is distinct from public.my_negocio_id_text() then
    raise exception 'cross_tenant';
  end if;

  if v_cita.grupo_id is not null then
    select coalesce(sum(public.importe_senal_servicio(c.servicio_id)), 0)
      into v_total
      from public.citas c where c.grupo_id = v_cita.grupo_id;
    select id into v_cabecera from public.citas
      where grupo_id = v_cita.grupo_id
      order by orden_en_grupo nulls first, inicio limit 1;
  else
    v_total := public.importe_senal_servicio(v_cita.servicio_id);
    v_cabecera := v_cita.id;
  end if;

  if coalesce(v_total, 0) <= 0 then
    return null;
  end if;

  select * into v_pago from public.pagos
    where cita_id = v_cabecera and tipo = 'senal' and estado = 'pendiente'
    limit 1;

  if found then
    update public.pagos set importe_cents = v_total, updated_at = now()
      where id = v_pago.id returning * into v_pago;
  else
    insert into public.pagos (negocio_id, cita_id, cliente_id, tipo, importe_cents, estado)
    values (v_cita.negocio_id, v_cabecera, v_cita.cliente_id, 'senal', v_total, 'pendiente')
    returning * into v_pago;
  end if;

  return v_pago;
end;
$function$;

revoke all on function public.requerir_senal_cita(uuid) from public, anon;
grant execute on function public.requerir_senal_cita(uuid) to authenticated;
