# Reasignación cross-profesional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un solape ofrezca, como estrategia más a 1 clic, atender a la cita intrusa con otro profesional libre a su misma hora y con categoría suficiente.

**Architecture:** Nuevo lever `reasignar` en `calcularEstrategiasSolape` (recibe candidatos vía `opts.reasignacion`), `UpdateRetraso` gana `profesional_id?`, y ese campo se propaga por `estrategiaAMovimientos` → acción `optimizar_agenda` (payload + undo + historial). Datos (`categoria`, `categoria_minima`) se cablean desde `AgendaCalendar` → `OrganizarAgendaPanel` → analizador.

**Tech Stack:** TypeScript puro (app/Metro + `deno test`). Deno: `& "$env:USERPROFILE\.deno\bin\deno.exe"`. Typecheck: `./node_modules/.bin/tsc.cmd --noEmit` (0 errores fuera de `supabase/functions`).

Spec: `docs/superpowers/specs/2026-07-15-reasignacion-cross-profesional-design.md`

---

### Task 1: Helper de jerarquía de categorías

**Files:**
- Modify: `lib/constants.ts` (tras `CategoriaProfesional`, ~línea 53)
- Modify: `lib/retrasos.test.ts` (import + test)

- [ ] **Step 1: Test (falla)** — en `lib/retrasos.test.ts`, añade el import y el test al final.

Import (añadir debajo del import de `./retrasos.ts`):

```ts
import { categoriaCumple } from './constants.ts';
```

Test (al final del fichero):

```ts
Deno.test('categoriaCumple: null minima cualquiera cumple; respeta la jerarquia', () => {
  assertEquals(categoriaCumple('auxiliar', null), true);
  assertEquals(categoriaCumple('auxiliar', undefined), true);
  assertEquals(categoriaCumple('oficial', 'oficial'), true);
  assertEquals(categoriaCumple('estilista_senior', 'oficial'), true);
  assertEquals(categoriaCumple('auxiliar', 'oficial'), false);
  assertEquals(categoriaCumple('desconocida', 'oficial'), false);
});
```

- [ ] **Step 2: Correr y verificar FALLO**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/retrasos.test.ts`
Expected: FAIL (`categoriaCumple` no existe).

- [ ] **Step 3: Implementar** — en `lib/constants.ts`, tras la línea `export type CategoriaProfesional = ...;` (~53):

```ts
// Jerarquia de categorias de menor a mayor (para requisitos de categoria minima).
export const CATEGORIA_ORDEN: CategoriaProfesional[] = [
  'auxiliar', 'oficial', 'oficial_mayor', 'estilista_senior', 'direccion',
];

// True si un profesional de categoria `profCat` cumple el requisito `minima`.
// minima null/undefined = sin requisito. Requisito desconocido no bloquea; categoria
// desconocida no cumple cuando hay requisito.
export function categoriaCumple(
  profCat: string | null | undefined,
  minima: string | null | undefined,
): boolean {
  if (!minima) return true;
  const need = CATEGORIA_ORDEN.indexOf(minima as CategoriaProfesional);
  if (need < 0) return true;
  const have = CATEGORIA_ORDEN.indexOf((profCat ?? '') as CategoriaProfesional);
  return have >= need;
}
```

- [ ] **Step 4: Correr y verificar PASA**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/retrasos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts lib/retrasos.test.ts
git commit -m "feat(agenda): helper categoriaCumple + CATEGORIA_ORDEN"
```

---

### Task 2: Lever `reasignar` en el motor de solapes

**Files:**
- Modify: `lib/retrasos.ts` (union `EstrategiaTipo`; `UpdateRetraso`; import de constants; helper nuevo + `calcularEstrategiasSolape`)
- Modify: `lib/retrasos.test.ts` (tests)

- [ ] **Step 1: Tests (fallan)** — al final de `lib/retrasos.test.ts`:

```ts
Deno.test('reasignar: otro profesional libre a la misma hora (sin requisito) se ofrece', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const rea = est.find((e) => e.tipo === 'reasignar');
  assert(rea, 'debe ofrecer reasignar');
  assertEquals(rea!.updates[0].id, 'B');
  assertEquals(rea!.updates[0].profesional_id, 'P2');
  assertEquals(rea!.updates[0].inicio, iso(10, 30)); // misma hora
  assertEquals(rea!.citasMovidas, 0);
});

Deno.test('reasignar: descarta candidato de categoria insuficiente', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'auxiliar', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});

Deno.test('reasignar: elige la categoria cualificada mas baja', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [
      { id: 'P3', nombre: 'Cris', categoria: 'estilista_senior', ocupacion: [] as CitaRetraso[] },
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const rea = est.find((e) => e.tipo === 'reasignar')!;
  assertEquals(rea.updates[0].profesional_id, 'P2'); // oficial < estilista_senior
});

Deno.test('reasignar: candidato ocupado en la ventana no cuenta', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 30, 30)] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});

Deno.test('reasignar: intrusa encadenada (grupoId) no se reasigna', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cad-1' })];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'));
});
```

- [ ] **Step 2: Correr y verificar FALLO**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/retrasos.test.ts`
Expected: FAIL (`opts.reasignacion` / tipo `reasignar` no existen).

- [ ] **Step 3a: `EstrategiaTipo` + `UpdateRetraso` + import** en `lib/retrasos.ts`.

Reemplaza la unión `EstrategiaTipo`:

```ts
export type EstrategiaTipo =
  | 'cascada'
  | 'mover_hueco'
  | 'aprovechar_reposo'
  | 'adelantar_otra'
  | 'reasignar'
  | 'pedir_retraso_siguiente';
```

En `UpdateRetraso`, añade el campo opcional:

```ts
export interface UpdateRetraso {
  id: string;
  inicio: string;
  fin: string;
  fin_activa?: string;
  fin_espera?: string;
  profesional_id?: string; // solo en updates de reasignacion (cambio de profesional)
}
```

Añade el import de constants cerca de la cabecera. Si `retrasos.ts` ya tiene un `import ... from './constants.ts'`, amplía esa lista; si no, añade una línea nueva:

```ts
import { categoriaCumple, CATEGORIA_ORDEN, type CategoriaProfesional } from './constants.ts';
```

- [ ] **Step 3b: Helper `estrategiaReasignar` + parámetro en `calcularEstrategiasSolape`.**

Inserta el helper justo antes de `export function calcularEstrategiasSolape`:

```ts
// Palanca E: reasignar la intrusa a otro profesional libre a su MISMA hora, con
// categoria suficiente. Elige la categoria cualificada mas baja (desempate por nombre).
function estrategiaReasignar(
  intrusa: CitaRetraso,
  reasignacion: {
    categoriaMinima?: string | null;
    candidatos: { id: string; nombre: string; categoria?: string | null; ocupacion: CitaRetraso[] }[];
  },
): EstrategiaRetraso | null {
  if (intrusa.grupoId) return null;
  const intrusaFases = fasesDe(intrusa);
  const elegibles = reasignacion.candidatos.filter(
    (c) =>
      categoriaCumple(c.categoria, reasignacion.categoriaMinima) &&
      !c.ocupacion.some((o) => chocaActivaActiva(fasesDe(o), intrusaFases)),
  );
  if (elegibles.length === 0) return null;
  const mejor = elegibles.slice().sort((a, b) => {
    const ia = CATEGORIA_ORDEN.indexOf((a.categoria ?? '') as CategoriaProfesional);
    const ib = CATEGORIA_ORDEN.indexOf((b.categoria ?? '') as CategoriaProfesional);
    return ia - ib || a.nombre.localeCompare(b.nombre);
  })[0];
  const update: UpdateRetraso = { ...toUpdate(intrusa, intrusaFases), profesional_id: mejor.id };
  const hora = new Date(intrusaFases.ini).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return {
    tipo: 'reasignar',
    titulo: `Atender con ${mejor.nombre}`,
    resumen: `${intrusa.cliente ?? 'La cita'} mantiene su hora (${hora}) pero la atiende ${mejor.nombre}, que esta libre; el resto del dia no cambia.`,
    citasMovidas: 0,
    retrasoCierreMin: 0,
    updates: [update],
    avisos: [],
  };
}
```

En `calcularEstrategiasSolape`, amplía la firma de `opts` y añade el push del lever. Reemplaza la cabecera y el bloque de pushes:

```ts
export function calcularEstrategiasSolape(
  citasDelProfesional: CitaRetraso[],
  intrusaId: string,
  fijaId: string,
  opts?: {
    cierreMs?: number;
    ahoraMs?: number;
    reasignacion?: {
      categoriaMinima?: string | null;
      candidatos: { id: string; nombre: string; categoria?: string | null; ocupacion: CitaRetraso[] }[];
    };
  },
): EstrategiaRetraso[] {
```

Y en el cuerpo, el bloque de pushes pasa a:

```ts
  // Orden de insercion = preferencia ante empate (reposo > hueco > reasignar > adelantar > cascada).
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, true));
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, false));
  if (opts?.reasignacion) push(estrategiaReasignar(intrusa, opts.reasignacion));
  push(estrategiaAdelantarFija(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs));
  push(estrategiaCascadaSolape(citasDelProfesional, intrusa, fija, cierreMs));
