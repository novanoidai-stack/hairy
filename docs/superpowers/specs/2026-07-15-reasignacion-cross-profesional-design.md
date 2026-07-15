# Spec — Reasignación cross-profesional (Agenda inteligente #2, slice 2)

Fecha: 2026-07-15 · Autor: Alexandru (lógica/motor) · Estado: aprobado para plan

## Contexto y objetivo

Del `INFORME_TAREAS_AGENDA.md` #2, ejemplo literal: *"Mover la Cita B a un empleado con
tiempo muerto y misma especialidad"*. Extiende el slice 1 (solapes multi-solución): ante un
solape, ofrecer además **"atender a la intrusa con otro profesional libre a su misma hora"**
como una estrategia más a 1 clic. Resuelve el choque sin mover a nadie de hora — solo cambia
el estilista de la cita intrusa.

## Decisiones (aprobadas)

- **Elegibilidad:** profesional activo, distinto del actual, con `categoria >= servicio.categoria_minima`
  y **libre** (sin choque activa-activa) en la ventana exacta de la intrusa.
- **Slot destino:** la misma hora exacta; solo cambia `profesional_id`.
- **Especialidades:** fuera de v1 (son orientativas). **Compresión / mover a otro hueco:** fuera de v1.
- Plumbing de datos incluido en este slice (lo hace Alexandru).

## Estado actual (lo que se reutiliza)

- `lib/retrasos.ts`: `calcularEstrategiasSolape` (slice 1), primitivas `fasesDe`, `chocaActivaActiva`,
  `reubicar`, `toUpdate`; tipos `EstrategiaRetraso`, `EstrategiaTipo`, `UpdateRetraso`, `AvisoRetraso`.
- `lib/organizarAgenda.ts`: `detectarSolapes` delega en `calcularEstrategiasSolape`; `analizarAgendaDia`
  agrupa por profesional; `estrategiaAMovimientos` mapea updates → movimientos.
- `lib/chispaOps.ts`: acción `optimizar_agenda` aplica los movimientos. La acción de mover cita YA
  escribe `profesional_id` (`payload.profesional_id = a.nuevo_profesional_id`) → precedente probado.
- `lib/constants.ts`: `CATEGORIAS_PROFESIONAL` (auxiliar → oficial → oficial_mayor → estilista_senior → direccion).
- `RetrasoEstrategiasModal.web.tsx`: genérico (usa `e.tipo` solo como key) → sin cambios de UI de diseño.

**Datos reales (BD Mecha):** `profesionales.categoria` poblado y coincide con la jerarquía;
`especialidades` es `text[]`. `servicios.categoria_minima` hoy es **NULL en todos** (40/40) → el
filtro de categoría no descarta a nadie todavía; la lógica debe tratar `categoria_minima = null`
como "sin requisito" (`categoriaCumple(_, null) = true`), quedando lista para cuando se rellene.

## Diseño

### 1. Tipos y helper (`lib/retrasos.ts` + `lib/constants.ts`)

- `EstrategiaTipo` += `'reasignar'`.
- `UpdateRetraso` += `profesional_id?: string` (solo lo llevan los updates de reasignación).
- En `lib/constants.ts`: `CATEGORIA_ORDEN: CategoriaProfesional[]` (jerarquía de menor a mayor) y
  `export function categoriaCumple(profCat: string | null | undefined, minima: string | null | undefined): boolean`
  → `true` si `minima` es null/undefined (sin requisito) o si `indexOf(profCat) >= indexOf(minima)`.
  Categorías desconocidas: si `profCat` no está en el orden → `false` cuando hay `minima`.

### 2. Generador de reasignación (`lib/retrasos.ts`)

`calcularEstrategiasSolape` gana un parámetro opcional en `opts`:

```ts
opts?: {
  cierreMs?: number;
  ahoraMs?: number;
  reasignacion?: {
    categoriaMinima?: string | null; // del servicio de la intrusa
    candidatos: { id: string; nombre: string; categoria?: string | null; ocupacion: CitaRetraso[] }[];
  };
}
```

Nuevo helper `estrategiaReasignar(intrusa, reasignacion)` → `EstrategiaRetraso | null`:

- Si `intrusa.grupoId` → `null` (no romper cadena multiprofesional).
- Filtra candidatos: `categoriaCumple(c.categoria, categoriaMinima)` **y** libres en la ventana de la
  intrusa: `!c.ocupacion.map(fasesDe).some((f) => chocaActivaActiva(f, fasesDe(intrusa)))`.
- Si ninguno → `null`.
- Elige el **de categoría cualificada más baja** (no gastar un senior en algo simple); desempate por
  `nombre` (estable). Una sola estrategia `reasignar` (tipo único).
