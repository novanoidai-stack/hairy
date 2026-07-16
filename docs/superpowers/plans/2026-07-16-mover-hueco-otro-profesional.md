# Mover a hueco de otro profesional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ante un solape, ofrecer a 1 clic "mover a la clienta al hueco de otro profesional" (misma
categoría o superior, esquivando sus bloqueos), completando el slice 3 de la tarea #2 de agenda.

**Architecture:** Una palanca pura más en `lib/retrasos.ts` (`estrategiaMoverAOtroProfesional`),
enchufada a `calcularEstrategiasSolape` por el mismo canal `opts.reasignacion` que abrió el slice 2.
Los bloqueos del candidato entran como obstáculos opacos en el barrido de `buscarHueco`. El apply
path (`chispaOps.optimizar_agenda`) ya escribe `profesional_id`: no se toca.

**Tech Stack:** TypeScript puro (sin deps), tests Deno, Expo/React Native Web para el plumbing.

**Spec:** `docs/superpowers/specs/2026-07-16-mover-hueco-otro-profesional-design.md`

**Comandos** (ver memorias `reference_deno_hairy` y `reference_hairy_typecheck_command`):
- Tests: `C:\Users\alexa\.deno\bin\deno.exe test lib/retrasos.test.ts`
- Typecheck: `.\node_modules\.bin\tsc.cmd --noEmit`
- Deno NO está en el PATH: usar siempre la ruta completa.
- Fallo preexistente conocido y NO relacionado: test "dia limpio" de `lib/organizarAgenda.test.ts`.

**Reglas del repo:** sin emojis en ningún archivo (regla dura). Código en inglés, comentarios en
español. No añadir features/validaciones/abstracciones que no pida el plan.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `lib/retrasos.ts` | Motor puro: tipos, `fasesDeBloqueo`, palanca nueva, orquestación | Modificar |
| `lib/retrasos.test.ts` | Tests Deno del motor | Modificar |
| `lib/organizarAgenda.ts` | Agrupa bloqueos por profesional e inyecta candidatos | Modificar |
| `components/agenda/OrganizarAgendaPanel.web.tsx` | Pasa bloqueos al análisis | Modificar |
| `components/agenda/AgendaCalendar.web.tsx` | Pasa el estado `bloqueos` que ya tiene | Modificar |
| `lib/hooks/useAvisos.ts` | Carga bloqueos para el análisis de Avisos | Modificar |

---

### Task 1: Tipos y helper de bloqueo

**Files:**
- Modify: `lib/retrasos.ts`

- [ ] **Step 1: Añadir el tipo de estrategia**

En `lib/retrasos.ts`, sustituir el bloque `export type EstrategiaTipo` (~L174) por:

```ts
export type EstrategiaTipo =
  | 'cascada'
  | 'mover_hueco'
  | 'aprovechar_reposo'
  | 'adelantar_otra'
  | 'reasignar'
  | 'mover_reasignar'
  | 'pedir_retraso_siguiente';
```

- [ ] **Step 2: Extraer el tipo de candidato (hoy duplicado inline 3 veces)**

Justo debajo de `export interface EstrategiasOpts { ... }` (~L205), añadir:

```ts
// Bloqueo de un profesional (vacaciones, reunion, baja). Ocupa todo su tramo.
export interface BloqueoProfesional {
  inicio: string;
  fin: string;
}

// Profesional alternativo al que se puede pasar una cita. `bloqueos` es opcional: si el
// llamador no los cablea, la palanca solo esquiva citas y puede proponer un hueco que en
// realidad esta bloqueado (ver spec, seccion Plumbing).
export interface CandidatoReasignacion {
  id: string;
  nombre: string;
  categoria?: string | null;
  ocupacion: CitaRetraso[];
  bloqueos?: BloqueoProfesional[];
}

export interface ReasignacionOpts {
  categoriaMinima?: string | null;
  candidatos: CandidatoReasignacion[];
}
```

- [ ] **Step 3: Usar los tipos nuevos en las firmas existentes**

En `estrategiaReasignar` (~L620), sustituir el parámetro inline:

```ts
function estrategiaReasignar(
  intrusa: CitaRetraso,
  reasignacion: ReasignacionOpts,
): EstrategiaRetraso | null {
```

