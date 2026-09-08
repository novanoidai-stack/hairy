-- TARJETAS REGALO: el backend que nunca se desplego.
--
-- La funcionalidad entro en la UI el 7 jul 2026 (sesion 14) y su migracion se quedo
-- en archive/migraciones-legacy/sesion14_parte_b_tarjetas.sql SIN APLICAR. Que fue un
-- descuido y no una decision lo prueba su hermana de la misma sesion,
-- sesion14_parte_b_gastos, que si consta aplicada el 2 ago 2026.
--
-- DOS MESES ASI, Y NADIE LO REPORTO, por como falla: `buscarTarjetaRegalo` hace
--   if (dbErr || !data) setError('Tarjeta no encontrada')
-- y la tabla que no existe devuelve error, no vacio. O sea que el mostrador veia
-- "Tarjeta no encontrada" ante un codigo VALIDO, indistinguible de un codigo mal
-- escrito. Nadie reporta "falta una tabla": se asume que la tarjeta de la clienta es
-- falsa. Ademas Caja tiene un boton "Vender tarjeta regalo" (caja.web.tsx) que
-- llamaba a vender_tarjeta_regalo, que tampoco existia.
--
-- QUE CAMBIA RESPECTO A LA VERSION ARCHIVADA, y por que
--
-- 1. SIN POLITICAS DE ESCRITURA. La archivada daba insert/update/delete al cliente,
--    y de ahi salio el P1 del 7 sep: el POS descontaba el saldo y escribia el
--    movimiento en DOS consultas sueltas, ignorando ambos errores. Se "arreglo"
--    moviendolo a una RPC, pero mientras el cliente pudiera escribir la tabla el
--    camino viejo seguia disponible. Aqui solo hay SELECT: saldo y movimiento se
--    tocan unicamente por RPC definer, en la misma transaccion. Comprobado en
--    produccion con `set local role authenticated` y un uid real, dentro de un
--    rollback: lee=1, update=0, insert de movimiento denegado, delete=0.
--
-- 2. Idempotencia ESTRUCTURAL, no solo comprobada. `uq_trm_consumo_por_cobro` impide
--    que una tarjeta se consuma dos veces contra el mismo cobro aunque alguien se
--    salte la comprobacion de la RPC.
--
-- 3. `vender_tarjeta_regalo` DELEGA en crear_cobro_walkin en vez de insertar en
--    cobros a mano como hacia la archivada. El cobro de una tarjeta es una venta de
--    mostrador como cualquier otra: duplicar ese insert es fabricar un invariante
--    repartido (lineas, stock, origen, estado, fiscalidad) que se desincroniza sola.
--
-- 4. Convenciones de hoy que la archivada no tenia: `set search_path`,
--    `my_negocio_id_text()` envuelto en (select ...) para el InitPlan, y
--    `exige_mi_negocio` en la RPC que recibe un id ajeno (p_cobro_id).
--
-- NO se anade `cobros.tarjeta_regalo_cents` ni el metodo 'tarjeta_regalo' al CHECK,
-- aunque la archivada lo hacia: el cliente no usa ninguno de los dos. Descuenta el
-- saldo del total y registra el movimiento aparte, asi que el total del cobro sigue
-- siendo lo que de verdad entro en caja -- que es lo que el arqueo necesita.
--
-- Probado de punta a punta contra produccion dentro de un rollback: venta 5000 ->
-- saldo 5000; aplicar 3000 -> saldo 2000 y 2 movimientos; segundo intento sobre el
-- mismo cobro -> 'tarjeta_ya_aplicada'. El codigo se normaliza a mayusculas, que es
-- como lo busca el POS.

create table if not exists public.tarjetas_regalo (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  codigo text not null,
  saldo_inicial_cents integer not null check (saldo_inicial_cents > 0),
  saldo_actual_cents integer not null check (saldo_actual_cents >= 0),
  cliente_comprador_id uuid references public.clientes(id) on delete set null,
  fecha_caducidad timestamptz,
  created_at timestamptz not null default now(),
  constraint tarjetas_regalo_saldo_coherente check (saldo_actual_cents <= saldo_inicial_cents)
);

create unique index if not exists uq_tarjetas_regalo_codigo
  on public.tarjetas_regalo (negocio_id, codigo);

