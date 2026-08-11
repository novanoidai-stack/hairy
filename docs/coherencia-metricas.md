# Coherencia de métricas entre páginas

Este documento es **el contrato** que evita que las cifras (ingresos, propinas,
citas) vuelvan a divergir entre Mi Jornada, Caja, Informes, Equipo y Agenda.

## Principios (no negociables)

1. **Una sola fuente de verdad.** Todo cálculo de dinero vive en
   `lib/metricasNegocio.ts`; todo conteo/estado de citas vive en
   `lib/citasMetrics.ts`. Ninguna página debe recalcular estas cifras inline.
2. **Ingreso REAL = cobros sin propina.** `ingresosRealesCents(cobros)` resta la
   propina. La propina se muestra **siempre** en una columna/tarjeta aparte,
   nunca mezclada en el total principal.
3. **Ingreso PREVISTO = catálogo sobre citas activas.** Se etiqueta "Previsto",
   nunca como ingreso real. Solo es la cifra principal cuando NO hay cobros.
4. **Columna de fecha:** los **ingresos** se fechan siempre por `cobrado_at`;
   las **citas** siempre por `inicio`. No mezclar.
5. **Estados canónicos** (en `citasMetrics.ts`):
   - `esActiva` = pendiente ∨ confirmada ∨ completada (ni cancelada ni no-show).
   - `cuentaComoConfirmada` = confirmada ∨ completada → KPI "Confirmadas".
   - `esCompletada` → KPI "Completadas".

## Tabla métrica → función → fuente

| Métrica | Función (`lib/metricasNegocio.ts`) | Fuente de datos |
|---|---|---|
| Ingresos reales (sin propina) | `ingresosRealesCents(cobros, rango?)` | `cobros` (total_cents − propina_cents) |
| Propinas | `propinasCents(cobros, rango?)` | `cobros.propina_cents` |
| Nº de cobros | `numCobros(cobros, rango?)` | `cobros` (completados en rango) |
| Ticket medio | `ticketMedioCents(cobros, rango?)` | ingresos reales / nº cobros |
| Desglose por método | `desglosePorMetodoCents(cobros, rango?)` | agrupado por `cobros.metodo` |
| Desglose por canal (arqueo) | `desglosePorCanalCents(cobros, rango?)` | `efectivo_cents`/`datafono_cents`/`online_cents` |
| Ingresos previstos (catálogo) | `ingresosPrevistosCents(citas, precioFor, rango?)` | catálogo sobre `esActiva` |
| Filtrar cobro por periodo | `esCobroEnRango(cobro, rango?)` | estado + `cobrado_at` |

| Métrica (citas) | Predicado (`lib/citasMetrics.ts`) |
|---|---|
| Cita activa (HOY, ingresos previstos) | `esActiva` |
| KPI "Confirmadas" | `cuentaComoConfirmada` |
| KPI "Completadas" | `esCompletada` |
| Canceladas + no-show | `esCanceladaONoShow` |

## Dónde se aplica (estado por página)

| Página | Ingreso real | Propina aparte | Previsto (catálogo) | Citas |
|---|:---:|:---:|:---:|:---:|
| **Caja** (arqueo) | ✅ `ingresosRealesCents` | ✅ | — | — |
| **Mi Jornada** | ✅ `total_cents − propinas_cents` (client-side, RPC devuelve ambos) | ✅ | — | — |
| **Informes** | ✅ `ingresosRealesCents` (KPI "Ingresos" + `facturacionPorProf`) | ✅ | ✅ "Previsto (catálogo)" secundario | `esActiva` |
| **Equipo** | ✅ `ingresosRealesCents` por profesional (con fallback catálogo) | — | ✅ "INGRESOS (prev.)" si no hay cobros | `cuentaComoConfirmada` |
| **Agenda** (KPIs) | — | — | — | ✅ "HOY" usa `esActiva`; "Confirmadas" usa `cuentaComoConfirmada` |

### Notas por página