- `updates = [ { ...toUpdate(intrusa, fasesDe(intrusa)), profesional_id: candidato.id } ]` (misma hora).
- `citasMovidas = 0`, `retrasoCierreMin = 0`, `avisos = []` (la clienta mantiene su hora; el aviso de
  cambio de estilista, si se decide, es de otro flujo).
- `titulo = 'Atender con ' + candidato.nombre`; `resumen` explica que mantiene la hora y cambia de profesional.

Se inserta en `calcularEstrategiasSolape` en el orden: `aprovechar_reposo`, `mover_hueco`,
`reasignar`, `adelantar_otra`, `cascada`. El ranking `citasMovidas → retrasoCierreMin` (con
desempate por orden de inserción, `Array.sort` estable) hace que `reasignar` (0/0) compita arriba.
**Dedup:** ampliar la firma a `${u.id}@${u.inicio}@${u.profesional_id ?? ''}` para que una reasignación
(misma hora, otro profesional) nunca se deduplique contra otra estrategia.

### 3. Contexto en el orquestador (`lib/organizarAgenda.ts`)

- `CitaOrganizar` += `categoriaMinima?: string | null` (requisito del servicio de la cita).
- `analizarAgendaDia` `profesionales` param: `{ id: string; nombre: string; categoria?: string | null }[]`.
- En `detectarSolapes`, para cada solape construye `candidatos` = los **demás** profesionales activos
  del negocio (id, nombre, categoria) con su `ocupacion` = las citas del día de ese profesional del pool
  ya filtrado. Pasa `{ categoriaMinima: intrusa.categoriaMinima, candidatos }` a `calcularEstrategiasSolape`.
  Para tener a los demás profesionales, `analizarAgendaDia` pasa a `detectarSolapes` el pool completo del
  día por profesional (o el mapa `porProfesional`) + la lista de profesionales activos con categoría.

### 4. Apply path (`lib/organizarAgenda.ts` + `lib/chispaOps.ts`)

- `estrategiaAMovimientos`: cada movimiento incluye `nuevo_profesional_id: u.profesional_id` cuando existe.
- `optimizar_agenda`:
  - Tipo `movimientos` += `nuevo_profesional_id?: string`.
  - `capturarEstadoPrevio`: el `select` incluye `profesional_id` (para poder deshacer).
  - Bucle de aplicación: si `m.nuevo_profesional_id`, añadir `profesional_id` al payload del `.update` y
    registrar el cambio en el historial IA (campo `profesional_id`, anterior→nuevo).

### 5. Plumbing de datos (`components/agenda/AgendaCalendar.web.tsx` + `OrganizarAgendaPanel.web.tsx`)

- `AgendaCalendar` select de `profesionales` (~L847): añadir `categoria` → `"id, nombre, color, activo, foto_perfil, categoria"`.
- `AgendaCalendar` select de `servicios` (~L859): añadir `categoria_minima`.
- `OrganizarAgendaPanelProps`: `profesionales: { id; nombre; categoria?: string | null }[]`,
  `servicios: { id; nombre; categoria_minima?: string | null }[]`.
- `OrganizarAgendaPanel`: al mapear `citasHoy` añadir `categoriaMinima` (lookup por `servicio_id` →
  `categoria_minima`); al llamar `analizarAgendaDia` pasar los profesionales con `categoria`.

## Testing (Deno, `lib/retrasos.test.ts`)

1. Hay otro profesional libre a la misma hora con `categoria_minima = null` → emite `reasignar` con
   `updates[0].profesional_id` = ese profesional y misma `inicio`.
2. `categoria_minima` exige `oficial` y el único libre es `auxiliar` → NO emite `reasignar`.
3. Dos candidatos libres cualificados (`oficial` y `estilista_senior`) → elige `oficial` (categoría más baja).
4. El único "libre" está ocupado (choque activa-activa) en la ventana → NO emite `reasignar`.
5. `reasignar` sale `recomendada` (0 disrupción) cuando compite con `mover_hueco`.
6. `intrusa.grupoId` → NO emite `reasignar`.
7. `categoriaCumple`: null→true; igual→true; mayor→true; menor→false; desconocida con minima→false.
8. Firma de dedup: una `reasignar` (misma hora, otro profesional) no se deduplica contra otra estrategia.

## Fuera de alcance (slices siguientes)

- Mover a otro hueco+profesional (cambia hora y profesional).
- Filtro/preferencia por `especialidades`.
- Compresión de servicios; casuística profunda #1; proactividad #1 + avisos #3.
- Aviso automático a la clienta del cambio de estilista (decisión de producto aparte).
