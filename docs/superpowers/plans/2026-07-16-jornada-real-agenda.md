# Jornada real del negocio en el organizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el organizador acote sus propuestas al horario real del salon (`negocio_horarios`)
en vez de a las constantes globales 09:00-20:00.

**Architecture:** `ventanaDelDia()` en `organizarAgenda.ts` resuelve `[aperturaMs, cierreMs]` del dia
leyendo `negocio_horarios` (con fallback a las constantes actuales). La ventana se propaga a las
palancas de `retrasos.ts`, que hoy solo reciben `cierreMs`; cada `buscarHueco` pasa a acotar tambien
por abajo con `aperturaMs`.

**Tech Stack:** TypeScript puro, tests Deno, Expo/RN Web para el plumbing.

**Spec:** `docs/superpowers/specs/2026-07-16-jornada-real-agenda-design.md`

**Comandos:**
- Tests: `& "C:\Users\alexa\.deno\bin\deno.exe" test lib/retrasos.test.ts lib/organizarAgenda.test.ts`
- Typecheck: `npx tsc --noEmit` (ignorar `supabase/functions`)
- Build: `npm run build:web`
- Ojo: `cd Hairy` primero (hay un package.json suelto en `Desktop\Projects`).
- Fallo preexistente conocido y NO relacionado: test "dia limpio" de `organizarAgenda.test.ts`.
- Errores de typecheck preexistentes: los 2 de `PapeleraModal.web.tsx`.

**Reglas del repo:** sin emojis. Codigo en ingles, comentarios en espanol. Nada que no pida el plan.

**EL PUNTO CRITICO:** `negocio_horarios.dia_semana` es **0 = LUNES ... 6 = DOMINGO**.
`Date.getDay()` es **0 = domingo**. Mapear siempre `(getDay() + 6) % 7`. La Task 2 existe para
blindar esto con un test.

---

## File Structure

| Archivo | Responsabilidad | Accion |
|---|---|---|
| `lib/organizarAgenda.ts` | `ventanaDelDia`, tipos, propagacion de la ventana | Modificar |
| `lib/retrasos.ts` | Palancas: acotar `buscarHueco` por `aperturaMs` | Modificar |
| `lib/organizarAgenda.test.ts` | Tests de ventana + mapeo de dia | Modificar |
| `components/agenda/OrganizarAgendaPanel.web.tsx` | Prop `horarios` | Modificar |
| `components/agenda/AgendaCalendar.web.tsx` | Cargar y pasar `negocio_horarios` | Modificar |
| `lib/hooks/useAvisos.ts` | Cargar y pasar `negocio_horarios` | Modificar |

---

### Task 1: `aperturaMs` en las palancas de `retrasos.ts`

**Files:**
- Modify: `lib/retrasos.ts`

- [ ] **Step 1: Anadir `aperturaMs` a las opciones**

Sustituir `export interface EstrategiasOpts` (~L203) por:

```ts
export interface EstrategiasOpts {
  cierreMs?: number; // instante de cierre del dia (ms). Default: ultimo fin + 3h.
  aperturaMs?: number; // instante de apertura (ms). Default: sin restriccion por abajo.
}
```

- [ ] **Step 2: `estrategiaMoverUna` acota por abajo**

En `estrategiaMoverUna` (~L406), sustituir:

```ts
  const cierreMs = opts?.cierreMs ?? cierreDefault(citas);
  const desde = marcadaFases.ini + minutos * MIN; // no antes de que empiece el retraso
```

por:

```ts
  const cierreMs = opts?.cierreMs ?? cierreDefault(citas);
  // no antes de que empiece el retraso, ni antes de que abra el salon (RN-AG-010)
  const desde = Math.max(marcadaFases.ini + minutos * MIN, opts?.aperturaMs ?? -Infinity);
```

- [ ] **Step 3: `estrategiaMoverIntrusa` acota por abajo**

Anadir `aperturaMs: number` como ultimo parametro de `estrategiaMoverIntrusa` (~L493) y sustituir
la linea del `desde` (~L534):

```ts
  const desde = Math.max(ahoraMs, +new Date(fija.inicio), aperturaMs);
```

- [ ] **Step 4: `estrategiaAdelantarFija` acota por abajo**

