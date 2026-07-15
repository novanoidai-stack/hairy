# Solapes multi-solución — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un solape de citas del mismo profesional ofrezca varias estrategias de resolución (no una), aplicables a 1 clic.

**Architecture:** Nueva función pura `calcularEstrategiasSolape` en `lib/retrasos.ts` (junto a `calcularEstrategiasRetraso`), que genera hasta 4 palancas de reposicionamiento puro reutilizando las primitivas de fase existentes. `detectarSolapes` en `lib/organizarAgenda.ts` deja de construir la estrategia inline y delega en ella. La UI (`RetrasoEstrategiasModal`) ya pinta un array de `EstrategiaRetraso` → sin cambios de UI.

**Tech Stack:** TypeScript puro (mismas primitivas para app/Metro y `deno test`). Tests con `deno test`.

Spec: `docs/superpowers/specs/2026-07-15-solapes-multi-solucion-design.md`

---

### Task 1: Tests unitarios de `calcularEstrategiasSolape` (rojo)

**Files:**
- Modify: `lib/retrasos.test.ts` (añadir import + bloque de tests al final)

- [ ] **Step 1: Añadir `calcularEstrategiasSolape` al import de tests**

En `lib/retrasos.test.ts`, en el bloque `import { ... } from './retrasos.ts';` (líneas 6-13), añade la función:

```ts
import {
  proponerRetrasoPorCita,
  construirUpdatesRetraso,
  calcularEstrategiasRetraso,
  calcularEstrategiasSolape,
  duracionRealAprendida,
  mejorAlternativaSlot,
  type CitaRetraso,
} from './retrasos.ts';
```

- [ ] **Step 2: Añadir los tests al final de `lib/retrasos.test.ts`**

```ts
// Helper local: ms de una hora del dia base D.
function msD(h: number, m = 0): number {
  return +new Date(iso(h, m));
}

Deno.test('solape: ofrece mover la intrusa y adelantar la fija; recomienda la de menor disrupcion', () => {
  // A 10:00-11:00 (fija), B 10:30-11:00 (intrusa) chocan.
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30)];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const tipos = est.map((e) => e.tipo).sort();
  assertEquals(tipos, ['adelantar_otra', 'mover_hueco']);
  // Recomendada unica y primera.
  assertEquals(est.filter((e) => e.recomendada).length, 1);
  assert(est[0].recomendada);
  // La recomendada adelanta la fija A a las 9:00 (0 min de retraso de cierre).
  assertEquals(est[0].tipo, 'adelantar_otra');
  assertEquals(est[0].updates[0].id, 'A');
  assertEquals(est[0].updates[0].inicio, iso(9, 0));
  // La otra mueve la intrusa B al hueco de las 11:00.
  const hueco = est.find((e) => e.tipo === 'mover_hueco')!;
  assertEquals(hueco.updates[0].id, 'B');
  assertEquals(hueco.updates[0].inicio, iso(11, 0));
});

Deno.test('solape: si la intrusa cabe en un reposo de otra cita, lo ofrece (y deduplica el hueco identico)', () => {
  // A activa 10:00-10:20, reposo hasta 11:00, fin 11:15. B 10:10-10:30 choca con la activa de A.
  const citas = [
    cita('A', 10, 0, 75, { fin_activa: iso(10, 20), fin_espera: iso(11, 0) }),
    cita('B', 10, 10, 20),
  ];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const reposo = est.find((e) => e.tipo === 'aprovechar_reposo');
  assert(reposo, 'debe ofrecer aprovechar_reposo');
  assertEquals(reposo!.updates[0].id, 'B');
  // Primer slot alineado a 15 min dentro del reposo [10:20, 11:00) que no pisa la activa de A.
  assertEquals(reposo!.updates[0].inicio, iso(10, 30));
  // Tipos unicos (keys del modal): ninguna estrategia repite tipo.
  assertEquals(new Set(est.map((e) => e.tipo)).size, est.length);
  // El hueco que caeria en el mismo slot que el reposo se deduplica.
  assertEquals(est.filter((e) => e.updates[0].id === 'B' && e.updates[0].inicio === iso(10, 30)).length, 1);
});

Deno.test('solape: la cascada arrastra las citas siguientes cuando hace falta', () => {
  // A 10:00-11:00 (fija), B 10:30-11:00 (intrusa), C 11:00-11:30 pegada detras de B.
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30), cita('C', 11, 0, 30)];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  const cascada = est.find((e) => e.tipo === 'cascada');
  assert(cascada, 'debe ofrecer cascada');
  assert(cascada!.citasMovidas >= 1);
  // La cascada recoloca B y C.
  const ids = cascada!.updates.map((u) => u.id).sort();
  assertEquals(ids, ['B', 'C']);
});

Deno.test('solape: una intrusa encadenada (grupoId) no se mueve sola', () => {
  const citas = [cita('A', 10, 0, 60), cita('B', 10, 30, 30, { grupoId: 'cadena-1' })];
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(9, 0) });
  // Ninguna estrategia toca la cita B (encadenada); solo cabe adelantar la fija A.
  assert(est.every((e) => e.updates.every((u) => u.id !== 'B')));
  assert(est.some((e) => e.tipo === 'adelantar_otra'));
});

Deno.test('solape: sin ninguna salida (ambas encadenadas, sin adelanto posible) devuelve []', () => {
  const citas = [
    cita('A', 10, 0, 60, { grupoId: 'cad-A' }),
    cita('B', 10, 30, 30, { grupoId: 'cad-B' }),
  ];
  // Ambas encadenadas: no se puede mover sola ni la intrusa (hueco/reposo/cascada) ni la fija (adelantar).
  const est = calcularEstrategiasSolape(citas, 'B', 'A', { ahoraMs: msD(10, 30) });
  assertEquals(est.length, 0);
});
```

