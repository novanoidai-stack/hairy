# VeriFactu PROPIO (directo a AEAT) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar tarea a tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Este plan SUSTITUYE** a `PLAN-VERIFACTU-F1-BACKEND-IMPLEMENTACION-2026-07-13.md` (que asumía un proveedor intermediario/mock). La decisión del 13 jul es **construir la integración directa con la AEAT** (modalidad VeriFactu puro, Mecha como Colaborador Social con Sello de Entidad). Contexto y fuentes oficiales: `PLAN-VERIFACTU-Y-FRONTERAS-FISCALES-2026-07-13.md` §12.

**Goal:** Que Mecha genere, encadene, numere sin huecos, firme (huella SHA-256) y **remita en tiempo real a la AEAT** los registros de facturación de cada salón, sin intermediarios de pago y sin custodiar certificados por salón.

**Architecture:** El **hash y el encadenamiento son autoritativos en la BD** (una RPC atómica serializa por negocio con advisory lock, asigna número y calcula la huella con el formato EXACTO de la AEAT). La **transmisión mTLS+SOAP** vive en un **worker Node dedicado** (fuera de Supabase Edge) que sostiene el certificado de Sello de Entidad de Mecha, respeta el control de flujo de la AEAT y persiste la respuesta. Los registros son **inmutables** una vez generados; las correcciones son registros de **anulación/rectificativa** encadenados.

**Tech Stack:** Supabase Postgres (pgcrypto SHA-256, advisory locks), PostgREST RPC, Node worker (https.Agent mTLS + SOAP), React Native Web (tipos + UI, en plan aparte). Verificación: Supabase MCP `execute_sql` (con **vector de oro oficial**), `npx tsc --noEmit`, y el entorno de **preproducción de la AEAT** (`prewww1.aeat.es`).

## Global Constraints

- **Fuentes oficiales, cero improvisación fiscal.** Todo formato (huella, QR, XML) sale de la AEAT (sede + portal de desarrolladores). Ante duda, la fuente autoritativa es el documento/WSDL/XSD oficial descargado, no un blog.
- **Modalidad = VeriFactu puro** (remisión en tiempo real). NO se implementa firma XAdES por registro ni registro de eventos (son del modo No-VeriFactu).
- **Multi-tenant estricto:** cada salón = su propio obligado tributario, su propia serie, su propia cadena de huella. Nada se cruza entre `negocio_id`.
- Importes SIEMPRE en **céntimos** (integer) en BD; se formatean a `n.nn` sólo para la huella/QR/XML.
- **Numeración sin huecos** entre registros **generados** (no entre borradores). El número se asigna en el momento de la generación, bajo advisory lock por negocio.
- **Inmutabilidad:** una factura `generada` no admite UPDATE de campos fiscales/huella ni DELETE. Correcciones = anulación/rectificativa encadenada.
- **Huella:** SHA-256 (ISO/IEC 10118-3:2018), salida **64 hex MAYÚSCULAS**, sobre la cadena `campo=valor&...` en UTF-8, campos vacíos como `Nombre=`.
- **El certificado NUNCA está en el repo ni en el cliente.** Vive como secreto del worker. Mecha custodia UN certificado (Sello de Entidad), no uno por salón.
- Toda función `security definer` nueva: `revoke execute ... from public, anon` (y `authenticated` salvo que deba invocarla el salón). Código en inglés, comentarios en español, sin emojis.
- **Prerrequisitos legales (Fase D) BLOQUEAN producción**, no el desarrollo en preproducción.

---

## Vector de oro (verificado localmente — usar en todos los tests de huella)

```
Cadena de entrada (UTF-8):
IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00

SHA-256 (hex, MAYÚSCULAS):
3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60
```

---

# FASE A — Datos, huella y encadenamiento (Carlos) — se puede hacer sin certificado

### Task A0: Reutilizar `config_fiscal` (del plan anterior) + añadir campos de colaborador social

**Files:**
- Create: `migrations/fiscal-a0-config.sql`

**Interfaces:**
- Produces: tabla `public.config_fiscal` (ver plan anterior Task 1) MÁS columnas: `num_serie_formato text default '{serie}/{ejercicio}/{numero6}'`, `entorno_aeat text default 'preproduccion' check (entorno_aeat in ('preproduccion','produccion'))`, `representacion_ok boolean default false` (el salón firmó el Anexo II), `representacion_doc_url text`.

- [ ] **Step 1: Escribir la migración**

Copiar la tabla `config_fiscal` y `upsert_config_fiscal` del plan F1 anterior (Task 1) y **añadir** al final:
```sql
-- migrations/fiscal-a0-config.sql  (además de lo del plan F1 Task 1)
alter table public.config_fiscal add column if not exists num_serie_formato text not null default '{serie}/{ejercicio}/{numero6}';
alter table public.config_fiscal add column if not exists entorno_aeat text not null default 'preproduccion'
  check (entorno_aeat in ('preproduccion','produccion'));
alter table public.config_fiscal add column if not exists representacion_ok boolean not null default false;
alter table public.config_fiscal add column if not exists representacion_doc_url text;
comment on column public.config_fiscal.representacion_ok is 'El salon firmo el modelo de representacion (Anexo II, Res. 18 dic 2024) para que Mecha remita por el.';
```

- [ ] **Step 2: Aplicar y verificar** (Supabase MCP `apply_migration` name `fiscal_a0_config`):
```sql
select column_name from information_schema.columns
where table_name='config_fiscal' and column_name in ('entorno_aeat','representacion_ok');
```
Expected: 2 filas.

- [ ] **Step 3: Commit**
```bash
git add migrations/fiscal-a0-config.sql
git commit -m "feat(fiscal): config_fiscal + campos colaborador social/entorno AEAT (DIY)"
```

---

### Task A1: Tabla `facturas` con máquina de estados VeriFactu + inmutabilidad

**Files:**
- Create: `migrations/fiscal-a1-facturas.sql`