```

- [ ] **Step 3c: Firma de dedup incluye `profesional_id`.**

En `calcularEstrategiasSolape`, reemplaza la línea de firma del dedup:

```ts
    const sig = e.updates.map((u) => `${u.id}@${u.inicio}@${u.profesional_id ?? ''}`).sort().join('|');
```

- [ ] **Step 4: Correr y verificar PASA**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/retrasos.test.ts`
Expected: PASS (todos, incluidos los 5 nuevos de reasignar).

- [ ] **Step 5: Commit**

```bash
git add lib/retrasos.ts lib/retrasos.test.ts
git commit -m "feat(agenda): lever reasignar en calcularEstrategiasSolape"
```

---

### Task 3: Threading en el orquestador + `estrategiaAMovimientos`

**Files:**
- Modify: `lib/organizarAgenda.ts` (`CitaOrganizar`; `analizarAgendaDia` firma + candidatos; `detectarSolapes`; `estrategiaAMovimientos`; import)
- Modify: `lib/organizarAgenda.test.ts` (test de integración)

- [ ] **Step 1: Test de integración (falla)** — al final de `lib/organizarAgenda.test.ts`:

```ts
Deno.test('solape: si otro profesional esta libre a la misma hora, ofrece reasignar', () => {
  const citas = [cita('A', 'P5', 10, 0, 60), cita('B', 'P5', 10, 30, 30)];
  const profs = [
    { id: 'P5', nombre: 'Eva', categoria: 'oficial' },
    { id: 'P6', nombre: 'Fer', categoria: 'oficial' },
  ];
  const problemas = analizarAgendaDia(citas, profs, { ahoraMs: ms(9, 0) });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const rea = solape.estrategias.find((e) => e.tipo === 'reasignar');
  assert(rea, 'debe ofrecer reasignar');
  assertEquals(rea!.updates[0].id, 'B');
  assertEquals(rea!.updates[0].profesional_id, 'P6');
  assertEquals(rea!.updates[0].inicio, iso(10, 30));
});
```

- [ ] **Step 2: Correr y verificar FALLO**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/organizarAgenda.test.ts`
Expected: FAIL (no se genera `reasignar` aún).

- [ ] **Step 3a: Import + tipos en `lib/organizarAgenda.ts`.**

Añade `type CategoriaProfesional` no hace falta; solo amplía tipos locales. En la interfaz `CitaOrganizar` añade el campo:

```ts
export interface CitaOrganizar extends CitaRetraso {
  profesional_id: string;
  estado: string;
  categoriaMinima?: string | null;
}
```

- [ ] **Step 3b: `analizarAgendaDia` firma + construcción de candidatos.**

Reemplaza la firma y el cuerpo del bucle por profesional. La firma:

```ts
export function analizarAgendaDia(
  citas: CitaOrganizar[],
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[],
  opts?: AnalisisAgendaOpts,
): ProblemaAgenda[] {
```

Dentro, tras construir `porProfesional`, prepara los profesionales activos (para candidatos). Reemplaza el bloque del bucle `for (const [, citasProfSinOrdenar] of porProfesional)` para que capture el id del profesional y pase candidatos a `detectarSolapes`:

```ts
  const activos = profesionales.filter((p) => p.activo !== false);

  const problemas: ProblemaAgenda[] = [];
  for (const [profId, citasProfSinOrdenar] of porProfesional) {
    const citasProf = [...citasProfSinOrdenar].sort((a, b) => +new Date(a.inicio) - +new Date(b.inicio));
    const cierreMs = cierreDelDia(citasProf[0].inicio);

    const retraso = detectarRetraso(citasProf, ahoraMs, cierreMs);
    if (retraso) {
      problemas.push(retraso);
      continue;
    }

    const candidatos = activos
      .filter((p) => p.id !== profId)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria ?? null,
        ocupacion: porProfesional.get(p.id) ?? [],
      }));

    const solapes = detectarSolapes(citasProf, ahoraMs, cierreMs, candidatos);
    if (solapes.length > 0) {
      problemas.push(...solapes);
      continue;
    }

    problemas.push(...detectarHuecos(citasProf, ahoraMs, cierreMs, umbralHuecoMs));
  }