create table if not exists public.tarjetas_regalo_movimientos (
  id uuid primary key default gen_random_uuid(),
  tarjeta_id uuid not null references public.tarjetas_regalo(id) on delete cascade,
  cobro_id uuid references public.cobros(id) on delete set null,
  importe_cents integer not null check (importe_cents <> 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_trm_tarjeta on public.tarjetas_regalo_movimientos (tarjeta_id);

-- Un cobro no puede consumir dos veces la misma tarjeta. Parcial porque las cargas
-- (importe positivo) si pueden repetirse contra distintos cobros.
create unique index if not exists uq_trm_consumo_por_cobro
  on public.tarjetas_regalo_movimientos (tarjeta_id, cobro_id)
  where importe_cents < 0;

alter table public.tarjetas_regalo enable row level security;
alter table public.tarjetas_regalo_movimientos enable row level security;

-- SOLO lectura, y solo del propio salon. Escribir es cosa de las RPC de abajo.
drop policy if exists tarjetas_regalo_select_propio on public.tarjetas_regalo;
create policy tarjetas_regalo_select_propio on public.tarjetas_regalo
  for select to authenticated
  using (negocio_id = (select public.my_negocio_id_text()));

drop policy if exists trm_select_propio on public.tarjetas_regalo_movimientos;
create policy trm_select_propio on public.tarjetas_regalo_movimientos
  for select to authenticated
  using (exists (
    select 1 from public.tarjetas_regalo t
    where t.id = tarjetas_regalo_movimientos.tarjeta_id
      and t.negocio_id = (select public.my_negocio_id_text())
  ));

revoke all on table public.tarjetas_regalo from anon;
revoke all on table public.tarjetas_regalo_movimientos from anon;

create or replace function public.vender_tarjeta_regalo(
  p_cliente_id uuid,
  p_precio_cents integer,
  p_metodo text,
  p_codigo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_negocio text := public.my_negocio_id_text();
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_cobro_id uuid;
  v_tarjeta_id uuid;
begin
  if v_negocio is null then raise exception 'sin_perfil'; end if;
  if coalesce(p_precio_cents, 0) <= 0 then raise exception 'precio_invalido'; end if;
  if length(v_codigo) < 4 then raise exception 'codigo_invalido'; end if;

  -- La regla del parametro: p_cliente_id es un id del que se deduce un negocio, asi
  -- que se ata al del llamante. crear_cobro_walkin lo revalida, pero esta tabla la
  -- escribimos nosotros y no puede fiarse de que lo haga otro.
  if p_cliente_id is not null
     and not exists (select 1 from public.clientes
                     where id = p_cliente_id and negocio_id = v_negocio) then
    raise exception 'cliente_no_autorizado';
  end if;

  if exists (select 1 from public.tarjetas_regalo
             where negocio_id = v_negocio and codigo = v_codigo) then
    raise exception 'codigo_duplicado';
  end if;

  -- El dinero de la venta entra por el MISMO sitio que cualquier venta de mostrador.
  v_cobro_id := public.crear_cobro_walkin(
    jsonb_build_array(jsonb_build_object(
      'nombre', 'Tarjeta regalo ' || v_codigo,
      'precio_cents', p_precio_cents,
      'cantidad', 1,
      'tipo', 'suplemento'
    )),
    p_metodo, 0, 0, null, p_cliente_id
  );

  insert into public.tarjetas_regalo (
    negocio_id, codigo, saldo_inicial_cents, saldo_actual_cents, cliente_comprador_id
  ) values (
    v_negocio, v_codigo, p_precio_cents, p_precio_cents, p_cliente_id
  ) returning id into v_tarjeta_id;

  insert into public.tarjetas_regalo_movimientos (tarjeta_id, cobro_id, importe_cents)
  values (v_tarjeta_id, v_cobro_id, p_precio_cents);

  return v_tarjeta_id;
end;
$$;

create or replace function public.aplicar_tarjeta_regalo_a_cobro(
  p_tarjeta_id uuid,
  p_cobro_id uuid,
  p_importe_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarjeta public.tarjetas_regalo;
  v_cobro public.cobros;
begin
  if coalesce(p_importe_cents, 0) <= 0 then raise exception 'importe_invalido'; end if;

  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'cobro_no_encontrado'; end if;
  perform public.exige_mi_negocio(v_cobro.negocio_id, false);

  select * into v_tarjeta from public.tarjetas_regalo
    where id = p_tarjeta_id for update;
  if not found or v_tarjeta.negocio_id is distinct from v_cobro.negocio_id then
    raise exception 'tarjeta_no_encontrada';
  end if;
  if v_tarjeta.fecha_caducidad is not null and v_tarjeta.fecha_caducidad < now() then
    raise exception 'tarjeta_caducada';
  end if;
  if exists (select 1 from public.tarjetas_regalo_movimientos
             where tarjeta_id = p_tarjeta_id and cobro_id = p_cobro_id and importe_cents < 0) then
    raise exception 'tarjeta_ya_aplicada';
  end if;
  if v_tarjeta.saldo_actual_cents < p_importe_cents then
    raise exception 'saldo_insuficiente';
  end if;

  update public.tarjetas_regalo
     set saldo_actual_cents = saldo_actual_cents - p_importe_cents
   where id = p_tarjeta_id;

  insert into public.tarjetas_regalo_movimientos (tarjeta_id, cobro_id, importe_cents)
  values (p_tarjeta_id, p_cobro_id, -p_importe_cents);

  return p_importe_cents;
end;
$$;

revoke all on function public.vender_tarjeta_regalo(uuid, integer, text, text) from public, anon;
grant execute on function public.vender_tarjeta_regalo(uuid, integer, text, text) to authenticated, service_role;

revoke all on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer) from public, anon;
grant execute on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer) to authenticated, service_role;

comment on table public.tarjetas_regalo is
  'Tarjetas regalo por salon. SIN politicas de escritura a proposito: solo se tocan por RPC definer (vender_tarjeta_regalo / aplicar_tarjeta_regalo_a_cobro), que hacen saldo y movimiento en la misma transaccion.';

comment on function public.aplicar_tarjeta_regalo_a_cobro(uuid, uuid, integer) is
  'Descuenta saldo y registra el movimiento en una sola transaccion, atado al negocio del cobro e idempotente por (tarjeta, cobro).';

notify pgrst, 'reload schema';