**Interfaces:**
- Produces: tabla `public.facturas`. Estados: `borrador` → `generada` → (`aceptada` | `aceptada_con_errores` | `rechazada`); operación `anulacion` como registro aparte. Columnas clave adicionales frente al plan F1: `estado`, `num_serie_completo text`, `fechahora_gen timestamptz`, `id_emisor text`, `huella text`, `huella_anterior text`.

- [ ] **Step 1: Escribir la migración**
```sql
-- migrations/fiscal-a1-facturas.sql
-- Registro de facturacion VeriFactu (modalidad puro). Inmutable tras 'generada'.
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cobro_id uuid references public.cobros(id),

  estado text not null default 'borrador'
    check (estado in ('borrador','generada','aceptada','aceptada_con_errores','rechazada','anulada')),
  operacion text not null default 'alta' check (operacion in ('alta','anulacion')),
  factura_anulada_id uuid references public.facturas(id),
  factura_rectificada_id uuid references public.facturas(id),

  tipo text not null default 'F2' check (tipo in ('F1','F2','R1','R2','R3','R4','R5')),
  serie text not null,
  numero integer,                    -- se asigna al GENERAR (no en borrador) => sin huecos
  ejercicio integer not null,
  num_serie_completo text,           -- NumSerieFactura para la huella/XML (p.ej. 'A/2026/000123')
  fecha_expedicion date not null default current_date,
  fechahora_gen timestamptz,         -- FechaHoraHusoGenRegistro (fijado al generar)

  id_emisor text not null,           -- NIF del salon (IDEmisorFactura)
  nif_receptor text,
  nombre_receptor text,

  base_imponible_cents integer not null,
  tipo_iva numeric not null default 21.0,
  cuota_iva_cents integer not null,
  total_cents integer not null,

  huella text,                       -- <sum1:Huella> de ESTE registro (se fija al generar)
  huella_anterior text,              -- huella del registro inmediatamente anterior del negocio

  aeat_estado text,                  -- Correcto / AceptadoConErrores / Incorrecto (crudo AEAT)
  aeat_csv text,
  aeat_error_codigo text,
  aeat_error_desc text,
  qr_url text,
  payload_xml text,                  -- XML enviado (auditoria)
  respuesta jsonb,                   -- respuesta cruda AEAT
  entorno text,                      -- preproduccion | produccion

  created_at timestamptz not null default now(),
  unique (negocio_id, serie, ejercicio, numero)
);
create index if not exists facturas_negocio_gen on public.facturas(negocio_id, fechahora_gen);
create index if not exists facturas_cobro on public.facturas(cobro_id);
create index if not exists facturas_pendiente_envio on public.facturas(negocio_id)
  where estado = 'generada' and aeat_estado is null;
-- Una sola factura de alta por cobro
create unique index if not exists facturas_cobro_alta_unico
  on public.facturas(negocio_id, cobro_id) where cobro_id is not null and operacion='alta';

alter table public.facturas enable row level security;
drop policy if exists facturas_select_own on public.facturas;
create policy facturas_select_own on public.facturas
  for select using (negocio_id = current_setting('app.negocio_id', true));
-- Sin INSERT/UPDATE/DELETE para authenticated: todo via RPC security definer.

-- Inmutabilidad DELETE: nunca
create or replace function public.facturas_prevent_delete()
returns trigger as $$
begin
  raise exception 'No se permite eliminar registros de facturacion (RD 1007/2023 VeriFactu).';
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_delete_trigger on public.facturas;
create trigger facturas_prevent_delete_trigger before delete on public.facturas
  for each row execute function public.facturas_prevent_delete();

-- Inmutabilidad UPDATE: campos fiscales/huella intocables SIEMPRE.
-- Numero/huella/fechahora_gen: se fijan en el paso 'generada' (cuando OLD.estado='borrador').
create or replace function public.facturas_prevent_fiscal_updates()
returns trigger as $$
begin
  -- Campos economicos y de identidad: intocables siempre
  if OLD.negocio_id <> NEW.negocio_id
     or OLD.cobro_id is distinct from NEW.cobro_id
     or OLD.tipo <> NEW.tipo or OLD.operacion <> NEW.operacion
     or OLD.serie <> NEW.serie or OLD.ejercicio <> NEW.ejercicio
     or OLD.base_imponible_cents <> NEW.base_imponible_cents
     or OLD.cuota_iva_cents <> NEW.cuota_iva_cents
     or OLD.total_cents <> NEW.total_cents or OLD.tipo_iva <> NEW.tipo_iva
     or OLD.id_emisor <> NEW.id_emisor then
    raise exception 'Campos fiscales de una factura no son modificables (VeriFactu).';
  end if;
  -- numero/huella/huella_anterior/fechahora_gen/num_serie_completo: solo se pueden fijar al generar
  if OLD.estado <> 'borrador' then
    if OLD.numero is distinct from NEW.numero
       or OLD.huella is distinct from NEW.huella
       or OLD.huella_anterior is distinct from NEW.huella_anterior
       or OLD.fechahora_gen is distinct from NEW.fechahora_gen
       or OLD.num_serie_completo is distinct from NEW.num_serie_completo then
      raise exception 'La factura ya esta generada; la huella/numero no se pueden cambiar (VeriFactu).';
    end if;
  end if;
  return NEW;
end; $$ language plpgsql security definer set search_path = public;
drop trigger if exists facturas_prevent_fiscal_updates_trigger on public.facturas;
create trigger facturas_prevent_fiscal_updates_trigger before update on public.facturas
  for each row execute function public.facturas_prevent_fiscal_updates();

revoke execute on function public.facturas_prevent_delete() from public, anon, authenticated;
revoke execute on function public.facturas_prevent_fiscal_updates() from public, anon, authenticated;
```

- [ ] **Step 2: Aplicar y verificar DELETE e inmutabilidad económica** (en un **branch de Supabase** — `create_branch`):
```sql
insert into public.facturas (negocio_id, ejercicio, serie, id_emisor,
  base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents)
values ('test_fx', 2026, 'A', '12345678Z', 1736, 21, 364, 2100);
delete from public.facturas where negocio_id='test_fx';                 -- debe fallar
update public.facturas set total_cents=1 where negocio_id='test_fx';    -- debe fallar
```
Expected: ambos lanzan excepción.