Es la mas afectada: hoy busca desde `ahoraMs` y puede adelantar una cita a antes de abrir.
Anadir `aperturaMs: number` como ultimo parametro (~L568) y sustituir (~L576):

```ts
  const slot = buscarHueco(fijaFases, obst, Math.max(ahoraMs, aperturaMs), cierreMs, false);
```

- [ ] **Step 5: `estrategiaMoverAOtroProfesional` acota por abajo**

Anadir `aperturaMs: number` como ultimo parametro y sustituir su `desde`:

```ts
  // Solo hacia adelante: no se adelanta a la clienta (y asi el primer hueco ES el mas cercano).
  const desde = Math.max(ahoraMs, intrusaFases.ini, aperturaMs);
```

- [ ] **Step 6: Propagar en `calcularEstrategiasSolape`**

Anadir `aperturaMs?: number;` al `opts` de `calcularEstrategiasSolape`, y al principio del cuerpo
(junto a `ahoraMs`/`cierreMs`):

```ts
  const aperturaMs = opts?.aperturaMs ?? -Infinity;
```

Pasarlo como ultimo argumento a las 4 llamadas del bloque `push(...)`:
`estrategiaMoverIntrusa(..., cierreMs, true, aperturaMs)`,
`estrategiaMoverIntrusa(..., cierreMs, false, aperturaMs)`,
`estrategiaMoverAOtroProfesional(intrusa, opts.reasignacion, ahoraMs, cierreMs, aperturaMs)`,
`estrategiaAdelantarFija(..., cierreMs, aperturaMs)`.

`estrategiaCascadaSolape` NO cambia: no busca hueco, solo empuja.

- [ ] **Step 7: Tests de regresion**

Run: `& "C:\Users\alexa\.deno\bin\deno.exe" test lib/retrasos.test.ts`
Expected: PASS 29/29. Sin `aperturaMs`, el default `-Infinity` deja `Math.max` igual que antes.

- [ ] **Step 8: Commit**

```bash
git add lib/retrasos.ts
git commit -m "feat(agenda): aperturaMs acota las palancas por abajo"
```

---

### Task 2: `ventanaDelDia` y el mapeo de dia (TDD)

**Files:**
- Modify: `lib/organizarAgenda.ts`
- Test: `lib/organizarAgenda.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Al final de `lib/organizarAgenda.test.ts`. Nota: `D = '2026-07-08'` es **miercoles**, asi que
`dia_semana` = 2 con el mapeo correcto. Los helpers `cita`, `iso`, `ms` ya existen; `iso` acepta un
tercer parametro `dia` para fechas distintas de `D`.

```ts
// --- Jornada real del negocio (negocio_horarios) ---
// OJO: dia_semana es 0=LUNES..6=DOMINGO; Date.getDay() es 0=domingo. Mapeo: (getDay()+6)%7.

const H_9_20 = (dia: number) => ({ dia_semana: dia, abierto: true, apertura: '09:00', cierre: '20:00' });

Deno.test('jornada: usa el horario del dia correcto (0=lunes, no 0=domingo)', () => {
  // 2026-07-12 es DOMINGO -> dia_semana 6 con el mapeo correcto. El lunes (fila 0) cierra a las
  // 23:00; el domingo (fila 6) esta cerrado -> fallback 09:00-20:00.
  // Las citas van al FINAL del dia a proposito: el unico hueco para la intrusa es a las 20:00
  // (tras A), que cabe con el cierre del lunes (23:00) pero NO con el fallback del domingo
  // (20:00, la intrusa acabaria a las 20:30). Asi el test discrimina de verdad:
  //   - mapeo correcto -> fila 6 -> cierre 20:00 -> no se propone nada que pase de las 20:00.
  //   - getDay() sin mapear -> fila 0 (lunes) -> cierre 23:00 -> propone 20:00-20:30 -> FALLA.
  const DOM = '2026-07-12';
  const citas = [
    { ...cita('A', 'P1', 19, 0, 60), inicio: iso(19, 0, DOM), fin: iso(20, 0, DOM) },
    { ...cita('B', 'P1', 19, 30, 30), inicio: iso(19, 30, DOM), fin: iso(20, 0, DOM) },
  ];
  const horarios = [
    { dia_semana: 0, abierto: true, apertura: '09:00', cierre: '23:00' }, // lunes: cierra tardisimo
    { dia_semana: 6, abierto: false, apertura: null, cierre: null },      // domingo: cerrado
  ];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], {
    ahoraMs: ms(9, 0, DOM),
    horarios,
  });
  const solape = problemas.find((p) => p.tipo === 'solape');
  assert(solape, 'debe detectar el solape');
  // Ningun update puede caer despues de las 20:00 (fallback del domingo).
  for (const e of solape!.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.fin) <= +new Date(iso(20, 0, DOM)), `${e.tipo} propone fin ${u.fin}, pasa de las 20:00`);
    }
  }
});

