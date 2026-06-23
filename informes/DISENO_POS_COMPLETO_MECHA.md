# Diseño del POS completo de Mecha — flujos, vinculación y online/offline

> **Fecha:** 24 jun 2026 · **Autor:** Carlos + Claude.
> **Construye sobre** `ARQUITECTURA_POS_Y_ESTADISTICAS_MECHA.md` (modelo de datos de dos capas,
> anti-doble-conteo, fases POS-0..3, reparto Carlos/Alexandro). **No repito** aquí ese modelo;
> esto define el **producto POS completo**, cómo queda **vinculado** con estadísticas, caja
> diaria y el **perfil del profesional** (que se construye en paralelo), y una vuelta honesta a
> la cuestión **online/offline**.
> **Estado del código (verificado 24 jun):** POS-0 y POS-1 ya existen y están desplegados —
> cobro desde la cita (`crearCobro` en `components/agenda/AgendaCalendar.web.tsx`), pantalla
> **Caja** (`app/(tabs)/caja.web.tsx`: cobro de pendientes vía RPC `crear_cobro_desde_cita`,
> arqueo del día, fichajes), y "estimado vs cobrado" en Informes. Tablas reales: `cobros`,
> `cobro_lineas`, `fichajes` (migración `pos-caja-cobros-fichajes.sql`).

---

## 1. Qué falta para que el POS esté "completo"

Hoy tenemos las **piezas** (cobro desde cita + caja + arqueo + fichaje), pero no un POS
**cohesionado**. Lo que falta, en orden de valor:

1. **Un único flujo de cobro reutilizable** (hoy hay dos caminos casi duplicados: el de la ficha
   de cita y el de la pantalla Caja). Debe haber **un solo "motor de cobro"** (componente +
   RPC) que ambos invoquen, para no divergir.
2. **Cobro sin cita (walk-in) y venta suelta** — el modelo ya lo permite (`cobros.cita_id` nulo,
   líneas tipo `producto`/`suplemento`), pero **no hay UI** para iniciar un cobro que no parte de
   una cita. Es lo que convierte "cobrar una cita" en "POS".
3. **Vinculación explícita** cobros ↔ estadísticas ↔ caja diaria ↔ **perfil del profesional**
   (§3 y §4). Hoy el perfil del profesional no existe y la caja/informes leen por su cuenta.
4. **Mover el fichaje** de la pantalla Caja al **perfil del profesional** (lo pide el usuario;
   se trabaja en paralelo) — §5.
5. **Resiliencia de red** (online/offline) — §6.

---

## 2. El POS como producto: entradas y flujos

### 2.1 Cómo se "abre" el POS (entry points)
El POS no es una pantalla nueva aislada; es un **motor de cobro** al que se llega desde varios
sitios (principio PR02 del dossier: las cosas viven integradas, no en un módulo aparte):

- **Desde la cita** (caso principal): ficha de cita → "Cobrar". Ya existe.
- **Desde Caja** (cierre del turno): lista de citas de hoy pendientes → seleccionar → "Cobrar".
  Ya existe; es la vista "operativa de caja".
- **Desde Caja → "Cobro rápido / venta"** (NUEVO): botón para iniciar un cobro **sin cita**
  (walk-in, venta de producto, propina suelta). Abre el mismo motor con `cita_id = null`.

### 2.2 El motor de cobro (un solo componente, dos orígenes de datos)
Unificar el modal de cobro de la cita y el de Caja en **un `<CobroSheet>`** que reciba:
`{ citaId?|null, grupoId?, clienteId?|null, profesionalId?, lineasIniciales[] }` y produzca un
`cobro` + `cobro_lineas`. Campos del ticket:

- **Líneas**: servicio(s) de la cita (precargadas) + añadir servicio puntual / producto /
  suplemento (tipo `producto`/`suplemento` ya soportado en `cobro_lineas`).
- **Método**: efectivo / datáfono / (online y mixto cuando entre POS-2) — **como etiqueta**, no
  mueve dinero (regla del reparto: el dinero electrónico es de Alexandro).
- **Propina** y **descuento**.
- **Señal**: si la cita tiene `pagos.tipo='senal'` pagada, se **descuenta** del total (no se
  suma). Hoy el cobro desde cita ya lo contempla; el walk-in no tiene señal.
- **Cuenta familiar / grupo** (`cobros.grupo_id`, Modular 5): un pagador liquida varias
  citas/personas en un solo cobro. El modelo lo permite; la UI lo expone en POS-1.5.

Resultado: **un `cobro` = un hecho económico**. Marca la(s) cita(s) `cobrada=true, cobro_id`.
La columna `cobros.idempotency_key` **existe pero hoy NO se rellena** (ni `crearCobro` ni la RPC
la setean) → para reintentos/replays offline seguros (§6) hay que **empezar a poblarla**.

### 2.3 Recibo (no factura)
Tras cobrar, ofrecer **"recibo/comprobante de cobro"** (PDF/print o WhatsApp vía el motor que ya
existe). **Nunca** "factura/ticket fiscal" hasta POS-3 (fiscalista). Disciplina innegociable.