- [ ] **Step 3: Commit**
```bash
git add migrations/fiscal-a1-facturas.sql
git commit -m "feat(fiscal): tabla facturas VeriFactu (estados + inmutabilidad) DIY"
```

---

### Task A2: RPC `crear_factura_borrador` (deriva del cobro, SIN número ni huella)

**Files:**
- Create: `migrations/fiscal-a2-borrador.sql`

**Interfaces:**
- Consumes: `cobros`, `config_fiscal`.
- Produces: `public.crear_factura_borrador(p_cobro_id uuid, p_tipo text default 'F2', p_nif_receptor text default null, p_nombre_receptor text default null) returns uuid`.

- [ ] **Step 1: Escribir la RPC**
```sql
-- migrations/fiscal-a2-borrador.sql
-- Crea la factura en estado 'borrador' derivada del cobro: desglosa IVA, fija emisor/serie/ejercicio.
-- NO asigna numero ni huella (eso ocurre al GENERAR, para no dejar huecos).
create or replace function public.crear_factura_borrador(
  p_cobro_id uuid, p_tipo text default 'F2',
  p_nif_receptor text default null, p_nombre_receptor text default null
) returns uuid as $$
declare
  v_cobro public.cobros; v_cfg public.config_fiscal;
  v_base int; v_cuota int; v_id uuid;
begin
  select * into v_cobro from public.cobros where id = p_cobro_id;
  if not found then raise exception 'Cobro no encontrado'; end if;
  if v_cobro.estado <> 'completado' then raise exception 'Solo se factura un cobro completado'; end if;

  select * into v_cfg from public.config_fiscal where negocio_id = v_cobro.negocio_id;
  if not found or v_cfg.nif is null then raise exception 'config_fiscal/NIF no configurado'; end if;

  v_base := round(v_cobro.total_cents / (1 + v_cfg.tipo_iva_defecto/100.0));
  v_cuota := v_cobro.total_cents - v_base;

  insert into public.facturas (
    negocio_id, cobro_id, estado, operacion, tipo, serie, ejercicio,
    fecha_expedicion, id_emisor, nif_receptor, nombre_receptor,
    base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents, entorno
  ) values (
    v_cobro.negocio_id, p_cobro_id, 'borrador', 'alta', coalesce(p_tipo,'F2'),
    v_cfg.serie_defecto, extract(year from now())::int,
    current_date, v_cfg.nif, p_nif_receptor, p_nombre_receptor,
    v_base, v_cfg.tipo_iva_defecto, v_cuota, v_cobro.total_cents, v_cfg.entorno_aeat
  ) returning id into v_id;
  return v_id;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.crear_factura_borrador(uuid,text,text,text) from public, anon;
```

- [ ] **Step 2: Verificar desglose IVA** (branch): sembrar cobro `total_cents=2100`, `config_fiscal` con NIF, llamar y comprobar `base=1736`, `cuota=364`, `estado='borrador'`, `numero is null`.

- [ ] **Step 3: Commit**
```bash
git add migrations/fiscal-a2-borrador.sql
git commit -m "feat(fiscal): crear_factura_borrador (desglose IVA, sin numero/huella)"
```

---

### Task A3: RPC `generar_registro_alta` — el corazón (número + huella EXACTA + cadena, atómico)

**Files:**
- Create: `migrations/fiscal-a3-generar-alta.sql`

**Interfaces:**
- Consumes: `facturas` (borrador), `config_fiscal`, `pgcrypto.digest`.
- Produces: `public.generar_registro_alta(p_factura_id uuid) returns table(numero int, huella text, num_serie_completo text, fechahora_gen timestamptz)`. Serializa por negocio con `pg_advisory_xact_lock`. Deja la factura en `estado='generada'`, inmutable.

- [ ] **Step 1: Validar PRIMERO la fórmula de huella contra el vector de oro** (branch, `execute_sql`):
```sql
create extension if not exists pgcrypto;
select upper(encode(digest(
  'IDEmisorFactura=' || '89890001K' ||
  '&NumSerieFactura=' || '12345678/G33' ||
  '&FechaExpedicionFactura=' || '01-01-2024' ||
  '&TipoFactura=' || 'F1' ||
  '&CuotaTotal=' || '12.35' ||
  '&ImporteTotal=' || '123.45' ||
  '&Huella=' || '' ||
  '&FechaHoraHusoGenRegistro=' || '2024-01-01T19:20:30+01:00'
, 'sha256'), 'hex')) as huella;
```
Expected EXACTO: `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`. **Si no coincide, parar**: la construcción de la cadena está mal.

