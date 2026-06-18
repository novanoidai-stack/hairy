# Arquitectura — POS / Caja y coherencia con los informes (Mecha)

> **Estado:** diseño + decisión para Jose (18 jun 2026). No hay código nuevo todavía.
> **Autores:** Carlos + Claude.
> **Relación con otros docs:** amplía `ARQUITECTURA_PAGOS_MECHA.md` (que ya define el modelo
> de cita unificado, la tabla `pagos` y el enlace público de pago) y la §8 del
> `MEGA_INFORME_MECHA.md` (Pagos P1 señal · P2 cobro QR en local · P3 caja fiscal completa).
> Este documento responde a una pregunta concreta de Jose: **si metemos un POS en Mecha,
> ¿cómo evitamos doble-contar el dinero y las citas entre el POS y el sistema de informes
> actual?** La respuesta corta: no es "uno u otro"; son dos capas distintas que se enlazan,
> y el dinero se cuenta desde una sola fuente.

---

## 1. La pregunta de Jose (replanteada con precisión)

Jose quiere un **POS** en Mecha (el profesional cobra al cliente desde el software: elige
servicio, método —datáfono/efectivo— y el sistema lleva la contabilidad de caja por detrás),
tomando como referencia funcional la caja del **modo gestor de novanoidai** (`web_vercel/web`).

Su preocupación es real y está bien vista:

> "Las estadísticas hoy salen de las **citas** (portal, agentes, Buxi, manuales). Si además
> metemos un **POS** que cobra, podemos **doble-contar** las citas y el dinero. ¿Nos quedamos
> solo con el POS como fuente, nos quedamos con lo de ahora y añadimos POS pero sin
> contabilidad de caja, o hay forma de mantener la coherencia entre los dos sistemas?"

La clave para responder es entender **qué mide cada sistema hoy**, y resulta que **no miden lo
mismo**.

---

## 2. El dato que reencuadra todo: hoy los "ingresos" NO son dinero real

Lo primero, verificado en el código (no es suposición):

**Los "ingresos" de los informes de Mecha hoy son una facturación _teórica/esperada_, no caja
real.** Se calculan como `precio_de_catálogo_del_servicio × citas completadas`:

- `app/(tabs)/informes.web.tsx:646` → `profCitas.reduce((s, c) => s + (srvMap.get(c.servicio_id)?.precio || 0), 0)`
- `app/(tabs)/informes.web.tsx:213` (tooltip) → *"Solo cuenta citas completadas. Es la base
  para ver la tendencia de ventas."*

Es decir, el "ingreso" actual:

- **NO** conoce el importe realmente cobrado (descuentos, recargos, precio negociado).
- **NO** conoce el **método de pago** (efectivo / datáfono / online / bizum).
- **NO** conoce **propinas**, **bonos**, **venta de producto**, ni **cobros parciales**.
- **NO** distingue cita completada-y-cobrada de cita completada-e-impagada.

> Existe el campo `citas.precio_cobrado` en BD, pero **los informes no lo usan**: usan el precio
> de catálogo del servicio. O sea, hoy Mecha da una **previsión de facturación**, no una caja.

**Implicación directa para la pregunta de Jose:** el sistema actual y un POS **no son dos formas
de medir lo mismo** (lo que provocaría el doble conteo que teme). Son **dos capas diferentes**:

| Capa | Entidad | Qué mide | KPIs que alimenta |
|---|---|---|---|
| **Demanda / operación** | `citas` | Qué se reservó/atendió, por quién, desde qué canal | ocupación, no-shows, retención, atribución de canal (portal/whatsapp/voz/buxi/manual), reposo aprovechado, % de hueco |
| **Dinero / caja** | cobros (POS) | Qué se **cobró de verdad**, cómo y cuándo | facturación real, efectivo vs datáfono, propinas, descuentos, arqueo, comisiones sobre lo cobrado |

El doble conteo solo aparece si **sumas dinero desde las dos capas a la vez**. Si cada capa es
dueña de su verdad y el dinero sale de **un único libro**, no hay doble conteo. Eso es
exactamente lo que ya hace novanoidai.

---

## 3. La referencia: cómo lo resolvió ya novanoidai (en producción)

La caja del modo gestor de novanoidai (`web_vercel/web/app/dashboard/caja/page.tsx`,
`app/pos/page.tsx`, `app/api/pos/transaccion/route.ts`) **ya resolvió este problema**. Su modelo:

1. **`transacciones_pos`** — cada **cobro individual** del POS: `barbero`, `cliente`,
   `servicios` (array, puede incluir productos), `monto_total`, `metodo`, `monto_efectivo`,
   `monto_tarjeta`, `cita_id` (opcional), `idempotency_key`, `estado`. Al cobrar con `cita_id`,
   marca `citas.pagada_en_pos = true` y `citas.transaccion_pos_id`
   (`api/pos/transaccion/route.ts:170-175`). Idempotente por `idempotency_key`.

2. **`caja_registros`** — el **cierre diario** de caja, con una columna **`origen`**
   (`manual` · `ocr_tpv` · `agente_voz` · `booksys` · `novanoid` · `bcr`,
   migración `20260420130000_caja_origen.sql`). El POS se consolida aquí vía **trigger**.

3. **Las citas se usan SOLO como estimación.** `citasEstimadas` (`caja/page.tsx:246-250`)
   suma `citas.precio_cobrado` únicamente para **pre-rellenar** el modo foto y para comparar;
   **nunca** entra en la facturación contable.

4. **Anti-doble-conteo explícito en el propio código** (`caja/page.tsx:394-395`):
   > *"caja_registros ya incluye POS vía trigger, por lo que esta agregación sólo se usa para el
   > conteo de operaciones y para mostrar detalle, **NO para sumarse a registros**."*

   Y para "hoy" (`caja/page.tsx:414-421`) combina explícitamente cierre manual + POS del día,
   con cada total saliendo de **una** fuente, mostrando incluso de dónde viene cada euro
   ("Cierre manual" vs "Automático TPV").

**Conclusión del precedente:** la coherencia se logra (a) teniendo **un único libro de dinero**
(la caja), (b) marcando el **origen** de cada apunte, y (c) usando las **citas solo como
estimación**, no como fuente contable. Es justo lo que necesita Mecha — adaptado a que el modelo
de cita de Mecha es más rico y a que Mecha ya tiene la tabla `pagos`.

> Matiz importante: la caja de novanoidai estima IVA (`total / 1.21`) pero **no es facturación
> fiscal** (no hay VeriFactu ni numeración correlativa). Es **gestión de caja**, no **factura**.
> Esa distinción es crítica para Mecha (ver §7).

---

## 4. La solución propuesta para Mecha: dos capas que se enlazan

```
  FUENTES DE CITA                 CAPA DE DEMANDA            CAPA DE DINERO
  (portal/IA/Buxi/manual)         (verdad operativa)         (verdad financiera)
  ───────────────────────         ──────────────────         ──────────────────
        │                                                          
        ▼                                                          
   ┌─────────┐   se atiende    ┌──────────┐   se cobra    ┌────────────────────┐
   │  cita   │ ───────────────▶│  cita    │ ─────────────▶│  cobro (POS)        │
   │ (canal, │                 │completada│   cita_id     │  método, propina,   │
   │ autoría)│                 └──────────┘ ◀─────────────│  descuento, líneas  │
   └─────────┘                       ▲       marca pagada └────────────────────┘
        │                            │                              │
        │ señal online (pagos)       │ (señal se DESCUENTA          ▼
        └────────────────────────────┘  del total al cobrar)  ┌──────────┐
                                                               │  caja    │
   INFORMES OPERATIVOS  ◀── citas                              │ (cierre/ │
   INFORMES FINANCIEROS ◀── cobros (un solo libro)             │  arqueo) │
                                                               └──────────┘
```

**Reglas de coherencia (las que evitan el doble conteo por construcción):**

1. **Una cita es el evento.** Sigue siendo la fuente única de los KPIs operativos
   (ocupación, no-shows, canal, retención). Nunca se vuelve "dinero".
2. **Un cobro es el dinero.** Es la fuente única de la facturación real, método, propinas,
   descuentos y arqueo. Una cita **sin** cobro = **0 € realizados** (solo "previsto").
3. **El cobro liquida la cita** vía `cita_id` (y marca la cita como cobrada). **Como máximo un
   cobro "liquidador" por cita** (índice único `cita_id` para cobros liquidadores +
   `idempotency_key`). Un walk-in sin cita previa = cobro con `cita_id = null` (o se crea una
   cita rápida) → sigue siendo **un** apunte de dinero.
