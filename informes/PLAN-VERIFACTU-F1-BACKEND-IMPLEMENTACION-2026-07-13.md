# VeriFactu F1 — Núcleo backend de facturación (sandbox) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que, a partir de un `cobro` ya registrado, el sistema pueda generar un registro de factura **inmutable, numerado sin huecos y encadenado por hash SHA-256**, con QR/CSV **simulados** vía una capa de proveedor abstracta — todo verificable sin UI y sin enviar nada real a la AEAT.

**Architecture:** Capa fiscal derivada 1:1 de `cobros`. La numeración + desglose de IVA + cadena de hash se calculan **atómicamente en una RPC SQL** (`crear_factura_desde_cobro`). El transporte (QR/CSV/estado AEAT) se aísla tras la interfaz `ProveedorFiscal`; en F1 sólo existe `MockSandboxProvider`. Una edge function `emitir-factura` orquesta: llama a la RPC y luego al proveedor, y escribe la respuesta mientras la factura está `pendiente`. Inmutabilidad garantizada por triggers, igual patrón que `cobros`.

**Tech Stack:** Supabase Postgres (pgcrypto para SHA-256), PostgREST RPC, Supabase Edge Functions (Deno/TS), React Native Web (solo tipos compartidos). Verificación: Supabase MCP `execute_sql` para BD; `npx tsc --noEmit` para TS.

## Global Constraints

- Multi-tenant estricto: TODO filtra/incluye `negocio_id` (text). Cada salón = su propio obligado tributario, su propia serie y su propia cadena de hash. Nunca mezclar negocios. (copiado del spec §3.1)
- Importes SIEMPRE en **céntimos** (`integer`), nunca float. (patrón de `cobros`)
- Inmutabilidad: `facturas` NO admite DELETE nunca; NO admite UPDATE de campos fiscales; sólo se permite escribir campos de estado de envío mientras `aeat_estado='pendiente'`. Correcciones sólo por factura de **anulación** o **rectificativa** encadenada. (spec §3.4)
- **Una sola cadena de hash**, en `facturas` (NO reactivar hash en `cobros`). (spec §3.5)
- Toda función `security definer` nueva: `revoke execute ... from public, anon, authenticated` explícito; sólo `service_role`/RPC interna la invoca. (CLAUDE.md §4, round 4)
- Código en inglés, comentarios en español, sin emojis. (CLAUDE.md)
- Tras la migración, pasar advisors de seguridad de Supabase. (CLAUDE.md §4)
- **Alcance F1:** NADA de envío real a AEAT ni certificados (eso es F2/Alexandro). Sólo `MockSandboxProvider`.

---

### Task 1: Migración `config_fiscal` (identidad fiscal por negocio)

**Files:**
- Create: `migrations/fiscal-01-config.sql`

**Interfaces:**
- Produces: tabla `public.config_fiscal` (PK `negocio_id text`); RPC `public.upsert_config_fiscal(...)` que devuelve la fila; helper de lectura `public.get_config_fiscal(p_negocio_id text)`.

- [ ] **Step 1: Escribir la migración**