- [ ] **Step 2: Escribir la RPC** (usa el mismo patrón de concatenación, con formateo exacto de fecha/importe)
```sql
-- migrations/fiscal-a3-generar-alta.sql
-- Genera el registro de ALTA: asigna numero (sin huecos), fija fechahora_gen, construye la
-- cadena de huella con el formato EXACTO de la AEAT, calcula SHA-256 y encadena. Atomico por negocio.
create or replace function public.generar_registro_alta(p_factura_id uuid)
returns table(numero int, huella text, num_serie_completo text, fechahora_gen timestamptz) as $$
declare
  f public.facturas; cfg public.config_fiscal;
  v_num int; v_prev text; v_nsc text; v_fhg timestamptz;
  v_fhg_str text; v_fecha_str text; v_cuota_str text; v_importe_str text; v_cadena text; v_huella text;
begin
  select * into f from public.facturas where id = p_factura_id;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado <> 'borrador' then raise exception 'La factura no esta en borrador'; end if;
  select * into cfg from public.config_fiscal where negocio_id = f.negocio_id;

  -- Serializa TODA la generacion de este negocio (numero + cadena de huella)
  perform pg_advisory_xact_lock(hashtext('verifactu_gen:' || f.negocio_id));

  -- 1) Numero sin huecos entre registros GENERADOS (numero not null) de serie+ejercicio
  select coalesce(max(numero),0)+1 into v_num
    from public.facturas
    where negocio_id=f.negocio_id and serie=f.serie and ejercicio=f.ejercicio and numero is not null;

  -- 2) NumSerieFactura (formato del negocio; por defecto SERIE/EJERCICIO/NUMERO6)
  v_nsc := replace(replace(replace(cfg.num_serie_formato,
             '{serie}', f.serie), '{ejercicio}', f.ejercicio::text),
             '{numero6}', lpad(v_num::text, 6, '0'));

  -- 3) Huella del registro inmediatamente anterior del negocio (cadena unica por negocio)
  select huella into v_prev from public.facturas
    where negocio_id=f.negocio_id and huella is not null
    order by fechahora_gen desc, numero desc limit 1;
  v_prev := coalesce(v_prev, '');   -- vacio si es el primero

  -- 4) FechaHoraHusoGenRegistro en ISO 8601 con huso (+01:00). OF da '+01'; se normaliza a '+01:00'.
  v_fhg := now();
  v_fhg_str := to_char(v_fhg, 'YYYY-MM-DD"T"HH24:MI:SS') ||
               regexp_replace(to_char(v_fhg, 'OF'), '^([+-]\d{2})$', '\1:00');
  -- (si OF ya trae minutos, p.ej. '+05:30', el regexp lo deja igual)
  if v_fhg_str !~ '[+-]\d{2}:\d{2}$' then
    v_fhg_str := v_fhg_str || ':00';
  end if;

  v_fecha_str  := to_char(f.fecha_expedicion, 'DD-MM-YYYY');
  v_cuota_str  := to_char(f.cuota_iva_cents/100.0, 'FM999999990.00');   -- '.' es literal
  v_importe_str:= to_char(f.total_cents/100.0,    'FM999999990.00');

  -- 5) Cadena EXACTA (orden y separadores oficiales) + SHA-256 mayusculas
  v_cadena :=
    'IDEmisorFactura='        || f.id_emisor ||
    '&NumSerieFactura='       || v_nsc ||
    '&FechaExpedicionFactura='|| v_fecha_str ||
    '&TipoFactura='           || f.tipo ||
    '&CuotaTotal='            || v_cuota_str ||
    '&ImporteTotal='          || v_importe_str ||
    '&Huella='                || v_prev ||
    '&FechaHoraHusoGenRegistro=' || v_fhg_str;
  v_huella := upper(encode(digest(convert_to(v_cadena,'UTF8'),'sha256'),'hex'));

  -- 6) Fijar en la factura (permitido: estado sigue 'borrador' hasta este UPDATE)
  update public.facturas set
    numero=v_num, num_serie_completo=v_nsc, fechahora_gen=v_fhg,
    huella=v_huella, huella_anterior=nullif(v_prev,''), estado='generada'
  where id=p_factura_id;

  return query select v_num, v_huella, v_nsc, v_fhg;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.generar_registro_alta(uuid) from public, anon;
```

- [ ] **Step 3: Verificar numeración sin huecos y encadenamiento** (branch): crear 2 borradores en el mismo negocio, generarlos, y comprobar: números `1` y `2`; la 2ª tiene `huella_anterior` = `huella` de la 1ª; `length(huella)=64` y en mayúsculas; re-generar una ya `generada` falla.

- [ ] **Step 4: Verificar el redondeo de importe/cuota** (branch): factura con `total_cents=12345`, `cuota_iva_cents=1235` → en la cadena deben aparecer `ImporteTotal=123.45` y `CuotaTotal=12.35`. Comprobar con:
```sql
select to_char(12345/100.0,'FM999999990.00'), to_char(1235/100.0,'FM999999990.00');
```
Expected: `123.45`, `12.35`.

- [ ] **Step 5: Commit**
```bash
git add migrations/fiscal-a3-generar-alta.sql
git commit -m "feat(fiscal): generar_registro_alta con huella exacta AEAT + cadena atomica"
```

---

### Task A4: RPC `registrar_respuesta_aeat` (el worker escribe el resultado)

**Files:**
- Create: `migrations/fiscal-a4-respuesta.sql`

**Interfaces:**
- Produces: `public.registrar_respuesta_aeat(p_factura_id uuid, p_aeat_estado text, p_csv text, p_error_codigo text, p_error_desc text, p_qr_url text, p_payload_xml text, p_respuesta jsonb) returns void`. Mapea `aeat_estado` crudo → `estado` de la factura.

- [ ] **Step 1: Escribir la RPC**
```sql
-- migrations/fiscal-a4-respuesta.sql
-- El worker de envio persiste la respuesta de la AEAT. Mapea el estado crudo al estado de la factura.
create or replace function public.registrar_respuesta_aeat(
  p_factura_id uuid, p_aeat_estado text, p_csv text default null,
  p_error_codigo text default null, p_error_desc text default null,
  p_qr_url text default null, p_payload_xml text default null, p_respuesta jsonb default null
) returns void as $$
declare v_estado text;
begin
  v_estado := case upper(coalesce(p_aeat_estado,''))
    when 'CORRECTO' then 'aceptada'
    when 'ACEPTADOCONERRORES' then 'aceptada_con_errores'
    when 'INCORRECTO' then 'rechazada'
    else 'rechazada' end;
  update public.facturas set
    aeat_estado=p_aeat_estado, aeat_csv=p_csv,
    aeat_error_codigo=p_error_codigo, aeat_error_desc=p_error_desc,
    qr_url=coalesce(p_qr_url, qr_url), payload_xml=coalesce(p_payload_xml, payload_xml),
    respuesta=coalesce(p_respuesta, respuesta), estado=v_estado
  where id=p_factura_id and estado='generada';
  if not found then raise exception 'Factura no esta en estado generada'; end if;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.registrar_respuesta_aeat(uuid,text,text,text,text,text,text,jsonb)
  from public, anon, authenticated;   -- solo el worker (service_role) la invoca
```
> Nota: escribir `aeat_estado`/`csv`/`qr_url` está permitido por el trigger porque no toca `numero`/`huella`/`total`. Pero cambia `estado` de `generada` a final: OK (el trigger sólo bloquea número/huella tras `generada`, no el estado).