4. **La señal online no se suma, se descuenta.** El `pagos.tipo='senal'` (ya pagado online,
   modelo de Alexandro) se **resta** del total a cobrar en el local. Nunca se cuenta la señal
   *y* el precio completo. (Es la regla RN-CJ-010 del doc del socio.)
5. **El dinero nunca se suma desde dos capas.** Los informes financieros leen del **libro de
   cobros**; jamás "precio de catálogo de citas + cobros".

---

## 5. Por qué esto NO doble-cuenta — y además es mejor producto

El miedo de Jose ("no podemos coger de los dos sitios a la vez") se resuelve con un
**interruptor por negocio** que decide cuál es la cifra **autoritativa** de "ingresos":

- **Negocio que NO usa el POS** (solo quiere agenda + IA + informes): "ingresos" = la
  **estimación actual** (precio de catálogo × citas completadas), claramente etiquetada como
  **"estimado"**. Exactamente lo de hoy. No se rompe nada.
- **Negocio que SÍ usa el POS**: "ingresos" = **cobros reales** del libro de caja. La estimación
  pasa a segundo plano como comparativa.

Como nunca se suman las dos, **no hay doble conteo**. Y aparece un beneficio inesperado:

> **"Previsto (citas) vs cobrado (caja)"** es, en sí mismo, un KPI valioso. El hueco entre lo
> que *deberían* haber facturado las citas y lo que *de verdad* entró en caja revela descuentos
> no registrados, propinas, no-shows, fugas de efectivo y errores de cobro. Lo que Jose veía
> como "un problema de dos sistemas" se convierte en una **ventaja de control** que ni Booksy
> ni Fresha presentan tan claramente.

---

## 6. Las tres opciones que planteó Jose, evaluadas

| Opción | Qué es | Veredicto |
|---|---|---|
| **(a) Solo POS como fuente de TODO** | Tirar la estimación por citas; todas las estadísticas salen del POS | **No.** Obliga a TODO salón a usar el POS para tener informes; el salón que solo quiere agenda+IA se queda sin analítica. Y mezcla lo operativo (que vive en las citas: canal, ocupación, no-shows) con lo financiero. Perderíamos la atribución de canal y la analítica de demanda. |
| **(b) Mantener lo de ahora + POS sin contabilidad de caja** | El POS solo marca "pagado" y método, pero la facturación sigue estimándose desde citas | **Viable como Fase 1**, pero desaprovecha el valor real del POS (caja real, arqueo, método, propinas). Sirve de puente, no de destino. |
| **(c) Coherencia entre los dos (capas enlazadas)** ⭐ | Citas = verdad operativa; cobros/caja = verdad financiera; enlazados por `cita_id`; señal descontada; interruptor por negocio | **Recomendada.** Es lo que hace novanoidai en producción, no doble-cuenta por construcción, no rompe a los salones sin POS, y convierte el "previsto vs cobrado" en feature. |

**Recomendación: (c).** Y se puede entregar por fases (la Fase 1 de (c) coincide con (b), así
que no se tira trabajo): primero el POS registra cobros y método sin pretensión fiscal; luego se
enchufa el cobro electrónico y, mucho después y con fiscalista, la facturación fiscal.

---

## 7. El campo de minas fiscal (lo que NO podemos improvisar)

El Modular 5 del socio y la §8 (P3) del MEGA INFORME son explícitos: **fiscalidad real
(VeriFactu, RD 1619/2012, IVA 21%, numeración correlativa) requiere asesoría fiscal y NO se
improvisa.** Hay que separar dos cosas que la gente confunde:

| | **Caja operativa / registro de cobro** | **Facturación fiscal** |
|---|---|---|
| Qué es | Apuntar lo que entró: servicio, método, propina, descuento, arqueo, IVA **estimado** | Documento legal: factura/ticket fiscal, VeriFactu, numeración correlativa, conservación |
| ¿Se puede hacer ya? | **Sí** (es lo que pide Jose y lo que tiene novanoidai) | **No sin fiscalista** (P3, 4-6 semanas, proyecto aparte) |
| Riesgo | Bajo (es gestión interna) | **Alto**: emitir como "fiscal" algo que no lo es es problema con Hacienda, no un bug |
| Dueño | Carlos (UI + datos) + Alexandro (cobro electrónico) | Fiscalista + Alexandro |