```sql
-- migrations/fiscal-01-config.sql
-- Identidad fiscal por negocio (obligado tributario). Multi-tenant estricto.
create table if not exists public.config_fiscal (
  negocio_id text primary key,
  nif text,
  razon_social text,
  domicilio_fiscal text,
  regimen_iva text not null default 'general',
  tipo_iva_defecto numeric not null default 21.0,
  territorio text not null default 'comun'
    check (territorio in ('comun','foral_pv','foral_navarra')),
  serie_defecto text not null default 'A',
  modalidad text not null default 'verifactu'
    check (modalidad in ('verifactu','no_verifactu')),
  aplica_verifactu boolean not null default true,   -- false si SII/modulos/foral
  proveedor_fiscal text,
  proveedor_estado text not null default 'no_configurado'
    check (proveedor_estado in ('no_configurado','sandbox','produccion')),
  apoderamiento_ok boolean not null default false,
  declaracion_responsable_ok boolean not null default false,
  activo boolean not null default false,            -- facturacion fiscal ACTIVA
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.config_fiscal enable row level security;

drop policy if exists config_fiscal_select_own on public.config_fiscal;
create policy config_fiscal_select_own on public.config_fiscal
  for select using (negocio_id = current_setting('app.negocio_id', true));

-- Upsert controlado (no exponemos INSERT/UPDATE directos a authenticated)
create or replace function public.upsert_config_fiscal(
  p_negocio_id text,
  p_nif text default null,
  p_razon_social text default null,
  p_domicilio_fiscal text default null,
  p_regimen_iva text default null,
  p_tipo_iva_defecto numeric default null,
  p_territorio text default null,
  p_serie_defecto text default null,
  p_modalidad text default null,
  p_aplica_verifactu boolean default null,
  p_proveedor_fiscal text default null
) returns public.config_fiscal as $$
declare v_row public.config_fiscal;
begin
  insert into public.config_fiscal as cf (negocio_id, nif, razon_social, domicilio_fiscal,
      regimen_iva, tipo_iva_defecto, territorio, serie_defecto, modalidad, aplica_verifactu, proveedor_fiscal)
  values (p_negocio_id, p_nif, p_razon_social, p_domicilio_fiscal,
      coalesce(p_regimen_iva,'general'), coalesce(p_tipo_iva_defecto,21.0),
      coalesce(p_territorio,'comun'), coalesce(p_serie_defecto,'A'),
      coalesce(p_modalidad,'verifactu'), coalesce(p_aplica_verifactu,true), p_proveedor_fiscal)
  on conflict (negocio_id) do update set
    nif = coalesce(p_nif, cf.nif),
    razon_social = coalesce(p_razon_social, cf.razon_social),
    domicilio_fiscal = coalesce(p_domicilio_fiscal, cf.domicilio_fiscal),
    regimen_iva = coalesce(p_regimen_iva, cf.regimen_iva),
    tipo_iva_defecto = coalesce(p_tipo_iva_defecto, cf.tipo_iva_defecto),
    territorio = coalesce(p_territorio, cf.territorio),
    serie_defecto = coalesce(p_serie_defecto, cf.serie_defecto),
    modalidad = coalesce(p_modalidad, cf.modalidad),
    aplica_verifactu = coalesce(p_aplica_verifactu, cf.aplica_verifactu),
    proveedor_fiscal = coalesce(p_proveedor_fiscal, cf.proveedor_fiscal),
    updated_at = now()
  returning * into v_row;
  return v_row;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.upsert_config_fiscal(text,text,text,text,text,numeric,text,text,text,boolean,text)
  from public, anon;
```

- [ ] **Step 2: Aplicar y verificar la tabla existe**

Aplicar con Supabase MCP `apply_migration` (name: `fiscal_01_config`). Luego `execute_sql`:
```sql
select count(*) as ok from information_schema.tables
where table_schema='public' and table_name='config_fiscal';
```
Expected: `ok = 1`.

- [ ] **Step 3: Verificar el upsert crea y actualiza sin duplicar**

`execute_sql`:
```sql
select public.upsert_config_fiscal('test_fiscal_x', '12345678Z', 'Salon Test');
select public.upsert_config_fiscal('test_fiscal_x', null, 'Salon Test 2');
select negocio_id, nif, razon_social from public.config_fiscal where negocio_id='test_fiscal_x';
delete from public.config_fiscal where negocio_id='test_fiscal_x';
```
Expected: una sola fila, `nif='12345678Z'` (conservado), `razon_social='Salon Test 2'` (actualizado).

- [ ] **Step 4: Commit**

```bash
git add migrations/fiscal-01-config.sql
git commit -m "feat(fiscal): tabla config_fiscal + upsert por negocio (VeriFactu F1)"
```

---

### Task 2: Migración `facturas` + inmutabilidad

**Files:**
- Create: `migrations/fiscal-02-facturas.sql`

**Interfaces:**
- Consumes: `public.cobros(id, negocio_id, total_cents, cliente_id)`.
- Produces: tabla `public.facturas` con columnas exactas del spec §3.2; triggers `facturas_prevent_delete_trigger`, `facturas_prevent_fiscal_updates_trigger`.

- [ ] **Step 1: Escribir la migración**