- [ ] **Step 2: Verificar el mapeo** (branch): generar una factura, llamar con `p_aeat_estado='Correcto'` → `estado='aceptada'`; con `'Incorrecto'` → `rechazada`.

- [ ] **Step 3: Commit**
```bash
git add migrations/fiscal-a4-respuesta.sql
git commit -m "feat(fiscal): registrar_respuesta_aeat (mapea estado AEAT->factura)"
```

---

### Task A5: RPC `generar_registro_anulacion` (correcciones — nunca borrar)

**Files:**
- Create: `migrations/fiscal-a5-anulacion.sql`

**Interfaces:**
- Produces: `public.generar_registro_anulacion(p_factura_id uuid) returns uuid` (crea un nuevo registro `operacion='anulacion'`, encadenado, con su propia huella sobre los campos de anulación).

- [ ] **Step 1: Escribir la RPC** (cadena de huella de anulación: `IDEmisorFacturaAnulada&NumSerieFacturaAnulada&FechaExpedicionFacturaAnulada&Huella`)
```sql
-- migrations/fiscal-a5-anulacion.sql
create or replace function public.generar_registro_anulacion(p_factura_id uuid)
returns uuid as $$
declare
  f public.facturas; v_prev text; v_fhg timestamptz; v_fhg_str text; v_cadena text; v_huella text; v_id uuid;
begin
  select * into f from public.facturas where id=p_factura_id and operacion='alta';
  if not found then raise exception 'Factura de alta no encontrada'; end if;
  if f.estado not in ('aceptada','aceptada_con_errores','generada') then
    raise exception 'Solo se anula una factura ya generada/aceptada'; end if;

  perform pg_advisory_xact_lock(hashtext('verifactu_gen:' || f.negocio_id));
  select huella into v_prev from public.facturas
    where negocio_id=f.negocio_id and huella is not null
    order by fechahora_gen desc, numero desc limit 1;
  v_prev := coalesce(v_prev,'');
  v_fhg := now();
  v_fhg_str := to_char(v_fhg,'YYYY-MM-DD"T"HH24:MI:SS') ||
               regexp_replace(to_char(v_fhg,'OF'),'^([+-]\d{2})$','\1:00');
  if v_fhg_str !~ '[+-]\d{2}:\d{2}$' then v_fhg_str := v_fhg_str || ':00'; end if;

  v_cadena :=
    'IDEmisorFacturaAnulada='         || f.id_emisor ||
    '&NumSerieFacturaAnulada='        || f.num_serie_completo ||
    '&FechaExpedicionFacturaAnulada=' || to_char(f.fecha_expedicion,'DD-MM-YYYY') ||
    '&Huella='                        || v_prev ||
    '&FechaHoraHusoGenRegistro='      || v_fhg_str;
  v_huella := upper(encode(digest(convert_to(v_cadena,'UTF8'),'sha256'),'hex'));

  insert into public.facturas (
    negocio_id, cobro_id, estado, operacion, factura_anulada_id, tipo, serie, ejercicio,
    num_serie_completo, fecha_expedicion, fechahora_gen, id_emisor,
    base_imponible_cents, tipo_iva, cuota_iva_cents, total_cents,
    huella, huella_anterior, entorno
  ) values (
    f.negocio_id, f.cobro_id, 'generada', 'anulacion', f.id, f.tipo, f.serie, f.ejercicio,
    f.num_serie_completo, f.fecha_expedicion, v_fhg, f.id_emisor,
    f.base_imponible_cents, f.tipo_iva, f.cuota_iva_cents, f.total_cents,
    v_huella, nullif(v_prev,''), f.entorno
  ) returning id into v_id;

  update public.facturas set estado='anulada' where id=f.id and estado in ('aceptada','aceptada_con_errores','generada');
  return v_id;
end; $$ language plpgsql security definer set search_path = public;

revoke execute on function public.generar_registro_anulacion(uuid) from public, anon;
```

- [ ] **Step 2: Verificar** (branch): anular una factura aceptada → nace registro `operacion='anulacion'` con huella encadenada; la original queda `estado='anulada'`.

- [ ] **Step 3: Commit**
```bash
git add migrations/fiscal-a5-anulacion.sql
git commit -m "feat(fiscal): generar_registro_anulacion encadenado (correccion sin borrado)"
```

---

### Task A6: Advisors de seguridad + verificación de cadena completa

- [ ] **Step 1:** `get_advisors` (security). Confirmar que ninguna función nueva queda ejecutable por anon/authenticated indebidamente.
- [ ] **Step 2:** Prueba de humo completa en branch: cobro → `crear_factura_borrador` → `generar_registro_alta` → `registrar_respuesta_aeat('Correcto', 'CSVX')`. Comprobar `estado='aceptada'`, `huella` 64 hex, `numero=1`.
- [ ] **Step 3: Commit** (si hubo correcciones de advisors).

---

# FASE B — Lógica de cliente/worker pura (Carlos) — construcción del XML, QR y verificación de huella

> Estas piezas son TS puro y testeables con el vector de oro. `npx tsc --noEmit` + un pequeño runner con `assert`.

### Task B1: `lib/fiscal/huella.ts` (espejo de verificación + vector de oro)

**Files:**
- Create: `lib/fiscal/huella.ts`
- Create: `lib/fiscal/huella.check.ts` (runner de asserts — se ejecuta con `npx tsx` o `node` tras transpile)

**Interfaces:**
- Produces: `construirCadenaAlta(c: CamposAlta): string`, `calcularHuella(cadena: string): string` (SHA-256 hex mayúsculas), tipo `CamposAlta`.