- [ ] **Step 3: Ejecutar los tests y verificar que FALLAN**

Run: `cd Hairy && deno test lib/retrasos.test.ts`
Expected: FAIL — `calcularEstrategiasSolape` no existe todavía (error de import/símbolo).

---

### Task 2: Implementar `calcularEstrategiasSolape` + tipo `adelantar_otra` (verde)

**Files:**
- Modify: `lib/retrasos.ts` (union `EstrategiaTipo` en líneas 172-176; añadir función y helpers tras `calcularEstrategiasRetraso`, ~línea 476)

- [ ] **Step 1: Añadir `'adelantar_otra'` a la unión `EstrategiaTipo`**

Reemplaza el bloque de líneas 172-176 en `lib/retrasos.ts`:

```ts
export type EstrategiaTipo =
  | 'cascada'
  | 'mover_hueco'
  | 'aprovechar_reposo'
  | 'adelantar_otra'
  | 'pedir_retraso_siguiente';
```

- [ ] **Step 2: Añadir la función y sus helpers justo después de `calcularEstrategiasRetraso`**

Inserta este bloque tras el cierre de `calcularEstrategiasRetraso` (tras la línea 476 `}`), antes de la sección "Duracion real aprendida":

```ts
// =====================================================================================
// Estrategias para un SOLAPE activa-activa entre 'fija' (empieza antes) e 'intrusa'
// (empieza despues). Espeja calcularEstrategiasRetraso: varias palancas de
// reposicionamiento PURO, cada una con tipo unico, ordenadas por menor disrupcion, la
// primera recomendada. Cada estrategia se calcula contra el estado REAL (aplicable por
// separado) y valida hayColision antes de emitirse. Fuera de v1: compresion de servicios
// y reasignacion cross-profesional.
// =====================================================================================

// Palanca A/B: mueve solo la INTRUSA a un hueco (soloReposo=false) o dentro de un reposo
// de otra cita (soloReposo=true); la fija y el resto se quedan.
function estrategiaMoverIntrusa(
  citas: CitaRetraso[],
  intrusa: CitaRetraso,
  fija: CitaRetraso,
  ahoraMs: number,
  cierreMs: number,
  soloReposo: boolean,
): EstrategiaRetraso | null {
  if (intrusa.grupoId) return null; // no mover sola una cita encadenada
  const intrusaFases = fasesDe(intrusa);
  const obst = citas.filter((c) => c.id !== intrusa.id).map(fasesDe);
  const desde = Math.max(ahoraMs, +new Date(fija.inicio));
  const slot = buscarHueco(intrusaFases, obst, desde, cierreMs, soloReposo);
  if (slot == null) return null;
  const nueva = reubicar(intrusaFases, slot);
  if (hayColision([...obst, nueva])) return null;
  const update = toUpdate(intrusa, nueva);
  const hora = new Date(slot).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const desplazoMin = Math.round((slot - intrusaFases.ini) / MIN);
  const aviso: AvisoRetraso = {
    cita_id: intrusa.id,
    cliente: intrusa.cliente ?? null,
    telefono: intrusa.telefono ?? null,
    inicioNuevo: update.inicio,
    minutos: desplazoMin,
  };
  return {
    tipo: soloReposo ? 'aprovechar_reposo' : 'mover_hueco',
    titulo: soloReposo
      ? `Atender a ${intrusa.cliente ?? 'la intrusa'} en un reposo`
      : `Mover a ${intrusa.cliente ?? 'la intrusa'} a otro hueco`,
    resumen: soloReposo
      ? `Aprovechas un tiempo muerto: ${intrusa.cliente ?? 'la cita'} pasa a las ${hora} (durante un reposo) y el resto del dia no se mueve.`
      : `${intrusa.cliente ?? 'La cita'} pasa a las ${hora} y el resto del dia se mantiene.`,
    citasMovidas: 0,
    retrasoCierreMin: cierreDelta(citas, [update]),
    updates: [update],
    avisos: aviso.telefono ? [aviso] : [],
  };
}

// Palanca C: adelanta la cita FIJA (la que empieza antes) para dejar sitio; la intrusa se
// queda. Solo se emite si hay hueco anterior real (el slot resultante adelanta a la fija).
function estrategiaAdelantarFija(
  citas: CitaRetraso[],
  intrusa: CitaRetraso,
  fija: CitaRetraso,
  ahoraMs: number,
  cierreMs: number,
): EstrategiaRetraso | null {
  if (fija.grupoId) return null;
  const fijaFases = fasesDe(fija);
  const obst = citas.filter((c) => c.id !== fija.id).map(fasesDe);
  const slot = buscarHueco(fijaFases, obst, ahoraMs, cierreMs, false);
  if (slot == null || slot >= fijaFases.ini) return null; // solo cuenta si ADELANTA
  const nueva = reubicar(fijaFases, slot);
  if (hayColision([...obst, nueva])) return null;
  const update = toUpdate(fija, nueva);
  const hora = new Date(slot).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const desplazoMin = Math.round((slot - fijaFases.ini) / MIN); // negativo (adelanto)
  const aviso: AvisoRetraso = {
    cita_id: fija.id,
    cliente: fija.cliente ?? null,
    telefono: fija.telefono ?? null,
    inicioNuevo: update.inicio,
    minutos: desplazoMin,
  };
  return {
    tipo: 'adelantar_otra',
    titulo: `Adelantar a ${fija.cliente ?? 'la otra cita'}`,
    resumen: `${fija.cliente ?? 'La otra cita'} se adelanta a las ${hora} para dejar sitio; ${intrusa.cliente ?? 'la intrusa'} se queda a su hora.`,
    citasMovidas: 0,
    retrasoCierreMin: cierreDelta(citas, [update]),
    updates: [update],
    avisos: aviso.telefono ? [aviso] : [],
  };
}

// Palanca D: empuja la intrusa (y las citas pegadas detras) lo justo para deshacer el
// choque. Fallback seguro; envuelve el motor de cascada existente.
function estrategiaCascadaSolape(
  citas: CitaRetraso[],
  intrusa: CitaRetraso,
  fija: CitaRetraso,
  cierreMs: number,
): EstrategiaRetraso | null {
  if (intrusa.grupoId) return null; // no mover sola una cita encadenada
  const fijaFases = fasesDe(fija);
  const intrusaFases = fasesDe(intrusa);
  const step = SLOT_MIN * MIN;
  let minutos = 0;
  for (let extra = step; intrusaFases.ini + extra <= cierreMs; extra += step) {
    if (!chocaActivaActiva(fijaFases, reubicar(intrusaFases, intrusaFases.ini + extra))) {
      minutos = Math.round(extra / MIN);
      break;
    }
  }
  if (minutos <= 0) return null;
  const prop = proponerRetrasoPorCita(citas, intrusa.id, minutos);
  if (prop.items.length === 0) return null;
  const updates = construirUpdatesRetraso(prop, citas);
  const otras = prop.items.filter((it) => it.cita_id !== intrusa.id);
  const avisos: AvisoRetraso[] = otras
    .filter((it) => it.telefono)
    .map((it) => ({
      cita_id: it.cita_id,
      cliente: it.cliente,
      telefono: it.telefono,
      inicioNuevo: it.inicioNuevo,
      minutos: it.empujeMin,
    }));
  return {
    tipo: 'cascada',
    titulo: 'Empujar todo en cascada',
    resumen:
      otras.length === 0
        ? `${intrusa.cliente ?? 'La cita'} se retrasa lo justo para no solaparse; el resto del dia se mantiene.`
        : `${intrusa.cliente ?? 'La cita'} y ${otras.length} cita${otras.length > 1 ? 's' : ''} siguiente${otras.length > 1 ? 's' : ''} se recolocan.`,
    citasMovidas: otras.length,
    retrasoCierreMin: cierreDelta(citas, updates),
    updates,
    avisos,
  };
}

export function calcularEstrategiasSolape(
  citasDelProfesional: CitaRetraso[],
  intrusaId: string,
  fijaId: string,
  opts?: { cierreMs?: number; ahoraMs?: number },
): EstrategiaRetraso[] {
  const intrusa = citasDelProfesional.find((c) => c.id === intrusaId);
  const fija = citasDelProfesional.find((c) => c.id === fijaId);
  if (!intrusa || !fija) return [];

  const ahoraMs = opts?.ahoraMs ?? Date.now();
  const cierreMs = opts?.cierreMs ?? cierreDefault(citasDelProfesional);

  const raw: EstrategiaRetraso[] = [];
  const push = (e: EstrategiaRetraso | null) => {
    if (e) raw.push(e);
  };
  // Orden de insercion = preferencia ante empate (reposo > hueco > adelantar > cascada).
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, true));
  push(estrategiaMoverIntrusa(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs, false));
  push(estrategiaAdelantarFija(citasDelProfesional, intrusa, fija, ahoraMs, cierreMs));
  push(estrategiaCascadaSolape(citasDelProfesional, intrusa, fija, cierreMs));

  // Dedup: quita estrategias cuyo efecto (updates) ya produce otra anterior. Garantiza
  // ademas tipos unicos por lista (keys del RetrasoEstrategiasModal).
  const seen = new Set<string>();
  const out: EstrategiaRetraso[] = [];
  for (const e of raw) {
    const sig = e.updates.map((u) => `${u.id}@${u.inicio}`).sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(e);
  }

  out.sort((a, b) => a.citasMovidas - b.citasMovidas || a.retrasoCierreMin - b.retrasoCierreMin);
  if (out.length > 0) out[0].recomendada = true;
  return out;
}
```