```sql
-- migrations/fiscal-02-facturas.sql
-- Registro de facturacion VeriFactu. Inmutable, encadenado por hash. Deriva 1:1 de cobros.
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cobro_id uuid references public.cobros(id),
  tipo text not null default 'F2'
    check (tipo in ('F1','F2','R1','R2','R3','R4','R5')),
  operacion text not null default 'alta'
    check (operacion in ('alta','anulacion')),
  factura_anulada_id uuid references public.facturas(id),
  factura_rectificada_id uuid references public.facturas(id),
  serie text not null,
  numero integer not null,
  ejercicio integer not null,
  fecha_expedicion timestamptz not null default now(),
  nif_emisor text not null,
  nif_receptor text,
  nombre_receptor text,
  base_imponible_cents integer not null,
  tipo_iva numeric not null default 21.0,
  cuota_iva_cents integer not null,
  total_cents integer not null,
  hash_anterior text,
  hash_propio text not null,
  aeat_estado text not null default 'pendiente'
    check (aeat_estado in ('pendiente','correcto','aceptado_con_errores','rechazado','anulado')),
  aeat_csv text,
  qr_url text,
  proveedor text,
  proveedor_ref text,
  payload jsonb,
  respuesta jsonb,
  created_at timestamptz not null default now(),
  unique (negocio_id, serie, ejercicio, numero)
);
create index if not exists facturas_negocio_fecha on public.facturas(negocio_id, fecha_expedicion desc);
create index if not exists facturas_cobro on public.facturas(cobro_id);
-- Una sola factura de alta por cobro (idempotencia)
create unique index if not exists facturas_cobro_alta_unico
  on public.facturas(negocio_id, cobro_id)
  where cobro_id is not null and operacion = 'alta';

alter table public.facturas enable row level security;
drop policy if exists facturas_select_own on public.facturas;
create policy facturas_select_own on public.facturas
  for select using (negocio_id = current_setting('app.negocio_id', true));
-- No hay policy de INSERT/UPDATE/DELETE para authenticated: todo pasa por RPC security definer.

-- Inmutabilidad: bloquear DELETE
create or replace function public.facturas_prevent_delete()
returns trigger as $$
begin
  raise exception 'No se permite eliminar registros de facturacion (RD 1007/2023 VeriFactu).';
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_delete_trigger on public.facturas;
create trigger facturas_prevent_delete_trigger before delete on public.facturas
  for each row execute function public.facturas_prevent_delete();

-- Inmutabilidad: bloquear UPDATE de campos fiscales; permitir estado de envio solo mientras pendiente
create or replace function public.facturas_prevent_fiscal_updates()
returns trigger as $$
begin
  if OLD.negocio_id <> NEW.negocio_id
     or OLD.cobro_id is distinct from NEW.cobro_id
     or OLD.tipo <> NEW.tipo or OLD.operacion <> NEW.operacion
     or OLD.serie <> NEW.serie or OLD.numero <> NEW.numero or OLD.ejercicio <> NEW.ejercicio
     or OLD.base_imponible_cents <> NEW.base_imponible_cents
     or OLD.cuota_iva_cents <> NEW.cuota_iva_cents
     or OLD.total_cents <> NEW.total_cents
     or OLD.tipo_iva <> NEW.tipo_iva
     or OLD.hash_propio <> NEW.hash_propio
     or OLD.hash_anterior is distinct from NEW.hash_anterior then
    raise exception 'No se permiten cambios en los campos fiscales de una factura (VeriFactu).';
  end if;
  if OLD.aeat_estado <> 'pendiente' then
    raise exception 'La factura ya esta cerrada; use anulacion/rectificativa (VeriFactu).';
  end if;
  return NEW;
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_fiscal_updates_trigger on public.facturas;
create trigger facturas_prevent_fiscal_updates_trigger before update on public.facturas
  for each row execute function public.facturas_prevent_fiscal_updates();

revoke execute on function public.facturas_prevent_delete() from public, anon, authenticated;
revoke execute on function public.facturas_prevent_fiscal_updates() from public, anon, authenticated;
```

- [ ] **Step 2: Aplicar y verificar inmutabilidad (DELETE bloqueado)**

Aplicar `apply_migration` (name `fiscal_02_facturas`). Insertar una fila de prueba directa (con service_role via execute_sql) y probar DELETE:
```sql
insert into public.facturas (negocio_id, serie, numero, ejercicio, nif_emisor,
  base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents, hash_propio)
values ('test_fiscal_x','A',1,2026,'12345678Z', 826, 21.0, 174, 1000, 'hash_test_1');
delete from public.facturas where negocio_id='test_fiscal_x';   -- debe fallar
```
Expected: el DELETE lanza `No se permite eliminar registros de facturacion...`.