En `calcularEstrategiasSolape` (~L653), sustituir el `opts` por:

```ts
export function calcularEstrategiasSolape(
  citasDelProfesional: CitaRetraso[],
  intrusaId: string,
  fijaId: string,
  opts?: {
    cierreMs?: number;
    ahoraMs?: number;
    reasignacion?: ReasignacionOpts;
  },
): EstrategiaRetraso[] {
```

- [ ] **Step 4: Añadir el helper `fasesDeBloqueo`**

Justo debajo de `fasesDe` (~L222), añadir:

```ts
// Un bloqueo ocupa TODO su tramo: sin fase de reposo aprovechable (finE === fin hace que
// ventanasActivas devuelva una sola ventana [ini, fin]).
export function fasesDeBloqueo(b: BloqueoProfesional): Fases {
  const ini = +new Date(b.inicio);
  const fin = +new Date(b.fin);
  return { id: `bloqueo:${b.inicio}:${b.fin}`, ini, finA: fin, finE: fin, fin };
}
```

- [ ] **Step 5: Verificar que compila**

Run: `.\node_modules\.bin\tsc.cmd --noEmit`
Expected: 0 errores en `lib/retrasos.ts` (ignorar errores de `supabase/functions`: son Deno).

- [ ] **Step 6: Commit**

```bash
git add lib/retrasos.ts
git commit -m "refactor(agenda): tipos CandidatoReasignacion/BloqueoProfesional + fasesDeBloqueo"
```

---

### Task 2: Palanca `mover_reasignar` (TDD)

**Files:**
- Modify: `lib/retrasos.ts`
- Test: `lib/retrasos.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Al final de `lib/retrasos.test.ts`, añadir. Los helpers `cita(id, hIni, mIni, durMin, extra)`,
`iso(h, m)` y `msD(h, m)` ya existen en el archivo.

```ts
Deno.test('mover_reasignar: nadie libre a la hora exacta, pero uno tiene hueco despues', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      // Ocupado a las 10:30 (tapa la reasignacion a misma hora), libre a partir de las 11:00.
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'reasignar'), 'no debe haber reasignar a misma hora');
  const mv = est.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'debe ofrecer mover_reasignar');
  assertEquals(mv!.updates.length, 1);
  assertEquals(mv!.updates[0].id, 'B');
  assertEquals(mv!.updates[0].profesional_id, 'P2');
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
  assertEquals(mv!.citasMovidas, 0);
});

Deno.test('mover_reasignar: elige el hueco mas temprano entre candidatos', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      // Cris se libera a las 12:00; Bea a las 11:00 -> gana Bea aunque este despues en la lista.
      { id: 'P3', nombre: 'Cris', categoria: 'oficial', ocupacion: [cita('Y', 10, 0, 120)] },
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.updates[0].profesional_id, 'P2');
  assertEquals(mv.updates[0].inicio, iso(11, 0));
});

Deno.test('mover_reasignar: no adelanta a la clienta a un hueco anterior', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    // Bea esta libre TODA la manana pero ocupada justo en la ventana de B (10:30-11:00).
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 30, 30)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar');
  assert(mv, 'debe ofrecer mover_reasignar');
  // El hueco de las 9:00 existe, pero la busqueda arranca en la hora original (10:30).
  assertEquals(mv!.updates[0].inicio, iso(11, 0));
});

Deno.test('mover_reasignar: un bloqueo del destino tapa el hueco', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      {
        id: 'P2',
        nombre: 'Bea',
        categoria: 'oficial',
        ocupacion: [cita('X', 10, 0, 60)],
        // Reunion de 11:00 a 12:00 -> el primer hueco pasa a ser las 12:00.
        bloqueos: [{ inicio: iso(11, 0), fin: iso(12, 0) }],
      },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.updates[0].inicio, iso(12, 0));
});

Deno.test('mover_reasignar: descarta candidato de categoria insuficiente', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: 'oficial',
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'auxiliar', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'mover_reasignar'));
});

Deno.test('mover_reasignar: intrusa encadenada (grupoId) no se mueve', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cad-1' })];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(!est.some((e) => e.tipo === 'mover_reasignar'));
});