- [ ] **Step 3: Ejecutar los tests unitarios y verificar que PASAN**

Run: `cd Hairy && deno test lib/retrasos.test.ts`
Expected: PASS (todos, incluidos los 5 nuevos de solape).

- [ ] **Step 4: Commit**

```bash
cd Hairy
git add lib/retrasos.ts lib/retrasos.test.ts
git commit -m "feat(agenda): calcularEstrategiasSolape (multiples soluciones por solape)"
```

---

### Task 3: Delegar en `detectarSolapes` + actualizar test de integración

**Files:**
- Modify: `lib/organizarAgenda.ts` (import línea 24-36; función `detectarSolapes` líneas 136-183)
- Modify: `lib/organizarAgenda.test.ts` (test de solape líneas 88-96)

- [ ] **Step 1: Añadir `calcularEstrategiasSolape` al import de `retrasos.ts`**

En `lib/organizarAgenda.ts`, en el bloque `import { ... } from './retrasos.ts';` (líneas 24-36), añade la función a la lista existente:

```ts
import {
  type CitaRetraso,
  type UpdateRetraso,
  type EstrategiaRetraso,
  type Fases,
  calcularEstrategiasRetraso,
  calcularEstrategiasSolape,
  fasesDe,
  chocaActivaActiva,
  reubicar,
  toUpdate,
  buscarHueco,
  hayColision,
} from './retrasos.ts';
```