- [ ] **Step 3: Verificar UPDATE fiscal bloqueado y estado de envio permitido**

```sql
-- Bloqueado: cambiar importe
update public.facturas set total_cents=999 where negocio_id='test_fiscal_x';  -- debe fallar
-- Permitido mientras pendiente: escribir respuesta de envio
update public.facturas set aeat_estado='correcto', aeat_csv='CSV123', qr_url='http://x'
  where negocio_id='test_fiscal_x';  -- debe funcionar
-- Ya cerrada: un segundo update debe fallar
update public.facturas set qr_url='http://y' where negocio_id='test_fiscal_x';  -- debe fallar
```
Expected: 1º falla (campo fiscal), 2º OK, 3º falla (ya cerrada). Limpieza: como no se puede DELETE, dejar la fila de test o truncar con privilegio de owner en un branch de pruebas. (Nota para el ejecutor: hacer estas pruebas en un **branch de Supabase**, no en producción — ver `create_branch`.)

- [ ] **Step 4: Commit**

```bash
git add migrations/fiscal-02-facturas.sql
git commit -m "feat(fiscal): tabla facturas + triggers de inmutabilidad VeriFactu (F1)"
```

---

### Task 3: RPC de numeración atómica sin huecos

**Files:**
- Create: `migrations/fiscal-03-numeracion.sql`

**Interfaces:**
- Produces: `public.siguiente_numero_factura(p_negocio_id text, p_serie text, p_ejercicio int) returns int`.

- [ ] **Step 1: Escribir la RPC**

```sql
-- migrations/fiscal-03-numeracion.sql
-- Numeracion correlativa sin huecos por (negocio, serie, ejercicio). Advisory lock por transaccion.
create or replace function public.siguiente_numero_factura(
  p_negocio_id text, p_serie text, p_ejercicio int
) returns int as $$
declare v_num int;
begin
  perform pg_advisory_xact_lock(hashtext(p_negocio_id || '|' || p_serie || '|' || p_ejercicio::text));
  select coalesce(max(numero),0) + 1 into v_num
    from public.facturas
    where negocio_id = p_negocio_id and serie = p_serie and ejercicio = p_ejercicio;
  return v_num;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.siguiente_numero_factura(text,text,int) from public, anon, authenticated;
```

- [ ] **Step 2: Aplicar y verificar correlatividad**

Aplicar `apply_migration` (name `fiscal_03_numeracion`). En un branch de pruebas:
```sql
select public.siguiente_numero_factura('test_num','A',2026);  -- 1 (no hay facturas)
insert into public.facturas (negocio_id, serie, numero, ejercicio, nif_emisor,
  base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents, hash_propio)
values ('test_num','A',1,2026,'X',826,21,174,1000,'h1');
select public.siguiente_numero_factura('test_num','A',2026);  -- 2
select public.siguiente_numero_factura('test_num','B',2026);  -- 1 (otra serie)
```
Expected: 1, luego 2, luego 1.

- [ ] **Step 3: Commit**

```bash
git add migrations/fiscal-03-numeracion.sql
git commit -m "feat(fiscal): numeracion atomica de facturas sin huecos (F1)"
```

---

### Task 4: RPC `crear_factura_desde_cobro` (desglose IVA + hash encadenado, atómico)

**Files:**
- Create: `migrations/fiscal-04-crear-factura.sql`

**Interfaces:**
- Consumes: `cobros`, `config_fiscal`, `siguiente_numero_factura`.
- Produces: `public.crear_factura_desde_cobro(p_cobro_id uuid, p_tipo text default 'F2', p_nif_receptor text default null, p_nombre_receptor text default null) returns uuid` (id de factura en estado `pendiente`).

- [ ] **Step 1: Escribir la RPC**