Deno.test('jornada: sabado corto (cierre 14:00) no propone nada despues', () => {
  // D = 2026-07-08 es miercoles -> dia_semana 2.
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:00', cierre: '14:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  for (const e of solape.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.fin) <= +new Date(iso(14, 0)), `${e.tipo} propone fin ${u.fin}, pasa de las 14:00`);
    }
  }
});

Deno.test('jornada: cierre a las 21:00 permite huecos que la constante de las 20:00 tapaba', () => {
  // Dia lleno de 09:00 a 20:00 salvo un hueco al final: con cierre 21:00 la intrusa cabe a las 20:00.
  const citas = [
    cita('A', 'P1', 19, 0, 60),  // 19:00-20:00
    cita('B', 'P1', 19, 30, 30), // intrusa 19:30-20:00
  ];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '07:00', cierre: '21:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  const mover = solape.estrategias.find((e) => e.tipo === 'mover_hueco');
  assert(mover, 'con cierre 21:00 debe caber mover la intrusa a las 20:00');
  assertEquals(mover!.updates[0].inicio, iso(20, 0));
});

Deno.test('jornada: apertura 09:30 impide adelantar una cita a las 09:00', () => {
  // Hueco libre antes de las 10:00, pero el salon abre a las 09:30.
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:30', cierre: '20:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(8, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  for (const e of solape.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.inicio) >= +new Date(iso(9, 30)), `${e.tipo} propone inicio ${u.inicio}, antes de abrir`);
    }
  }
});

Deno.test('jornada: sin horarios en opts, comportamiento identico al actual', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const conNada = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0) });
  const conVacio = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios: [] });
  assertEquals(JSON.stringify(conNada), JSON.stringify(conVacio));
  assert(conNada.length > 0, 'debe seguir detectando el solape');
});

Deno.test('jornada: abierto=false con citas ese dia cae al fallback y sigue habiendo estrategias', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: false, apertura: null, cierre: null }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape');
  assert(solape, 'apertura excepcional: debe seguir pudiendo reorganizarse');
  assert(solape!.estrategias.length > 0);
});

Deno.test('jornada: acepta el formato HH:MM:SS que devuelve Postgres', () => {
  const citas = [cita('A', 'P1', 10, 0, 60), cita('B', 'P1', 10, 30, 30)];
  const horarios = [{ dia_semana: 2, abierto: true, apertura: '09:00:00', cierre: '14:00:00' }];
  const problemas = analizarAgendaDia(citas, [{ id: 'P1', nombre: 'Ana' }], { ahoraMs: ms(9, 0), horarios });
  const solape = problemas.find((p) => p.tipo === 'solape')!;
  for (const e of solape.estrategias) {
    for (const u of e.updates) {
      assert(+new Date(u.fin) <= +new Date(iso(14, 0)), `${e.tipo} ignora el cierre en HH:MM:SS`);
    }
  }
});
```

- [ ] **Step 2: Ejecutar para verificar que fallan**

Run: `& "C:\Users\alexa\.deno\bin\deno.exe" test lib/organizarAgenda.test.ts`
Expected: FAIL. `analizarAgendaDia` no acepta `horarios` todavia (error de tipo en `deno test`,
que typechequea). Los tests de fallback pueden pasar en vacio; los de horario real, no.

- [ ] **Step 3: Tipos y helper**

En `lib/organizarAgenda.ts`, sustituir el import de constants:

```ts
import { HORARIO_APERTURA, HORARIO_CIERRE } from './constants.ts';
```

Anadir junto a `BloqueoOrganizar`:

```ts
// Fila cruda de negocio_horarios. OJO: dia_semana es 0 = LUNES ... 6 = DOMINGO (ver DAY_LABELS
// en configuracion.web.tsx), mientras que Date.getDay() es 0 = domingo. De ahi el (+6) % 7.
export interface HorarioNegocio {
  dia_semana: number;
  abierto: boolean;
  apertura: string | null; // 'HH:MM' o 'HH:MM:SS'
  cierre: string | null;
}