---

## 3. Vinculación con estadísticas y caja diaria (la "verdad financiera")

Regla de oro (del doc de arquitectura): **el dinero se lee SIEMPRE del libro `cobros`**, nunca de
las citas. Las citas son la verdad **operativa**; los cobros, la **financiera**. No se suman.

| Consumidor | Lee de | Qué muestra |
|---|---|---|
| **Informes** (`informes.web.tsx`) | `cobros` del periodo | "Cobrado real" + comparativa "estimado (citas) vs cobrado"; efectivo/datáfono; propinas; IVA **estimado** (no fiscal) |
| **Caja diaria** (arqueo) | `cobros` de hoy | total cobrado, desglose por método, propinas, nº de cobros; descargable (CSV) |
| **Perfil del profesional** (§4) | `cobros` filtrados por `profesional_id` | cuánto ha cobrado, ticket medio, comisión estimada |

Vinculación clave que **falta cablear** y hay que dejar explícita:
- **Informes y Caja ya leen `cobros`** → OK.
- **El perfil del profesional debe leer `cobros WHERE profesional_id = <pro>`** (no por
  `creado_por`/`user_id`): el cobro lo registra quien está en caja, pero el ingreso es del
  **profesional que prestó el servicio**. Esto importa para comisiones.
- **Comisiones**: hoy se estiman en Informes sobre catálogo. Cuando hay POS, la comisión debe
  calcularse sobre **lo cobrado real** (base sin IVA), por `profesional_id`. Es el puente
  cobros → nómina del profesional.

---

## 4. El perfil del profesional (sesión paralela) — contrato de datos

El usuario indica que en paralelo se construye un **perfil por profesional** (con su **rol**) que
muestra: **horas trabajadas, sus citas, cuántos cobros ha hecho, su rendimiento**, y que **el
botón de fichaje se mueve ahí**. Para que encaje con el POS sin pisarnos, este es el **contrato**:

### 4.1 De dónde sale cada dato del perfil
| Dato del perfil | Fuente | Join |
|---|---|---|
| **Horas trabajadas** | `fichajes` (pares entrada/salida) | por `profesional_id` y día |
| **Citas** | `citas` | `WHERE profesional_id = <pro>` |
| **Cobros hechos / facturado** | `cobros` | `WHERE profesional_id = <pro>` (no `creado_por`) |
| **Rendimiento** | derivado | cobrado/hora, ticket medio, ocupación (citas vs hueco), comisión estimada |
| **Rol** | `profiles.role` / `profesionales` | identidad |

### 4.2 La trampa a resolver YA: `fichajes` se guarda por `user_id`, no por `profesional_id`
La tabla `fichajes` tiene **las dos columnas** (`user_id` y `profesional_id`), pero el código
actual de Caja **solo rellena `user_id`** (`fichar()` en `caja.web.tsx`). El perfil quiere
agrupar por **profesional**. Hay que decidir y dejar fijo el **mapa `profesional ↔ user`**:
- Opción recomendada: **rellenar `fichajes.profesional_id`** al fichar (además de `user_id`),
  resolviendo el profesional del usuario actual. Requiere un vínculo `profesionales.user_id`
  (o `profiles.profesional_id`) — **verificar si existe**; si no, es una migración pequeña y es
  **prerrequisito** del perfil. Esto es lo primero a acordar con la sesión paralela.

### 4.3 Quién posee qué (para no chocar con la sesión paralela)
- **Sesión paralela (perfil/fichaje):** pantalla de perfil, el **botón de fichaje** y su
  lectura de horas. Dueña de mover el fichaje fuera de Caja.
- **Esta línea (POS/caja):** el motor de cobro, la pantalla Caja (arqueo/cobro), Informes.
- **Contrato compartido (hay que acordarlo):** (1) `fichajes.profesional_id` poblado; (2) el
  perfil lee `cobros`/`citas` por `profesional_id`; (3) al **quitar** el fichaje de Caja, Caja
  conserva el **arqueo** (dinero) y deja de mostrar el bloque de fichaje — coordinar para no
  romper la pantalla mientras ambos editamos `caja.web.tsx`/perfil.

---

## 5. Reubicación del fichaje (Caja → perfil) sin romper Caja
- Caja **se queda con lo financiero**: cobro de pendientes, "cobro rápido/venta", arqueo del día,
  registros descargables. Pierde el bloque "Tu fichaje".
- El **fichaje** (entrada/salida + registro de jornada del equipo) vive en el **perfil**.
  Dirección/propietario ve el de todo el equipo; cada profesional, el suyo (ya hay `canSeeAll`).
- Riesgo de colisión: ambos tocan `caja.web.tsx`/perfil a la vez → **acordar el orden** (que la
  sesión paralela haga el corte del fichaje, y yo deje Caja preparada) antes de editar en paralelo.

---

## 6. Online / offline — la vuelta honesta que pediste

