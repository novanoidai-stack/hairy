-- Migration: tickets-verifactu.sql
-- Tabla + RPC de emision (mint) de tickets VeriFactu con hash-chain REAL server-side.
--
-- Objetivo (Mega-Plan WS-8): reemplazar el hashSimulado/QR falso por un registro
-- interno INALTERABLE y encadenado por serie. NO se envia a AEAT (eso queda para el
-- alta fiscal con Alexandro). El ticket es profesional y verosimil, sin mentir.
--
-- Hash (replica exacta de lib/caja/verifactuHash.ts:16):
--   sha256( "{cifEmisor}|{numeroFactura}|{fechaEmision}|{totalEuros.toFixed(2)}|{hashAnterior}" )
-- Todos los inputs se guardan en payload jsonb para poder re-verificar la cadena.
--
-- Depende de: negocio-datos-fiscales.sql (negocio_portal.nif como cifEmisor).

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TABLA
-- =====================================================================
create table if not exists public.tickets_verifactu (
  id            uuid primary key default gen_random_uuid(),
  negocio_id    text not null,
  cobro_id      uuid not null,
  serie         text not null default 'A',
  numero        integer not null,
  hash          text not null,
  hash_anterior text not null default '',
  fecha_emision timestamptz not null default now(),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

alter table public.tickets_verifactu enable row level security;

-- 1 ticket por cobro; numeracion correlativa por (negocio, serie).
create unique index if not exists tickets_verifactu_cobro_id_uidx
  on public.tickets_verifactu (cobro_id);
create unique index if not exists tickets_verifactu_neg_serie_numero_uidx
  on public.tickets_verifactu (negocio_id, serie, numero);
create index if not exists tickets_verifactu_neg_serie_created_idx
  on public.tickets_verifactu (negocio_id, serie, created_at desc);

-- =====================================================================
-- 2. RLS  (lectura para direccion; escritura solo por trigger/RPC como dueno)
-- =====================================================================
drop policy if exists tickets_verifactu_select_policy on public.tickets_verifactu;
create policy tickets_verifactu_select_policy on public.tickets_verifactu
  for select to authenticated
  using (
    negocio_id = (select negocio_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('owner','admin','direccion')
  );

-- Sin grants de escritura a authenticated/anon: la emision va por trigger (dueno postgres).
revoke insert, update, delete on public.tickets_verifactu from authenticated, anon;
grant select on public.tickets_verifactu to authenticated;

-- =====================================================================
-- 3. RPC mint_ticket_verifactu(p_cobro_id)
--    Idempotente, nunca levanta excepcion (no bloquea el cobro), encadena hash.
-- =====================================================================
create or replace function public.mint_ticket_verifactu(p_cobro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_cobro   record;
  v_neg     text;
  v_serie   text := 'A';
  v_nif     text;
  v_cif     text;
  v_numero  integer;
  v_hash_ant text;
  v_numero_factura text;
  v_fecha   timestamptz := now();
  v_fecha_str text;
  v_total_str text;
  v_payload_str text;
  v_hash    text;
  v_existing record;
  v_newid   uuid;
begin
  -- Cargar cobro.
  select negocio_id, total_cents, metodo, origen, estado, created_at
    into v_cobro
  from public.cobros where id = p_cobro_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_encontrado');
  end if;

  -- Solo emitir ticket para cobros en estado terminal pagado.
  if v_cobro.estado not in ('completado','pagado') then
    return jsonb_build_object('ok', false, 'error', 'cobro_no_completado', 'estado', v_cobro.estado);
  end if;

  v_neg := v_cobro.negocio_id;

  -- Idempotencia: si ya existe ticket para este cobro, devolverlo.
  select * into v_existing from public.tickets_verifactu where cobro_id = p_cobro_id;
  if found then
    return jsonb_build_object('ok', true, 'ya_existia', true, 'ticket_id', v_existing.id,
      'serie', v_existing.serie, 'numero', v_existing.numero, 'hash', v_existing.hash);
  end if;

  -- Serializar emision por negocio para evitar huecos/race en max(numero)+1.
  perform pg_advisory_xact_lock(hashtext(v_neg || '|' || v_serie));

  -- Emisor: NIF del negocio si dio de alta datos fiscales; fallback honrado a negocio_id.
  select nif into v_nif from public.negocio_portal where negocio_id = v_neg;
  v_cif := coalesce(nullif(btrim(v_nif), ''), v_neg);

  -- Numero correlativo y hash anterior (cadena por negocio+serie).
  select coalesce(max(numero), 0) + 1 into v_numero
  from public.tickets_verifactu where negocio_id = v_neg and serie = v_serie;

  select hash into v_hash_ant
  from public.tickets_verifactu
  where negocio_id = v_neg and serie = v_serie
  order by numero desc limit 1;
  v_hash_ant := coalesce(v_hash_ant, '');

  -- Inputs del hash (matches lib/caja/verifactuHash.ts).
  v_numero_factura := v_serie || '-' || lpad(v_numero::text, 5, '0');
  v_fecha_str      := to_char(v_fecha, 'YYYY-MM-DD"T"HH24:MI:SS');
  -- totalEuros.toFixed(2): 2 decimales, sin espacios (JS). ltrim quita los espacios de to_char.
  v_total_str      := ltrim(to_char(v_cobro.total_cents / 100.0, '999999990.00'));

  v_payload_str := v_cif || '|' || v_numero_factura || '|' || v_fecha_str || '|' || v_total_str || '|' || v_hash_ant;
  v_hash := encode(digest(v_payload_str, 'sha256'), 'hex');

  insert into public.tickets_verifactu (
    negocio_id, cobro_id, serie, numero, hash, hash_anterior, fecha_emision, payload
  ) values (
    v_neg, p_cobro_id, v_serie, v_numero, v_hash, v_hash_ant, v_fecha,
    jsonb_build_object(
      'cif_emisor', v_cif,
      'nif_real', v_nif,
      'numero_factura', v_numero_factura,
      'fecha_emision', v_fecha_str,
      'total_euros', v_total_str,
      'total_cents', v_cobro.total_cents,
      'metodo', v_cobro.metodo,
      'origen', v_cobro.origen
    )
  ) returning id into v_newid;

  return jsonb_build_object(
    'ok', true, 'ticket_id', v_newid,
    'serie', v_serie, 'numero', v_numero, 'numero_factura', v_numero_factura,
    'hash', v_hash, 'hash_anterior', v_hash_ant
  );
end;
$$;

comment on function public.mint_ticket_verifactu(uuid) is
  'Emite (o devuelve si ya existe) el ticket VeriFactu encadenado de un cobro completado. Registro interno inalterable, sin envio a AEAT.';

-- No exponer el RPC a clientes: se invoca desde el trigger de cobros.
revoke execute on function public.mint_ticket_verifactu(uuid) from public, anon, authenticated;

-- =====================================================================
-- 4. TRIGGER AFTER INSERT/UPDATE sobre cobros
--    Nunca debe bloquear el cobro: envuelve mint en exception handler.
-- =====================================================================
create or replace function public.cobros_mint_ticket_trigger()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  begin
    perform public.mint_ticket_verifactu(NEW.id);
  exception when others then
    raise notice 'tickets_verifactu: emision omitida para cobro % (%)', NEW.id, sqlerrm;
  end;
  return null; -- trigger AFTER: retorno ignorado.
end;
$$;

revoke execute on function public.cobros_mint_ticket_trigger() from public, anon, authenticated;

drop trigger if exists cobros_mint_ticket_trigger on public.cobros;
create trigger cobros_mint_ticket_trigger
  after insert or update of estado on public.cobros
  for each row
  when (new.estado in ('completado','pagado'))
  execute function public.cobros_mint_ticket_trigger();