Deno.test('mover_reasignar: reasignar a misma hora gana (dedup por firma)', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    // Bea libre del todo: el hueco mas temprano ES la hora original -> misma firma que reasignar.
    candidatos: [{ id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [] as CitaRetraso[] }],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  assert(est.some((e) => e.tipo === 'reasignar'), 'reasignar debe estar');
  assert(!est.some((e) => e.tipo === 'mover_reasignar'), 'mover_reasignar es el mismo efecto: dedup');
});

Deno.test('mover_reasignar: determinista ante huecos equivalentes (categoria, luego nombre)', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const base = [
    { id: 'P3', nombre: 'Cris', categoria: 'estilista_senior', ocupacion: [cita('Y', 10, 0, 60)] },
    { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
  ];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', {
    ahoraMs: msD(9, 0),
    reasignacion: { categoriaMinima: 'oficial', candidatos: base },
  });
  const inv = calcularEstrategiasSolape(citas, 'B', 'A', {
    ahoraMs: msD(9, 0),
    reasignacion: { categoriaMinima: 'oficial', candidatos: base.slice().reverse() },
  });
  const a = est.find((e) => e.tipo === 'mover_reasignar')!;
  const b = inv.find((e) => e.tipo === 'mover_reasignar')!;
  // Mismo hueco (11:00) para ambos -> gana la categoria cualificada mas baja, sea cual sea el orden.
  assertEquals(a.updates[0].profesional_id, 'P2');
  assertEquals(b.updates[0].profesional_id, 'P2');
});

Deno.test('mover_reasignar: avisa a la clienta del cambio de hora', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const reasignacion = {
    categoriaMinima: null,
    candidatos: [
      { id: 'P2', nombre: 'Bea', categoria: 'oficial', ocupacion: [cita('X', 10, 0, 60)] },
    ],
  };
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0), reasignacion });
  const mv = est.find((e) => e.tipo === 'mover_reasignar')!;
  assertEquals(mv.avisos.length, 1);
  assertEquals(mv.avisos[0].cita_id, 'B');
  assertEquals(mv.avisos[0].inicioNuevo, iso(11, 0));
  assertEquals(mv.avisos[0].minutos, 30);
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `C:\Users\alexa\.deno\bin\deno.exe test lib/retrasos.test.ts`
Expected: FAIL. Los tests de `mover_reasignar` fallan porque la palanca no existe todavía
(`est.find(...)` devuelve `undefined` → los `assert(mv, ...)` revientan). Los tests previos
(`reasignar: *`, `solape: *`) deben seguir en PASS.

- [ ] **Step 3: Implementar la palanca**

En `lib/retrasos.ts`, insertar justo DESPUÉS de `estrategiaReasignar` (antes de
`export function calcularEstrategiasSolape`):

