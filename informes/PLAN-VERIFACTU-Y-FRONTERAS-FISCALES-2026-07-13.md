# Plan — VeriFactu + Fronteras Fiscales Claras (Facturación / Cobros / Stock / Citas / Fichajes)

> **Fecha:** 13 de julio de 2026
> **Autor:** Carlos + Claude
> **Estado:** DISEÑO (no implementado). Requiere validación de un fiscalista antes de emitir a producción.
> **Sustituye/completa:** `informes/ARQUITECTURA_FISCAL_Y_COMPLIANCE_MECHA.md` (25 jun) — aquel cubría inmutabilidad + RGPD; este añade la **capa de facturación VeriFactu real**, las **fronteras de dominio** y el **registro horario legal**.
> **Decisiones de encuadre (13 jul):** integración vía **intermediario REST** (colaborador social) detrás de una **capa de abstracción `ProveedorFiscal`**; alcance de esta sesión = documento de arquitectura completo, sin tocar código.

---

## 0. TL;DR

1. **El problema de fondo** no es solo "meter VeriFactu": es que las fronteras entre **cita (demanda)**, **cobro (dinero)**, **factura (fiscal)**, **stock** y **fichaje (laboral)** están claras en el modelo de datos pero **no en la UI ni en la cabeza del salón**. Este plan las hace explícitas y añade la capa fiscal que falta.
2. **VeriFactu** = registro de facturación por operación, **encadenado por hash SHA-256**, firmado, con **QR**, y (en modalidad "VeriFactu puro") **remitido a la AEAT en tiempo real**. Nunca se borra; se **anula** o **rectifica** dejando rastro.
3. **Plazos (ya aplazados un año, RD-ley 15/2025):** sociedades **1 ene 2027**, autónomos **1 jul 2027**. PERO como **fabricantes de software** ya estáis obligados (desde 29 jul 2025) a ofrecer producto conforme + emitir **declaración responsable de conformidad**. Hay tiempo para hacerlo bien, no para ignorarlo.
4. **Arquitectura:** capa `facturas` (registro fiscal inmutable, encadenado) derivada 1:1 de `cobros`; numeración sin huecos por RPC atómico; envío a AEAT a través de un `ProveedorFiscal` (intermediario REST colaborador social, arrancando en su **sandbox AEAT gratis**). Fichajes: inmutabilidad + encadenamiento + export a Inspección.
5. **Reparto:** Carlos = modelo de datos, numeración, UI de fronteras/facturación/ajustes fiscales, fichajes inmutables, hash local. Alexandro = envío real a AEAT (mueve dato fiscal a un tercero + integra API/cert externa → su regla de reparto). Jose + fiscalista = tipos de IVA, régimen, elección de proveedor, texto de la declaración responsable.

---

## 1. Las cinco fronteras (modelo mental que debe verse en la UI)

Cada capa tiene un **dueño legal distinto** y un **grado de mutabilidad distinto**. La regla de oro: **el flujo es unidireccional; lo de abajo nunca muta lo de arriba, y el dinero se cuenta una sola vez.**

```
  CITA            →   COBRO              →   FACTURA (VeriFactu)
  (demanda)           (dinero real)          (fiscal duro)
  operativo           caja                   AEAT
  mutable             inmutable (hecho)      inmutable + encadenada + QR + AEAT

  STOCK (inventario)  ── operativo/valorización, NO fiscal por sí mismo
  FICHAJE (registro horario) ── laboral (Inspección de Trabajo), NO AEAT
```

| Capa | Qué es | Tabla(s) | Autoridad | ¿Mutable? | Estado hoy |
|---|---|---|---|---|---|
| **Cita** | Demanda: quién viene, cuándo, con quién | `citas`, `cita_servicios` | — (operativo) | Sí, libremente | ✅ existe |
| **Cobro** | Hecho económico: dinero que entra en caja | `cobros`, `cobro_lineas`, `pagos` | Ley Antifraude 11/2021 | **No** (solo rectificación/reembolso) | ✅ inmutable |
| **Factura** | Representación fiscal del cobro ante Hacienda | `facturas` (NUEVA) | RD 1007/2023 (VeriFactu) | **No** (solo anulación/rectificativa) | ❌ falta |
| **Stock** | Existencias y valoración de productos | `inventario_*` | Contable (no AEAT directo) | Sí (con historial de movimientos) | ✅ v0 existe |
| **Fichaje** | Jornada laboral del empleado | `fichajes` | Art. 34.9 ET + nuevo RD (en trámite) | **No** (solo corrección con rastro) | ⚠️ existe, no blindado |