**Reglas de disciplina (heredadas del MEGA §8):**
- El POS de Fase 1-2 produce un **"recibo / comprobante de cobro"**, **nunca** un "ticket fiscal"
  ni "factura". En ningún sitio de la UI ni del marketing decimos "factura".
- El libro de cobros se diseña para que la **capa fiscal se monte ENCIMA** después: el cobro es
  el **hecho económico**; el documento fiscal, cuando llegue, lo **referencia**. No rehacemos
  nada al añadir la fiscalidad.

---

## 8. Reparto Carlos / Alexandro (regla del proyecto: el dinero es de Alexandro)

La regla del repo: *"si una tarea mueve dinero, usa IA o integra terceros → Alexandro; el resto →
Carlos."* Aplicada al POS:

| Pieza | Quién | Por qué |
|---|---|---|
| **UI del POS** (elegir servicio/producto, cliente, profesional; método como **etiqueta** efectivo/datáfono/bizum; propina; descuento) | **Carlos** | Es interfaz + lógica de datos simple; registrar "efectivo" o "datáfono físico" es solo una etiqueta — **no pasa dinero por Mecha** |
| **Modelo de datos del cobro** (`cobros`/`transacciones_pos` + líneas) y enlace a la cita | **Carlos** (DDL cita-side, sin dinero) | Espejo de lo ya hecho en `ARQUITECTURA_PAGOS_MECHA.md §7` |
| **Pantalla de arqueo / cierre de caja** y consolidación diaria | **Carlos** | UI + agregación de datos propios |
| **Informes leyendo del libro de cobros** + interruptor "estimado vs real" por negocio | **Carlos** | Presentación sobre datos propios |
| **Cobro ELECTRÓNICO real** (online/QR vía `pago_token` ya diseñado = Stripe; TPV físico = Stripe Terminal) | **Alexandro** | Mueve dinero + pasarela + webhooks |
| **Conciliación de la señal** (descontar `pagos.tipo='senal'` del total) | **Alexandro** (backend) + Carlos (mostrarlo) | Toca la pasarela |
| **Reembolsos** | **Alexandro** | Mueve dinero |
| **Capa fiscal (VeriFactu, factura, numeración)** | **Fiscalista + Alexandro** | Regulado |
| **Venta de producto / stock** (si se quiere, como en novanoidai con `ventas_productos` + `decrementar_stock`) | Fuera de alcance hoy (disciplina del dossier: no inventario aún) | — |

**Resumen del reparto:** Carlos puede construir **toda la caja operativa** (registrar cobros con
método como etiqueta, propina, descuento, arqueo, informes reales) sin tocar dinero electrónico.
El momento en que el cobro **se ejecuta electrónicamente** dentro de Mecha (online, QR, datáfono
integrado) o se vuelve **factura fiscal**, es de Alexandro / fiscalista.

---

## 9. Modelo de datos propuesto (boceto DDL — alineado con `pagos` y con novanoidai)

> No aplicar todavía: es propuesta para acordar con Alexandro. Reutiliza la tabla `pagos` ya
> existente y añade el "libro de cobros" del local.

```sql
-- Libro de cobros del local (cabecera). Un cobro liquida 0..1 citas (o un grupo familiar).
create table if not exists cobros (
  id uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  cita_id uuid references citas(id) on delete set null,   -- null = walk-in sin cita
  grupo_id uuid,                                           -- cuenta familiar (Modular 5)
  profesional_id text,
  cliente_id uuid,
  total_cents integer not null,
  propina_cents integer not null default 0,
  descuento_cents integer not null default 0,
  metodo text not null check (metodo in ('efectivo','datafono','online','bizum','mixto')),
  efectivo_cents integer not null default 0,
  datafono_cents integer not null default 0,
  online_cents integer not null default 0,                 -- señal ya pagada vía `pagos`, descontada
  origen text not null default 'manual'
    check (origen in ('manual','pos','portal','whatsapp','voz','buxi','ocr_tpv')),
  estado text not null default 'completado'
    check (estado in ('completado','anulado','reembolsado')),
  idempotency_key text,
  cobrado_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
-- como máximo un cobro liquidador por cita:
create unique index if not exists cobros_cita_unico
  on cobros(cita_id) where cita_id is not null and estado = 'completado';

create table if not exists cobro_lineas (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references cobros(id) on delete cascade,
  tipo text not null check (tipo in ('servicio','producto','suplemento')),
  ref_id text,                  -- servicio_id / producto_id
  nombre text not null,         -- snapshot del nombre
  precio_cents integer not null,
  cantidad integer not null default 1
);

-- En citas, el espejo de "esta cita ya se cobró":
alter table citas add column if not exists cobrada boolean default false;
alter table citas add column if not exists cobro_id uuid references cobros(id);

-- `pagos` (ya existe, de Alexandro) referencia el cobro cuando el dinero es electrónico:
alter table pagos add column if not exists cobro_id uuid references cobros(id);
```