```ts
// Palanca F: mover la intrusa al hueco de OTRO profesional (su tiempo muerto o un hueco
// libre), a partir de su hora original. Cierra el ejemplo del informe "mover la cita a un
// empleado con tiempo muerto". Esquiva las citas Y los bloqueos del destino (RN-AG-010).
function estrategiaMoverAOtroProfesional(
  intrusa: CitaRetraso,
  reasignacion: ReasignacionOpts,
  ahoraMs: number,
  cierreMs: number,
): EstrategiaRetraso | null {
  if (intrusa.grupoId) return null; // no mover sola una cita encadenada
  const intrusaFases = fasesDe(intrusa);
  // Solo hacia adelante: no se adelanta a la clienta (y asi el primer hueco ES el mas cercano).
  const desde = Math.max(ahoraMs, intrusaFases.ini);

  const opciones: { cand: CandidatoReasignacion; slot: number; obst: Fases[] }[] = [];
  for (const c of reasignacion.candidatos) {
    if (!categoriaCumple(c.categoria, reasignacion.categoriaMinima)) continue;
    const obst = [...c.ocupacion.map(fasesDe), ...(c.bloqueos ?? []).map(fasesDeBloqueo)];
    const slot = buscarHueco(intrusaFases, obst, desde, cierreMs, false);
    if (slot == null) continue;
    if (hayColision([...obst, reubicar(intrusaFases, slot)])) continue;
    opciones.push({ cand: c, slot, obst });
  }
  if (opciones.length === 0) return null;

  // Mejor = hueco mas temprano; desempate por categoria cualificada mas baja, luego nombre.
  const mejor = opciones.slice().sort((a, b) => {
    if (a.slot !== b.slot) return a.slot - b.slot;
    const ia = CATEGORIA_ORDEN.indexOf((a.cand.categoria ?? '') as CategoriaProfesional);
    const ib = CATEGORIA_ORDEN.indexOf((b.cand.categoria ?? '') as CategoriaProfesional);
    return ia - ib || a.cand.nombre.localeCompare(b.cand.nombre);
  })[0];

  const nueva = reubicar(intrusaFases, mejor.slot);
  const update: UpdateRetraso = { ...toUpdate(intrusa, nueva), profesional_id: mejor.cand.id };
  const hora = new Date(mejor.slot).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const desplazoMin = Math.round((mejor.slot - intrusaFases.ini) / MIN);
  // Solo para redactar el resumen: el slot cae dentro del reposo de una cita del destino.
  const enReposo = mejor.obst.some(
    (o) => o.finE > o.finA && mejor.slot >= o.finA && mejor.slot < o.finE,
  );
  // Cuanto se alarga el dia del profesional DESTINO por acoger esta cita. No sirve cierreDelta:
  // castea updates por id contra la lista del profesional ORIGEN, y la intrusa deja de ser suya.
  const finesDestino = mejor.cand.ocupacion.map((c) => +new Date(c.fin));
  const retrasoCierreMin = finesDestino.length
    ? Math.max(0, Math.round((nueva.fin - Math.max(...finesDestino)) / MIN))
    : 0;
  const aviso: AvisoRetraso = {
    cita_id: intrusa.id,
    cliente: intrusa.cliente ?? null,
    telefono: intrusa.telefono ?? null,
    inicioNuevo: update.inicio,
    minutos: desplazoMin,
  };
  return {
    tipo: 'mover_reasignar',
    titulo: `Pasar a ${intrusa.cliente ?? 'la intrusa'} con ${mejor.cand.nombre}`,
    resumen: enReposo
      ? `${intrusa.cliente ?? 'La cita'} pasa a las ${hora} con ${mejor.cand.nombre}, aprovechando un tiempo muerto suyo; el resto del dia no se mueve.`
      : `${intrusa.cliente ?? 'La cita'} pasa a las ${hora} y la atiende ${mejor.cand.nombre}, que tiene el hueco libre; el resto del dia no se mueve.`,
    citasMovidas: 0,
    retrasoCierreMin,
    updates: [update],
    avisos: aviso.telefono ? [aviso] : [],
  };
}
```

- [ ] **Step 4: Enchufarla a la orquestación**

En `calcularEstrategiasSolape`, en el bloque de `push(...)`, sustituir la línea de `reasignacion`
por estas dos y actualizar el comentario de orden:

```ts
  // Orden de insercion = preferencia ante empate (reposo > hueco > reasignar > mover_reasignar
  // > adelantar > cascada). Mantener la hora de la clienta es preferible a moverla.
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, true));
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, false));
  if (opts?.reasignacion) {
    push(estrategiaReasignar(intrusa, opts.reasignacion));
    push(estrategiaMoverAOtroProfesional(intrusa, opts.reasignacion, ahoraMs, cierreMs));
  }
  push(estrategiaAdelantarFija(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs));
  push(estrategiaCascadaSolape(citasDelProfesional, intrusa, fija, cierreMs));
```

- [ ] **Step 5: Actualizar el comentario de cabecera del bloque de solapes**

En el comentario de bloque (~L482-489), sustituir la última frase
`Fuera de v1: compresion de servicios y reasignacion cross-profesional.` por:

```
// primera recomendada. Cada estrategia se calcula contra el estado REAL (aplicable por
// separado) y valida hayColision antes de emitirse. Fuera de v1: compresion de servicios.
```

- [ ] **Step 6: Ejecutar los tests**

Run: `C:\Users\alexa\.deno\bin\deno.exe test lib/retrasos.test.ts`
Expected: PASS en todos, incluidos los 9 nuevos de `mover_reasignar` y los previos de `reasignar`.