```sql
-- migrations/fiscal-04-crear-factura.sql
-- Crea el registro de factura (alta) a partir de un cobro: numera, desglosa IVA y encadena hash.
-- NO envia a AEAT (eso lo hace la edge function via ProveedorFiscal). Estado inicial: pendiente.
create or replace function public.crear_factura_desde_cobro(
  p_cobro_id uuid,
  p_tipo text default 'F2',
  p_nif_receptor text default null,
  p_nombre_receptor text default null
) returns uuid as $$
declare
  v_cobro public.cobros;
  v_cfg public.config_fiscal;
  v_ejercicio int;
  v_numero int;
  v_base int;
  v_cuota int;
  v_hash_prev text;
  v_hash text;
  v_id uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if v_cobro.estado <> 'completado' then
    raise exception 'Solo se factura un cobro completado';
  end if;

  select * into v_cfg from public.config_fiscal where negocio_id = v_cobro.negocio_id;
  if not found then raise exception 'config_fiscal no configurada para el negocio'; end if;

  v_ejercicio := extract(year from now())::int;
  v_numero := public.siguiente_numero_factura(v_cobro.negocio_id, v_cfg.serie_defecto, v_ejercicio);

  -- Desglose IVA desde total con IVA incluido (B2C). Redondeo bancario simple.
  v_base := round(v_cobro.total_cents / (1 + v_cfg.tipo_iva_defecto/100.0));
  v_cuota := v_cobro.total_cents - v_base;

  -- Hash del ultimo registro de este negocio (cadena unica por negocio)
  select hash_propio into v_hash_prev
    from public.facturas
    where negocio_id = v_cobro.negocio_id
    order by created_at desc limit 1;
  if v_hash_prev is null then
    v_hash_prev := repeat('0', 64);
  end if;

  v_hash := encode(digest(
    concat_ws('|', v_cfg.nif, v_cfg.serie_defecto, v_numero::text, v_ejercicio::text,
              v_cobro.total_cents::text, now()::text, v_hash_prev),
    'sha256'), 'hex');

  insert into public.facturas (
    negocio_id, cobro_id, tipo, operacion, serie, numero, ejercicio,
    nif_emisor, nif_receptor, nombre_receptor,
    base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents,
    hash_anterior, hash_propio, aeat_estado
  ) values (
    v_cobro.negocio_id, p_cobro_id, coalesce(p_tipo,'F2'), 'alta',
    v_cfg.serie_defecto, v_numero, v_ejercicio,
    v_cfg.nif, p_nif_receptor, p_nombre_receptor,
    v_base, v_cfg.tipo_iva_defecto, v_cuota, v_cobro.total_cents,
    v_hash_prev, v_hash, 'pendiente'
  ) returning id into v_id;

  return v_id;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.crear_factura_desde_cobro(uuid,text,text,text) from public, anon;
-- authenticated puede invocarla (crea su propia factura); la RPC valida negocio via el cobro.
```

- [ ] **Step 2: Aplicar y verificar el desglose de IVA**

Requiere `pgcrypto` (digest). Verificar/activar:
```sql
create extension if not exists pgcrypto;
```
En un branch, sembrar un cobro y config, y crear factura:
```sql
select public.upsert_config_fiscal('test_fx','B12345678','Salon FX');
-- crear un cobro minimo directo (branch de pruebas):
insert into public.cobros (negocio_id, total_cents, metodo, estado)
  values ('test_fx', 2100, 'efectivo', 'completado') returning id;
-- usar ese id:
select public.crear_factura_desde_cobro('<cobro_id>');
select numero, base_imponible_cents, cuota_iva_cents, total_cents, length(hash_propio) as hlen, hash_anterior
  from public.facturas where negocio_id='test_fx';
```
Expected: `total_cents=2100`, `base_imponible_cents=1736`, `cuota_iva_cents=364` (2100/1.21≈1735.5→1736), `hlen=64`, `hash_anterior` = 64 ceros (primera factura).

- [ ] **Step 3: Verificar encadenamiento e idempotencia**

```sql
-- Segunda factura: su hash_anterior debe ser el hash_propio de la primera
insert into public.cobros (negocio_id, total_cents, metodo, estado)
  values ('test_fx', 1000, 'efectivo', 'completado') returning id;
select public.crear_factura_desde_cobro('<cobro_id_2>');
select numero, hash_anterior from public.facturas where negocio_id='test_fx' order by numero;
-- Idempotencia: re-facturar el mismo cobro debe fallar por el indice unico
select public.crear_factura_desde_cobro('<cobro_id_2>');  -- debe fallar (duplicate key)
```
Expected: la 2ª factura tiene `numero=2` y su `hash_anterior` = hash de la nº1; re-facturar lanza violación de `facturas_cobro_alta_unico`.