**Cómo encaja con lo que ya hay:**
- `pagos` (señal/total/reembolso) sigue siendo el registro de **movimientos electrónicos**;
  ahora cuelga de un `cobro`. El `pago_token` / enlace público (`ARQUITECTURA_PAGOS §4`) cobra
  electrónicamente y, al confirmarse por webhook, rellena `cobros.online_cents`.
- Para un cobro 100% en efectivo o datáfono físico, **no hay `pagos`**: solo el `cobro` (etiqueta
  de método), igual que `transacciones_pos` en novanoidai.

---

## 10. Plan por fases (alineado con MEGA §8 P1/P2/P3)

| Fase | Qué | Dueño | Fiscal |
|---|---|---|---|
| **POS-0 (puente)** | Botón "Cobrar" en la cita completada → registra `cobro` con método como **etiqueta** (efectivo/datáfono), propina y descuento; marca la cita `cobrada`. Sin dinero electrónico. | Carlos | No fiscal |
| **POS-1** | Pantalla de **arqueo/cierre diario** + informes con interruptor "estimado vs cobrado" por negocio. KPIs financieros desde el libro de cobros. | Carlos | No fiscal |
| **POS-2** | Cobro **electrónico**: online/QR vía `pago_token` (= MEGA §8 P2) y/o datáfono integrado (Stripe Terminal). Conciliación de señal. | **Alexandro** (UI: Carlos) | No fiscal |
| **POS-3** | **Facturación fiscal** (VeriFactu, numeración, factura simplificada) = MEGA §8 P3. | **Fiscalista + Alexandro** | **Fiscal** |

POS-0 y POS-1 son **íntegramente de Carlos** y entregan ya el "el profesional cobra desde el
software y tengo caja real" que pide Jose, sin tocar la pasarela ni la fiscalidad.

---

## 11. Decisiones pendientes para Jose

1. **¿Confirmamos la opción (c)** (dos capas enlazadas, interruptor estimado/real por negocio),
   en lugar de "solo POS" o "POS sin caja"? *(Recomendación: sí, (c).)*
2. **¿Arrancamos por POS-0/POS-1** (caja operativa no fiscal, 100% Carlos) y dejamos el cobro
   electrónico (POS-2) para cuando Alexandro tenga la pasarela? *(Recomendación: sí.)*
3. **Nomenclatura:** confirmamos que hasta POS-3 hablamos de **"recibo/comprobante de cobro"** y
   **nunca** de "factura/ticket fiscal" (en UI y marketing). *(Recomendación: sí, innegociable.)*
4. **¿Cuándo contratamos al fiscalista?** POS-3 no puede empezar sin ello (igual que la decisión
   ya abierta en MEGA §11.4).
5. **¿Venta de producto en el POS?** novanoidai la tiene (`ventas_productos` + stock), pero la
   disciplina del dossier dice "no inventario aún". *(Recomendación: dejar el cobro preparado
   para líneas tipo `producto`, pero no construir gestión de stock todavía.)*
6. **¿Reescribimos los "ingresos" actuales como "ingresos estimados"** ya, para que la cifra no
   se confunda con caja real incluso antes del POS? *(Recomendación: sí, es un cambio de etiqueta
   barato y honesto — encaja con la regla "sin claims falsos" del CLAUDE.md.)*

---

*Documento de diseño. La parte de cobro electrónico y fiscalidad es de Alexandro/fiscalista; la
caja operativa (POS-0/POS-1) es de Carlos. Verificado contra el código de `Hairy/` y de
`web_vercel/web` el 18 de junio de 2026.*
