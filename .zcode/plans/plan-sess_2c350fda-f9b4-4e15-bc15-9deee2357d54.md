# Plan: coherencia de datos + caja unificada + registro de productos + agenda

Diagnóstico confirmado en 4 áreas. Se ejecuta en **3 fases independientes**, cada una verificable por separado. Por defecto uso las opciones recomendadas (ajustables):

- **Ingresos:** fuente de verdad = `cobros.total_cents` (real, con propinas mostradas **siempre por separado y restadas** del total principal). El número "estimado por catálogo" pasa a llamarse **"Previsto"** y se muestra como secundario donde ya existía.
- **Agenda:** scroll lateral **automático** por defecto con ancho mínimo cómodo, eliminando el toggle fit/scroll como condicionante.
- **Entrega:** por fases, validando cada una.

---

## FASE 1 — Arreglo rápido de la agenda (scroll lateral)  *[aislada, bajo riesgo]*

**Problema:** en la vista "todos los profesionales" las columnas usan `minmax(140px, 1fr)` con `overflowX: hidden`, de modo que cuando hay muchos profesionales las citas se comprimen/deforman.

**Cambios en `components/agenda/AgendaCalendar.web.tsx`** (componente `DayTimeline`):
- **Línea ~7353** `overflowX: agendaFit ? "hidden" : "auto"` → `overflowX: "auto"` (siempre scroll cuando hace falta).
- **Líneas ~7360-7363** `minWidth: !agendaFit ? N*140+56 : "100%"` → `minWidth: \`${(profesionales.length || 1) * 200 + 56}px\`` (mínimo por columna sube de 140→200px para que la cita no se corrompa; aplica siempre).
- **Línea ~7370** `gridTemplateColumns: \`56px repeat(N, minmax(140px, 1fr))\`` → \`56px repeat(N, minmax(200px, 1fr))\`.
- El estado `agendaFit` (líneas 788-800) deja de condicionar el layout; si el toggle sigue visible, se mantiene inofensivo o se oculta.

**Verificación:** con 2, 4, 8 y 12 profesionales, comprobar que las columnas mantienen ≥200px y aparece scroll lateral solo cuando no caben. `px tsc --noEmit` en segundo plano.

---

## FASE 2 — Caja unificada (cita + producto en un mismo ticket) + registro de productos

**Problema:** hoy `selectedIds` (citas) y `carrito` (productos) son estados independientes; "Vender producto" llama a `crear_cobro_walkin` saltándose el CobroSheet; además el CobroSheet sólo añade productos con `citaIds.length === 1` y la suma de la cita en Caja ignora `cita_productos`.

### 2A. Unificar el carrito de Caja (`app/(tabs)/caja.web.tsx`)
- Cargar `cita_productos` de las citas seleccionadas e incluirlos como líneas iniciales (hoy no se hace → líneas 175-184).
- Hacer que el botón "Vender producto" **añada al mismo ticket** cuando haya citas seleccionadas, en vez de llamar a `crear_cobro_walkin` por separado (líneas 1032-1251).
- Al cobrar con cita(s) seleccionada(s) + productos extra, abrir CobroSheet pasando `lineasIniciales` (productos del carrito) además de los de las citas.

### 2B. CobroSheet: permitir productos en cobro multi-cita (`components/pos/CobroSheet.tsx`)
- Línea 338 `p_lineas_extra: props.citaIds.length === 1 ? ... : []` → repartir `lineas` en el cobro (asignar las líneas extra al primer cobro del lote, o crear un cobro walk-in adicional ligado al mismo `cliente_id`). Decisión: adjuntar todas las líneas extra **al primer cobro** del lote (mantiene un único ticket principal y evita cambiar el RPC).

### 2C. Registro de productos en Informes (`app/(tabs)/informes.web.tsx`)
- Nueva sección **"Productos vendidos"**: lee `cobro_lineas` donde `tipo='producto'` + join `cobros` + `clientes`, en el periodo activo. Muestra: unidades, ingresos por producto, top productos, ventas por profesional y desglose por cliente.
- Añadirla a `SECTION_INFO` (líneas 184-194) y a `SeccionId` (línea 268).

### 2D. Productos en la ficha de cliente (`app/(tabs)/clientes.web.tsx`)
- Nueva subsección **"Productos"**: historial de `cobro_lineas` (tipo producto) + `cita_productos` del cliente, con fecha, cantidad y si fue "en cita" o "venta suelta".

### 2E. Productos en la ficha/detalle de cita
- `app/screens/agenda-detalle.tsx` y `app/cita/[id].web.tsx`: mostrar `cita_productos` y `cobro_lineas(tipo='producto')` de esa cita. Hoy no se muestran.
- `components/agenda/AppointmentCard.tsx`: badge/indicador "lleva producto" cuando la cita tenga `cita_productos` o cobro con líneas de producto.

### 2F. Enlace entre `cita_productos` y `cobro_lineas` (opcional, para integridad)
- Añadir columna `cita_productos.cobro_linea_id` (nullable) que el RPC `crear_cobro_desde_cita` rellene al crear las líneas extra, para poder trazar "este producto cobrado ↔ este producto usado en cita". Mig con `ALTER TABLE` + ajuste del RPC. (Se puede posponer a Fase 3 si quieres ir más rápido.)

**Verificación:** vender un servicio + 2 productos en un solo ticket; comprobar que genera **un** cobro con 3 líneas (1 servicio + 2 producto), descuenta stock, y aparece en Informes, ficha de cliente y ficha de cita. Tests `lib/caja/*` y `lib/inventario/*` en verde. `px tsc --noEmit`.

---

## FASE 3 — Coherencia de datos entre páginas (fuente única de verdad)  *[la más importante]*

**Problema raíz:** no existe una función compartida; cada página recalcula ingresos/conteo a su manera. Se crean **funciones puras compartidas en `lib/`** y se reemplazan los cálculos inline.

### 3A. Nueva lib compartida `lib/metricasNegocio.ts`
Funciones puras que se convierten en la **única fuente**:
- `ingresosReales(cobros, rango)` → `sum(total_cents) − sum(propina_cents)` (propina siempre separada).
- `propinas(cobros, rango)`, `ticketMedio(cobros)`, `desglosePorMetodo(cobros)`.
- `ingresosPrevistos(citas, servicios, rango)` → catálogo sobre `esActiva` (etiquetado como "Previsto", no como ingreso real).
- Conteos de citas usando SIEMPRE los predicados de `lib/citasMetrics.ts` (`esConfirmada`, `esCompletada`, `cuentaComoConfirmada`, `esActiva`).

### 3B. Unificar definiciones de "confirmadas / completadas"
- **Decisión de coherencia:** "Confirmadas" = `cuentaComoConfirmada` (confirmada OR completada) en TODAS partes (Agenda ya lo hace; Citas e Informes pasan a usarlo). Hoy Citas/Informes usan `esConfirmada` solo → desajuste.
- "Completadas" = `esCompletada` en todas partes.
- Equipo "citas" = `cuentaComoConfirmada` (hoy usa confirmada+completada, que coincide; se documenta y se unifica al mismo predicado).

### 3C. Reconciliar cada página con la fuente única
- **Mi Jornada** (`app/(tabs)/mi-jornada.web.tsx` + RPC `mi_jornada_resumen`): ya suma `cobros.total_cents` → se le resta la propina para el total mostrado; propina en columna aparte. (El RPC es definer; el cambio va en una migración RPC.)
- **Caja** (`caja.web.tsx` líneas 297-313): usar `metricasNegocio`; total sin propina, propina aparte.
- **Informes** (`informes.web.tsx`): "Total Ingresos" pasa a ser el **real** (cobros); el catálogo pasa a "Previsto" como secundario. `facturacionPorProf` ya resta propina (línea 809) → se alinea con `metricasNegocio`.
- **Equipo** (`equipo.web.tsx` líneas 306-354 + `RendimientoEquipo.web.tsx`): la tarjeta y el ranking deben usar la misma definición. **Auditar/reescribir el RPC `equipo_jornada_ranking`** (hoy sin SQL en el repo → añadir migración que lo (re)defina con la misma fórmula que `mi_jornada_resumen`, para que ranking y jornada cuadren).
- **Agenda KPIs** (`AgendaCalendar.web.tsx` líneas 1369-1374, 1679-1681): "HOY" deja de contar canceladas/no-show (usar `esActiva`); "Confirmadas" ya usa `cuentaComoConfirmada`.

### 3D. Filtros consistentes
- **`oculta_en_calendario`**: decidir política única. Propuesta: las **agregarlo como predicado `citaVisible`** en `citasMetrics.ts` y aplicarlo en Agenda, Citas, Informes y Mi Jornada por igual (hoy Agenda filtra y el resto no).
- **Columna de fecha**: ingresos siempre por `cobrado_at`; citas siempre por `inicio`. Documentado en `metricasNegocio`.

### 3E. Documentación de coherencia
- `docs/coherencia-metricas.md`: tabla "métrica → función → fuente", para que no vuelva a divergir.

**Verificación:** construir una batería de tests que, con datos de prueba fijos, comprueben que Mi Jornada = Caja = Informes = Equipo para los mismos profesional/periodo (ingresos reales, propinas, conteo de citas completadas). Casos: cita con seña, walk-in de producto, cita cancelada, cita oculta. `px tsc --noEmit`.

---

## Notas y riesgos
- **RPCs en producción:** varios RPC (`crear_cobro_desde_cita` 7-arg, `equipo_jornada_ranking`, `mi_jornada_resumen_horas_desde_tramos`) viven solo en la BD y no en el repo. Los cambios a la lógica server-side irán como **nuevas migraciones** que los redefinan, para que el repo refleje la realidad.
- **No romper Expo/Metro:** no arrancar servidores en otros puertos; si un error de sintaxis detiene el servidor, pedir al usuario que lo reinicie en su puerto original.
- **Validación automática:** tras cada cambio estructural React, `px tsc --noEmit` en segundo plano antes de avisar que está listo.
- Cada fase se entrega y valida antes de empezar la siguiente. Si quieres, puedo empezar por la **Fase 1** (la más rápida y visible) y de ahí encadenar.