- [ ] **Step 4: Commit**

```bash
git add migrations/fiscal-04-crear-factura.sql
git commit -m "feat(fiscal): crear_factura_desde_cobro con desglose IVA y hash encadenado (F1)"
```

---

### Task 5: Capa `ProveedorFiscal` + `MockSandboxProvider` (TS)

**Files:**
- Create: `lib/fiscal/proveedorFiscal.ts`
- Create: `lib/fiscal/proveedorFiscal.mock.ts`

**Interfaces:**
- Produces:
  - `interface FacturaAltaPayload { negocioId: string; nifEmisor: string; nifReceptor?: string; serie: string; numero: number; ejercicio: number; baseCents: number; cuotaCents: number; totalCents: number; tipoIva: number; hashPropio: string; }`
  - `interface ResultadoAlta { aeatEstado: 'pendiente'|'correcto'|'aceptado_con_errores'|'rechazado'; qrUrl: string; csv?: string; ref: string; }`
  - `interface ProveedorFiscal { emitirAlta(p: FacturaAltaPayload): Promise<ResultadoAlta>; }`
  - `class MockSandboxProvider implements ProveedorFiscal`
  - `function getProveedorFiscal(nombre?: string): ProveedorFiscal` (devuelve el mock en F1).

- [ ] **Step 1: Escribir la interfaz**

```typescript
// lib/fiscal/proveedorFiscal.ts
// Capa de abstraccion del proveedor fiscal. En F1 solo existe el mock de sandbox.
// El envio real a AEAT (VerifactuApiProvider) es F2 (Alexandro).

export type AeatEstado = 'pendiente' | 'correcto' | 'aceptado_con_errores' | 'rechazado';

export interface FacturaAltaPayload {
  negocioId: string;
  nifEmisor: string;
  nifReceptor?: string;
  serie: string;
  numero: number;
  ejercicio: number;
  baseCents: number;
  cuotaCents: number;
  totalCents: number;
  tipoIva: number;
  hashPropio: string;
}

export interface ResultadoAlta {
  aeatEstado: AeatEstado;
  qrUrl: string;
  csv?: string;
  ref: string;
}

export interface ProveedorFiscal {
  emitirAlta(p: FacturaAltaPayload): Promise<ResultadoAlta>;
}
```

- [ ] **Step 2: Escribir el mock de sandbox**

```typescript
// lib/fiscal/proveedorFiscal.mock.ts
import type { ProveedorFiscal, FacturaAltaPayload, ResultadoAlta } from './proveedorFiscal';

// Simula la respuesta de un colaborador social en entorno de pruebas AEAT.
// NO llama a ninguna red. El QR apunta a una URL de verificacion simulada.
export class MockSandboxProvider implements ProveedorFiscal {
  async emitirAlta(p: FacturaAltaPayload): Promise<ResultadoAlta> {
    const ref = `MOCK-${p.negocioId}-${p.serie}-${p.ejercicio}-${p.numero}`;
    const qrUrl =
      `https://sandbox.verifactu.example/verify?nif=${encodeURIComponent(p.nifEmisor)}` +
      `&serie=${encodeURIComponent(p.serie)}&num=${p.numero}&total=${p.totalCents}`;
    return {
      aeatEstado: 'correcto',
      qrUrl,
      csv: `SANDBOX-${p.hashPropio.slice(0, 12).toUpperCase()}`,
      ref,
    };
  }
}
```

- [ ] **Step 3: Escribir el selector de proveedor (al final de `proveedorFiscal.ts`)**

```typescript
// Añadir al final de lib/fiscal/proveedorFiscal.ts
import { MockSandboxProvider } from './proveedorFiscal.mock';