**Invariantes que el código ya respeta (no romper):**
- Una cita **nunca** se convierte en dinero; el dinero vive solo en `cobros`.
- Máximo **un cobro liquidador por cita** (índice único parcial).
- La señal online (`pagos.tipo='senal'`) **se descuenta** del total, no se suma.
- `cobros`/`cobro_lineas` no admiten DELETE ni UPDATE de importes (triggers antifraude).

**Lo que este plan añade:** `factura` deriva de `cobro` con la **misma disciplina** (1:1, inmutable, corrección por anulación/rectificativa encadenada). Coherencia total con lo que ya existe.

---

## 2. Cómo funciona VeriFactu (resumen operativo para el diseño)

- **Registro de facturación de ALTA**: se genera simultáneo o inmediatamente anterior a expedir cada factura. Contiene datos mínimos (emisor, receptor si aplica, desglose de IVA, total, fecha/hora, serie+número, hash anterior, hash propio).
- **Registro de ANULACIÓN**: no existe "borrar"; anular genera **otro registro encadenado**.
- **Encadenamiento SHA-256**: `hash_propio = SHA256(campos_clave + hash_registro_anterior)`. Romper una factura pasada rompe la cadena → detectable.
- **Firma electrónica** por registro **+ QR tributario** en la factura/ticket (el QR lleva datos básicos de la operación, **no** el hash) para verificación por AEAT/cliente.
- **Dos modalidades:**
  - **VeriFactu puro (recomendado):** cada registro se **remite a AEAT en tiempo real**. AEAT valida la cadena por ti → no estás obligado a autofirmar ni a generar "registros de evento". Más simple para un SaaS.
  - **No-VeriFactu:** cumples requisitos y **conservas** los registros firmados; auditables a requerimiento. Más obligaciones locales (firma, eventos). Lo dejamos como modo secundario configurable, no como base.
- **Facturas simplificadas (tickets):** el caso normal en peluquería (cliente sin NIF). La app gratis de la AEAT **no** las soporta → justifica software privado como Mecha.
- **Fuera de ámbito:** inscritos en **SII**, **módulos**, y forales (**País Vasco/Navarra → TicketBAI/Batuz**, sistema distinto). El diseño debe **detectar territorio foral** y no ofrecer VeriFactu ahí (fase futura: soporte TicketBAI).

### Plazos y obligaciones (actualizado)
- Sociedades: **1 ene 2027** · Autónomos/resto: **1 jul 2027** (RD-ley 15/2025).
- **Fabricante de software (Mecha):** producto conforme desde 29 jul 2025 + **declaración responsable de conformidad** (sanción hasta 150.000 € por comercializar software no conforme). → Acción manual de Jose/fiscalista, pero condiciona que **no** presumamos "100% legal" hasta emitirla.

---

## 3. Modelo de datos (Carlos)

### 3.1 `config_fiscal` — identidad fiscal por negocio
```sql
create table config_fiscal (
  negocio_id text primary key,
  nif text,                        -- NIF/CIF del salón (obligado tributario)
  razon_social text,
  domicilio_fiscal text,
  regimen_iva text default 'general',       -- general / recargo_equiv / exento...
  tipo_iva_defecto numeric default 21.0,    -- servicios peluquería (confirmar fiscalista)
  territorio text default 'comun',          -- comun / foral_pv / foral_navarra
  serie_defecto text default 'A',
  modalidad text default 'verifactu'        -- verifactu | no_verifactu
    check (modalidad in ('verifactu','no_verifactu')),
  proveedor_fiscal text,                    -- 'verifactuapi' | 'verifacti' | ...
  proveedor_estado text default 'no_configurado', -- no_configurado | sandbox | produccion
  apoderamiento_ok boolean default false,   -- ¿el salón ha autorizado al colaborador social?
  declaracion_responsable_ok boolean default false,
  activo boolean default false,             -- facturación fiscal ACTIVA para este salón
  created_at timestamptz default now()
);
```
> **Multi-tenant crítico:** cada salón es su **propio obligado tributario** con su **propia serie y su propia cadena de hash**. Nada se mezcla entre negocios.