export interface JornadaDia {
  aperturaMs: number;
  cierreMs: number;
}
```

Y anadir `horarios?: HorarioNegocio[];` a `AnalisisAgendaOpts`.

- [ ] **Step 4: Implementar `ventanaDelDia` y retirar `cierreDelDia`**

Sustituir la funcion `cierreDelDia` (~L90) por:

```ts
// 'HH:MM' o 'HH:MM:SS' -> ms sobre la fecha de referencia (hora local del salon).
function horaSobreFecha(fechaRefIso: string, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(fechaRefIso);
  d.setHours(h, min, 0, 0);
  return d.getTime();
}

// Ventana [apertura, cierre] del dia. Fallback a las constantes globales cuando no hay horario
// util: sin fila, dia cerrado (apertura excepcional: mejor reorganizar que no ofrecer nada),
// campos a NULL, formato invalido o cierre <= apertura.
function ventanaDelDia(fechaRefIso: string, horarios?: HorarioNegocio[]): JornadaDia {
  const porDefecto = (): JornadaDia => {
    const a = new Date(fechaRefIso);
    a.setHours(HORARIO_APERTURA.horas, HORARIO_APERTURA.minutos, 0, 0);
    const c = new Date(fechaRefIso);
    c.setHours(HORARIO_CIERRE.horas, HORARIO_CIERRE.minutos, 0, 0);
    return { aperturaMs: a.getTime(), cierreMs: c.getTime() };
  };
  if (!horarios || horarios.length === 0) return porDefecto();
  const dia = (new Date(fechaRefIso).getDay() + 6) % 7; // JS 0=domingo -> tabla 0=lunes
  const fila = horarios.find((h) => h.dia_semana === dia);
  if (!fila || !fila.abierto || !fila.apertura || !fila.cierre) return porDefecto();
  const aperturaMs = horaSobreFecha(fechaRefIso, fila.apertura);
  const cierreMs = horaSobreFecha(fechaRefIso, fila.cierre);
  if (aperturaMs == null || cierreMs == null || cierreMs <= aperturaMs) return porDefecto();
  return { aperturaMs, cierreMs };
}
```

- [ ] **Step 5: Propagar la ventana**

En `analizarAgendaDia`, sustituir (~L287):

```ts
    const cierreMs = cierreDelDia(citasProf[0].inicio);
```

por:

```ts
    const { aperturaMs, cierreMs } = ventanaDelDia(citasProf[0].inicio, opts?.horarios);
```

Anadir `aperturaMs: number` como ultimo parametro a `detectarRetraso`, `detectarSolapes` y
`detectarHuecos`, y pasarlo en las 3 llamadas:

```ts
    const retraso = detectarRetraso(citasProf, ahoraMs, cierreMs, aperturaMs);
    ...
    const solapes = detectarSolapes(citasProf, ahoraMs, cierreMs, candidatos, aperturaMs);
    ...
    problemas.push(...detectarHuecos(citasProf, ahoraMs, cierreMs, umbralHuecoMs, aperturaMs));
```

En `detectarRetraso`, pasarlo a la llamada de `calcularEstrategiasRetraso`:

```ts
  const estrategias = calcularEstrategiasRetraso(citasProf, candidata.c.id, minutos, { cierreMs, aperturaMs });
```

En `detectarSolapes`, pasarlo a `calcularEstrategiasSolape`:

```ts
      const estrategias = calcularEstrategiasSolape(citasProf, intrusa.id, fija.id, {
        cierreMs,
        ahoraMs,
        aperturaMs,
        reasignacion: { categoriaMinima: intrusa.categoriaMinima ?? null, candidatos },
      });
```

En `detectarHuecos`, acotar su `buscarHueco` directo (~L214):

```ts
    const slot = buscarHueco(propia, obstaculos, Math.max(ahoraMs, aperturaMs), cierreMs, false);