- **Mi Jornada** y **Equipo** se reconcilian **client-side**. Sus RPC
  (`mi_jornada_resumen`) ya devuelven `total_cents` y `propinas_cents` por
  separado; la política "real = total − propina" se aplica al mostrar, así que
  **no fue necesario tocar RPCs de producción**. Si en el futuro se quiere mover
  esa resta al servidor, hacerlo con una migración que (re)defina el RPC manteniendo
  ambos campos.
- **Equipo** muestra ingresos REALES cuando el profesional tiene cobros en el
  mes; si no, previstos por catálogo (etiqueta "INGRESOS (prev.)"). Las
  comisiones se calculan sobre esa misma base.
- **RendimientoEquipo** (ranking, `components/equipo/RendimientoEquipo.web.tsx`):
  el RPC `equipo_jornada_ranking` devuelve `ingresos_cents` (bruto, con propina)
  y `propinas_cents` aparte; el componente ahora ordena y muestra el ingreso
  **real** (`ingresos_cents − propinas_cents`) y la propina en línea aparte. La
  comisión ya venía bien del RPC (calculada sobre `ingresos − propina`).

## Verificación en producción (2026-08-12)

Inspeccionados los RPC reales de la BD (proyecto Mecha) — confirman que la
reconciliación client-side es correcta:

- `mi_jornada_resumen`: `total_cents = sum(total_cents)` (bruto, **incluye
  propina**) y `propinas_cents` aparte → la resta client-side es correcta. Su
  comisión ya usa `(total − propina)` (mismo principio).
- `equipo_jornada_ranking`: mismo patrón (`ingresos_cents` bruto + `propinas_cents`).
- `crear_cobro_desde_cita`: ya inserta `p_lineas_extra` como `cobro_lineas`
  tipo producto → el cambio de Caja (2A) los alimenta bien. Snapshot en
  `supabase/snapshots/crear_cobro_desde_cita.sql`.

Conclusión: **no fue necesario tocar ningún RPC de producción** para la
coherencia; las páginas aplican la política "real = total − propina" al mostrar.

## 2F (pendiente de aplicar, opcional)

`supabase/migrations/20260812000000_cita_productos_cobro_linea_id.sql` añade
`cita_productos.cobro_linea_id` (nullable, sin FK) y lo rellena desde
`crear_cobro_desde_cita` para trazabilidad producto-usado ↔ producto-cobrado.
**No aplicada** a producción: toca un RPC de cobro crítico y conviene probar el
flujo de cobro en la app antes. Rollback documentado en el propio fichero.

## Tests

`lib/metricasNegocio.test.ts` — batería de coherencia con datos fijos.

```bash
deno task test
# o, directo:
deno test --allow-read --sloppy-imports lib/metricasNegocio.test.ts
```

El test clave es **"COHERENCIA: la misma fuente devuelve el mismo número para
todas las páginas"**: demuestra que, dado el mismo array de cobros y el mismo
rango, `ingresosRealesCents` devuelve idéntico resultado para Mi Jornada, Caja,
Informes y Equipo (pues todas llaman a la misma función).

> **Nota sobre el runner:** la suite de Deno del proyecto usa `--sloppy-imports`
> (los módulos de la app importan sin extensión `.ts`) y `--no-check` (archivos
> RN/DOM como `lib/supabase.ts` no type-checkean bajo la lib de Deno). El task
> `deno task test` ya aplica ambos flags y se limita a los tests de lógica pura
> (`metricasNegocio` + `caja`). Tests que usan el alias `@/` (p. ej.
> `lib/chispaOps.test.ts`) requieren la resolución del bundler y no corren bajo
> Deno plano.

## Política pendiente: `oculta_en_calendario`

Hoy la Agenda oculta las citas con `oculta_en_calendario = true` y el resto de
páginas no filtran por ese flag. Como `oculta_en_calendario` se establece junto
a `estado = cancelada` (ver `app/screens/agenda-detalle.tsx → cancelarCita`),
las métricas que usan `esActiva` ya excluyen esas citas (las canceladas no son
activas). queda pendiente decidir si las citas ocultas **no canceladas** (ocultas
manuales) deben excluirse también en Informes/Mi Jornada. Si se decide que sí,
añadir el predicado `citaVisible` a `citasMetrics.ts` y aplicarlo aquí de forma
uniforme.
