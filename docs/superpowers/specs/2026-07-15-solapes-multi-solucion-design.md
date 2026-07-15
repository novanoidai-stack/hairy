# Spec — Solapes multi-solución (Agenda inteligente #2, slice 1)

Fecha: 2026-07-15 · Autor: Alexandru (lógica/motor) · Estado: aprobado para plan

## Contexto y objetivo

Del `INFORME_TAREAS_AGENDA.md`, bloque #2 (Gestión avanzada de solapamientos): ante un
choque de citas, el sistema no debe solo detectarlo, sino ofrecer **múltiples alternativas
estratégicas evaluando el impacto de cada una**, aplicables a 1 clic.

Hoy `detectarSolapes` (en `lib/organizarAgenda.ts`) detecta el solape activa-activa pero
devuelve **una sola** estrategia (mover la cita intrusa al primer hueco). Este slice lo
lleva a **varias** estrategias comparables, reutilizando toda la infraestructura de
`EstrategiaRetraso` que ya funciona para retrasos.

Reparto (informe): la **lógica** que produce las estrategias es de Alexandru; los modales
que las muestran son de Carlos. Este slice es **solo motor**: el
`RetrasoEstrategiasModal` existente ya pinta un array de `EstrategiaRetraso`.

## Estado actual (lo que se reutiliza)

- `lib/retrasos.ts` — primitivas puras de fase: `fasesDe`, `chocaActivaActiva`,
  `hayColision`, `reubicar`, `toUpdate`, `buscarHueco(fases, obstaculos, desde, hasta, soloReposo)`,
  `proponerRetrasoPorCita`/`construirUpdatesRetraso` (cascada). Tipos `EstrategiaRetraso`,
  `EstrategiaTipo`, `AvisoRetraso`, `Fases`.
- `calcularEstrategiasRetraso(...)` es el patrón a espejar: genera varias estrategias, dedup,
  ordena por `citasMovidas` → `retrasoCierreMin`, marca la 1ª `recomendada`.
- `lib/organizarAgenda.ts` — `detectarSolapes` detecta el par que choca; el orquestador
  `analizarAgendaDia` prioriza retraso > solape > huecos por profesional.
- `RetrasoEstrategiasModal.web.tsx` — genérico: usa `e.tipo` **solo como React key** y muestra
  `titulo/resumen/citasMovidas/retrasoCierreMin/avisos/recomendada`. No hace switch por tipo.

## Diseño

### Nueva función pura (en `lib/retrasos.ts`, junto a `calcularEstrategiasRetraso`)

```ts
export function calcularEstrategiasSolape(
  citasDelProfesional: CitaRetraso[],
  intrusaId: string,   // la que empieza más tarde del par que choca
  fijaId: string,      // la que empieza antes
  opts?: { cierreMs?: number; ahoraMs?: number },
): EstrategiaRetraso[]
```

Pura, sin BD ni UI. `ahoraMs` es el suelo temporal (no se mueve nada al pasado); default
`Date.now()`. `cierreMs` es el techo; default el de `cierreDefault`.

`detectarSolapes` en `organizarAgenda.ts` pasa a delegar: cuando detecta el par (fija, intrusa)
llama a `calcularEstrategiasSolape(citasProf, intrusa.id, fija.id, { cierreMs, ahoraMs })` y usa
el resultado como `ProblemaAgenda.estrategias`. Deja de construir la estrategia inline.

### Nuevo tipo de estrategia

Añadir `'adelantar_otra'` a la unión `EstrategiaTipo`. Necesario porque las keys del modal son
el `tipo` y un solape puede ofrecer "mover la intrusa" y "adelantar la fija", ambos
conceptualmente "mover a un hueco". El modal es genérico → no requiere cambios de UI.

### Las estrategias (todas reposicionamiento puro, cada una con `tipo` único)

Para el par (fija = empieza antes, intrusa = empieza después):

| tipo | Título (ejemplo) | Qué mueve | updates | Cómo se calcula |
|---|---|---|---|---|
| `mover_hueco` | "Mover a {intrusa} a otro hueco" | solo la intrusa, hacia adelante | `[intrusa']` | `buscarHueco(intrusa, resto-en-sitio, desde=max(ahoraMs, fija.ini), cierre, false)` (igual que hoy) |
| `aprovechar_reposo` | "Atender a {intrusa} en un reposo" | solo la intrusa, dentro de un reposo | `[intrusa']` | `buscarHueco(..., soloReposo=true)` |
| `adelantar_otra` | "Adelantar a {fija}" | solo la fija, hacia atrás | `[fija']` | `buscarHueco(fija, resto-en-sitio-incl-intrusa, desde=ahoraMs, cierre, false)`; solo se emite si el slot resultante es **anterior** al inicio actual de la fija y deja el día limpio |
| `cascada` | "Empujar todo en cascada" | intrusa + siguientes | `[intrusa', ...siguientes]` | `proponerRetrasoPorCita(citas, intrusaId, minutos)` con `minutos` = empuje mínimo a resolución de slot para que la ventana activa de la intrusa deje de solapar la de la fija (validar con `hayColision`); fallback seguro |