### 3.2 `facturas` — registro de facturación (el corazón fiscal)
```sql
create table facturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cobro_id uuid references cobros(id),      -- 1:1 con el cobro que factura (null solo en casos manuales)

  tipo text not null default 'F2'           -- F1 completa / F2 simplificada(ticket) / R1..R5 rectificativa
    check (tipo in ('F1','F2','R1','R2','R3','R4','R5')),
  operacion text not null default 'alta'    -- alta | anulacion
    check (operacion in ('alta','anulacion')),
  factura_anulada_id uuid references facturas(id), -- si operacion='anulacion'
  factura_rectificada_id uuid references facturas(id), -- si tipo='R*'

  serie text not null,
  numero integer not null,                  -- correlativo sin huecos por (negocio_id, serie, ejercicio)
  ejercicio integer not null,
  fecha_expedicion timestamptz not null default now(),

  nif_emisor text not null,
  nif_receptor text,                        -- null en simplificada (ticket)
  nombre_receptor text,

  base_imponible_cents integer not null,
  tipo_iva numeric not null default 21.0,
  cuota_iva_cents integer not null,
  total_cents integer not null,

  -- Encadenamiento VeriFactu
  hash_anterior text,
  hash_propio text not null,

  -- Respuesta AEAT / proveedor
  aeat_estado text default 'pendiente'      -- pendiente | correcto | aceptado_con_errores | rechazado | anulado
    check (aeat_estado in ('pendiente','correcto','aceptado_con_errores','rechazado','anulado')),
  aeat_csv text,                            -- Código Seguro de Verificación devuelto por AEAT
  qr_url text,                              -- URL de verificación (contenido del QR)
  proveedor text,
  proveedor_ref text,                       -- id de la factura en el intermediario
  payload jsonb,                            -- XML/JSON enviado (auditoría)
  respuesta jsonb,                          -- respuesta cruda del proveedor/AEAT

  created_at timestamptz default now(),

  unique (negocio_id, serie, ejercicio, numero)
);
create index facturas_negocio_fecha on facturas(negocio_id, fecha_expedicion desc);
create index facturas_cobro on facturas(cobro_id);
```

### 3.3 Numeración sin huecos (RPC atómico — NUNCA en cliente)
VeriFactu y el Reglamento de Facturación exigen numeración **correlativa sin saltos**. Se reserva con **advisory lock** por `(negocio_id, serie, ejercicio)`:
```sql
create or replace function siguiente_numero_factura(p_negocio_id text, p_serie text, p_ejercicio int)
returns int as $$
declare v_num int;
begin
  perform pg_advisory_xact_lock(hashtext(p_negocio_id || p_serie || p_ejercicio::text));
  select coalesce(max(numero),0)+1 into v_num
    from facturas where negocio_id=p_negocio_id and serie=p_serie and ejercicio=p_ejercicio;
  return v_num;
end; $$ language plpgsql security definer set search_path = public;
-- revoke execute from public/anon/authenticated; grant solo a service_role / RPC interna
```

### 3.4 Inmutabilidad de `facturas` (mismos triggers que cobros)
- Bloquear DELETE siempre.
- Bloquear UPDATE de campos fiscales (importes, hash, serie, numero, nif, aeat_csv una vez `correcto`).
- Permitir UPDATE solo de campos de estado de envío mientras `aeat_estado='pendiente'` (para escribir la respuesta AEAT).
- Correcciones únicamente vía **factura de anulación** o **rectificativa** encadenada. (Reutilizar el patrón de `compliance-antifraude-inmutabilidad.sql`.)

### 3.5 Decisión sobre el hash: **la cadena canónica vive en `facturas`, no en `cobros`**
El doc de 25 jun proponía encadenar `cobros`. Recomendación: **no** duplicar cadenas (confunde y puede desincronizar). La cadena legalmente relevante es la de **facturas** (registro de facturación VeriFactu). `cobros` se queda como está (inmutable, sin hash), y el hash local opcional se calcula solo si en algún momento se quiere integridad interna extra. **Una sola cadena, en facturas.**