- [ ] **Step 2: Reescribir `detectarSolapes` para delegar la generación de estrategias**

Reemplaza la función completa `detectarSolapes` (líneas 136-183) por:

```ts
// --- 2) Solape activa-activa: estado inconsistente (no deberia ocurrir, pero si
//        aparece hay que poder arreglarlo desde aqui). Por cada par que choca, la
//        que empieza antes es la 'fija' y la de despues la 'intrusa'; delega en
//        calcularEstrategiasSolape las multiples formas de resolverlo. ---
function detectarSolapes(citasProf: CitaOrganizar[], ahoraMs: number, cierreMs: number): ProblemaAgenda[] {
  const problemas: ProblemaAgenda[] = [];
  const resueltas = new Set<string>();
  const fases = citasProf.map(fasesDe);

  for (let i = 0; i < citasProf.length; i++) {
    for (let j = i + 1; j < citasProf.length; j++) {
      if (resueltas.has(citasProf[i].id) || resueltas.has(citasProf[j].id)) continue;
      if (!chocaActivaActiva(fases[i], fases[j])) continue;

      const [fijaIdx, intrusaIdx] = fases[i].ini <= fases[j].ini ? [i, j] : [j, i];
      const fija = citasProf[fijaIdx];
      const intrusa = citasProf[intrusaIdx];

      const estrategias = calcularEstrategiasSolape(citasProf, intrusa.id, fija.id, { cierreMs, ahoraMs });
      if (estrategias.length === 0) continue;

      resueltas.add(intrusa.id);
      problemas.push({
        id: `solape:${intrusa.id}`,
        tipo: 'solape',
        profesionalId: intrusa.profesional_id,
        profesionalNombre: '',
        titulo: 'Dos citas se solapan',
        descripcion: `${intrusa.cliente ?? 'Una cita'} choca con ${fija.cliente ?? 'otra cita'}. Hay ${estrategias.length} forma${estrategias.length > 1 ? 's' : ''} de resolverlo.`,
        citaIds: [intrusa.id, fija.id],
        estrategias,
      });
    }
  }
  return problemas;
}
```