- [ ] **Step 1: Escribir el módulo**
```typescript
// lib/fiscal/huella.ts
// Espejo en TS del calculo de huella (autoritativo en BD). Sirve para VERIFICAR antes de enviar
// y para tests con el vector de oro oficial de la AEAT.
import { createHash } from 'node:crypto';

export interface CamposAlta {
  idEmisor: string;
  numSerie: string;
  fechaExpedicion: string;      // dd-mm-yyyy
  tipoFactura: string;          // F1, F2, ...
  cuotaTotal: string;           // n.nn
  importeTotal: string;         // n.nn
  huellaAnterior: string;       // '' si es el primero
  fechaHoraHusoGen: string;     // ISO 8601 con huso, p.ej. 2024-01-01T19:20:30+01:00
}

export function construirCadenaAlta(c: CamposAlta): string {
  return (
    `IDEmisorFactura=${c.idEmisor}` +
    `&NumSerieFactura=${c.numSerie}` +
    `&FechaExpedicionFactura=${c.fechaExpedicion}` +
    `&TipoFactura=${c.tipoFactura}` +
    `&CuotaTotal=${c.cuotaTotal}` +
    `&ImporteTotal=${c.importeTotal}` +
    `&Huella=${c.huellaAnterior}` +
    `&FechaHoraHusoGenRegistro=${c.fechaHoraHusoGen}`
  );
}

export function calcularHuella(cadena: string): string {
  return createHash('sha256').update(Buffer.from(cadena, 'utf8')).digest('hex').toUpperCase();
}
```

- [ ] **Step 2: Escribir el check con el vector de oro**
```typescript
// lib/fiscal/huella.check.ts
import assert from 'node:assert';
import { construirCadenaAlta, calcularHuella } from './huella';

const cadena = construirCadenaAlta({
  idEmisor: '89890001K', numSerie: '12345678/G33', fechaExpedicion: '01-01-2024',
  tipoFactura: 'F1', cuotaTotal: '12.35', importeTotal: '123.45',
  huellaAnterior: '', fechaHoraHusoGen: '2024-01-01T19:20:30+01:00',
});
assert.strictEqual(cadena,
  'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00');
assert.strictEqual(calcularHuella(cadena),
  '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
console.log('OK huella vector de oro');
```

- [ ] **Step 3: Ejecutar el check**

Run: `npx tsx lib/fiscal/huella.check.ts` (si `tsx` no está, `npx --yes tsx@latest ...`).
Expected: imprime `OK huella vector de oro`, sin AssertionError.

- [ ] **Step 4: `npx tsc --noEmit`** → sin errores nuevos en `lib/fiscal/*`.

- [ ] **Step 5: Commit**
```bash
git add lib/fiscal/huella.ts lib/fiscal/huella.check.ts
git commit -m "feat(fiscal): huella TS (espejo) + check con vector de oro AEAT"
```

---

### Task B2: `lib/fiscal/qr.ts` (URL de cotejo AEAT)

**Files:**
- Create: `lib/fiscal/qr.ts`
- Create: `lib/fiscal/qr.check.ts`

**Interfaces:**
- Produces: `construirUrlCotejo(entorno: 'preproduccion'|'produccion', d: DatosQR): string`, tipo `DatosQR { nif; numSerie; fecha /*dd-mm-yyyy*/; importe /*n.nn*/ }`.

- [ ] **Step 1: Escribir el módulo** (params exactos: `nif`, `numserie`, `fecha`, `importe`; URL-encoded)
```typescript
// lib/fiscal/qr.ts
// QR VeriFactu = URL HTTPS al servicio de cotejo de la AEAT (Orden HAC/1177/2024, Cap. VIII).
// Sin datos cifrados: 4 parametros. El contenido del QR es exactamente esta URL.
export interface DatosQR { nif: string; numSerie: string; fecha: string; importe: string; }

const HOSTS = {
  preproduccion: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
} as const;

export function construirUrlCotejo(entorno: 'preproduccion' | 'produccion', d: DatosQR): string {
  const p = new URLSearchParams({
    nif: d.nif, numserie: d.numSerie, fecha: d.fecha, importe: d.importe,
  });
  return `${HOSTS[entorno]}?${p.toString()}`;
}
```

- [ ] **Step 2: Check**
```typescript
// lib/fiscal/qr.check.ts
import assert from 'node:assert';
import { construirUrlCotejo } from './qr';
const url = construirUrlCotejo('produccion', { nif:'89890001K', numSerie:'12345678/G33', fecha:'01-01-2024', importe:'123.45' });
assert.ok(url.startsWith('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?'));
assert.ok(url.includes('nif=89890001K'));
assert.ok(url.includes('numserie=12345678%2FG33'));      // '/' se codifica
assert.ok(url.includes('fecha=01-01-2024'));
assert.ok(url.includes('importe=123.45'));
console.log('OK qr');
```

- [ ] **Step 3: Ejecutar** `npx tsx lib/fiscal/qr.check.ts` → `OK qr`.
- [ ] **Step 4: Commit**
```bash
git add lib/fiscal/qr.ts lib/fiscal/qr.check.ts
git commit -m "feat(fiscal): construccion de URL de cotejo QR AEAT (pre/produccion)"
```

---

### Task B3: `lib/fiscal/xmlAlta.ts` (RegistroAlta según XSD oficial)

**Files:**
- Create: `lib/fiscal/xmlAlta.ts`
- Reference: descargar `SuministroLR.xsd` y `SuministroInformacion.xsd` del portal AEAT y de `github.com/hectorsipe/aeat-verifactu`; el XML DEBE validar contra ellos.

**Interfaces:**
- Produces: `construirXmlRegistroAlta(f: RegistroAltaInput): string` (fragmento `<sum1:RegistroAlta>...` con los namespaces `sum`/`sum1` correctos).

- [ ] **Step 1: Descargar los XSD oficiales** y guardarlos en `services/verifactu-sender/xsd/` (no en el bundle web). Anotar el `targetNamespace` real de `SuministroLR.xsd`.