---

## 4. La capa `ProveedorFiscal` (abstracción — clave para no quedar casados)

Interfaz interna estable; implementaciones intercambiables detrás. Vive como **edge function** (`emitir-factura`, `anular-factura`, `consultar-estado-factura`) porque el envío real toca certificados/tercero (Alexandro).

```ts
interface ProveedorFiscal {
  emitirAlta(f: FacturaAlta): Promise<{ hash: string; qrUrl: string; aeatEstado: string; csv?: string; ref: string }>;
  emitirAnulacion(f: FacturaAnulacion): Promise<{ hash: string; aeatEstado: string; ref: string }>;
  emitirRectificativa(f: FacturaRectificativa): Promise<{ hash: string; qrUrl: string; aeatEstado: string; csv?: string; ref: string }>;
  consultarEstado(ref: string): Promise<{ aeatEstado: string; csv?: string }>;
}
// Implementación 1: VerifactuApiProvider (REST, colaborador social, sandbox AEAT gratis)
// Implementación futura: AeatDirectoProvider (SOAP directo, cert por tenant) — solo si merece la pena
```

**Por qué así:** los "gratis" son gratis en **sandbox AEAT**; en producción hay coste por volumen/suscripción y letra pequeña (custodia de dato fiscal por un tercero, apoderamiento del salón como colaborador social, sostenibilidad del proveedor). La abstracción nos deja: (a) empezar barato en sandbox, (b) cambiar de proveedor sin tocar la lógica de negocio, (c) migrar a directo-AEAT si el volumen lo justifica.

### 4.1 Costes de producción y salto sandbox→producción (investigado 13 jul)
- **Modelo del mercado = por NIF activo, NO por factura** → encaja 1:1 con el SaaS (cada salón = 1 NIF).
  - **Verifacti:** desde **~2,9 €/NIF/mes** (hasta 100 NIFs; −10% anual). Límite de seguridad **3.000 facturas/NIF/mes**; exceso **+2 €/1.000 facturas**. VeriFactu **y** TicketBAI incluidos; independiente del nº de TPVs/locales.
  - **Verifactu-API.com / Korefactu:** también por NIF, sin permanencia; ~4–10 €/mes según volumen.
  - **Sandbox gratis e ilimitado** en todos; solo se paga al pasar a producción real.
- **Decisión:** **arrancar en sandbox**. Repercutir el ~3 €/NIF/mes en el pricing del plan del salón.
- **Salto sandbox→producción = trivial:** misma API, solo se cambia el **flag de entorno del NIF** (`test`→`producción`); no se reescribe nada. Arrancar en sandbox NO es trabajo tirado.

### 4.2 Opción "hacerlo nosotros de cero" (directo AEAT, sin coste por factura)
El servicio de recepción de AEAT es **gratuito** (no hay tasa pública), así que en producción no hay coste por factura. Pero implica:
1. **El certificado es el muro.** En VeriFactu el envío va firmado. Dos caminos, ambos costosos:
   - **Un certificado por salón** → custodiar cientos de certificados fiscales ajenos (superficie de seguridad enorme; cada salón debe sacarse el FNMT).
   - **Mecha como colaborador social** → un certificado propio + **apoderamiento** de cada salón ante AEAT (lo que hacen los intermediarios). Requiere alta formal como colaborador social + gestión de apoderamientos.
2. **Construcción técnica media-alta:** XML según XSD, cliente **SOAP con mTLS**, **control de flujo** (tiempos de espera AEAT / máx. 1.000 registros pendientes), rechazos, rectificativas/subsanaciones, **mantener WSDL/XSD**. Librerías maduras en .NET/Java, **poco en TS/Deno** (nuestro stack) → portar o construir.
3. **Responsabilidad 100% nuestra** (ningún tercero absorbe la conformidad). La declaración responsable hay que emitirla igual.
- **Veredicto:** el *happy path* son semanas; la cola larga (ciclo de certificados, caídas AEAT, forales, rectificación) es donde muerde. A ~3 €/NIF, **DIY solo compensa a gran escala**. La capa `ProveedorFiscal` deja añadir un `AeatDirectoProvider` en el futuro **sin tocar la lógica de negocio** → no hace falta decidirlo ahora.