- [ ] **Step 7: Commit**

```bash
git add lib/retrasos.ts lib/retrasos.test.ts
git commit -m "feat(agenda): palanca mover_reasignar (hueco de otro profesional)"
```

---

### Task 3: Bloqueos en el orquestador

**Files:**
- Modify: `lib/organizarAgenda.ts`

- [ ] **Step 1: Añadir los bloqueos a las opciones de análisis**

En `lib/organizarAgenda.ts`, sustituir `export interface AnalisisAgendaOpts` (~L75) por:

```ts
// Bloqueo tal cual viene de la tabla bloqueos_profesional (no hace falta filtrarlos al dia:
// uno que no intersecta el dia nunca choca con un slot de ese dia).
export interface BloqueoOrganizar {
  profesional_id: string;
  inicio: string;
  fin: string;
}

export interface AnalisisAgendaOpts {
  ahoraMs?: number;
  umbralHuecoMin?: number;
  bloqueos?: BloqueoOrganizar[];
}
```

- [ ] **Step 2: Importar el tipo de candidato**

En el import de `./retrasos.ts` de `lib/organizarAgenda.ts`, añadir `type CandidatoReasignacion`
a la lista de imports existente.

- [ ] **Step 3: Usar el tipo en `detectarSolapes`**

Sustituir el parámetro `candidatos` de `detectarSolapes` (~L143) por:

```ts
  candidatos: CandidatoReasignacion[],
```

- [ ] **Step 4: Agrupar los bloqueos por profesional**

En `analizarAgendaDia`, justo después de `const activos = profesionales.filter((p) => p.activo !== false);`
(~L265), añadir:

```ts
  const bloqueosPorProf = new Map<string, { inicio: string; fin: string }[]>();
  for (const b of opts?.bloqueos ?? []) {
    const lista = bloqueosPorProf.get(b.profesional_id) ?? [];
    lista.push({ inicio: b.inicio, fin: b.fin });
    bloqueosPorProf.set(b.profesional_id, lista);
  }
```

- [ ] **Step 5: Inyectarlos en los candidatos**

Sustituir el `.map()` de construcción de `candidatos` (~L280) por:

```ts
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        categoria: p.categoria ?? null,
        ocupacion: (porProfesional.get(p.id) ?? []) as CitaRetraso[],
        bloqueos: bloqueosPorProf.get(p.id) ?? [],
      }));
```

- [ ] **Step 6: Verificar tests y typecheck**

Run: `C:\Users\alexa\.deno\bin\deno.exe test lib/retrasos.test.ts lib/organizarAgenda.test.ts`
Expected: PASS, salvo el fallo preexistente conocido del test "dia limpio" de `organizarAgenda`.

Run: `.\node_modules\.bin\tsc.cmd --noEmit`
Expected: 0 errores en `lib/`.

- [ ] **Step 7: Commit**

```bash
git add lib/organizarAgenda.ts
git commit -m "feat(agenda): threading de bloqueos del candidato en el orquestador"
```

---

### Task 4: Plumbing de datos (UI)

**Files:**
- Modify: `components/agenda/OrganizarAgendaPanel.web.tsx`
- Modify: `components/agenda/AgendaCalendar.web.tsx:3984`
- Modify: `lib/hooks/useAvisos.ts:177`

- [ ] **Step 1: Añadir la prop al panel**

En `OrganizarAgendaPanel.web.tsx`, dentro de `export interface OrganizarAgendaPanelProps` (~L60),
añadir tras la línea de `servicios`:

```ts
  bloqueos?: { profesional_id: string; inicio: string; fin: string }[];
```

- [ ] **Step 2: Recogerla en la desestructuración del componente**

Añadir `bloqueos` a la desestructuración de props del componente (junto a `servicios`, `negocioId`).

- [ ] **Step 3: Pasarla al análisis**

Sustituir la llamada a `analizarAgendaDia` (~L141) por:

```ts
  const problemas = useMemo(
    () => analizarAgendaDia(citasHoy, profesionales, { ahoraMs: ahoraOverrideMs, bloqueos }),
```

Añadir `bloqueos` al array de dependencias de ese `useMemo`.

- [ ] **Step 4: Pasar el estado desde AgendaCalendar**