- [ ] **Step 3: Actualizar el test de integración de solape**

En `lib/organizarAgenda.test.ts`, reemplaza el test de las líneas 88-96 por:

```ts
Deno.test('solape: dos citas activas que chocan ofrecen varias estrategias con tipos unicos', () => {
  const citas = [cita('A', 'P5', 10, 0, 60), cita('B', 'P5', 10, 30, 30)];
  const problemas = analizarAgendaDia(citas, PROFS, { ahoraMs: ms(9, 0) });
  assertEquals(problemas.length, 1);
  assertEquals(problemas[0].tipo, 'solape');
  assertEquals(problemas[0].citaIds.sort(), ['A', 'B']);
  // Varias estrategias, tipos unicos (keys del modal), exactamente una recomendada.
  assert(problemas[0].estrategias.length >= 2);
  assertEquals(
    new Set(problemas[0].estrategias.map((e) => e.tipo)).size,
    problemas[0].estrategias.length,
  );
  assertEquals(problemas[0].estrategias.filter((e) => e.recomendada).length, 1);
  assert(problemas[0].estrategias.some((e) => e.tipo === 'mover_hueco'));
  assert(problemas[0].estrategias.some((e) => e.tipo === 'adelantar_otra'));
});
```

- [ ] **Step 4: Ejecutar ambos ficheros de test y verificar que PASAN**

Run: `cd Hairy && deno test lib/organizarAgenda.test.ts lib/retrasos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
cd Hairy
git add lib/organizarAgenda.ts lib/organizarAgenda.test.ts
git commit -m "feat(agenda): detectarSolapes delega en calcularEstrategiasSolape"
```

---

### Task 4: Verificación final (typecheck + suite completa)

**Files:** ninguno nuevo (solo verificación).

- [ ] **Step 1: Typecheck de la app (ignorar Deno de supabase/functions)**

Run: `cd Hairy && ./node_modules/.bin/tsc.cmd --noEmit`
Expected: 0 errores fuera de `supabase/functions` (los de esa carpeta son Deno y se ignoran).

- [ ] **Step 2: Ejecutar toda la suite de tests Deno de lib**

Run: `cd Hairy && deno test lib/`
Expected: PASS (todos los ficheros `*.test.ts`).

- [ ] **Step 3: Si algo quedó sin commitear, commit final**

```bash
cd Hairy
git status --short
# si hay cambios: git add -A && git commit -m "chore(agenda): cierre slice solapes multi-solucion"
```

---

## Notas de verificación (self-review)

- **Cobertura del spec:** las 4 palancas (mover_hueco, aprovechar_reposo, adelantar_otra, cascada) → Task 2; delegación de `detectarSolapes` + `ProblemaAgenda.estrategias` → Task 3; tipo nuevo `adelantar_otra` → Task 2 Step 1; invariantes (estado real, `hayColision`, `grupoId`, ranking, tipos únicos, dedup) → Task 2; testing (los 8 casos del spec, condensados en 5 unitarios + 1 integración) → Tasks 1 y 3.
- **Sin placeholders:** todo el código (tests e implementación) está completo.
- **Consistencia de tipos:** `calcularEstrategiasSolape(citas, intrusaId, fijaId, opts)` con el mismo nombre y firma en test (Task 1), implementación (Task 2) y consumidor (Task 3). `EstrategiaTipo` incluye `adelantar_otra` antes de usarse.
- **Primitivas usadas** (`MIN`, `SLOT_MIN`, `cierreDefault`, `cierreDelta`, `fasesDe`, `chocaActivaActiva`, `hayColision`, `reubicar`, `toUpdate`, `buscarHueco`, `proponerRetrasoPorCita`, `construirUpdatesRetraso`) son todas del propio `lib/retrasos.ts`, disponibles en el mismo módulo.