---

## 5. Flujo end-to-end

```
1. Se cierra la CITA como completada
2. Caja: se registra el COBRO (dinero real) → inmutable            [ya existe]
3. Al registrar el cobro se ofrece/genera la FACTURA:
   a. Por defecto: factura SIMPLIFICADA (ticket, F2) automática
   b. Si el cliente pide factura con NIF: F1 completa
4. RPC interno: reserva numero (siguiente_numero_factura), monta payload,
   calcula base+IVA desde total_cents (precio B2C con IVA incluido → desglose)
5. Edge `emitir-factura` (Alexandro): llama a ProveedorFiscal.emitirAlta()
   → recibe hash, QR, estado AEAT, CSV → guarda en `facturas` → marca inmutable
6. UI muestra el ticket con QR + CSV; se puede imprimir / enviar por WhatsApp/email
7. Corrección: NUNCA se edita → factura de ANULACIÓN (encadenada) + nueva/rectificativa
```

**Desglose IVA:** los precios en Mecha son B2C con IVA incluido. `base = round(total / (1 + tipo_iva/100))`, `cuota = total - base`. El `tipo_iva` sale de `config_fiscal.tipo_iva_defecto` o por línea (servicio/producto). **El fiscalista confirma** los tipos (peluquería suele 21%, pero productos/servicios concretos podrían variar) → NO hardcodear sin su OK.

**Idempotencia:** el envío usa `cobro_id` + `idempotency_key` para no duplicar factura ante reintentos. Índice único `(negocio_id, cobro_id, operacion)` en facturas de alta.

---

## 6. UI — hacer visibles las fronteras (Carlos, el núcleo de tu queja)

1. **Caja / ficha de cobro:** badge de estado fiscal claro:
   `Sin factura` · `Ticket emitido (QR)` · `Factura completa` · `Anulada` · `Pendiente AEAT` · `Rechazada AEAT`.
2. **Ficha de cita:** tres bloques visualmente separados con etiqueta de capa:
   **Demanda** (la cita) · **Dinero** (el cobro) · **Fiscal** (la factura + QR). Deja obvio qué es qué.
3. **Nueva sección "Facturación"** (pestaña dentro de Caja o en Informes): libro de facturas emitidas — serie, número, fecha, cliente, base/IVA/total, estado AEAT, CSV; acciones legales (ver, descargar PDF/XML, **anular → rectificar**). **Read-only** salvo las acciones legales. Nada de editar/borrar.
4. **Ajustes → Fiscalidad:** NIF, razón social, domicilio, serie, modalidad, proveedor, IVA por defecto, estado de apoderamiento colaborador social, checkbox declaración responsable. Con **semáforo** de "¿listo para facturar legalmente?".
5. **Ticket/recibo:** plantilla con QR + CSV + desglose de IVA + serie/número. Reutilizable en pantalla, PDF, WhatsApp/email.
6. **Stock:** dejar explícito en la UI que inventario es **valoración/operativa**, no facturación (evitar que el salón crea que "vender producto" ya es "facturar"). El producto entra en la factura vía `cobro_lineas tipo='producto'`.

Respetar `useResponsive()`, tokens fuego, sin emojis, español. Reutilizar `Section`/`FieldRow`.

---

## 7. Registro horario legal (fichajes) — "solo informático" pero hazlo bien

**Estado normativo:** obligatorio desde 2019 (art. 34.9 ET). El **nuevo RD** que exige formato **digital, inalterable e interoperable con la Inspección (API REST)** está **en trámite, NO publicado en BOE** (informe crítico del Consejo de Estado, mar 2026). Diseñamos ya para cumplir el borrador; la API de Inspección se cablea cuando salga la norma.

**Cambios sobre la tabla `fichajes` existente:**
- **Inmutabilidad + corrección con rastro:** no se borra ni se edita un fichaje; una corrección crea un registro de corrección con `motivo`, `autor_id`, `original_id`, timestamp. Historial completo consultable.
- **Encadenamiento por hash** por trabajador (o por negocio): `hash_propio = SHA256(trabajador + tipo + ts + hash_anterior)` → inalterabilidad demostrable.
- **Campos nuevos:** `metodo` (`app`/`pin`/`qr`), `geo` (lat/lng puntual opcional, con consentimiento), `ip`, `hash_anterior`, `hash_propio`.
- **Biometría: prohibida** como método (no usar huella/facial).
- **Conservación 4 años**; export por trabajador/rango a **PDF/CSV firmado** (y hook para la futura API REST de Inspección).
- **Acceso:** trabajador, sus representantes y la Inspección. Añadir vista de "mis fichajes" para el empleado.