**La pregunta correcta no es "¿puede la BD trabajar offline?" sino "¿cómo abre el software y entra
el profesional sin WiFi?"** Desglose realista:

| Capa | ¿Funciona sin red? | Realidad |
|---|---|---|
| **Cargar la app** | Solo si es **PWA** con service worker que cachea el shell | Hoy es web export en Vercel: sin PWA, sin red **no carga nada**. Es el primer muro. |
| **Iniciar sesión** | Solo si **ya hay sesión cacheada** (JWT en almacenamiento) y no caducó | Supabase guarda la sesión; un login **previo online** sobrevive un rato offline. **El primer login JAMÁS funciona sin red.** Refrescar token tampoco. |
| **Leer datos (citas/servicios)** | Solo si hay **caché local** (IndexedDB) sembrada online | Sin caché, cada consulta va a Supabase → falla offline. |
| **Cobrar** | Sí, **si se encola** localmente y se sincroniza al volver | la columna `cobros.idempotency_key` existe (hoy **sin poblar**); al poblarla, replay seguro sin doble cobro. Es la pieza que más vale. |

**Conclusión:** un POS **offline-first de verdad** (que un dispositivo recién sacado de la caja,
sin haber visto nunca la red, abra la app y deje entrar) **no es realista** para una web app y
**no vale la pena**: el salón configura el dispositivo **una vez online**. Lo que sí es realista y
valioso es **resiliencia ante cortes**:

- **Fase A — "online resiliente" (barato, alto valor):** convertir la app en **PWA** (carga
  instantánea y sobrevive a la red intermitente) + **cachear los datos de hoy** (citas,
  servicios, clientes) + **banner claro "sin conexión"**. El 95% del dolor real (WiFi que
  parpadea) se cubre aquí.
- **Fase B — "cola de cobros offline":** permitir **registrar cobros y fichajes sin red**,
  escribiéndolos en una **cola local (IndexedDB)** con su `idempotency_key`, y **sincronizar al
  reconectar**. Es el "POS offline" que de verdad importa: puedes seguir cobrando durante un corte.
- **Lo que NO haremos:** auth offline desde cero ni una BD local completa con resolución de
  conflictos arbitraria. Coste altísimo, beneficio marginal para una peluquería.

> Regla de honestidad de producto: no prometer "funciona 100% offline". Prometer "**aguanta cortes
> de WiFi: sigues cobrando y se sincroniza solo**" — que es lo cierto y suficiente.

Reparto: la PWA + caché + cola local (Fase A/B) es **operativa, sin mover dinero** → puede ser de
Carlos. Si el cobro pasa a ser **electrónico** (Stripe Terminal/online), el offline de ESO es de
Alexandro (la pasarela define su propio modo offline).

---

## 7. Plan incremental propuesto (encaja con POS-0..3 del doc de arquitectura)
1. **Unificar el motor de cobro** (`<CobroSheet>`) usado por cita y por Caja. (Carlos)
2. **"Cobro rápido / venta sin cita"** en Caja (`cita_id` null + líneas producto). (Carlos)
3. **Contrato con la sesión paralela**: `fichajes.profesional_id` poblado + perfil leyendo
   `cobros`/`citas` por `profesional_id`; mover fichaje a perfil; Caja conserva arqueo. (acordar)
4. **Comisiones reales** en Informes y perfil = sobre `cobros` (base sin IVA) por profesional.
5. **PWA + caché de hoy** (Fase A online-resiliente). (Carlos)
6. **Cola de cobros offline** con `idempotency_key` (Fase B). (Carlos)
7. **Cobro electrónico** (POS-2) y **fiscalidad** (POS-3) — Alexandro / fiscalista, como ya estaba.

---

## 8. Decisiones para Jose / coordinación
1. **¿Existe ya un vínculo `profesional ↔ user`** (`profesionales.user_id` o
   `profiles.profesional_id`)? Es prerrequisito del perfil y de poblar `fichajes.profesional_id`.
   Si no, migración pequeña primero.
2. **¿El "cobro sin cita" (walk-in/venta) entra ya**, o esperamos a tener el perfil? (Recomiendo
   entrarlo: es lo que hace que "cobrar citas" sea un POS de verdad.)
3. **Online/offline:** ¿confirmamos el enfoque **"online resiliente + cola de cobros"** (Fases
   A/B) y descartamos el offline-first total? (Recomendado.)
4. **Coordinación con la sesión paralela:** acordar el corte del fichaje (quién lo mueve y cuándo)
   para no romper `caja.web.tsx`/perfil editando a la vez.
5. **Producto en el POS** (líneas tipo `producto`): dejar el cobro preparado (ya lo está) pero
   **sin gestión de stock** todavía (disciplina del dossier).

---

*Diseño. La caja operativa (motor de cobro, walk-in, arqueo, PWA/caché/cola) es de Carlos; el
cobro electrónico y la fiscalidad, de Alexandro/fiscalista. El perfil del profesional y el
fichaje se construyen en paralelo: este doc fija el contrato de datos para que encajen sin
doble-contar ni pisarse.*