En `AgendaCalendar.web.tsx`, en el render de `<OrganizarAgendaPanel` (~L3984), añadir la prop:

```tsx
          bloqueos={bloqueos}
```

`bloqueos` ya existe en el estado del componente (`const [bloqueos, setBloqueos] = useState<any[]>([])`,
~L403, poblado desde `bloqueos_profesional` con `select *`) — no hay que cargar nada nuevo.

- [ ] **Step 5: Cargar categoria de los profesionales en useAvisos**

Bug latente descubierto al escribir el plan: `useAvisos` carga los profesionales SIN su categoría,
así que `categoriaCumple(undefined, minima)` devolvería `false` y descartaría a todos los candidatos
en cuanto un servicio tuviera `categoria_minima`. Hoy no se nota (NULL en los 40 servicios), pero
haría que Avisos analizara distinto que el panel. En `lib/hooks/useAvisos.ts:122`, sustituir:

```ts
          supabase.from('profesionales').select('id, nombre').eq('negocio_id', negocioId).eq('activo', true),
```

por:

```ts
          supabase.from('profesionales').select('id, nombre, categoria').eq('negocio_id', negocioId).eq('activo', true),
```

- [ ] **Step 6: Cargar bloqueos en useAvisos**

En `lib/hooks/useAvisos.ts`, justo ANTES de la llamada a `analizarAgendaDia` (~L177), añadir. La
variable del negocio en scope se llama `negocioId` (definida en L83 desde `getUserProfile()`):

```ts
        const { data: bloqueosData } = await supabase
          .from('bloqueos_profesional')
          .select('profesional_id, inicio, fin')
          .eq('negocio_id', negocioId);
```

Y sustituir la llamada por:

```ts
        const problemas = analizarAgendaDia(citasOrganizar, profesionales, {
          ahoraMs: ahora.getTime(),
          bloqueos: bloqueosData ?? [],
        });
```

- [ ] **Step 7: Typecheck**

Run: `.\node_modules\.bin\tsc.cmd --noEmit`
Expected: 0 errores (ignorar `supabase/functions`). Si falta `@types/react-dom`, correr `npm install`
(ver memoria `reference_hairy_typecheck_command`).

- [ ] **Step 8: Commit**

```bash
git add components/agenda/OrganizarAgendaPanel.web.tsx components/agenda/AgendaCalendar.web.tsx lib/hooks/useAvisos.ts
git commit -m "feat(agenda): cablear bloqueos de profesional al organizador"
```

---

### Task 5: Verificación end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Suite completa de tests del motor**

Run: `C:\Users\alexa\.deno\bin\deno.exe test lib/retrasos.test.ts lib/organizarAgenda.test.ts`
Expected: PASS salvo el fallo preexistente conocido "dia limpio" de `organizarAgenda`.
Si falla algo MÁS que ese, parar y arreglar antes de seguir.

- [ ] **Step 2: Typecheck de la app**

Run: `.\node_modules\.bin\tsc.cmd --noEmit`
Expected: 0 errores en `app/`, `lib/`, `components/`.

- [ ] **Step 3: Build web**

Run: `npm run build:web`
Expected: build sin errores.

- [ ] **Step 4: Comprobación manual en el navegador**

Run: `node scripts/serve-web.mjs` y abrir `http://localhost:8080/app`.
En la agenda, provocar un solape (arrastrar una cita encima de otra del mismo profesional) con
otro profesional del salón ocupado a esa hora pero libre más tarde. Abrir el panel Organizar
agenda. Verificar: aparece la tarjeta "Pasar a <clienta> con <profesional>", y al aplicarla la
cita cambia de profesional Y de hora en el calendario.

- [ ] **Step 5: Verificar el undo**

Deshacer la acción desde el propio panel. Verificar que la cita vuelve a su profesional y hora
originales (el undo de `profesional_id` ya venía del slice 2).

---

## Fuera de alcance (no hacer en este plan)

Especialidades (ranking) · expansión de recurrencia de bloqueos · ventana de jornada real de
`negocio_horarios` · compresión de servicios · cambios de diseño en `RetrasoEstrategiasModal`
(es genérico y pinta cualquier estrategia por su `tipo`).