Cada estrategia:
- Se calcula contra el **estado REAL** (nunca asume que otra propuesta ya se aplicó) → cada
  tarjeta es segura de aplicar por separado. (Invariante ya vigente en `organizarAgenda.ts`.)
- Valida `hayColision([...obstáculos, movida]) === false` antes de emitirse; si no queda limpio,
  no se emite (`null`).
- No mueve sola una cita con `grupoId` (cadena multiprofesional): si la intrusa o la fija
  tienen `grupoId`, esa palanca concreta se omite (la cascada puede seguir aplicando si arrastra
  la cadena entera de forma coherente — igual que hoy).
- `citasMovidas = updates.length - 1` (paridad con el motor de retrasos: cuenta las citas
  movidas **además** de la mínima inevitable). `retrasoCierreMin = cierreDelta(citas, updates)`.
- `avisos`: por cada cita movida con teléfono, un `AvisoRetraso` (minutos negativo si se
  adelanta, como en `adelantar_otra`).

### Ranking y dedup

Mismo criterio que `calcularEstrategiasRetraso`:
1. Orden de inserción por preferencia: `aprovechar_reposo`, `mover_hueco`, `adelantar_otra`, `cascada`.
2. Dedup: si dos estrategias acaban con la misma cita en el mismo `inicio`, se queda la de
   menor tipo-preferencia (p. ej. si `mover_hueco` coincide con `aprovechar_reposo`, se quita el hueco).
3. `sort((a,b) => a.citasMovidas - b.citasMovidas || a.retrasoCierreMin - b.retrasoCierreMin)`.
4. La primera tras ordenar → `recomendada = true`.
5. Invariante: **como máximo una estrategia por `tipo`** en la lista (keys del modal únicas).

### Casos borde

- **Ninguna palanca aplica** (día muy lleno, sin huecos, intrusa encadenada): devolver `[]`.
  `detectarSolapes` entonces no genera `ProblemaAgenda` para ese par (comportamiento actual:
  si no hay slot, `continue`).
- **La cascada siempre está** si hay algo que empujar y hay margen hasta el cierre; es el
  fallback. Si ni la cascada cabe antes del cierre, se emite igualmente (retrasa el cierre) —
  igual que en retrasos.
- **`adelantar_otra` sin hueco anterior**: `buscarHueco` de la fija devuelve su propio inicio o
  posterior → no es adelanto → no se emite.
- **fija e intrusa idéntico inicio** (empate): el desempate lo hace ya `detectarSolapes` (usa
  `fases[i].ini <= fases[j].ini`); `calcularEstrategiasSolape` recibe el par ya ordenado.

## Testing

`lib/organizarAgenda.test.ts` y (si aplica) un `lib/retrasos.test.ts` con `deno test`. Casos:
1. Solape simple con hueco posterior → emite `mover_hueco`; la intrusa no choca tras aplicar.
2. Solape donde la intrusa cabe en un reposo de otra cita → emite `aprovechar_reposo`; dedup
   con `mover_hueco` si coinciden.
3. Solape con hueco **antes** de la fija → emite `adelantar_otra` (fija se adelanta), intrusa
   intacta, día limpio.
4. Día lleno salvo empujar en cascada → emite `cascada`; `citasMovidas > 0`, updates coherentes.
5. Sin ninguna salida → `[]`.
6. Intrusa con `grupoId` → no se ofrece mover la intrusa sola.
7. Ranking: con varias palancas, la recomendada es la de menor `citasMovidas`/`retrasoCierreMin`;
   tipos únicos en la lista.
8. Todas las estrategias mantienen `hayColision === false` sobre el estado resultante.

## Fuera de alcance (slices siguientes)

- **Compresión** de servicios (reducir duración activa para encajar) — necesita primitiva nueva
  + regla de compresión mínima; cambia la duración real del servicio (visto bueno de Jose).
- **Reasignación cross-profesional** ("mover B a otro empleado con misma especialidad") — añade
  búsqueda de hueco entre profesionales + filtro por categoría.
- **Casuística profunda #1** (limpieza entre servicios, encadenamiento que agota, límites físicos).
- **Proactividad en segundo plano** (#1) + surfacing en Avisos (#3).
- Cualquier cambio en `RetrasoEstrategiasModal` u otra UI (dominio de Carlos).