- [ ] **Step 2: Escribir el generador** siguiendo la estructura del XSD (campos: `IDVersion`, `IDFactura{IDEmisorFactura,NumSerieFactura,FechaExpedicionFactura}`, `NombreRazonEmisor`, `TipoFactura`, `DescripcionOperacion`, `Desglose{DetalleDesglose{ClaveRegimen,CalificacionOperacion,TipoImpositivo,BaseImponibleOimporteNoSujeto,CuotaRepercutida}}`, `CuotaTotal`, `ImporteTotal`, `Encadenamiento{RegistroAnterior|PrimerRegistro}`, `SistemaInformatico{...}`, `FechaHoraHusoGenRegistro`, `TipoHuella=01`, `Huella`).

```typescript
// lib/fiscal/xmlAlta.ts
// Construye el <RegistroAlta> VeriFactu. La estructura EXACTA y el orden de nodos siguen
// SuministroLR.xsd (portal AEAT). Este generador debe validarse contra el XSD (Step 3).
export interface RegistroAltaInput {
  idEmisor: string; razonEmisor: string;
  numSerie: string; fechaExpedicion: string; // dd-mm-yyyy
  tipoFactura: string; descripcion: string;
  claveRegimen: string;         // p.ej. '01' regimen general
  calificacion: string;         // 'S1' sujeta no exenta
  tipoImpositivo: string;       // '21.00'
  baseImponible: string;        // n.nn
  cuotaRepercutida: string;     // n.nn
  cuotaTotal: string; importeTotal: string;
  huellaAnterior?: string;      // undefined => PrimerRegistro
  numSerieAnterior?: string; fechaAnterior?: string; idEmisorAnterior?: string;
  sistNombre: string; sistNif: string; sistId: string; sistVersion: string; sistNumInstalacion: string;
  fechaHoraHusoGen: string; huella: string;
}

export function construirXmlRegistroAlta(f: RegistroAltaInput): string {
  const encad = f.huellaAnterior
    ? `<sum1:RegistroAnterior><sum1:IDEmisorFactura>${f.idEmisorAnterior}</sum1:IDEmisorFactura>` +
      `<sum1:NumSerieFactura>${f.numSerieAnterior}</sum1:NumSerieFactura>` +
      `<sum1:FechaExpedicionFactura>${f.fechaAnterior}</sum1:FechaExpedicionFactura>` +
      `<sum1:Huella>${f.huellaAnterior}</sum1:Huella></sum1:RegistroAnterior>`
    : `<sum1:PrimerRegistro>S</sum1:PrimerRegistro>`;
  return (
    `<sum1:RegistroAlta>` +
    `<sum1:IDVersion>1.0</sum1:IDVersion>` +
    `<sum1:IDFactura>` +
      `<sum1:IDEmisorFactura>${f.idEmisor}</sum1:IDEmisorFactura>` +
      `<sum1:NumSerieFactura>${f.numSerie}</sum1:NumSerieFactura>` +
      `<sum1:FechaExpedicionFactura>${f.fechaExpedicion}</sum1:FechaExpedicionFactura>` +
    `</sum1:IDFactura>` +
    `<sum1:NombreRazonEmisor>${f.razonEmisor}</sum1:NombreRazonEmisor>` +
    `<sum1:TipoFactura>${f.tipoFactura}</sum1:TipoFactura>` +
    `<sum1:DescripcionOperacion>${f.descripcion}</sum1:DescripcionOperacion>` +
    `<sum1:Desglose><sum1:DetalleDesglose>` +
      `<sum1:ClaveRegimen>${f.claveRegimen}</sum1:ClaveRegimen>` +
      `<sum1:CalificacionOperacion>${f.calificacion}</sum1:CalificacionOperacion>` +
      `<sum1:TipoImpositivo>${f.tipoImpositivo}</sum1:TipoImpositivo>` +
      `<sum1:BaseImponibleOimporteNoSujeto>${f.baseImponible}</sum1:BaseImponibleOimporteNoSujeto>` +
      `<sum1:CuotaRepercutida>${f.cuotaRepercutida}</sum1:CuotaRepercutida>` +
    `</sum1:DetalleDesglose></sum1:Desglose>` +
    `<sum1:CuotaTotal>${f.cuotaTotal}</sum1:CuotaTotal>` +
    `<sum1:ImporteTotal>${f.importeTotal}</sum1:ImporteTotal>` +
    `<sum1:Encadenamiento>${encad}</sum1:Encadenamiento>` +
    `<sum1:SistemaInformatico>` +
      `<sum1:NombreRazon>${f.sistNombre}</sum1:NombreRazon>` +
      `<sum1:NIF>${f.sistNif}</sum1:NIF>` +
      `<sum1:IdSistemaInformatico>${f.sistId}</sum1:IdSistemaInformatico>` +
      `<sum1:Version>${f.sistVersion}</sum1:Version>` +
      `<sum1:NumeroInstalacion>${f.sistNumInstalacion}</sum1:NumeroInstalacion>` +
    `</sum1:SistemaInformatico>` +
    `<sum1:FechaHoraHusoGenRegistro>${f.fechaHoraHusoGen}</sum1:FechaHoraHusoGenRegistro>` +
    `<sum1:TipoHuella>01</sum1:TipoHuella>` +
    `<sum1:Huella>${f.huella}</sum1:Huella>` +
    `</sum1:RegistroAlta>`
  );
}
```
> **IMPORTANTE:** los nombres/orden de nodos de arriba siguen la estructura conocida del XSD, pero el XSD oficial es la fuente autoritativa. En el Step 3 hay que **validar** el XML contra `SuministroLR.xsd` y ajustar cualquier discrepancia (prefijos de namespace, campos obligatorios como `Contraparte` en F1 con receptor, escapado XML de textos). Además hay que **escapar** `& < > " '` en los valores de texto (razón social, descripción).

- [ ] **Step 3: Validar contra el XSD oficial:** montar un ejemplo y validarlo con `xmllint --schema services/verifactu-sender/xsd/SuministroLR.xsd ejemplo.xml --noout`. Ajustar hasta que valide. Commit del ejemplo válido en `services/verifactu-sender/samples/alta-ok.xml`.