```

- [ ] **Step 3c: `detectarSolapes` recibe candidatos y los pasa.**

Reemplaza la firma y la llamada a `calcularEstrategiasSolape` dentro de `detectarSolapes`:

```ts
function detectarSolapes(
  citasProf: CitaOrganizar[],
  ahoraMs: number,
  cierreMs: number,
  candidatos: { id: string; nombre: string; categoria?: string | null; ocupacion: CitaRetraso[] }[],
): ProblemaAgenda[] {
```

Y la línea que calcula `estrategias`:

```ts
      const estrategias = calcularEstrategiasSolape(citasProf, intrusa.id, fija.id, {
        cierreMs,
        ahoraMs,
        reasignacion: { categoriaMinima: intrusa.categoriaMinima ?? null, candidatos },
      });
```

- [ ] **Step 3d: `estrategiaAMovimientos` propaga `nuevo_profesional_id`.**

Reemplaza el cuerpo de `estrategiaAMovimientos`:

```ts
export function estrategiaAMovimientos(
  estrategia: EstrategiaRetraso,
  citasPorId: Map<string, CitaOrganizar>,
): { cita_id: string; nuevo_inicio: string; nuevo_fin: string; nuevo_fin_activa?: string; nuevo_fin_espera?: string; nuevo_profesional_id?: string; cliente_nombre: string }[] {
  return estrategia.updates.map((u: UpdateRetraso) => ({
    cita_id: u.id,
    nuevo_inicio: u.inicio,
    nuevo_fin: u.fin,
    nuevo_fin_activa: u.fin_activa,
    nuevo_fin_espera: u.fin_espera,
    nuevo_profesional_id: u.profesional_id,
    cliente_nombre: citasPorId.get(u.id)?.cliente ?? '',
  }));
}
```

- [ ] **Step 4: Correr y verificar PASA**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/organizarAgenda.test.ts lib/retrasos.test.ts`
Expected: PASS (salvo el fallo PREEXISTENTE "dia limpio", ajeno a este slice).

- [ ] **Step 5: Commit**

```bash
git add lib/organizarAgenda.ts lib/organizarAgenda.test.ts
git commit -m "feat(agenda): threading de candidatos de reasignacion en el orquestador"
```

---

### Task 4: Apply path del cambio de profesional (`chispaOps`)

**Files:**
- Modify: `lib/chispaOps.ts` (tipo `movimientos` ~L218; `capturarEstadoPrevio` ~L386; apply loop ~L896-909; undo ~L1320-1330)

No hay test Deno (toca Supabase/React). Verificación: `tsc --noEmit`.

- [ ] **Step 1: Tipo `movimientos` (+ `nuevo_profesional_id`).**

En la unión `AccionPropuesta`, reemplaza la línea `movimientos: {...}[]` (~218):

```ts
      movimientos: { cita_id: string; nuevo_inicio: string; nuevo_fin: string; nuevo_fin_activa?: string; nuevo_fin_espera?: string; nuevo_profesional_id?: string; cliente_nombre: string }[];
```

- [ ] **Step 2: `capturarEstadoPrevio` incluye `profesional_id`.**

Reemplaza el `select` del case `optimizar_agenda` en `capturarEstadoPrevio` (~386):

```ts
      const { data } = await supabase
        .from('citas')
        .select('id, inicio, fin, fin_activa, fin_espera, profesional_id')
        .in('id', ids);
```

- [ ] **Step 3: Apply loop escribe `profesional_id` y lo registra.**

Reemplaza el cuerpo del `for (const mov of a.movimientos)` en el case `optimizar_agenda` de `ejecutarAccion` (~895-910):

```ts
        for (const mov of a.movimientos) {
          const { data: prev } = await supabase.from('citas').select('inicio, profesional_id').eq('id', mov.cita_id).maybeSingle();
          const patch: Record<string, string | boolean> = {
            inicio: mov.nuevo_inicio,
            fin: mov.nuevo_fin,
            fin_activa: mov.nuevo_fin_activa ?? mov.nuevo_fin,
            confirmacion_enviada: false, // para que n8n vuelva a avisar
          };
          if (mov.nuevo_fin_espera) patch.fin_espera = mov.nuevo_fin_espera;
          if (mov.nuevo_profesional_id) patch.profesional_id = mov.nuevo_profesional_id;
          const { error } = await supabase.from('citas').update(patch).eq('id', mov.cita_id);
          if (!error) {
            exito++;
            const cambios: CambioHist[] = [
              { campo: 'inicio', anterior: (prev?.inicio as string) ?? null, nuevo: mov.nuevo_inicio },
            ];
            if (mov.nuevo_profesional_id) {
              cambios.push({ campo: 'profesional_id', anterior: (prev?.profesional_id as string) ?? null, nuevo: mov.nuevo_profesional_id });
            }
            await registrarHistorialIA(a.negocio_id, mov.cita_id, cambios, 'Reorganizada por Chispa');
          }
        }
```

- [ ] **Step 4: Undo restaura `profesional_id`.**

Reemplaza el bucle del case `optimizar_agenda` en el deshacer (~1320-1330):

```ts
        for (const cita of previo as Array<{ id: string; inicio: string; fin: string; fin_activa?: string; fin_espera?: string; profesional_id?: string }>) {
          const patch: Record<string, string | boolean> = {
            inicio: cita.inicio,
            fin: cita.fin,
            fin_activa: cita.fin_activa ?? cita.fin,
            fin_espera: cita.fin_espera ?? cita.fin,
            confirmacion_enviada: false,
          };
          if (cita.profesional_id) patch.profesional_id = cita.profesional_id;
          await supabase.from('citas').update(patch).eq('id', cita.id);
          await registrarHistorialIA(negocioId, cita.id, [
            { campo: 'inicio', anterior: cita.inicio, nuevo: cita.inicio },
          ], 'Deshacer: optimizacion revertida por Chispa');
        }
```

- [ ] **Step 5: Typecheck**

Run: `cd Hairy && ./node_modules/.bin/tsc.cmd --noEmit`
Expected: 0 errores fuera de `supabase/functions`.

- [ ] **Step 6: Commit**

```bash
git add lib/chispaOps.ts
git commit -m "feat(agenda): optimizar_agenda aplica y deshace el cambio de profesional"
```

---

### Task 5: Plumbing de datos (AgendaCalendar + OrganizarAgendaPanel)

**Files:**
- Modify: `components/agenda/AgendaCalendar.web.tsx` (selects ~L847 y ~L859)
- Modify: `components/agenda/OrganizarAgendaPanel.web.tsx` (props ~L62-64; mapping ~L115-134; call ~L139)

Verificación: `tsc --noEmit`.

- [ ] **Step 1: Selects de AgendaCalendar traen `categoria` y `categoria_minima`.**

Reemplaza el select de `profesionales` (~847):

```ts
            .select("id, nombre, color, activo, foto_perfil, categoria")
```

Reemplaza el select de `servicios` (~859):

```ts
            .select(
              "id, nombre, precio, duracion_activa_min, duracion_espera_min, duracion_activa_extra_min, categoria_id, categoria_minima",
            )
```

- [ ] **Step 2: Props del panel aceptan los nuevos campos.**

En `OrganizarAgendaPanelProps` (~62-64) reemplaza las dos líneas:

```ts
  profesionales: { id: string; nombre: string; categoria?: string | null; activo?: boolean }[];
  clientes: { id: string; nombre: string; telefono?: string | null }[];
  servicios: { id: string; nombre: string; categoria_minima?: string | null }[];
```

- [ ] **Step 3: Mapping de `citasHoy` añade `categoriaMinima`; la llamada pasa la categoría.**

Reemplaza el `useMemo` de `citasHoy` (~115-134):

```ts
  const citasHoy: CitaOrganizar[] = useMemo(() => {
    const clienteMap = new Map(clientes.map((c) => [c.id, c]));
    const servicioMap = new Map(servicios.map((s) => [s.id, s.nombre]));
    const servicioCatMinMap = new Map(servicios.map((s) => [s.id, s.categoria_minima ?? null]));
    return citas.map((c) => {
      const cliente = c.cliente_id ? clienteMap.get(c.cliente_id) : undefined;
      return {
        id: c.id,
        inicio: c.inicio,
        fin: c.fin,
        fin_activa: c.fin_activa,
        fin_espera: c.fin_espera,
        estado: c.estado,
        profesional_id: c.profesional_id,
        grupoId: c.grupo_id ?? null,
        cliente: cliente?.nombre ?? null,
        telefono: cliente?.telefono ?? null,
        servicio: c.servicio_id ? (servicioMap.get(c.servicio_id) ?? null) : null,
        categoriaMinima: c.servicio_id ? (servicioCatMinMap.get(c.servicio_id) ?? null) : null,
      };
    });
  }, [citas, clientes, servicios]);
```

La llamada a `analizarAgendaDia` (~139) no cambia de forma (ya pasa `profesionales`, que ahora traen `categoria`/`activo`): confírmalo:

```ts
  const problemas = useMemo(
    () => analizarAgendaDia(citasHoy, profesionales, { ahoraMs: ahoraOverrideMs }),
    [citasHoy, profesionales, ahoraOverrideMs],
  );
```

- [ ] **Step 4: Typecheck**

Run: `cd Hairy && ./node_modules/.bin/tsc.cmd --noEmit`
Expected: 0 errores fuera de `supabase/functions`.

- [ ] **Step 5: Commit**

```bash
git add "components/agenda/AgendaCalendar.web.tsx" "components/agenda/OrganizarAgendaPanel.web.tsx"
git commit -m "feat(agenda): cablear categoria/categoria_minima al organizador"
```

---

### Task 6: Verificación final

- [ ] **Step 1: Suite Deno de los ficheros tocados**

Run: `& "$env:USERPROFILE\.deno\bin\deno.exe" test lib/retrasos.test.ts lib/organizarAgenda.test.ts`
Expected: PASS salvo el fallo PREEXISTENTE "dia limpio" (ajeno a este slice; ver spec).

- [ ] **Step 2: Typecheck de la app**

Run: `cd Hairy && ./node_modules/.bin/tsc.cmd --noEmit`
Expected: 0 errores fuera de `supabase/functions`.

- [ ] **Step 3: Restaurar `deno.lock` si quedó tocado**

```bash
git checkout -- deno.lock 2>/dev/null || true
git status --short
```

---

## Notas de verificación (self-review)

- **Cobertura del spec:** helper `categoriaCumple` → Task 1; tipo `reasignar` + `UpdateRetraso.profesional_id` + `estrategiaReasignar` + dedup → Task 2; `CitaOrganizar.categoriaMinima` + `analizarAgendaDia.categoria/activo` + candidatos en `detectarSolapes` + `estrategiaAMovimientos` → Task 3; apply path `optimizar_agenda` (payload + estado previo + historial + undo) → Task 4; plumbing selects + props + mapping → Task 5; testing → Tasks 1-3 + 6.
- **Sin placeholders:** todo el código está completo.
- **Consistencia de tipos:** `reasignacion: { categoriaMinima?, candidatos: {id, nombre, categoria?, ocupacion}[] }` idéntico en `calcularEstrategiasSolape` (Task 2), `detectarSolapes`/`analizarAgendaDia` (Task 3). `UpdateRetraso.profesional_id?` (Task 2) → `movimientos.nuevo_profesional_id?` (Tasks 3-4) → `patch.profesional_id` (Task 4). `CambioHist` ya existe en chispaOps (usado por `registrarHistorialIA`).
- **No unit-testable:** Tasks 4 y 5 (Supabase/React) se validan con `tsc`. La lógica de reasignación sí está cubierta por Deno (Tasks 1-3).