```

- [ ] **Step 6: Ejecutar los tests**

Run: `& "C:\Users\alexa\.deno\bin\deno.exe" test lib/organizarAgenda.test.ts lib/retrasos.test.ts`
Expected: PASS todos los nuevos + los previos, salvo el fallo preexistente "dia limpio".

**Si falla el test del mapeo de dia**, revisar el `(getDay() + 6) % 7`: es el bug que ese test
existe para cazar.

- [ ] **Step 7: Commit**

```bash
git add lib/organizarAgenda.ts lib/organizarAgenda.test.ts
git commit -m "feat(agenda): ventanaDelDia lee negocio_horarios (0=lunes) con fallback"
```

---

### Task 3: Plumbing de datos

**Files:**
- Modify: `components/agenda/OrganizarAgendaPanel.web.tsx`
- Modify: `components/agenda/AgendaCalendar.web.tsx`
- Modify: `lib/hooks/useAvisos.ts`

- [ ] **Step 1: Prop en el panel**

En `OrganizarAgendaPanelProps`, tras `bloqueos`:

```ts
  horarios?: { dia_semana: number; abierto: boolean; apertura: string | null; cierre: string | null }[];
```

Anadir `horarios` a la desestructuracion de props del componente, y al `useMemo`:

```ts
  const problemas = useMemo(
    () => analizarAgendaDia(citasHoy, profesionales, { ahoraMs: ahoraOverrideMs, bloqueos, horarios }),
    [citasHoy, profesionales, ahoraOverrideMs, bloqueos, horarios],
  );
```

- [ ] **Step 2: Cargar en AgendaCalendar**

En `AgendaCalendar.web.tsx`, junto al resto de estados de datos (cerca de
`const [bloqueos, setBloqueos] = useState<any[]>([]);`, ~L403):

```tsx
  const [horarios, setHorarios] = useState<any[]>([]);
```

En el `Promise.all` de carga (donde esta el select de `bloqueos_profesional`, ~L868), anadir:

```ts
          supabase
            .from("negocio_horarios")
            .select("dia_semana, abierto, apertura, cierre")
            .eq("negocio_id", negocioId),
```

Recoger el resultado en la desestructuracion (junto a `bloqueoResult`) como `horarioResult` y,
junto a `setBloqueos(...)`:

```ts
        setHorarios(horarioResult.data ?? []);
```

Y pasarlo al panel (~L3985, junto a `bloqueos={bloqueos}`):

```tsx
          horarios={horarios}
```

- [ ] **Step 3: Cargar en useAvisos**

En `lib/hooks/useAvisos.ts`, junto al select de bloqueos anadido en el slice anterior:

```ts
        const { data: horariosData } = await supabase
          .from('negocio_horarios')
          .select('dia_semana, abierto, apertura, cierre')
          .eq('negocio_id', negocioId);
```

Y en la llamada:

```ts
        const problemas = analizarAgendaDia(citasOrganizar, profesionales, {
          ahoraMs: ahora.getTime(),
          bloqueos: bloqueosData ?? [],
          horarios: horariosData ?? [],
        });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: solo los 2 errores preexistentes de `PapeleraModal.web.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/agenda/OrganizarAgendaPanel.web.tsx components/agenda/AgendaCalendar.web.tsx lib/hooks/useAvisos.ts
git commit -m "feat(agenda): cablear negocio_horarios al organizador"
```

---

### Task 4: Verificacion

- [ ] **Step 1: Suite completa**

Run: `& "C:\Users\alexa\.deno\bin\deno.exe" test lib/retrasos.test.ts lib/organizarAgenda.test.ts`
Expected: PASS salvo "dia limpio" (preexistente). Si falla algo mas, parar y arreglar.

- [ ] **Step 2: Typecheck y build**

Run: `npx tsc --noEmit` -> solo los 2 de `PapeleraModal`.
Run: `npm run build:web` -> `Exported: web/app`.

- [ ] **Step 3: Limpiar ruido**

`deno test` reescribe `deno.lock`: `git checkout deno.lock` antes de cerrar.

---

## Fuera de alcance

Pausas de comida (0 de 21 filas las usan) · recurrencia de bloqueos (0 de 7) · jornada por
profesional (no existe la tabla) · festivos y cierres puntuales (sin modelo).