- [ ] **Step 4: Commit**
```bash
git add lib/fiscal/xmlAlta.ts services/verifactu-sender/xsd services/verifactu-sender/samples
git commit -m "feat(fiscal): generador XML RegistroAlta validado contra XSD AEAT"
```

---

# FASE C — Worker de envío mTLS + SOAP (Alexandro / infra) — necesita el certificado

> Componente **fuera de Supabase Edge** (Deno Deploy no soporta cert de cliente fiable). Node con `https.Agent`. Sostiene el **Certificado de Sello de Entidad de Mecha** como secreto. NO va en el repo cliente.

### Task C1: Esqueleto del worker + cliente SOAP con mTLS (preproducción)

**Files:**
- Create: `services/verifactu-sender/` (proyecto Node aparte: `package.json`, `src/aeatClient.ts`, `src/env.ts`)

**Interfaces:**
- Produces: `enviarRegFactu(xmlRegistros: string): Promise<AeatRespuesta>` que hace POST SOAP con mTLS al endpoint de preproducción.

- [ ] **Step 1:** Descargar `SistemaFacturacion.wsdl` del portal AEAT (o de `github.com/seccion31/verifactu-delphi-demo`). Leer el `soap:address`. Endpoints:
  - Preproducción: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
  - Producción: **leer del WSDL oficial de producción** (no hardcodear el `prewww`).
- [ ] **Step 2:** Implementar el POST SOAP con `https.Agent({ cert, key, ca })` cargando el Sello de Entidad desde variables de entorno/secreto. El sobre SOAP envuelve `<sum:RegFactuSistemaFacturacion>` con `Cabecera{ObligadoEmision{NombreRazon,NIF}}` + uno o varios `RegistroAlta`/`RegistroAnulacion`.
- [ ] **Step 3:** Parsear la respuesta: `EstadoEnvio` global + por registro `EstadoRegistro` (`Correcto`/`AceptadoConErrores`/`Incorrecto`), `CSV`, `CodigoErrorRegistro`/`DescripcionErrorRegistro`, y el **tiempo de espera** (`TiempoEsperaEnvio`).
- [ ] **Step 4:** Prueba real contra **preproducción** con un certificado de pruebas válido: enviar el `samples/alta-ok.xml`. Expected: respuesta HTTP 200 con `EstadoRegistro=Correcto` (o error identificable). Guardar la respuesta cruda.
- [ ] **Step 5: Commit** del worker (sin secretos).

### Task C2: Control de flujo + bucle de transmisión

- [ ] **Step 1:** Bucle: seleccionar facturas `estado='generada' and aeat_estado is null` por negocio (orden `fechahora_gen`), construir XML (reusar `lib/fiscal/xmlAlta.ts`), **verificar la huella con `lib/fiscal/huella.ts` antes de enviar** (defensa), enviar.
- [ ] **Step 2:** Respetar `TiempoEsperaEnvio` de cada respuesta antes del siguiente envío; permitir lotes hasta ~1.000 registros pendientes. Reintentos con backoff ante fallo de red (mismo registro, misma huella — NO regenerar).
- [ ] **Step 3:** Persistir resultado con la RPC `registrar_respuesta_aeat` (service_role).
- [ ] **Step 4:** Prueba: 3 facturas generadas → todas quedan `aceptada` con su CSV; log muestra respeto del tiempo de espera.
- [ ] **Step 5: Commit.**

### Task C3: Verificación de cotejo QR (smoke)

- [ ] **Step 1:** Para una factura aceptada en preproducción, construir la URL de cotejo (`lib/fiscal/qr.ts`, entorno `preproduccion`) y comprobar que el servicio de la AEAT la reconoce. Documentar el resultado.
- [ ] **Step 2: Commit** del informe de smoke.

---

# FASE D — Prerrequisitos legales y go-live (Jose + fiscalista) — BLOQUEAN producción

- [ ] Firmar el **Acuerdo de Colaboración Social Tipo 017** con la AEAT (`comunicacion.sepri@correo.aeat.es`).
- [ ] Obtener el **Certificado de Sello de Entidad** de Mecha e instalarlo como secreto del worker.
- [ ] Integrar en el **onboarding** el **modelo de representación por salón** (Anexo II, Res. 18 dic 2024) con documento acreditable custodiado; setear `config_fiscal.representacion_ok=true` sólo cuando esté firmado.
- [ ] **Declaración responsable de conformidad** del software (fiscalista) — requisito de fabricante.
- [ ] Confirmar **tipos de IVA**, `ClaveRegimen` y `CalificacionOperacion` por servicio/producto (fiscalista).
- [ ] Cambiar `config_fiscal.entorno_aeat='produccion'` y `activo=true` por salón sólo tras validar todo en preproducción.

---

## Fuera de alcance de este plan (planes siguientes)

- **UI (Carlos):** badges de estado fiscal, sección "Facturación" (libro read-only), Ajustes→Fiscalidad, ticket con QR. Ver arquitectura §6.
- **Fichajes legales (Carlos):** inmutabilidad + encadenado + export. Ver arquitectura §7.

## Self-Review (hecho)

- **Cobertura:** huella exacta (A3+B1, con vector de oro), numeración sin huecos entre generados (A3), encadenamiento (A3/A5), QR (B2, params y hosts oficiales), XML (B3, validado contra XSD), inmutabilidad (A1), envío mTLS+SOAP+flujo (C1-C2), certificado multi-tenant vía colaborador social (D), modalidad VeriFactu puro (constraints). 
- **Vector de oro** verificado localmente y usado como gate en A3-Step1 y B1.
- **Riesgo destacado:** ejecutar pruebas de inmutabilidad en **branch de Supabase** (las filas no se borran). El XSD oficial manda sobre el esqueleto XML de B3. La huella es autoritativa en BD (A3); el TS (B1) sólo verifica.
- **Consistencia de tipos:** `generar_registro_alta`/`registrar_respuesta_aeat`/`crear_factura_borrador` con firmas coherentes entre tareas; `CamposAlta`/`construirCadenaAlta` reflejan el mismo orden que la RPC SQL.