Esto es claramente **Carlos** (no mueve dinero ni integra terceros); la futura API interoperable con Inspección será de Alexandro cuando exista spec.

---

## 8. Reparto de trabajo

| Bloque | Dueño | Notas |
|---|---|---|
| `config_fiscal`, `facturas`, numeración RPC, triggers inmutabilidad | **Carlos** | Modelo + seguridad; no envía nada a AEAT |
| Interfaz `ProveedorFiscal` + tipos + edge stubs (sin credenciales) | **Carlos** | Deja los métodos listos, mock en sandbox |
| UI: fronteras, sección Facturación, Ajustes fiscalidad, ticket+QR | **Carlos** | El grueso visible |
| Fichajes inmutables + encadenado + export | **Carlos** | "Solo informático" |
| Envío real a AEAT (proveedor, cert/apoderamiento, webhooks estado) | **Alexandro** | Mueve dato fiscal a tercero + API externa → su regla |
| API interoperable Inspección (cuando salga BOE) | **Alexandro** | Integración externa |
| Tipos de IVA, régimen, elección de proveedor, declaración responsable, DPA | **Jose + fiscalista** | Gate legal; NO improvisar |

---

## 9. Fases

- **F0 — Legal/decisión (Jose+fiscalista):** confirmar tipos IVA/régimen, elegir proveedor, preparar declaración responsable y apoderamiento colaborador social. *(Bloquea producción, no el desarrollo.)*
- **F1 — Base de datos + fronteras UI (Carlos):** `config_fiscal`, `facturas`, numeración, inmutabilidad; badges de estado fiscal; sección Facturación (read-only); Ajustes Fiscalidad; ticket con QR **simulado**. Interfaz `ProveedorFiscal` con provider mock/sandbox.
- **F2 — Envío real (Alexandro):** `VerifactuApiProvider` → **sandbox AEAT gratis** → validar cadena/hash/QR/CSV → producción. Webhook de estado.
- **F3 — Fichajes legales (Carlos):** inmutabilidad + encadenado + export.
- **F4 — Certificación (Jose):** declaración responsable emitida → activar `config_fiscal.activo` por salón → marketing "100% legal" **solo entonces**.

---

## 10. Riesgos y avisos honestos

- **No es "100% legal" hasta F4.** Hasta emitir la declaración responsable de conformidad y validar con fiscalista, no se puede prometer eso a los salones. Es un diferencial real, pero con fecha.
- **Territorios forales** (PV/Navarra) usan TicketBAI/Batuz → detectarlos y **no** ofrecer VeriFactu ahí (fase futura).
- **SII y módulos** quedan fuera de VeriFactu → `config_fiscal` debe permitir marcar el salón como "no aplica VeriFactu".
- **Coste del proveedor en producción**: repercutir en el pricing del SaaS; "gratis" es sandbox.
- **Una sola cadena de hash** (en facturas). No reactivar la de cobros para no desincronizar.
- **El fiscalista manda** en IVA, tipos de factura y textos legales. Este documento es la ingeniería; no sustituye el criterio fiscal.

---

## 11. Fuentes

- AEAT — Sistemas VERI*FACTU (FAQ, huella/hash): sede.agenciatributaria.gob.es
- RD 1007/2023 + Orden HAC/1177/2024 (Ley Antifraude 11/2021)
- RD-ley 15/2025 (aplazamiento de plazos a 2027)
- Repos: github.com/hectorsipe/aeat-verifactu (WSDL/XSD), github.com/mdiago/VeriFactu (.NET), github.com/squareetlabs/verifactu-sdk (Java)
- Intermediarios REST: verifactuapi.es, verifacti.com, FacturaHub
- Registro horario: art. 34.9 ET (RDL 8/2019) + nuevo RD en tramitación (Consejo de Estado, mar 2026)