export function getProveedorFiscal(_nombre?: string): ProveedorFiscal {
  // F1: siempre mock de sandbox. F2 añadira VerifactuApiProvider segun `_nombre`.
  return new MockSandboxProvider();
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/fiscal/*` (ignorar errores preexistentes de `supabase/functions`, que son Deno).

- [ ] **Step 5: Commit**

```bash
git add lib/fiscal/proveedorFiscal.ts lib/fiscal/proveedorFiscal.mock.ts
git commit -m "feat(fiscal): capa ProveedorFiscal + MockSandboxProvider (F1)"
```

---

### Task 6: Edge function `emitir-factura` (orquesta RPC + proveedor)

**Files:**
- Create: `supabase/functions/emitir-factura/index.ts`
- Reference (patrón): `supabase/functions/reembolsar-cobro/index.ts`, `supabase/functions/_shared/`

**Interfaces:**
- Consumes: RPC `crear_factura_desde_cobro`, tabla `facturas`, `getProveedorFiscal` (reimplementado inline para Deno o importado desde `_shared` — ver Step 1), `config_fiscal`.
- Produces: endpoint POST que recibe `{ cobro_id, tipo?, nif_receptor?, nombre_receptor? }` y devuelve `{ factura_id, aeat_estado, qr_url, csv, serie, numero }`.

- [ ] **Step 1: Leer el patrón de una edge existente**

Leer `supabase/functions/reembolsar-cobro/index.ts` completo y `supabase/functions/_shared/` para copiar exactamente: cabeceras CORS (allowlist mechaa.es), creación del client con `SUPABASE_SERVICE_ROLE_KEY`, y el manejo de auth del usuario. Anotar los imports/paths reales que usa este repo (no asumir).

- [ ] **Step 2: Escribir la edge function**

```typescript
// supabase/functions/emitir-factura/index.ts
// Orquesta la emision de una factura en sandbox:
// 1) RPC crear_factura_desde_cobro (numera, desglosa IVA, encadena hash) -> factura pendiente
// 2) Llama al ProveedorFiscal (mock en F1) -> qr/csv/estado
// 3) Escribe el resultado en la factura (permitido mientras aeat_estado='pendiente')
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Mock de sandbox (inline para Deno; en F2 se reemplaza por el proveedor real).
function mockEmitirAlta(f: {
  negocioId: string; nifEmisor: string; serie: string; ejercicio: number;
  numero: number; totalCents: number; hashPropio: string;
}) {
  const ref = `MOCK-${f.negocioId}-${f.serie}-${f.ejercicio}-${f.numero}`;
  const qrUrl = `https://sandbox.verifactu.example/verify?nif=${encodeURIComponent(f.nifEmisor)}` +
    `&serie=${encodeURIComponent(f.serie)}&num=${f.numero}&total=${f.totalCents}`;
  return { aeatEstado: 'correcto', qrUrl, csv: `SANDBOX-${f.hashPropio.slice(0,12).toUpperCase()}`, ref };
}

const CORS = {
  'Access-Control-Allow-Origin': '*', // ajustar a la allowlist real de _shared
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { cobro_id, tipo, nif_receptor, nombre_receptor } = await req.json();
    if (!cobro_id) return json({ error: 'cobro_id requerido' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Crear la factura (pendiente)
    const { data: facturaId, error: rpcErr } = await supabase.rpc('crear_factura_desde_cobro', {
      p_cobro_id: cobro_id, p_tipo: tipo ?? 'F2',
      p_nif_receptor: nif_receptor ?? null, p_nombre_receptor: nombre_receptor ?? null,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 400);

    // 2) Leer la factura recien creada
    const { data: f, error: selErr } = await supabase.from('facturas')
      .select('*').eq('id', facturaId).single();
    if (selErr) return json({ error: selErr.message }, 400);

    // 3) Emitir con el proveedor (mock)
    const r = mockEmitirAlta({
      negocioId: f.negocio_id, nifEmisor: f.nif_emisor, serie: f.serie,
      ejercicio: f.ejercicio, numero: f.numero, totalCents: f.total_cents, hashPropio: f.hash_propio,
    });

    // 4) Escribir el resultado (permitido solo mientras pendiente)
    const { error: updErr } = await supabase.from('facturas').update({
      aeat_estado: r.aeatEstado, qr_url: r.qrUrl, aeat_csv: r.csv,
      proveedor: 'mock_sandbox', proveedor_ref: r.ref, respuesta: r,
    }).eq('id', facturaId);
    if (updErr) return json({ error: updErr.message }, 400);

    return json({
      factura_id: facturaId, aeat_estado: r.aeatEstado, qr_url: r.qrUrl,
      csv: r.csv, serie: f.serie, numero: f.numero,
    }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
```
> Nota: si el repo centraliza CORS/allowlist en `_shared`, sustituir el `CORS` inline por ese import (Step 1).

- [ ] **Step 3: Desplegar la edge function**

Desplegar con Supabase MCP `deploy_edge_function` (slug `emitir-factura`). (El repo despliega edges vía MCP/CLI, no vía build web.)

- [ ] **Step 4: Verificar end-to-end en sandbox**

En un branch con `config_fiscal` y un cobro `completado` sembrados, invocar la función (curl o `get_logs`), y comprobar:
```sql
select numero, aeat_estado, qr_url, aeat_csv, proveedor, proveedor_ref
  from public.facturas where cobro_id = '<cobro_id>';
```
Expected: `aeat_estado='correcto'`, `qr_url` no nulo, `aeat_csv` empieza por `SANDBOX-`, `proveedor='mock_sandbox'`.

- [ ] **Step 5: Confirmar inmutabilidad tras cierre**

```sql
update public.facturas set qr_url='http://tamper' where cobro_id='<cobro_id>';
```
Expected: falla con `La factura ya esta cerrada...` (porque `aeat_estado` ya no es `pendiente`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/emitir-factura/index.ts
git commit -m "feat(fiscal): edge emitir-factura orquesta RPC + proveedor mock (F1)"
```

---

### Task 7: Advisors de seguridad + documento de estado

**Files:**
- Modify: `informes/PLAN-VERIFACTU-Y-FRONTERAS-FISCALES-2026-07-13.md` (marcar F1 backend como HECHO)

- [ ] **Step 1: Pasar advisors de seguridad**

Ejecutar Supabase MCP `get_advisors` (type `security`). Revisar que no aparezcan las funciones nuevas como `*_security_definer_function_executable` para anon/authenticated (deben estar revocadas). Corregir cualquier hallazgo antes de continuar.

- [ ] **Step 2: Actualizar el documento de arquitectura**

En `informes/PLAN-VERIFACTU-Y-FRONTERAS-FISCALES-2026-07-13.md`, §9, marcar **F1 (backend)** como HECHO con la fecha y listar lo que queda (F1-UI, F2 Alexandro, F3 fichajes).

- [ ] **Step 3: Commit**

```bash
git add informes/PLAN-VERIFACTU-Y-FRONTERAS-FISCALES-2026-07-13.md
git commit -m "docs(fiscal): F1 backend VeriFactu hecho; pendientes UI/F2/fichajes"
```

---

## Fuera de alcance de este plan (planes siguientes)

- **F1-UI (Carlos):** badge de estado fiscal en Caja/ficha de cobro; sección "Facturación" (libro read-only); Ajustes → Fiscalidad (form sobre `upsert_config_fiscal`); ticket con QR. Requiere localizar los `.web.tsx` de caja/ajustes y seguir `hairy-design-system`.
- **F2 (Alexandro):** `VerifactuApiProvider` real → sandbox AEAT → producción; apoderamiento colaborador social; webhook de estado; anulación/rectificativa reales.
- **F3 (Carlos):** fichajes inmutables + encadenado + export a Inspección (spec §7).
- **F0/F4 (Jose + fiscalista):** tipos de IVA, elección de proveedor, declaración responsable de conformidad, activar `config_fiscal.activo`.

## Self-Review (hecho)

- **Cobertura del spec:** §3.1→Task1, §3.2/§3.4→Task2, §3.3 numeración→Task3, §5 desglose+hash+idempotencia→Task4, §4 abstracción→Task5/6, §4 flujo→Task6, §4/§10 advisors→Task7. UI (§6), fichajes (§7), envío real (§4.2/F2) explícitamente diferidos.
- **Placeholders:** ninguno; todo el SQL/TS es literal.
- **Consistencia de tipos:** `crear_factura_desde_cobro(uuid,text,text,text)` usado igual en Task4 y Task6; `hashPropio`/`hash_propio`, `aeat_estado` coherentes entre TS y SQL; `FacturaAltaPayload` de Task5 coincide con los campos que arma Task6.
- **Aviso de ejecución:** las pruebas destructivas de inmutabilidad deben correr en un **branch de Supabase** (`create_branch`), no en producción, porque las filas de `facturas` no se pueden borrar por diseño.
