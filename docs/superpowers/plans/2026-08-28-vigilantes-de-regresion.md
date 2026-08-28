# Vigilantes de regresión — Plan de implementación

> **Para quien lo ejecute (agente o humano):** los pasos van con casilla (`- [ ]`).
> Usa `superpowers:executing-plans` o `superpowers:subagent-driven-development`.

**Objetivo:** que nadie tenga que adivinar qué se ha roto. Un conjunto de vigilantes que
corren solos (CI en cada PR, canario cada hora en producción), detectan invariantes rotos,
pantallas que ya no cargan y botones que ya no responden, y lo enseñan todo en una pestaña
**Salud** del panel de staff.

**Arquitectura:** tres capas de detección + un recolector + una vista.

```
CAPA 1  Vigilantes de invariantes   scripts/vigilantes/*.mjs   <5 s, sin red, en cada PR
CAPA 2  Vigilantes de base de datos public.vigilancia_bd()     dentro de Postgres
CAPA 3  Smoke de pantallas          tests/smoke/               Playwright, CI + canario
                     │
                     ▼
        edge: registrar-vigilancia   (token propio, NUNCA una clave de Supabase)
                     │
                     ▼
        vigilancia_ejecuciones + vigilancia_hallazgos
                     │
                     ▼
        web/admin.html → pestaña "Salud"
```

**Dos niveles, decidido en el brainstorming:** `bloqueante` tumba la CI; `aviso` solo informa
y aparece en el panel. Regla para clasificar: bloqueante = un usuario real ve algo falso o
roto (precios que no cuadran, una ruta sin auth, una pantalla que no carga). Aviso = deuda
que crece (código muerto, políticas RLS lentas).

**Stack:** Node 20 ESM (`.mjs`, sin dependencias nuevas), Playwright ya instalado,
Postgres/Supabase, edge function Deno, `web/admin.html` (JS plano, sin framework).

---

## Principio que gobierna todo el diseño: un ancla perdida FALLA

El fallo clásico de este tipo de herramienta es podrirse en silencio: alguien reescribe la
sección de precios de la landing, el regex del vigilante deja de encontrar nada, y el
vigilante pasa en verde para siempre.

**Por eso `capturar()` lanza si no encuentra el ancla.** No encontrar el ancla es un
hallazgo bloqueante, igual que encontrarla con el valor equivocado. Si esto molesta, la
salida es arreglar el ancla, nunca ablandar la comprobación.

---

## Estructura de ficheros

**Nuevos:**

| Fichero | Responsabilidad |
|---|---|
| `scripts/vigilantes/nucleo.mjs` | Contrato común: leer ficheros, `capturar()`, construir hallazgos, número de línea |
| `scripts/vigilantes/index.mjs` | Runner CLI: corre todos, imprime, código de salida, `--json` |
| `scripts/vigilantes/precios.mjs` | Los 3 sitios de precios cuadran con `lib/planes.ts` |
| `scripts/vigilantes/referidos.mjs` | Los 4 sitios de referidos cuadran entre sí. Exporta `TABLA_REFERIDOS` |
| `scripts/vigilantes/rutas-publicas.mjs` | La lista de rutas exentas de auth es exactamente la esperada |
| `scripts/vigilantes/cache-app.mjs` | `vercel.json` no ha vuelto a poner `no-store` a todo `/app` |
| `scripts/vigilantes/codigo-muerto.mjs` | knip contra línea base congelada |
| `scripts/vigilantes/knip-baseline.json` | La línea base (14/66/8/28/6) |
| `scripts/vigilantes/bd.mjs` | Llama a `public.vigilancia_bd()` y traduce a hallazgos |
| `scripts/vigilantes/enviar.mjs` | Manda el JSON de una corrida a `registrar-vigilancia` |
| `supabase/migrations/20260829090000_vigilancia.sql` | Tablas, RPCs de staff y `vigilancia_bd()` |
| `supabase/functions/registrar-vigilancia/index.ts` | Recolector con token propio |
| `tests/smoke/pantallas.ts` | Inventario de pantallas (datos, no test) |
| `tests/smoke/pantallas.spec.ts` | Test parametrizado: carga + consola + red + botones |
| `.github/workflows/canario.yml` | Smoke horario contra `https://www.mechaa.es` |

**Modificados:**

| Fichero | Cambio |
|---|---|
| `package.json` | Scripts `vigilar`, `vigilar:bd`, `vigilar:json` |
| `.github/workflows/ci.yml` | Paso "Vigilantes de invariantes" + envío al recolector |
| `supabase/config.toml` | `verify_jwt = false` para `registrar-vigilancia` |
| `web/admin.html` | Pestaña + vista "Salud" |
| `.env.example` | `VIGILANCIA_TOKEN` |
| `CLAUDE.md` | Decisión de diseño 10: los vigilantes |

---

## Fase 1 — El núcleo y los vigilantes estáticos

### Task 1: El núcleo (`nucleo.mjs`)

**Files:**
- Create: `scripts/vigilantes/nucleo.mjs`
- Test: `scripts/vigilantes/nucleo.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

```js
// scripts/vigilantes/nucleo.test.mjs
// Se corre con `node --test scripts/vigilantes/nucleo.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { capturar, AnclaPerdida, lineaDe, hallazgo } from './nucleo.mjs';

test('capturar devuelve el grupo 1 y su linea', () => {
  const texto = 'uno\ndos\n"lowPrice": "39"\ncuatro';
  const r = capturar(texto, /"lowPrice":\s*"(\d+)"/, { fichero: 'x.html', ancla: 'lowPrice' });
  assert.equal(r.valor, '39');
  assert.equal(r.linea, 3);
});

test('capturar lanza AnclaPerdida si el ancla ya no existe', () => {
  assert.throws(
    () => capturar('nada que ver', /"lowPrice":\s*"(\d+)"/, { fichero: 'x.html', ancla: 'lowPrice' }),
    AnclaPerdida,
  );
});

test('lineaDe cuenta desde 1', () => {
  assert.equal(lineaDe('a\nb\nc', 4), 3);
});

test('hallazgo exige nivel valido', () => {
  assert.throws(() => hallazgo({ clave: 'x', nivel: 'grave', ambito: 'a', titulo: 't', detalle: 'd' }));
  const h = hallazgo({ clave: 'x', nivel: 'aviso', ambito: 'a', titulo: 't', detalle: 'd' });
  assert.equal(h.nivel, 'aviso');
});
```

- [ ] **Step 2: Correr el test y ver que falla**

```bash
node --test scripts/vigilantes/nucleo.test.mjs
```

Esperado: FAIL, `Cannot find module './nucleo.mjs'`.

- [ ] **Step 3: Escribir el núcleo**

```js
// scripts/vigilantes/nucleo.mjs
//
// Contrato comun de los vigilantes. Un vigilante es un modulo que exporta por
// defecto { nombre, ambito, descripcion, ejecutar(ctx) -> hallazgo[] }.
//
// La regla que sostiene todo esto: si un vigilante NO encuentra su ancla, falla.
// Un regex que deja de casar porque alguien reescribio la seccion no puede
// pasar en verde -- asi es como estas herramientas se pudren en silencio.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const NIVELES = ['bloqueante', 'aviso'];

// El ancla ya no esta donde estaba: el vigilante se ha quedado ciego.
export class AnclaPerdida extends Error {
  constructor(mensaje, { fichero, ancla }) {
    super(mensaje);
    this.name = 'AnclaPerdida';
    this.fichero = fichero;
    this.ancla = ancla;
  }
}

export function leer(rel) {
  const abs = path.join(RAIZ, rel);
  if (!existsSync(abs)) {
    throw new AnclaPerdida(`No existe el fichero ${rel}`, { fichero: rel, ancla: 'fichero' });
  }
  return readFileSync(abs, 'utf8');
}

export function lineaDe(texto, indice) {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === '\n') n++;
  return n;
}

// Busca `re` en `texto` y devuelve { valor, linea }. `re` DEBE tener un grupo 1.
export function capturar(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(
      `El ancla "${ancla}" ya no aparece en ${fichero}. O se ha reescrito esa parte ` +
      `(y hay que actualizar el vigilante) o se ha borrado. Un vigilante ciego no vale.`,
      { fichero, ancla },
    );
  }
  return { valor: m[1], linea: lineaDe(texto, m.index) };
}

// Igual que capturar pero para anclas que solo tienen que EXISTIR.
export function exigir(texto, re, { fichero, ancla }) {
  const m = re.exec(texto);
  if (!m) {
    throw new AnclaPerdida(
      `El ancla "${ancla}" ya no aparece en ${fichero}.`,
      { fichero, ancla },
    );
  }
  return { linea: lineaDe(texto, m.index) };
}

export function hallazgo({ clave, nivel, ambito, titulo, detalle, fichero = null, linea = null }) {
  if (!NIVELES.includes(nivel)) throw new Error(`Nivel no valido: ${nivel}`);
  if (!clave || !titulo) throw new Error('Un hallazgo necesita clave y titulo');
  return { clave, nivel, ambito, titulo, detalle: detalle || '', fichero, linea };
}

// Azucar: compara dos valores que TIENEN que ser iguales.
export function debenCuadrar({ clave, ambito, que, esperado, encontrado, fichero, linea, porque }) {
  if (String(esperado) === String(encontrado)) return null;
  return hallazgo({
    clave, nivel: 'bloqueante', ambito,
    titulo: `${que}: se esperaba ${esperado} y hay ${encontrado}`,
    detalle: porque,
    fichero, linea,
  });
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

```bash
node --test scripts/vigilantes/nucleo.test.mjs
```

Esperado: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/nucleo.mjs scripts/vigilantes/nucleo.test.mjs
git commit -m "feat(vigilantes): nucleo comun — un ancla perdida falla, no pasa en verde"
```

---

### Task 2: Vigilante de precios

Los precios viven en tres sitios (decision documentada en CLAUDE.md). La fuente de verdad
es `lib/planes.ts`; los otros dos se comparan contra ella.

**Files:**
- Create: `scripts/vigilantes/precios.mjs`
- Test: `scripts/vigilantes/precios.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

```js
// scripts/vigilantes/precios.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './precios.mjs';

test('hoy los tres sitios cuadran', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'no deberia haber hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('lee la fuente de verdad de lib/planes.ts', async () => {
  const p = await vigilante.precios();
  assert.equal(p.esencial, 39);
  assert.equal(p.estudio, 59);
  assert.equal(p.whatsapp, 19);
  assert.equal(p.voz, 29);
  assert.equal(p.completa, 39);
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test scripts/vigilantes/precios.test.mjs
```

Esperado: FAIL, `Cannot find module './precios.mjs'`.

- [ ] **Step 3: Escribir el vigilante**

```js
// scripts/vigilantes/precios.mjs
//
// Los precios publicos viven en TRES sitios que hay que cambiar a la vez
// (CLAUDE.md, reestructura del 7 ago 2026):
//   1. lib/planes.ts                                  <- fuente de verdad
//   2. la seccion #precios de web/index.html          <- lo que ve el visitante
//   3. el SYSTEM_PROMPT de supabase/functions/chispa-landing  <- lo que recita la IA
//
// El fallo que esto evita no es teorico: si cambias planes.ts y te dejas el
// prompt, el asistente de la landing le recita precios viejos a un cliente real
// y todo compila, todos los tests pasan y nadie se entera.

import { leer, capturar, debenCuadrar } from './nucleo.mjs';

const PLANES = 'lib/planes.ts';
const LANDING = 'web/index.html';
const CHISPA = 'supabase/functions/chispa-landing/index.ts';

// Saca un numero de un Record<...> de TypeScript: `esencial: 39,`
function delRecord(texto, bloque, clave) {
  const re = new RegExp(
    `${bloque}[^{]*\\{[^}]*?\\b${clave}\\s*:\\s*(\\d+)`,
    's',
  );
  return Number(capturar(texto, re, { fichero: PLANES, ancla: `${bloque}.${clave}` }).valor);
}

async function precios() {
  const t = leer(PLANES);
  return {
    esencial: delRecord(t, 'PLAN_PRECIO_EUR', 'esencial'),
    estudio: delRecord(t, 'PLAN_PRECIO_EUR', 'estudio'),
    whatsapp: delRecord(t, 'IA_PRECIO_EUR', 'whatsapp'),
    voz: delRecord(t, 'IA_PRECIO_EUR', 'voz'),
    completa: delRecord(t, 'IA_PRECIO_EUR', 'completa'),
  };
}

// Cada ancla: [fichero, clave de precio, regex con grupo 1, nombre humano]
const ANCLAS = [
  // --- Landing: datos estructurados (esto es lo que lee Google) ---
  [LANDING, 'esencial', /"lowPrice":\s*"(\d+)"/, 'JSON-LD lowPrice'],
  [LANDING, 'estudio', /"highPrice":\s*"(\d+)"/, 'JSON-LD highPrice'],
  // --- Landing: las dos tarjetas de plan ---
  [LANDING, 'esencial', /data-plan="(\d+)"[^>]*>\s*Esencial/, 'boton Esencial de la calculadora'],
  [LANDING, 'estudio', /data-plan="(\d+)"[^>]*>\s*Estudio/, 'boton Estudio de la calculadora'],
  // --- Landing: el addon de IA ---
  [LANDING, 'whatsapp', /IA por WhatsApp<\/b>[\s\S]{0,400}?>(\d+)\s*€\/mes</, 'tarjeta IA WhatsApp'],
  [LANDING, 'voz', /IA de voz telefónica<\/b>[\s\S]{0,400}?>(\d+)\s*€\/mes</, 'tarjeta IA voz'],
  [LANDING, 'completa', /Las dos juntas:\s*\+(\d+)\s*€\/mes/, 'pack IA completa'],
  // --- El prompt que recita Chispa en la landing ---
  [CHISPA, 'esencial', /·\s*Esencial:\s*(\d+)\s*€\/mes/, 'prompt Chispa · Esencial'],
  [CHISPA, 'estudio', /·\s*Estudio:\s*(\d+)\s*€\/mes/, 'prompt Chispa · Estudio'],
  [CHISPA, 'whatsapp', /·\s*Solo WhatsApp:\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · WhatsApp'],
  [CHISPA, 'voz', /·\s*Solo voz:\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · voz'],
  [CHISPA, 'completa', /·\s*Completo \(WhatsApp \+ voz\):\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · pack'],
];

async function ejecutar() {
  const p = await precios();
  const hallazgos = [];
  const cache = new Map();

  for (const [fichero, clave, re, nombre] of ANCLAS) {
    if (!cache.has(fichero)) cache.set(fichero, leer(fichero));
    const { valor, linea } = capturar(cache.get(fichero), re, { fichero, ancla: nombre });
    const h = debenCuadrar({
      clave: `precios/${clave}`,
      ambito: 'precios',
      que: nombre,
      esperado: p[clave],
      encontrado: valor,
      fichero, linea,
      porque: `La fuente de verdad es ${PLANES}. Si el precio ha cambiado de verdad, ` +
              `cambialo en los TRES sitios: ${PLANES}, ${LANDING} y ${CHISPA}.`,
    });
    if (h) hallazgos.push(h);
  }

  // El pack se anuncia como "en vez de 48 € sueltos": ese 48 es whatsapp+voz.
  const sueltos = p.whatsapp + p.voz;
  const t = cache.get(CHISPA) ?? leer(CHISPA);
  const { valor, linea } = capturar(t, /en vez de\s*(\d+)\s*€\s*sueltos/, {
    fichero: CHISPA, ancla: 'prompt Chispa · comparativa del pack',
  });
  const h = debenCuadrar({
    clave: 'precios/pack-comparativa', ambito: 'precios',
    que: 'la comparativa "en vez de N € sueltos"',
    esperado: sueltos, encontrado: valor, fichero: CHISPA, linea,
    porque: `Tiene que ser whatsapp (${p.whatsapp}) + voz (${p.voz}).`,
  });
  if (h) hallazgos.push(h);

  return hallazgos;
}

export default {
  nombre: 'precios',
  ambito: 'precios',
  descripcion: 'Los precios cuadran en lib/planes.ts, la landing y el prompt de Chispa',
  ejecutar,
  precios,
};
```

- [ ] **Step 4: Correr el test y ver que pasa**

```bash
node --test scripts/vigilantes/precios.test.mjs
```

Esperado: `# pass 2`, `# fail 0`. Si falla el primer test, el vigilante ha encontrado
un desajuste REAL en el repo: arreglar el desajuste, no el vigilante.

- [ ] **Step 5: Probar que detecta un cambio de verdad**

```bash
node -e "const fs=require('fs');const p='lib/planes.ts';const t=fs.readFileSync(p,'utf8');fs.writeFileSync(p,t.replace('esencial: 39','esencial: 41'));"
node --test scripts/vigilantes/precios.test.mjs
git checkout lib/planes.ts
```

Esperado: la segunda orden FALLA con hallazgos en las 4 anclas de `esencial`.
Confirmado eso, `git checkout` deja el fichero como estaba.

- [ ] **Step 6: Commit**

```bash
git add scripts/vigilantes/precios.mjs scripts/vigilantes/precios.test.mjs
git commit -m "feat(vigilantes): los precios cuadran en los tres sitios o la CI se para"
```

---

### Task 3: Vigilante de referidos

**Files:**
- Create: `scripts/vigilantes/referidos.mjs`
- Test: `scripts/vigilantes/referidos.test.mjs`

Aquí no hay un `lib/*.ts` que haga de fuente de verdad (la tabla vive en la BD y en tres
textos). El vigilante **declara la tabla** y comprueba que los cuatro sitios la respetan.
Que el vigilante sea el quinto sitio es deliberado: convierte una deriva silenciosa en una
edición consciente de un solo fichero, y el diff la enseña.

- [ ] **Step 1: Escribir el test que falla**

```js
// scripts/vigilantes/referidos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { TABLA_REFERIDOS } from './referidos.mjs';

test('la tabla declarada es la del 23 ago 2026', () => {
  assert.deepEqual(TABLA_REFERIDOS, { nivel1: 10, nivel2: 4, nivel3: 2, tope: 30, bienvenida: 15 });
});

test('hoy los cuatro sitios cuadran', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test scripts/vigilantes/referidos.test.mjs
```

Esperado: FAIL, `Cannot find module './referidos.mjs'`.

- [ ] **Step 3: Escribir el vigilante**

```js
// scripts/vigilantes/referidos.mjs
//
// La red de referidos vive en CUATRO sitios (CLAUDE.md, fijado el 23 ago 2026):
//   1. la funcion recompute_referral_discount de la BD  (la comprueba vigilancia_bd())
//   2. la seccion #hermano de web/index.html + su FAQ en los datos estructurados
//   3. el modal "Recomendar" de web/demo.html
//   4. TabReferidos en app/(tabs)/configuracion.web.tsx
//
// Aqui no hay un lib/*.ts que mande, asi que la tabla se declara AQUI y los
// cuatro sitios se comparan contra ella. Si la regla de negocio cambia, se
// cambia esta constante -- a proposito, para que el diff lo cante.

import { leer, capturar, debenCuadrar } from './nucleo.mjs';

export const TABLA_REFERIDOS = {
  nivel1: 10,     // por cada salon que traes tu
  nivel2: 4,      // por los que traen ellos
  nivel3: 2,      // tercer nivel
  tope: 30,       // maximo de descuento; por encima, meses gratis
  bienvenida: 15, // lo que se lleva quien entra con tu enlace
};

const LANDING = 'web/index.html';
const DEMO = 'web/demo.html';
const CONFIG = 'app/(tabs)/configuracion.web.tsx';

const ANCLAS = [
  // --- Landing: la FAQ de los datos estructurados (lo que indexa Google) ---
  [LANDING, 'nivel1', /un (\d+)\s*% por cada salón que traes tú/, 'FAQ JSON-LD nivel 1'],
  [LANDING, 'nivel2', /un (\d+)\s*% por cada uno que traigan ellos/, 'FAQ JSON-LD nivel 2'],
  [LANDING, 'nivel3', /un (\d+)\s*% por el tercer nivel/, 'FAQ JSON-LD nivel 3'],
  [LANDING, 'tope', /hasta un máximo del (\d+)\s*%/, 'FAQ JSON-LD tope'],
  [LANDING, 'bienvenida', /recibe un (\d+)\s*% de bienvenida/, 'FAQ JSON-LD bienvenida'],
  // --- Landing: la seccion #hermano que ve el visitante ---
  [LANDING, 'nivel1', /−(\d+)%<\/b><span>Por cada salón que traes tú/, 'seccion #hermano nivel 1'],
  // --- Demo: el modal "Recomendar" ---
  [DEMO, 'nivel1', /−(\d+)% por cada salón que traes/, 'modal Recomendar nivel 1'],
  [DEMO, 'nivel2', /−(\d+)% y −\d+% por los que traen ellos/, 'modal Recomendar nivel 2'],
  [DEMO, 'nivel3', /−\d+% y −(\d+)% por los que traen ellos/, 'modal Recomendar nivel 3'],
  [DEMO, 'tope', /<div class="rw-amt">-(\d+)%<span>máx\.<\/span><\/div>/, 'modal Recomendar tope'],
  // --- El software: TabReferidos ---
  [CONFIG, 'nivel1', /tu cuota baja un (\d+)%/, 'TabReferidos nivel 1'],
  [CONFIG, 'nivel2', /un (\d+)% por los que traigan ellos/, 'TabReferidos nivel 2'],
  [CONFIG, 'nivel3', /un (\d+)% por el tercer nivel/, 'TabReferidos nivel 3'],
  [CONFIG, 'bienvenida', /se lleva su (\d+)% de bienvenida/, 'TabReferidos bienvenida'],
  // El tope de TabReferidos viene de la BD (stats.descuento_tope); esto vigila
  // el valor de reserva por si la RPC no responde.
  [CONFIG, 'tope', /stats\?\.descuento_tope \|\| (\d+)/, 'TabReferidos tope (valor de reserva)'],
];

async function ejecutar() {
  const hallazgos = [];
  const cache = new Map();
  for (const [fichero, clave, re, nombre] of ANCLAS) {
    if (!cache.has(fichero)) cache.set(fichero, leer(fichero));
    const { valor, linea } = capturar(cache.get(fichero), re, { fichero, ancla: nombre });
    const h = debenCuadrar({
      clave: `referidos/${clave}`,
      ambito: 'referidos',
      que: nombre,
      esperado: TABLA_REFERIDOS[clave],
      encontrado: valor,
      fichero, linea,
      porque: 'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez: ' +
              'la funcion recompute_referral_discount de la BD, #hermano de la landing, ' +
              'el modal Recomendar de la demo y TabReferidos del software.',
    });
    if (h) hallazgos.push(h);
  }
  return hallazgos;
}

export default {
  nombre: 'referidos',
  ambito: 'referidos',
  descripcion: 'La tabla de referidos (10/4/2, tope 30, bienvenida 15) cuadra en los cuatro sitios',
  ejecutar,
};
```

- [ ] **Step 4: Correr el test**

```bash
node --test scripts/vigilantes/referidos.test.mjs
```

Esperado: `# pass 2`. Si alguna ancla no casa, ajustar el regex al texto REAL del
fichero (leerlo antes con `grep -n`), nunca ablandarlo a `\d+` sin grupo.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/referidos.mjs scripts/vigilantes/referidos.test.mjs
git commit -m "feat(vigilantes): la tabla de referidos cuadra en los cuatro sitios"
```

---

### Task 4: Vigilante de rutas públicas

Añadir una ruta a `isPublicRoute` es abrir una pantalla al mundo sin sesión. Debe ser
siempre una decisión consciente, nunca un descuido.

**Hallazgo ya confirmado durante el diseño:** el código exime siete rutas
(`r`, `resena`, `cita`, `pago`, `pagar`, `presupuesto`, `contacto`) pero CLAUDE.md solo
documenta cuatro. La deriva ya está pasando.

**Files:**
- Create: `scripts/vigilantes/rutas-publicas.mjs`
- Test: `scripts/vigilantes/rutas-publicas.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

```js
// scripts/vigilantes/rutas-publicas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { RUTAS_PUBLICAS_ESPERADAS } from './rutas-publicas.mjs';

test('la lista esperada es la de hoy', () => {
  assert.deepEqual(
    [...RUTAS_PUBLICAS_ESPERADAS].sort(),
    ['cita', 'contacto', 'pagar', 'pago', 'presupuesto', 'r', 'resena'],
  );
});

test('_layout.tsx dice exactamente eso', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test scripts/vigilantes/rutas-publicas.test.mjs
```

Esperado: FAIL, `Cannot find module './rutas-publicas.mjs'`.

- [ ] **Step 3: Escribir el vigilante**

```js
// scripts/vigilantes/rutas-publicas.mjs
//
// app/_layout.tsx exime a unas rutas de los guards de auth: son las que usa el
// cliente final sin cuenta (portal de reserva, resena, gestion de su cita,
// pago de la senal, presupuesto, contacto). Todo lo que se meta ahi queda
// abierto al mundo.
//
// Este vigilante NO decide que rutas son legitimas: fija la lista de hoy y
// obliga a que cualquier cambio pase por aqui. Anadir una ruta publica sin
// tocar este fichero tumba la CI, y eso es exactamente lo que se busca.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, capturar, hallazgo } from './nucleo.mjs';

const LAYOUT = 'app/_layout.tsx';

export const RUTAS_PUBLICAS_ESPERADAS = new Set([
  'r',            // app/r/[slug]      portal publico de reserva
  'resena',       // app/resena/[slug] dejar valoracion
  'cita',         // app/cita/[id]     el cliente ve/cambia/cancela su cita
  'pago',         // app/pago/[ref]    pagar la senal (Stripe)
  'pagar',        // app/pagar/...     cobro en el local por QR
  'presupuesto',  // app/presupuesto/  aceptar un presupuesto
  'contacto',     // app/contacto/     formulario publico
]);

async function ejecutar() {
  const texto = leer(LAYOUT);
  const { valor, linea } = capturar(
    texto,
    /const isPublicRoute = \[([^\]]*)\]\.includes\(String\(segments\[0\]\)\)/,
    { fichero: LAYOUT, ancla: 'isPublicRoute' },
  );

  const encontradas = new Set(
    valor.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
  );

  const hallazgos = [];

  for (const r of encontradas) {
    if (!RUTAS_PUBLICAS_ESPERADAS.has(r)) {
      hallazgos.push(hallazgo({
        clave: `rutas-publicas/nueva-${r}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `La ruta /${r} se ha abierto sin sesion y no estaba en la lista`,
        detalle:
          `${LAYOUT} exime a "${r}" de los guards de auth. Si es a proposito, anadela a ` +
          `RUTAS_PUBLICAS_ESPERADAS en scripts/vigilantes/rutas-publicas.mjs con un ` +
          `comentario de por que. Si no lo es, quitala de isPublicRoute.`,
        fichero: LAYOUT, linea,
      }));
    }
  }

  for (const r of RUTAS_PUBLICAS_ESPERADAS) {
    if (!encontradas.has(r)) {
      hallazgos.push(hallazgo({
        clave: `rutas-publicas/desaparecida-${r}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `La ruta publica /${r} ha dejado de estar exenta de auth`,
        detalle:
          `Si era intencionado, quitala de RUTAS_PUBLICAS_ESPERADAS. Si no, el cliente ` +
          `final se va a encontrar la pantalla de login en /${r}.`,
        fichero: LAYOUT, linea,
      }));
    }
    // Una ruta exenta que ya no existe como carpeta es un agujero muerto.
    if (!existsSync(path.join(RAIZ, 'app', r))) {
      hallazgos.push(hallazgo({
        clave: `rutas-publicas/sin-carpeta-${r}`,
        nivel: 'aviso',
        ambito: 'seguridad',
        titulo: `/${r} esta exenta de auth pero no existe app/${r}/`,
        detalle: 'Exencion muerta: quitala de isPublicRoute y de este vigilante.',
        fichero: LAYOUT, linea,
      }));
    }
  }

  return hallazgos;
}

export default {
  nombre: 'rutas-publicas',
  ambito: 'seguridad',
  descripcion: 'Solo las rutas del cliente final estan exentas de los guards de auth',
  ejecutar,
};
```

- [ ] **Step 4: Correr el test**

```bash
node --test scripts/vigilantes/rutas-publicas.test.mjs
```

Esperado: `# pass 2`.

- [ ] **Step 5: Probar que detecta una ruta nueva**

```bash
node -e "const fs=require('fs');const p='app/_layout.tsx';const t=fs.readFileSync(p,'utf8');fs.writeFileSync(p,t.replace(\"'contacto'\",\"'contacto', 'admin'\"));"
node --test scripts/vigilantes/rutas-publicas.test.mjs
git checkout app/_layout.tsx
```

Esperado: FAIL con `La ruta /admin se ha abierto sin sesion`.

- [ ] **Step 6: Commit**

```bash
git add scripts/vigilantes/rutas-publicas.mjs scripts/vigilantes/rutas-publicas.test.mjs
git commit -m "feat(vigilantes): abrir una ruta sin sesion deja de poder colarse"
```

---

### Task 5: Vigilante de caché de /app

**Files:**
- Create: `scripts/vigilantes/cache-app.mjs`
- Test: `scripts/vigilantes/cache-app.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

```js
// scripts/vigilantes/cache-app.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante from './cache-app.mjs';

test('vercel.json sigue cacheando los estaticos de /app', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});
```

- [ ] **Step 2: Correr y ver que falla**

```bash
node --test scripts/vigilantes/cache-app.test.mjs
```

Esperado: FAIL, `Cannot find module './cache-app.mjs'`.

- [ ] **Step 3: Escribir el vigilante**

```js
// scripts/vigilantes/cache-app.mjs
//
// Decision 7 de CLAUDE.md (17 ago 2026): los estaticos del export de Expo llevan
// hash en el nombre, asi que /app/_expo y /app/assets van immutable. Estuvo TODO
// en no-store y eso obligaba a re-descargar el bundle de ~7 MB en cada carga,
// cada login y cada apertura de la demo.
//
// Volver a poner no-store a /app/(.*) no rompe ningun test ni ningun tipo: solo
// hace la aplicacion lenta para todo el mundo, en silencio. Por eso hay que
// vigilarlo desde fuera.

import { leer, hallazgo } from './nucleo.mjs';

const VERCEL = 'vercel.json';

// Rutas que TIENEN que cachearse para siempre.
const INMUTABLES = ['/app/_expo/:path*', '/app/assets/:path*'];

async function ejecutar() {
  const conf = JSON.parse(leer(VERCEL));
  const headers = conf.headers || [];
  const hallazgos = [];

  const cacheDe = (source) => {
    const regla = headers.find((h) => h.source === source);
    if (!regla) return null;
    const cc = (regla.headers || []).find((h) => h.key.toLowerCase() === 'cache-control');
    return cc ? cc.value : null;
  };

  for (const source of INMUTABLES) {
    const cc = cacheDe(source);
    if (cc === null) {
      hallazgos.push(hallazgo({
        clave: `cache-app/falta-${source}`,
        nivel: 'bloqueante',
        ambito: 'rendimiento',
        titulo: `${VERCEL} ya no cachea ${source}`,
        detalle:
          'Sin esta regla el navegador vuelve a descargar el bundle de ~7 MB en cada ' +
          'carga, cada login y cada apertura de la demo. Los nombres llevan hash: es seguro.',
        fichero: VERCEL,
      }));
      continue;
    }
    if (!/immutable/.test(cc) || /no-store/.test(cc)) {
      hallazgos.push(hallazgo({
        clave: `cache-app/rota-${source}`,
        nivel: 'bloqueante',
        ambito: 'rendimiento',
        titulo: `${source} ha dejado de ser immutable (ahora: "${cc}")`,
        detalle: 'Ver decision 7 de CLAUDE.md. No volver a poner no-store a /app/(.*).',
        fichero: VERCEL,
      }));
    }
  }

  // Una regla comodin que pille TAMBIEN _expo/assets y les meta no-store.
  for (const regla of headers) {
    const src = regla.source || '';
    if (!src.startsWith('/app')) continue;
    const cc = (regla.headers || []).find((h) => h.key.toLowerCase() === 'cache-control');
    if (!cc || !/no-store/.test(cc.value)) continue;
    // La regla legitima excluye _expo/ y assets/ con un lookahead negativo.
    const excluye = /\(\?!\s*_expo\/\s*\|\s*assets\/\s*\)/.test(src) || src === '/app';
    if (!excluye) {
      hallazgos.push(hallazgo({
        clave: 'cache-app/comodin-no-store',
        nivel: 'bloqueante',
        ambito: 'rendimiento',
        titulo: `La regla "${src}" pone no-store a los estaticos de /app`,
        detalle:
          'La regla de no-store tiene que excluir _expo/ y assets/, como hace ' +
          '"/app/:path((?!_expo/|assets/).*)". Ver decision 7 de CLAUDE.md.',
        fichero: VERCEL,
      }));
    }
  }

  return hallazgos;
}

export default {
  nombre: 'cache-app',
  ambito: 'rendimiento',
  descripcion: 'Los estaticos con hash de /app siguen sirviendose immutable',
  ejecutar,
};
```

- [ ] **Step 4: Correr el test**

```bash
node --test scripts/vigilantes/cache-app.test.mjs
```

Esperado: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/cache-app.mjs scripts/vigilantes/cache-app.test.mjs
git commit -m "feat(vigilantes): no volver a servir /app sin cache"
```

---

### Task 6: Vigilante de código muerto (línea base congelada)

Hoy knip da 14 ficheros, 66 exports, 8 tipos, 28 duplicados y 6 dependencias no listadas.
Ponerlo a bloquear deja la CI roja el día uno y alguien acabará quitando el linter. La
línea base congela esos números: el vigilante solo grita si **suben**. Y si bajan, avisa
para que se baje la línea base — así el trinquete solo gira en un sentido.

**Files:**
- Create: `scripts/vigilantes/codigo-muerto.mjs`
- Create: `scripts/vigilantes/knip-baseline.json`

- [ ] **Step 1: Generar la línea base con los números de hoy**

```bash
npx knip --reporter json > C:/tmp/knip.json
```

Ese comando termina con código 1 (hay hallazgos): es lo normal.

- [ ] **Step 2: Escribir la línea base**

```json
{
  "_comentario": "Deuda de codigo muerto CONGELADA el 28 ago 2026. El vigilante solo grita si algun numero SUBE. Cuando limpies algo, baja el numero aqui: el trinquete solo gira hacia abajo. Regenerar con: npx knip --reporter json",
  "files": 14,
  "exports": 66,
  "types": 8,
  "duplicates": 28,
  "unlisted": 6,
  "dependencies": 1,
  "devDependencies": 1,
  "binaries": 1
}
```

- [ ] **Step 3: Escribir el vigilante**

```js
// scripts/vigilantes/codigo-muerto.mjs
//
// knip encuentra ficheros, exports y tipos que ya no importa nadie. Hoy hay
// deuda heredada de sobra (66 exports muertos), asi que esto NO bloquea: fija
// una linea base y solo avisa cuando la deuda CRECE.
//
// Ojo: knip termina con codigo 1 cuando encuentra algo. Eso es normal, no un
// fallo de ejecucion; lo que importa es el JSON.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RAIZ, leer, hallazgo } from './nucleo.mjs';

const ejecutar_ = promisify(execFile);

const CATEGORIAS = {
  files: 'ficheros que no importa nadie',
  exports: 'exports sin uso',
  types: 'tipos exportados sin uso',
  duplicates: 'exports duplicados',
  unlisted: 'dependencias usadas y no declaradas',
  dependencies: 'dependencias declaradas y sin usar',
  devDependencies: 'devDependencies sin usar',
  binaries: 'binarios sin declarar',
};

async function contar() {
  let salida;
  try {
    const r = await ejecutar_('npx', ['knip', '--reporter', 'json'], {
      cwd: RAIZ, maxBuffer: 32 * 1024 * 1024, shell: process.platform === 'win32',
    });
    salida = r.stdout;
  } catch (e) {
    // knip sale con 1 cuando hay hallazgos: el stdout sigue siendo valido.
    if (!e.stdout) throw e;
    salida = e.stdout;
  }
  const datos = JSON.parse(salida);
  const total = {};
  for (const c of Object.keys(CATEGORIAS)) total[c] = 0;
  for (const it of datos.issues || []) {
    for (const c of Object.keys(CATEGORIAS)) total[c] += (it[c] || []).length;
  }
  return total;
}

async function ejecutar() {
  const base = JSON.parse(leer('scripts/vigilantes/knip-baseline.json'));
  const hoy = await contar();
  const hallazgos = [];

  for (const [cat, etiqueta] of Object.entries(CATEGORIAS)) {
    const antes = Number(base[cat] ?? 0);
    const ahora = hoy[cat];
    if (ahora > antes) {
      hallazgos.push(hallazgo({
        clave: `codigo-muerto/${cat}`,
        nivel: 'aviso',
        ambito: 'codigo-muerto',
        titulo: `Suben los ${etiqueta}: ${antes} → ${ahora}`,
        detalle:
          `Este cambio deja ${ahora - antes} mas. Verlos con: npx knip. ` +
          `Si son inevitables, sube el numero en scripts/vigilantes/knip-baseline.json ` +
          `explicando por que en el commit.`,
        fichero: 'scripts/vigilantes/knip-baseline.json',
      }));
    } else if (ahora < antes) {
      hallazgos.push(hallazgo({
        clave: `codigo-muerto/mejora-${cat}`,
        nivel: 'aviso',
        ambito: 'codigo-muerto',
        titulo: `Bajan los ${etiqueta}: ${antes} → ${ahora}. Baja la linea base`,
        detalle:
          `Se ha limpiado deuda. Poner "${cat}": ${ahora} en ` +
          `scripts/vigilantes/knip-baseline.json para que no vuelva a subir.`,
        fichero: 'scripts/vigilantes/knip-baseline.json',
      }));
    }
  }

  return hallazgos;
}

export default {
  nombre: 'codigo-muerto',
  ambito: 'codigo-muerto',
  descripcion: 'La deuda de codigo muerto no crece (linea base congelada)',
  lento: true,
  ejecutar,
  contar,
};
```

- [ ] **Step 4: Comprobar que hoy da cero hallazgos**

```bash
node -e "import('./scripts/vigilantes/codigo-muerto.mjs').then(async m=>{const h=await m.default.ejecutar();console.log(JSON.stringify(h,null,1));process.exit(h.length?1:0)})"
```

Esperado: `[]` y código de salida 0. Si sale algún hallazgo, la línea base no coincide
con la realidad: corregir los números del JSON con los que devuelve `contar()`.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/codigo-muerto.mjs scripts/vigilantes/knip-baseline.json
git commit -m "feat(vigilantes): trinquete de codigo muerto — la deuda no crece"
```

---

### Task 7: El runner

**Files:**
- Create: `scripts/vigilantes/index.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Escribir el runner**

```js
#!/usr/bin/env node
// scripts/vigilantes/index.mjs
//
// Corre todos los vigilantes, imprime lo que encuentran y decide si la CI se
// para. Uso:
//   node scripts/vigilantes/index.mjs                 todos los estaticos
//   node scripts/vigilantes/index.mjs --rapido        se salta los lentos (knip)
//   node scripts/vigilantes/index.mjs --solo precios  uno concreto
//   node scripts/vigilantes/index.mjs --json out.json ademas escribe el informe
//
// Codigo de salida: 1 si hay algun hallazgo BLOQUEANTE o si un vigilante
// revienta. Los avisos no paran nada.

import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { AnclaPerdida, hallazgo } from './nucleo.mjs';

import precios from './precios.mjs';
import referidos from './referidos.mjs';
import rutasPublicas from './rutas-publicas.mjs';
import cacheApp from './cache-app.mjs';
import codigoMuerto from './codigo-muerto.mjs';

const VIGILANTES = [precios, referidos, rutasPublicas, cacheApp, codigoMuerto];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const C = process.stdout.isTTY
  ? { rojo: '\x1b[31m', ambar: '\x1b[33m', verde: '\x1b[32m', gris: '\x1b[90m', neg: '\x1b[1m', fin: '\x1b[0m' }
  : { rojo: '', ambar: '', verde: '', gris: '', neg: '', fin: '' };

async function main() {
  const soloUno = valor('--solo');
  const rapido = flag('--rapido');
  const destinoJson = valor('--json');

  const aCorrer = VIGILANTES
    .filter((v) => !soloUno || v.nombre === soloUno)
    .filter((v) => !(rapido && v.lento));

  if (!aCorrer.length) {
    console.error(`No hay ningun vigilante llamado "${soloUno}".`);
    console.error('Disponibles: ' + VIGILANTES.map((v) => v.nombre).join(', '));
    process.exit(2);
  }

  const t0 = Date.now();
  const todos = [];
  const porVigilante = [];

  for (const v of aCorrer) {
    const t = Date.now();
    let hallazgos = [];
    let error = null;
    try {
      hallazgos = await v.ejecutar();
    } catch (e) {
      error = e;
      // Un ancla perdida es un hallazgo bloqueante, no un crash del runner: el
      // vigilante se ha quedado ciego y hay que enterarse igual que de un fallo.
      hallazgos = [hallazgo({
        clave: `${v.nombre}/ancla-perdida`,
        nivel: 'bloqueante',
        ambito: v.ambito,
        titulo: e instanceof AnclaPerdida
          ? `El vigilante "${v.nombre}" se ha quedado ciego`
          : `El vigilante "${v.nombre}" ha reventado`,
        detalle: e.message,
        fichero: e.fichero || null,
      })];
    }
    const ms = Date.now() - t;
    porVigilante.push({ nombre: v.nombre, ambito: v.ambito, ms, hallazgos, ok: !error && !hallazgos.length });
    todos.push(...hallazgos);
  }

  // --- Informe por pantalla ---
  console.log('');
  for (const v of porVigilante) {
    const bloq = v.hallazgos.filter((h) => h.nivel === 'bloqueante').length;
    const avi = v.hallazgos.length - bloq;
    const icono = bloq ? `${C.rojo}FALLA${C.fin}` : avi ? `${C.ambar}AVISA${C.fin}` : `${C.verde}  ok ${C.fin}`;
    console.log(`  ${icono}  ${v.nombre.padEnd(16)} ${C.gris}${v.ms} ms${C.fin}`);
  }

  const bloqueantes = todos.filter((h) => h.nivel === 'bloqueante');
  const avisos = todos.filter((h) => h.nivel === 'aviso');

  for (const grupo of [
    { lista: bloqueantes, titulo: 'BLOQUEANTES', color: C.rojo },
    { lista: avisos, titulo: 'AVISOS', color: C.ambar },
  ]) {
    if (!grupo.lista.length) continue;
    console.log(`\n${grupo.color}${C.neg}${grupo.titulo} (${grupo.lista.length})${C.fin}`);
    for (const h of grupo.lista) {
      const donde = h.fichero ? ` ${C.gris}${h.fichero}${h.linea ? ':' + h.linea : ''}${C.fin}` : '';
      console.log(`\n  ${grupo.color}▪${C.fin} ${C.neg}${h.titulo}${C.fin}${donde}`);
      if (h.detalle) console.log(`    ${C.gris}${h.detalle}${C.fin}`);
    }
  }

  const ms = Date.now() - t0;
  console.log('');
  if (!todos.length) {
    console.log(`${C.verde}Todo en orden.${C.fin} ${aCorrer.length} vigilantes, ${ms} ms.\n`);
  } else {
    console.log(
      `${bloqueantes.length} bloqueante(s), ${avisos.length} aviso(s). ` +
      `${aCorrer.length} vigilantes, ${ms} ms.\n`,
    );
  }

  if (destinoJson) {
    const informe = {
      version: 1,
      origen: process.env.GITHUB_ACTIONS ? 'ci' : 'local',
      commit: process.env.GITHUB_SHA || null,
      rama: process.env.GITHUB_REF_NAME || null,
      ejecutado_en: new Date().toISOString(),
      duracion_ms: ms,
      vigilantes: porVigilante.map((v) => ({ nombre: v.nombre, ambito: v.ambito, ms: v.ms, ok: v.ok })),
      hallazgos: todos,
    };
    writeFileSync(destinoJson, JSON.stringify(informe, null, 2), 'utf8');
    console.log(`${C.gris}Informe escrito en ${destinoJson}${C.fin}\n`);
  }

  process.exit(bloqueantes.length ? 1 : 0);
}

main().catch((e) => {
  console.error('El runner de vigilantes ha reventado:', e);
  process.exit(2);
});
```

- [ ] **Step 2: Añadir los scripts a `package.json`**

En el bloque `"scripts"`, junto a `"deadcode"`, añadir:

```json
    "vigilar": "node scripts/vigilantes/index.mjs",
    "vigilar:rapido": "node scripts/vigilantes/index.mjs --rapido",
    "vigilar:test": "node --test scripts/vigilantes/*.test.mjs"
```

- [ ] **Step 3: Correrlo**

```bash
npm run vigilar
```

Esperado: cinco líneas `ok`, `Todo en orden.` y código de salida 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/vigilantes/index.mjs package.json
git commit -m "feat(vigilantes): runner con dos niveles — bloquea lo grave, informa lo demas"
```

---

### Task 8: Colgar los vigilantes de la CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Añadir los pasos al job `check`**

Después del paso `Verificar catálogo de modelos IA`, insertar:

```yaml
      # Vigilantes de invariantes. Lo que cazan no lo caza ningun tipo ni ningun
      # test: cosas que viven en varios sitios a la vez y se desincronizan en
      # silencio (precios, referidos), rutas que se abren sin sesion, la cache
      # de /app, y la deuda de codigo muerto. Detalle en
      # docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md
      - name: Tests de los propios vigilantes
        run: npm run vigilar:test

      - name: Vigilantes de invariantes
        run: node scripts/vigilantes/index.mjs --json vigilancia.json

      - name: Guardar el informe de vigilancia
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vigilancia
          path: vigilancia.json
          retention-days: 14
```

- [ ] **Step 2: Verificar que el YAML es válido**

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!/Vigilantes de invariantes/.test(t))throw new Error('no se añadio');console.log('ok')"
```

Esperado: `ok`.

- [ ] **Step 3: Añadir `vigilancia.json` a `.gitignore`**

```
vigilancia.json
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .gitignore
git commit -m "ci(vigilantes): los invariantes se comprueban en cada PR"
```

---

## Fase 2 — Los vigilantes de base de datos

Estos no pueden correr en CI sin meter una credencial de Supabase en GitHub Actions, y
además no harían falta allí: las RPC se crean por migración aplicada en remoto, no por PR.
Viven **dentro de Postgres**, los llama el panel de staff (que ya está autenticado) y el
canario horario.

### Task 9: La función `vigilancia_bd()`

**Files:**
- Create: `supabase/migrations/20260829090000_vigilancia.sql` (primera parte)

- [ ] **Step 1: Escribir la migración**

```sql
-- Vigilancia: comprobaciones que solo se pueden hacer DENTRO de la base de datos.
--
-- Viven aqui y no en un script de CI a proposito: las RPC y las politicas se
-- crean por migracion aplicada en remoto, no por pull request, asi que un
-- vigilante que solo mirase el repo no las veria nunca. Ademas asi el panel de
-- staff puede preguntar "¿como esta la base de datos AHORA?" sin depender de
-- que haya corrido la CI.

create or replace function public.vigilancia_bd()
returns table(clave text, nivel text, ambito text, titulo text, detalle text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_staff() or auth.role() = 'service_role') then
    raise exception 'not_authorized';
  end if;

  -- 1. LA REGLA DEL PARAMETRO (CLAUDE.md, 23 ago 2026).
  -- Una funcion definer abierta a `authenticated` que recibe parametros y no
  -- menciona ni auth.uid() ni ningun guard: basta cambiar un uuid para operar
  -- sobre otro salon. Asi se colaron doce. Hoy tiene que dar 0.
  return query
  select
    'bd/rpc-sin-guard:' || p.proname,
    'bloqueante',
    'seguridad',
    'La RPC ' || p.proname || '() se fia del parametro que le pasan',
    'Es SECURITY DEFINER, la puede llamar cualquier usuario autenticado, recibe ' ||
    'parametros y no menciona auth.uid(), is_staff(), my_negocio_id_text() ni ' ||
    'exige_mi_negocio(). Multi-tenant roto: cambiando un uuid se opera sobre otro ' ||
    'salon. Anadir: perform public.exige_mi_negocio(<negocio>, <solo_gestor>).'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.pronargs > 0
    and has_function_privilege('authenticated', p.oid, 'execute')
    and pg_get_functiondef(p.oid) !~* '(auth\.uid|is_staff|my_negocio_id_text|exige_mi_negocio|auth\.role)'
    and p.proname not like 'pg\_%';

  -- 2. RLS SIN InitPlan (CLAUDE.md decision 6, 17 ago 2026).
  -- Una politica que llama auth.uid() suelto la ejecuta POR FILA; dentro de un
  -- subselect, una vez por consulta. is_staff() volatil provoco 24 M de seq
  -- scans sobre staff y 456 M de tuplas leidas en citas.
  return query
  select
    'bd/rls-sin-initplan:' || pol.schemaname || '.' || pol.tablename || '.' || pol.policyname,
    'aviso',
    'rendimiento',
    'La politica "' || pol.policyname || '" de ' || pol.tablename || ' llama a auth sin envolver',
    'Envolver la llamada en (select ...): (select auth.uid()), ' ||
    '(select my_negocio_id_text()), (select is_shared_demo_visitor()). Suelta, ' ||
    'Postgres la ejecuta una vez por FILA. Ver migrations/rendimiento-rls-initplan.sql.'
  from pg_policies pol
  where pol.schemaname = 'public'
    and (
      coalesce(pol.qual, '') ~ '(?<!select )\s*auth\.(uid|jwt|role)\(\)'
      or coalesce(pol.with_check, '') ~ '(?<!select )\s*auth\.(uid|jwt|role)\(\)'
    );

  -- 3. AYUDANTES DE RLS QUE NO SON STABLE.
  return query
  select
    'bd/helper-volatil:' || p.proname,
    'bloqueante',
    'rendimiento',
    'El ayudante de RLS ' || p.proname || '() es VOLATILE',
    'Los ayudantes que usan las politicas van STABLE. Volatil, Postgres no puede ' ||
    'cachear el resultado y lo reevalua por fila. is_staff() volatil por si sola ' ||
    'provoco 24 M de seq scans. Anadir STABLE a la definicion.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_staff', 'my_negocio_id_text', 'is_shared_demo_visitor', 'exige_mi_negocio')
    and p.provolatile = 'v';

  -- 4. LOS TIPOS DE SOLICITUD VIVEN EN DOS SITIOS.
  -- El CHECK de la tabla y la RPC crear_solicitud_publica. Si se anade un tipo
  -- en la RPC y no en el CHECK, el formulario devuelve un error 400 opaco.
  return query
  with tipos_check as (
    select unnest(
      regexp_split_to_array(
        regexp_replace(
          (select pg_get_constraintdef(con.oid)
             from pg_constraint con
             join pg_class c on c.oid = con.conrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'solicitudes'
              and con.conname = 'solicitudes_tipo_check'),
          '[^'']*''([^'']*)''[^'']*', E'\\1\n', 'g'
        ), E'\n'
      )
    ) as tipo
  ),
  def_rpc as (
    select coalesce(
      (select pg_get_functiondef(p.oid)
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'crear_solicitud_publica'
        limit 1), '') as cuerpo
  )
  select
    'bd/solicitud-tipo-huerfano:' || t.tipo,
    'aviso',
    'landing',
    'El tipo de solicitud "' || t.tipo || '" esta en el CHECK y no en crear_solicitud_publica',
    'Anadir un tipo obliga a tocar DOS sitios: la funcion crear_solicitud_publica y ' ||
    'el CHECK de la tabla solicitudes. Uno de los dos se ha quedado atras.'
  from tipos_check t, def_rpc d
  where t.tipo is not null and t.tipo <> ''
    and position(t.tipo in d.cuerpo) = 0;

  -- 5. LA TABLA DE REFERIDOS DE LA BD.
  -- Contrasta con scripts/vigilantes/referidos.mjs (10/4/2, tope 30, bienvenida 15).
  return query
  select * from (
    select
      'bd/referidos-' || x.que as clave,
      'bloqueante' as nivel,
      'referidos' as ambito,
      'recompute_referral_discount() ya no usa ' || x.esperado || ' para ' || x.que as titulo,
      'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez. ' ||
      'Si ha cambiado de verdad, actualiza TABLA_REFERIDOS en ' ||
      'scripts/vigilantes/referidos.mjs, la landing, la demo y TabReferidos.' as detalle
    from (values
      ('nivel1', '10'), ('nivel2', '4'), ('nivel3', '2'), ('tope', '30')
    ) as x(que, esperado)
    where (select coalesce(pg_get_functiondef(p.oid), '')
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'recompute_referral_discount'
            limit 1) !~ ('\m' || x.esperado || '\M')
  ) s;

end;
$$;

revoke all on function public.vigilancia_bd() from public, anon;
grant execute on function public.vigilancia_bd() to authenticated, service_role;

comment on function public.vigilancia_bd() is
  'Vigilantes que solo se pueden ejecutar dentro de Postgres: la regla del parametro, '
  'RLS sin InitPlan, ayudantes volatiles, tipos de solicitud y la tabla de referidos. '
  'Solo staff o service_role. Ver docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md';
```

- [ ] **Step 2: Aplicar la migración**

Con el MCP de Supabase (`apply_migration`, proyecto `vtrggiogjrhqtwbhbgia`,
nombre `vigilancia_bd`) o con el CLI.

- [ ] **Step 3: Probarla y comprobar que la regla del parámetro sigue dando 0**

```sql
select nivel, ambito, count(*) from public.vigilancia_bd() group by 1,2 order by 1,2;
select * from public.vigilancia_bd() where clave like 'bd/rpc-sin-guard%';
```

Esperado: la segunda consulta, **0 filas** (es el estado de hoy según CLAUDE.md).
Si devuelve algo, es un agujero multi-tenant real: arreglarlo antes de seguir.

- [ ] **Step 4: Pasar los advisors de seguridad**

Obligatorio tras cualquier migración (decisión 4 de CLAUDE.md). Con el MCP:
`get_advisors` tipo `security`. El total no debe subir respecto al suelo conocido (228).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829090000_vigilancia.sql
git commit -m "feat(vigilantes): la base de datos se audita a si misma"
```

---

### Task 10: El puente `bd.mjs`

**Files:**
- Create: `scripts/vigilantes/bd.mjs`
- Modify: `package.json`

- [ ] **Step 1: Escribir el puente**

```js
// scripts/vigilantes/bd.mjs
//
// Llama a public.vigilancia_bd() y traduce el resultado a hallazgos del mismo
// formato que los estaticos.
//
// NO se cuelga de la CI: haria falta meter una clave de Supabase en GitHub
// Actions y las RPC no se crean por PR, sino por migracion aplicada en remoto.
// Corre en local (`npm run vigilar:bd`, leyendo .env) y en el canario horario.
//
// Regla 9 de CLAUDE.md: la clave se lee del entorno y si falta, se falla a
// gritos. Nunca un valor por defecto.

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ, hallazgo } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// Una secret key (sb_secret_...) viaja en la cabecera apikey, no en Bearer:
// no es un JWT. Ver decision 9 de CLAUDE.md.
const CLAVE = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ejecutar() {
  if (!URL_BASE || !CLAVE) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en el entorno. Los vigilantes de ' +
      'base de datos no pueden correr sin ellas. Ponlas en .env (ver .env.example).',
    );
  }

  const r = await fetch(`${URL_BASE}/rest/v1/rpc/vigilancia_bd`, {
    method: 'POST',
    headers: {
      'apikey': CLAVE,
      'Authorization': `Bearer ${CLAVE}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!r.ok) {
    throw new Error(`vigilancia_bd() ha devuelto ${r.status}: ${await r.text()}`);
  }

  const filas = await r.json();
  return filas.map((f) => hallazgo({
    clave: f.clave,
    nivel: f.nivel,
    ambito: f.ambito,
    titulo: f.titulo,
    detalle: f.detalle,
    fichero: 'base de datos',
  }));
}

export default {
  nombre: 'base-de-datos',
  ambito: 'base-de-datos',
  descripcion: 'La regla del parametro, RLS con InitPlan, ayudantes STABLE y los tipos de solicitud',
  necesitaRed: true,
  ejecutar,
};
```

- [ ] **Step 2: Que el runner lo incluya solo si se pide**

En `scripts/vigilantes/index.mjs`, añadir el import y una lista aparte:

```js
import baseDeDatos from './bd.mjs';
```

y sustituir la línea `const VIGILANTES = [...]` por:

```js
const ESTATICOS = [precios, referidos, rutasPublicas, cacheApp, codigoMuerto];
// Los de red no van en la CI: necesitan credencial. Con --bd se anaden.
const CON_RED = [baseDeDatos];
const VIGILANTES = process.argv.includes('--bd') ? [...ESTATICOS, ...CON_RED] : ESTATICOS;
```

- [ ] **Step 3: Añadir el script a `package.json`**

```json
    "vigilar:bd": "node scripts/vigilantes/index.mjs --bd"
```

- [ ] **Step 4: Probarlo con las credenciales locales**

```bash
npm run vigilar:bd
```

Esperado: seis líneas, la última `base-de-datos`. Si sale `AVISA` con políticas RLS sin
InitPlan, son hallazgos reales; anotarlos, no silenciarlos.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/bd.mjs scripts/vigilantes/index.mjs package.json
git commit -m "feat(vigilantes): puente a los vigilantes de base de datos"
```

---

## Fase 3 — El recolector

### Task 11: Tablas y RPCs de vigilancia

**Files:**
- Create: `supabase/migrations/20260829100000_vigilancia_registro.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Registro de las corridas de vigilancia y sus hallazgos.
--
-- Deliberadamente SEPARADO de errores_cliente. Son dos cosas distintas:
--   errores_cliente = se rompio en casa de un cliente real, ya paso, hay alguien esperando.
--   vigilancia_*    = lo cazo un vigilante, normalmente antes de que llegue a nadie.
-- Mezclarlas entierra el crash de un salon que paga bajo 66 exports muertos.

create table if not exists public.vigilancia_ejecuciones (
  id             bigint generated always as identity primary key,
  creado_en      timestamptz not null default now(),
  origen         text        not null check (origen in ('ci', 'canario', 'local', 'panel')),
  commit_sha     text,
  rama           text,
  duracion_ms    integer,
  total          integer     not null default 0,
  bloqueantes    integer     not null default 0,
  avisos         integer     not null default 0,
  vigilantes     jsonb       not null default '[]'::jsonb,
  ok             boolean generated always as (bloqueantes = 0) stored
);

create index if not exists ix_vig_ejec_creado on public.vigilancia_ejecuciones (creado_en desc);
create index if not exists ix_vig_ejec_origen on public.vigilancia_ejecuciones (origen, creado_en desc);

create table if not exists public.vigilancia_hallazgos (
  id            bigint generated always as identity primary key,
  ejecucion_id  bigint not null references public.vigilancia_ejecuciones(id) on delete cascade,
  creado_en     timestamptz not null default now(),
  clave         text   not null,
  nivel         text   not null check (nivel in ('bloqueante', 'aviso')),
  ambito        text   not null,
  titulo        text   not null,
  detalle       text,
  fichero       text,
  linea         integer,
  -- Mismo ciclo de vida que errores_cliente, para que el panel se lea igual.
  estado        text   not null default 'nuevo'
                check (estado in ('nuevo', 'en_revision', 'resuelto', 'ignorado')),
  notas_staff   text,
  revisado_por  text,
  revisado_en   timestamptz
);

create index if not exists ix_vig_hall_ejec  on public.vigilancia_hallazgos (ejecucion_id);
create index if not exists ix_vig_hall_clave on public.vigilancia_hallazgos (clave, creado_en desc);

alter table public.vigilancia_ejecuciones enable row level security;
alter table public.vigilancia_hallazgos   enable row level security;

-- Sin politicas: nadie toca estas tablas directamente. Se leen por RPC de staff
-- y se escriben con la clave de servicio desde la edge function.

-- ---------------------------------------------------------------------------
-- Lectura para el panel
-- ---------------------------------------------------------------------------

-- Estado de cada ambito: como esta ahora mismo cada parte del producto.
create or replace function public.staff_vigilancia_resumen(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ultima  jsonb;
  v_canario jsonb;
  v_ambitos jsonb;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  select to_jsonb(e) into v_ultima
    from public.vigilancia_ejecuciones e
   where e.origen in ('ci', 'local')
   order by e.creado_en desc limit 1;

  select to_jsonb(e) into v_canario
    from public.vigilancia_ejecuciones e
   where e.origen = 'canario'
   order by e.creado_en desc limit 1;

  -- Por ambito, contando solo los hallazgos que siguen abiertos.
  select coalesce(jsonb_agg(x order by x->>'ambito'), '[]'::jsonb) into v_ambitos
  from (
    select jsonb_build_object(
             'ambito', h.ambito,
             'bloqueantes', count(*) filter (where h.nivel = 'bloqueante'),
             'avisos', count(*) filter (where h.nivel = 'aviso'),
             'ultima_vez', max(h.creado_en)
           ) as x
      from public.vigilancia_hallazgos h
     where h.creado_en > now() - make_interval(days => greatest(p_dias, 1))
       and h.estado in ('nuevo', 'en_revision')
     group by h.ambito
  ) s;

  return jsonb_build_object(
    'ultima_ci', v_ultima,
    'ultimo_canario', v_canario,
    'ambitos', v_ambitos,
    -- Si hace mas de 26 h que no corre el canario, el canario esta muerto y
    -- el verde del panel no significa nada. Avisarlo explicitamente.
    'canario_mudo', (
      v_canario is null
      or (v_canario->>'creado_en')::timestamptz < now() - interval '26 hours'
    )
  );
end;
$$;

-- Los hallazgos abiertos, agrupados por clave (como staff_errores_cliente).
create or replace function public.staff_vigilancia_hallazgos(
  p_dias   integer default 7,
  p_estado text default null,
  p_ambito text default null,
  p_nivel  text default null,
  p_limit  integer default 100
)
returns table(
  clave text, nivel text, ambito text, titulo text, detalle text,
  fichero text, linea integer, estado text, veces integer,
  primera_vez timestamptz, ultima_vez timestamptz,
  notas_staff text, revisado_por text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;

  return query
  select h.clave,
         (array_agg(h.nivel  order by h.creado_en desc))[1],
         (array_agg(h.ambito order by h.creado_en desc))[1],
         (array_agg(h.titulo order by h.creado_en desc))[1],
         (array_agg(h.detalle order by h.creado_en desc))[1],
         (array_agg(h.fichero order by h.creado_en desc))[1],
         (array_agg(h.linea  order by h.creado_en desc))[1],
         (array_agg(h.estado order by h.creado_en desc))[1],
         count(*)::int,
         min(h.creado_en),
         max(h.creado_en),
         (array_agg(h.notas_staff  order by h.revisado_en desc nulls last))[1],
         (array_agg(h.revisado_por order by h.revisado_en desc nulls last))[1]
    from public.vigilancia_hallazgos h
   where h.creado_en > now() - make_interval(days => greatest(p_dias, 1))
     and (p_estado is null or p_estado = '' or h.estado = p_estado)
     and (p_ambito is null or p_ambito = '' or h.ambito = p_ambito)
     and (p_nivel  is null or p_nivel  = '' or h.nivel  = p_nivel)
   group by h.clave
   order by
     -- Los bloqueantes primero, luego por reciente.
     (case when (array_agg(h.nivel order by h.creado_en desc))[1] = 'bloqueante' then 0 else 1 end),
     max(h.creado_en) desc
   limit greatest(p_limit, 1);
end;
$$;

create or replace function public.staff_marcar_hallazgo(
  p_clave  text,
  p_estado text,
  p_notas  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_n     int;
begin
  if not public.is_staff() then
    raise exception 'not_authorized';
  end if;
  if p_estado not in ('nuevo', 'en_revision', 'resuelto', 'ignorado') then
    raise exception 'Estado no valido';
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  update public.vigilancia_hallazgos
     set estado = p_estado,
         revisado_en = case when p_estado = 'nuevo' then null else now() end,
         revisado_por = case when p_estado = 'nuevo' then null
                             else coalesce(v_email, auth.uid()::text) end,
         notas_staff = coalesce(p_notas, notas_staff)
   where clave = p_clave;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'actualizados', v_n, 'estado', p_estado);
end;
$$;

-- ---------------------------------------------------------------------------
-- Escritura (solo service_role: la usa la edge function registrar-vigilancia)
-- ---------------------------------------------------------------------------

create or replace function public.registrar_vigilancia(p_informe jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id    bigint;
  v_bloq  int;
  v_avi   int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'solo service_role';
  end if;

  select count(*) filter (where h->>'nivel' = 'bloqueante'),
         count(*) filter (where h->>'nivel' = 'aviso')
    into v_bloq, v_avi
    from jsonb_array_elements(coalesce(p_informe->'hallazgos', '[]'::jsonb)) h;

  insert into public.vigilancia_ejecuciones
    (origen, commit_sha, rama, duracion_ms, total, bloqueantes, avisos, vigilantes)
  values (
    coalesce(p_informe->>'origen', 'ci'),
    p_informe->>'commit',
    p_informe->>'rama',
    nullif(p_informe->>'duracion_ms', '')::int,
    coalesce(v_bloq, 0) + coalesce(v_avi, 0),
    coalesce(v_bloq, 0),
    coalesce(v_avi, 0),
    coalesce(p_informe->'vigilantes', '[]'::jsonb)
  )
  returning id into v_id;

  insert into public.vigilancia_hallazgos
    (ejecucion_id, clave, nivel, ambito, titulo, detalle, fichero, linea, estado, notas_staff, revisado_por, revisado_en)
  select
    v_id,
    h->>'clave',
    h->>'nivel',
    coalesce(h->>'ambito', 'otros'),
    h->>'titulo',
    h->>'detalle',
    h->>'fichero',
    nullif(h->>'linea', '')::int,
    -- Si este hallazgo ya se marco antes (resuelto/ignorado) y vuelve a salir,
    -- hereda el estado: si no, cada corrida horaria resucitaria lo ignorado y
    -- el panel seria ruido puro.
    coalesce(prev.estado, 'nuevo'),
    prev.notas_staff,
    prev.revisado_por,
    prev.revisado_en
  from jsonb_array_elements(coalesce(p_informe->'hallazgos', '[]'::jsonb)) h
  left join lateral (
    select p.estado, p.notas_staff, p.revisado_por, p.revisado_en
      from public.vigilancia_hallazgos p
     where p.clave = h->>'clave'
     order by p.creado_en desc
     limit 1
  ) prev on true;

  return jsonb_build_object('ok', true, 'ejecucion_id', v_id,
                            'bloqueantes', v_bloq, 'avisos', v_avi);
end;
$$;

revoke all on function public.staff_vigilancia_resumen(integer)          from public, anon;
revoke all on function public.staff_vigilancia_hallazgos(integer, text, text, text, integer) from public, anon;
revoke all on function public.staff_marcar_hallazgo(text, text, text)    from public, anon;
revoke all on function public.registrar_vigilancia(jsonb)                from public, anon, authenticated;

grant execute on function public.staff_vigilancia_resumen(integer)       to authenticated;
grant execute on function public.staff_vigilancia_hallazgos(integer, text, text, text, integer) to authenticated;
grant execute on function public.staff_marcar_hallazgo(text, text, text) to authenticated;
grant execute on function public.registrar_vigilancia(jsonb)             to service_role;
```

- [ ] **Step 2: Aplicar la migración**

Con `apply_migration` del MCP, nombre `vigilancia_registro`.

- [ ] **Step 3: Comprobar que existe y que un anónimo no puede escribir**

```sql
select public.staff_vigilancia_resumen(7);
```

Esperado: un JSON con `ultima_ci: null`, `ultimo_canario: null`, `ambitos: []`,
`canario_mudo: true`.

- [ ] **Step 4: Pasar los advisors de seguridad**

`get_advisors` tipo `security`. Comprobar que no aparece nada nuevo sobre
`vigilancia_ejecuciones` / `vigilancia_hallazgos` más allá de los
`*_security_definer_function_executable` esperados.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829100000_vigilancia_registro.sql
git commit -m "feat(vigilantes): registro de corridas y hallazgos, separado de errores_cliente"
```

---

### Task 12: La edge function `registrar-vigilancia`

**Files:**
- Create: `supabase/functions/registrar-vigilancia/index.ts`
- Modify: `supabase/config.toml`
- Modify: `.env.example`

- [ ] **Step 1: Escribir la función**

```ts
// supabase/functions/registrar-vigilancia/index.ts
//
// Recibe el informe de una corrida de vigilancia (CI o canario) y lo guarda.
//
// NO usa un JWT: quien llama es un workflow de GitHub Actions, que no tiene
// sesion. Autoriza con un token propio (VIGILANCIA_TOKEN), no con una clave de
// Supabase: asi el workflow nunca ve una credencial de la base de datos.
// Por eso lleva verify_jwt = false en config.toml y por eso comprueba por su
// cuenta -- regla 9 de CLAUDE.md: si una funcion esta en esa lista, autoriza
// ella o queda abierta al mundo.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { claveServicio } from '../shared/claveServicio.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-vigilancia-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// Comparacion en tiempo constante: un token no se compara con ===.
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);

  const esperado = Deno.env.get('VIGILANCIA_TOKEN');
  if (!esperado) {
    // Fallo ruidoso: sin token configurado NO se acepta nada. Nunca un valor
    // por defecto (regla 9 de CLAUDE.md).
    console.error('[registrar-vigilancia] falta VIGILANCIA_TOKEN en el entorno');
    return json({ error: 'sin_configurar', porque: 'falta VIGILANCIA_TOKEN' }, 500);
  }

  const recibido = req.headers.get('x-vigilancia-token') || '';
  if (!iguales(recibido, esperado)) {
    return json({ error: 'no_autorizado', porque: 'x-vigilancia-token no coincide' }, 401);
  }

  let informe: Record<string, unknown>;
  try {
    informe = await req.json();
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  if (!Array.isArray((informe as { hallazgos?: unknown }).hallazgos)) {
    return json({ error: 'informe_invalido', porque: 'falta el array hallazgos' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) {
    console.error('[registrar-vigilancia] falta SUPABASE_URL');
    return json({ error: 'sin_configurar', porque: 'falta SUPABASE_URL' }, 500);
  }

  const supabase = createClient(url, claveServicio());
  const { data, error } = await supabase.rpc('registrar_vigilancia', { p_informe: informe });

  if (error) {
    console.error('[registrar-vigilancia] fallo al guardar:', error.message);
    return json({ error: 'fallo_al_guardar', detalle: error.message }, 500);
  }

  return json(data ?? { ok: true });
});
```

- [ ] **Step 2: Añadir `verify_jwt = false` en `supabase/config.toml`**

Junto a las otras funciones que llama la base de datos o un sistema externo:

```toml
[functions.registrar-vigilancia]
# La llama GitHub Actions, que no tiene JWT. Autoriza por su cuenta con
# VIGILANCIA_TOKEN (ver el propio index.ts).
verify_jwt = false
```

- [ ] **Step 3: Añadir la variable a `.env.example`**

```
# Token compartido con GitHub Actions para publicar los informes de vigilancia.
# NO es una clave de Supabase: solo sirve para escribir en vigilancia_*.
# Generar con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
VIGILANCIA_TOKEN=
```

- [ ] **Step 4: Comprobar tipos**

```bash
deno check --no-config supabase/functions/registrar-vigilancia/index.ts
```

Esperado: sin errores.

- [ ] **Step 5: Desplegar y probar que rechaza sin token**

Desplegar con el MCP (`deploy_edge_function`) o el CLI, y después:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/registrar-vigilancia" \
  -H "content-type: application/json" -d '{"hallazgos":[]}'
```

Esperado: `401`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/registrar-vigilancia/index.ts supabase/config.toml .env.example
git commit -m "feat(vigilantes): recolector con token propio, sin claves de Supabase en Actions"
```

---

### Task 13: El emisor `enviar.mjs` y su paso en la CI

**Files:**
- Create: `scripts/vigilantes/enviar.mjs`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Escribir el emisor**

```js
#!/usr/bin/env node
// scripts/vigilantes/enviar.mjs
//
// Manda un informe de vigilancia (el que escribe `index.mjs --json`) al
// recolector. Uso:
//   node scripts/vigilantes/enviar.mjs vigilancia.json
//
// Si faltan VIGILANCIA_URL o VIGILANCIA_TOKEN, avisa y sale con 0: que no se
// pueda publicar el informe NO debe tumbar una CI que ya ha dado su veredicto.
// El veredicto lo da el runner; esto es solo el registro.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: node scripts/vigilantes/enviar.mjs <informe.json>');
  process.exit(2);
}

const url = process.env.VIGILANCIA_URL;
const token = process.env.VIGILANCIA_TOKEN;

if (!url || !token) {
  console.log('[vigilancia] sin VIGILANCIA_URL / VIGILANCIA_TOKEN: no se publica el informe.');
  process.exit(0);
}

const informe = JSON.parse(readFileSync(destino, 'utf8'));

const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vigilancia-token': token },
  body: JSON.stringify(informe),
});

const cuerpo = await r.text();
if (!r.ok) {
  console.error(`[vigilancia] el recolector ha devuelto ${r.status}: ${cuerpo}`);
  process.exit(0); // igual que arriba: no tumbar la CI por el registro
}
console.log(`[vigilancia] informe publicado: ${cuerpo}`);
```

- [ ] **Step 2: Añadir el paso a `.github/workflows/ci.yml`**

Justo después del paso `Vigilantes de invariantes`:

```yaml
      # Publica el informe en el panel de staff. Si los secrets no estan
      # definidos no hace nada y no rompe: el veredicto ya lo dio el paso
      # anterior, esto es solo el registro.
      - name: Publicar el informe de vigilancia
        if: always()
        env:
          VIGILANCIA_URL: ${{ secrets.VIGILANCIA_URL }}
          VIGILANCIA_TOKEN: ${{ secrets.VIGILANCIA_TOKEN }}
        run: node scripts/vigilantes/enviar.mjs vigilancia.json
```

- [ ] **Step 3: Probarlo en local contra la función desplegada**

Con `VIGILANCIA_URL` y `VIGILANCIA_TOKEN` en `.env`:

```bash
node scripts/vigilantes/index.mjs --json C:/tmp/vigilancia.json ; node scripts/vigilantes/enviar.mjs C:/tmp/vigilancia.json
```

Esperado: `[vigilancia] informe publicado: {"ok":true,"ejecucion_id":1,...}`.

- [ ] **Step 4: Verificar que llegó**

```sql
select id, origen, total, bloqueantes, avisos, creado_en from public.vigilancia_ejecuciones order by id desc limit 3;
```

Esperado: una fila con `origen = 'local'`.

- [ ] **Step 5: Commit**

```bash
git add scripts/vigilantes/enviar.mjs .github/workflows/ci.yml
git commit -m "feat(vigilantes): los informes de la CI aterrizan en el panel"
```

---

## Fase 4 — La pestaña Salud del panel

Va **separada de Errores**, no dentro. Son dos cosas con distinta urgencia y distinto ciclo
de vida: Errores es "se rompió en casa de un cliente"; Salud es "lo cazamos antes".

### Task 14: Pestaña y vista

**Files:**
- Modify: `web/admin.html`

- [ ] **Step 1: Añadir el botón de pestaña**

En el bloque `<div class="ad-tabs">` (sobre la línea 290), **antes** de la pestaña Errores:

```html
    <button class="ad-tab" id="tabSal" data-view="salud">Salud<span class="badge" id="badgeSal"></span></button>
```

- [ ] **Step 2: Añadir la vista**

Justo antes de `<!-- SOPORTE.` (sobre la línea 626), insertar:

```html
  <!-- SALUD. Lo que cazan los vigilantes ANTES de que llegue a un cliente.
       Separado de Errores a proposito: alli esta lo que ya se rompio en casa de
       alguien; aqui, lo que se ha detectado solo. -->
  <div id="view-salud" style="display:none">
    <div class="ad-stats" id="statsSal">
      <div class="ad-stat" style="max-width:180px"><div class="n" id="statSalBloq">0</div><div class="l">Bloqueantes</div></div>
      <div class="ad-stat" style="max-width:180px"><div class="n" id="statSalAvi">0</div><div class="l">Avisos</div></div>
      <div class="ad-stat" style="max-width:180px"><div class="n" id="statSalAmb">0</div><div class="l">Ámbitos tocados</div></div>
      <div class="ad-stat" style="max-width:180px"><div class="n" id="statSalCan">—</div><div class="l">Último canario</div></div>
    </div>

    <p style="font-size:12.5px; color:var(--text-sec); margin:-2px 0 16px; line-height:1.5; max-width:760px;">
      Vigilantes automáticos: invariantes que viven en varios sitios a la vez (precios, referidos),
      rutas abiertas sin sesión, caché de la app, código muerto, la regla del parámetro en las RPC
      y el humo de cada pantalla. Corren en cada cambio y cada hora contra producción.
    </p>

    <div id="saludSemaforo" style="margin-bottom:18px"></div>

    <div class="ad-tools">
      <select class="ad-sel" id="fEstadoSal">
        <option value="">Todos los estados</option>
        <option value="nuevo" selected>Nuevos</option>
        <option value="en_revision">En revisión</option>
        <option value="resuelto">Resueltos</option>
        <option value="ignorado">Ignorados</option>
      </select>
      <select class="ad-sel" id="fNivelSal">
        <option value="">Todos los niveles</option>
        <option value="bloqueante">Solo bloqueantes</option>
        <option value="aviso">Solo avisos</option>
      </select>
      <select class="ad-sel" id="fAmbitoSal">
        <option value="">Todos los ámbitos</option>
        <option value="precios">Precios</option>
        <option value="referidos">Referidos</option>
        <option value="seguridad">Seguridad</option>
        <option value="rendimiento">Rendimiento</option>
        <option value="pantallas">Pantallas</option>
        <option value="codigo-muerto">Código muerto</option>
        <option value="landing">Landing</option>
      </select>
      <select class="ad-sel" id="fDiasSal">
        <option value="1">Últimas 24 h</option>
        <option value="7" selected>Últimos 7 días</option>
        <option value="30">Últimos 30 días</option>
      </select>
      <button class="ad-refresh" id="refreshSalBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 1 0 2.13-5.85L2 9"/></svg>
        Actualizar
      </button>
    </div>

    <div class="ad-count" id="countSal"></div>
    <div class="ad-msg" id="salMsg" style="margin-bottom:14px"></div>
    <div class="ad-list" id="listSal"></div>
  </div>
```

- [ ] **Step 3: Escribir el JavaScript de la vista**

Junto a `function loadErrores()` (sobre la línea 2719), añadir:

```js
  var saludLoaded = false;

  var AMBITO_SAL_LABEL = {
    precios: 'Precios', referidos: 'Referidos', seguridad: 'Seguridad',
    rendimiento: 'Rendimiento', pantallas: 'Pantallas', 'codigo-muerto': 'Código muerto',
    landing: 'Landing', 'base-de-datos': 'Base de datos', otros: 'Otros'
  };

  function loadSaludSemaforo() {
    var el = $('saludSemaforo');
    api.client.rpc('staff_vigilancia_resumen', { p_dias: 7 }).then(function (res) {
      if (res.error || !res.data) { el.innerHTML = ''; return; }
      var d = res.data;
      var ci = d.ultima_ci, can = d.ultimo_canario;

      function tarjeta(titulo, ej, extra) {
        if (!ej) {
          return '<div style="flex:1;min-width:220px;padding:12px 16px;border-radius:12px;' +
            'background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.25)">' +
            '<div style="font-size:12px;color:var(--text-ter);margin-bottom:4px">' + titulo + '</div>' +
            '<div style="font-size:13.5px;font-weight:700;color:#94a3b8">Nunca ha corrido</div></div>';
        }
        var mal = ej.bloqueantes > 0;
        var col = mal ? '#f87171' : '#34d399';
        var fondo = mal ? 'rgba(239,68,68,.10)' : 'rgba(16,185,129,.08)';
        var borde = mal ? 'rgba(239,68,68,.35)' : 'rgba(16,185,129,.25)';
        return '<div style="flex:1;min-width:220px;padding:12px 16px;border-radius:12px;' +
          'background:' + fondo + ';border:1px solid ' + borde + '">' +
          '<div style="font-size:12px;color:var(--text-ter);margin-bottom:4px">' + titulo + '</div>' +
          '<div style="font-size:13.5px;font-weight:700;color:' + col + '">' +
          (mal ? '⚠ ' + ej.bloqueantes + ' bloqueante' + (ej.bloqueantes === 1 ? '' : 's') : '✓ Sin bloqueantes') +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-sec);margin-top:3px">' +
          (ej.avisos || 0) + ' aviso' + (ej.avisos === 1 ? '' : 's') +
          ' · ' + fechaCorta(ej.creado_en) +
          (ej.rama ? ' · ' + esc(ej.rama) : '') + '</div>' +
          (extra || '') + '</div>';
      }

      var avisoMudo = d.canario_mudo
        ? '<div style="font-size:11.5px;color:#fbbf24;margin-top:6px">El canario lleva más de 26 h sin correr: este verde no significa nada.</div>'
        : '';

      var chips = (d.ambitos || []).map(function (a) {
        var mal = a.bloqueantes > 0;
        return '<span class="tag" style="background:' + (mal ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)') +
          ';color:' + (mal ? '#f87171' : '#fbbf24') +
          ';border-color:' + (mal ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)') + '">' +
          esc(AMBITO_SAL_LABEL[a.ambito] || a.ambito) + ': ' +
          (a.bloqueantes ? a.bloqueantes + ' bloq' : '') +
          (a.bloqueantes && a.avisos ? ' · ' : '') +
          (a.avisos ? a.avisos + ' avisos' : '') + '</span>';
      }).join(' ');

      el.innerHTML =
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">' +
        tarjeta('Último cambio (CI)', ci, '') +
        tarjeta('Producción (canario horario)', can, avisoMudo) +
        '</div>' +
        (chips ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + chips + '</div>' : '');

      if ($('statSalCan')) {
        $('statSalCan').textContent = can ? fechaCorta(can.creado_en) : '—';
      }
      if ($('statSalAmb')) $('statSalAmb').textContent = (d.ambitos || []).length;
    }).catch(function () { el.innerHTML = ''; });
  }

  function fechaCorta(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var h = Math.round((Date.now() - d.getTime()) / 3600000);
    if (h < 1) return 'hace minutos';
    if (h < 24) return 'hace ' + h + ' h';
    return 'hace ' + Math.round(h / 24) + ' d';
  }

  function loadSalud() {
    loadSaludSemaforo();
    var listEl = $('listSal');
    listEl.innerHTML = '<div class="ad-loading">Cargando vigilancia...</div>';
    clearMsg($('salMsg'));

    api.client.rpc('staff_vigilancia_hallazgos', {
      p_dias: parseInt($('fDiasSal').value, 10) || 7,
      p_estado: $('fEstadoSal').value || null,
      p_ambito: $('fAmbitoSal').value || null,
      p_nivel: $('fNivelSal').value || null,
      p_limit: 200
    }).then(function (res) {
      saludLoaded = true;
      if (res.error) {
        listEl.innerHTML = '';
        msg($('salMsg'), 'err', 'No se pudo cargar la vigilancia: ' + (res.error.message || ''));
        return;
      }
      var filas = res.data || [];
      var bloq = filas.filter(function (f) { return f.nivel === 'bloqueante'; }).length;

      $('statSalBloq').textContent = bloq;
      $('statSalAvi').textContent = filas.length - bloq;
      $('badgeSal').textContent = bloq ? String(bloq) : '';
      $('countSal').textContent = filas.length
        ? filas.length + (filas.length === 1 ? ' hallazgo' : ' hallazgos')
        : '';

      if (!filas.length) {
        listEl.innerHTML = '<div class="ad-empty">Ni un hallazgo con estos filtros. Los vigilantes no ven nada roto.</div>';
        return;
      }

      var html = '';
      filas.forEach(function (f) {
        var estado = f.estado || 'nuevo';
        var borde = f.nivel === 'bloqueante' ? '#ef4444' : '#f59e0b';
        if (estado === 'resuelto') borde = '#34d399';
        else if (estado === 'en_revision') borde = '#3b82f6';
        else if (estado === 'ignorado') borde = 'rgba(148,163,184,.4)';

        html += '<div class="card-row" style="border-left:3.5px solid ' + borde + '" data-clave="' + esc(f.clave) + '">';
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
        html += '<span style="font-size:14px;font-weight:700;color:var(--text);flex:1;min-width:240px">' + esc(f.titulo || '') + '</span>';

        if (f.nivel === 'bloqueante') {
          html += '<span class="tag" style="background:rgba(239,68,68,.14);color:#f87171;border-color:rgba(239,68,68,.36)">Bloqueante</span>';
        } else {
          html += '<span class="tag" style="background:rgba(245,158,11,.14);color:#fbbf24;border-color:rgba(245,158,11,.36)">Aviso</span>';
        }
        html += '<span class="plan free">' + esc(AMBITO_SAL_LABEL[f.ambito] || f.ambito) + '</span>';
        if (estado === 'resuelto') html += '<span class="tag" style="background:rgba(16,185,129,.12);color:#34d399;border-color:rgba(16,185,129,.3)">✓ Resuelto</span>';
        else if (estado === 'en_revision') html += '<span class="tag" style="background:rgba(59,130,246,.12);color:#60a5fa;border-color:rgba(59,130,246,.3)">En revisión</span>';
        else if (estado === 'ignorado') html += '<span class="tag" style="background:rgba(148,163,184,.12);color:#94a3b8;border-color:rgba(148,163,184,.3)">Ignorado</span>';
        html += '<span class="plan free">' + (f.veces || 0) + (f.veces === 1 ? ' vez' : ' veces') + '</span>';
        html += '</div>';

        if (f.detalle) {
          html += '<div style="font-size:12.5px;color:var(--text-sec);line-height:1.55;margin-bottom:8px">' + esc(f.detalle) + '</div>';
        }
        if (f.fichero) {
          html += '<div style="font-size:12px;color:var(--text-ter);font-family:ui-monospace,Menlo,monospace;margin-bottom:8px">' +
            esc(f.fichero) + (f.linea ? ':' + f.linea : '') + '</div>';
        }
        if (f.notas_staff) {
          html += '<div style="font-size:12px;color:var(--text-ter);margin-bottom:8px">Nota: ' + esc(f.notas_staff) +
            (f.revisado_por ? ' — ' + esc(f.revisado_por) : '') + '</div>';
        }

        html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
        html += '<button class="ad-mini sal-marcar" data-clave="' + esc(f.clave) + '" data-estado="en_revision">En revisión</button>';
        html += '<button class="ad-mini sal-marcar" data-clave="' + esc(f.clave) + '" data-estado="resuelto">Resuelto</button>';
        html += '<button class="ad-mini sal-marcar" data-clave="' + esc(f.clave) + '" data-estado="ignorado">Ignorar</button>';
        html += '</div>';
        html += '</div>';
      });
      listEl.innerHTML = html;

      Array.prototype.forEach.call(listEl.querySelectorAll('.sal-marcar'), function (b) {
        b.addEventListener('click', function () {
          var clave = b.getAttribute('data-clave');
          var estado = b.getAttribute('data-estado');
          b.disabled = true;
          api.client.rpc('staff_marcar_hallazgo', { p_clave: clave, p_estado: estado, p_notas: null })
            .then(function (r) {
              if (r.error) { msg($('salMsg'), 'err', r.error.message); b.disabled = false; return; }
              loadSalud();
            });
        });
      });
    });
  }
```

- [ ] **Step 4: Conectar la pestaña**

En el manejador que cambia de vista (junto a `if (err && !erroresLoaded) loadErrores();`,
sobre la línea 2489), añadir:

```js
    if (sal && !saludLoaded) loadSalud();
```

y declarar `sal` igual que se declara `err` en ese bloque (buscar cómo se resuelve `err`
y replicarlo para `view-salud`).

Y junto a los listeners de los filtros de errores (sobre la línea 2870):

```js
  var rSal = $('refreshSalBtn'); if (rSal) rSal.addEventListener('click', loadSalud);
  var fdSal = $('fDiasSal'); if (fdSal) fdSal.addEventListener('change', loadSalud);
  var feSal = $('fEstadoSal'); if (feSal) feSal.addEventListener('change', loadSalud);
  var faSal = $('fAmbitoSal'); if (faSal) faSal.addEventListener('change', loadSalud);
  var fnSal = $('fNivelSal'); if (fnSal) fnSal.addEventListener('change', loadSalud);
```

- [ ] **Step 5: Verificarlo en el navegador**

Arrancar el espejo local y entrar al panel con una cuenta de staff:

```bash
node scripts/serve-web.mjs
```

Abrir `http://localhost:8080/admin.html`, pestaña **Salud**. Debe verse el semáforo con la
corrida `local` publicada en la Task 13, y el aviso "El canario lleva más de 26 h sin correr".

- [ ] **Step 6: Commit**

```bash
git add web/admin.html
git commit -m "feat(vigilantes): pestana Salud en el panel de staff, aparte de Errores"
```

---

## Fase 5 — Smoke de pantallas

Esto es lo que responde "qué botón dejó de funcionar". También es la parte más lenta y la
única que puede ser inestable: por eso clasifica en **tres** estados (verde / flaky / rojo),
no en dos. Un flaky no es una regresión.

### Task 15: El inventario de pantallas

**Files:**
- Create: `tests/smoke/pantallas.ts`

- [ ] **Step 1: Escribir el inventario**

```ts
// tests/smoke/pantallas.ts
//
// Inventario de pantallas del software que el smoke recorre. Es DATOS, no un
// test: si anades una pantalla, anadela aqui y queda vigilada sin escribir un
// spec nuevo.
//
// `publica` = se puede comprobar sin credenciales (sobre la demo compartida).
// Las demas necesitan E2E_EMAIL / E2E_PASSWORD y se saltan si no los hay,
// igual que hace el job e2e de la CI.

export type Pantalla = {
  nombre: string;
  ruta: string;
  /** Texto que TIENE que estar cuando la pantalla ha cargado de verdad. */
  ancla: string | RegExp;
  publica: boolean;
  /** Pantallas que tardan (informes agregan, inventario carga catalogo). */
  lenta?: boolean;
};

export const PANTALLAS: Pantalla[] = [
  // --- Ya cubiertas por specs dedicados, pero el smoke las mira igual ---
  { nombre: 'agenda',         ruta: '/app/citas',         ancla: /Agenda|Citas/i,        publica: true },
  { nombre: 'caja',           ruta: '/app/caja',          ancla: /Caja|Cobros/i,         publica: true },
  { nombre: 'configuracion',  ruta: '/app/configuracion', ancla: /Ajustes|Configuración/i, publica: true },

  // --- Las que HOY no tiene nadie mirando ---
  { nombre: 'clientes',       ruta: '/app/clientes',      ancla: /Clientes|Cartera/i,    publica: true },
  { nombre: 'equipo',         ruta: '/app/equipo',        ancla: /Equipo/i,              publica: true },
  { nombre: 'informes',       ruta: '/app/informes',      ancla: /Informes/i,            publica: true, lenta: true },
  { nombre: 'presupuestos',   ruta: '/app/presupuestos',  ancla: /Presupuestos/i,        publica: true },
  { nombre: 'campanas',       ruta: '/app/campanas',      ancla: /Campañas/i,            publica: true },
  { nombre: 'resenas',        ruta: '/app/resenas',       ancla: /Reseñas/i,             publica: true },
  { nombre: 'lista-espera',   ruta: '/app/lista-espera',  ancla: /espera/i,              publica: true },
  { nombre: 'inventario',     ruta: '/app/inventario',    ancla: /Inventario|Productos/i, publica: true, lenta: true },
  { nombre: 'bandeja',        ruta: '/app/bandeja',       ancla: /Bandeja|Mensajes/i,    publica: true },
  { nombre: 'mi-jornada',     ruta: '/app/mi-jornada',    ancla: /jornada/i,             publica: true },
  { nombre: 'ayuda',          ruta: '/app/ayuda',         ancla: /Ayuda/i,               publica: true },

  // --- Portal publico y paginas del cliente final ---
  { nombre: 'portal-reserva', ruta: '/app/r/demo',        ancla: /Reservar|Servicios/i,  publica: true },
  { nombre: 'portal-resena',  ruta: '/app/resena/demo',   ancla: /valorac|reseñ/i,       publica: true },
];

/** Errores de consola que NO cuentan: ruido conocido de terceros. */
export const RUIDO_CONSOLA: RegExp[] = [
  /Download the React DevTools/i,
  /\[Violation\]/i,
  /favicon\.ico/i,
  // react-native-web avisa de props obsoletas de RN en cada render.
  /"shadow\*" style props are deprecated/i,
  /props\.pointerEvents is deprecated/i,
];

/** Peticiones fallidas que NO cuentan. */
export const RUIDO_RED: RegExp[] = [
  /favicon/i,
  /google-analytics|googletagmanager/i,
  // El realtime de Supabase reconecta solo; un 4xx suelto no es una regresion.
  /\/realtime\/v1\//i,
];
```

- [ ] **Step 2: Commit**

```bash
git add tests/smoke/pantallas.ts
git commit -m "feat(smoke): inventario de las 17 pantallas que hay que vigilar"
```

---

### Task 16: El spec parametrizado

**Files:**
- Create: `tests/smoke/pantallas.spec.ts`
- Modify: `playwright.config.ts` (añadir el smoke a `SPECS_PUBLICOS`)

- [ ] **Step 1: Escribir el spec**

```ts
// tests/smoke/pantallas.spec.ts
//
// Un test por pantalla, generado del inventario. Comprueba lo minimo que
// significa "esta pantalla sigue viva":
//   1. carga y aparece su ancla (no se queda en blanco)
//   2. cero errores de consola que no sean ruido conocido
//   3. cero peticiones 4xx/5xx que no sean ruido conocido
//   4. cada boton visible se puede pulsar sin que explote nada
//
// El punto 4 es el que responde "que boton dejo de funcionar". No comprueba que
// el boton haga lo correcto -- eso es de los specs dedicados -- sino que no
// lanza, no deja la pantalla en blanco y no rompe la navegacion.

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { PANTALLAS, RUIDO_CONSOLA, RUIDO_RED } from './pantallas';

const esRuido = (texto: string, patrones: RegExp[]) => patrones.some((r) => r.test(texto));

type Vigilancia = { consola: string[]; red: string[] };

function vigilar(page: Page): Vigilancia {
  const v: Vigilancia = { consola: [], red: [] };
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!esRuido(t, RUIDO_CONSOLA)) v.consola.push(t);
  });
  page.on('pageerror', (e) => {
    if (!esRuido(String(e), RUIDO_CONSOLA)) v.consola.push(`pageerror: ${e.message}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const u = r.url();
    if (!esRuido(u, RUIDO_RED)) v.red.push(`${r.status()} ${u}`);
  });
  return v;
}

for (const p of PANTALLAS) {
  test(`humo: ${p.nombre}`, async ({ page }) => {
    test.setTimeout(p.lenta ? 90_000 : 60_000);
    const v = vigilar(page);

    await page.goto(p.ruta, { waitUntil: 'domcontentloaded' });

    // 1. La pantalla ha cargado de verdad, no es un marco vacio.
    await expect(page.getByText(p.ancla).first()).toBeVisible({ timeout: 30_000 });

    // 2 y 3. Nada roto durante la carga.
    expect(v.consola, `errores de consola en ${p.nombre}`).toEqual([]);
    expect(v.red, `peticiones fallidas en ${p.nombre}`).toEqual([]);

    // 4. Los botones responden.
    const botones = page.locator('[role="button"]:visible, button:visible');
    const total = Math.min(await botones.count(), 25); // tope: hay pantallas con muchos
    const rutaInicial = new URL(page.url()).pathname;

    for (let i = 0; i < total; i++) {
      const b = botones.nth(i);
      let etiqueta = '';
      try {
        etiqueta = ((await b.innerText({ timeout: 1500 })) || '').trim().slice(0, 40);
      } catch {
        continue; // desaparecio entre medias: no es un fallo
      }
      // Los que sacan de la pantalla o cierran sesion no se pulsan aqui.
      if (/salir|cerrar sesión|volver a la web|eliminar|borrar/i.test(etiqueta)) continue;

      try {
        await b.click({ timeout: 3000, trial: false });
      } catch {
        continue; // tapado por un modal que abrio el click anterior: normal
      }
      await page.waitForTimeout(120);

      // No se ha quedado en blanco.
      const cuerpo = (await page.locator('body').innerText().catch(() => '')) || '';
      expect(cuerpo.trim().length, `la pantalla ${p.nombre} se quedo en blanco tras pulsar "${etiqueta}"`)
        .toBeGreaterThan(20);

      // Si abrio un modal, cerrarlo para que el siguiente click no lo herede.
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(80);
    }

    // Ningun boton nos ha sacado de la pantalla sin querer.
    expect(new URL(page.url()).pathname, `algo saco de ${p.nombre}`).toBe(rutaInicial);

    // 5. Y despues de todo el manoseo, sigue sin haber errores.
    expect(v.consola, `errores de consola al pulsar botones en ${p.nombre}`).toEqual([]);
  });
}
```

- [ ] **Step 2: Añadir el smoke a los specs públicos en `playwright.config.ts`**

En la constante `SPECS_PUBLICOS`, añadir:

```ts
  '**/smoke/pantallas.spec.ts',
```

- [ ] **Step 3: Correrlo en local**

```bash
npm run build:web && npx playwright test tests/smoke/pantallas.spec.ts --project=publico
```

Esperado: la primera vez fallarán varias. **Eso es el resultado**, no un problema del
test: son pantallas que hoy nadie mira. Anotar cada fallo y clasificarlo:
- error real de la aplicación → arreglarlo o abrirlo como tarea,
- ruido de terceros → añadir el patrón a `RUIDO_CONSOLA` / `RUIDO_RED` con un comentario
  que diga por qué es ruido,
- ancla mal elegida → corregir el inventario.

**No relajar el test para que pase.** Si algo se silencia, que quede escrito por qué.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/pantallas.spec.ts playwright.config.ts
git commit -m "feat(smoke): un test por pantalla — carga, consola, red y botones"
```

---

### Task 17: Traducir el resultado de Playwright a hallazgos

**Files:**
- Create: `scripts/vigilantes/smoke-a-hallazgos.mjs`

- [ ] **Step 1: Escribir el traductor**

```js
#!/usr/bin/env node
// scripts/vigilantes/smoke-a-hallazgos.mjs
//
// Convierte el informe JSON de Playwright en un informe de vigilancia, para que
// el smoke de pantallas salga en la misma pestana Salud que el resto.
//
// Uso:
//   npx playwright test tests/smoke --reporter=json > smoke.json
//   node scripts/vigilantes/smoke-a-hallazgos.mjs smoke.json vigilancia-smoke.json canario
//
// Clasifica en TRES estados, no dos: verde / flaky / rojo. Un test que pasa al
// reintento NO es una regresion (el spec de cambiar de vista falla 3 de 5 veces
// con el codigo sin tocar) pero si es informacion: sale como aviso con su tasa.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [entrada, salida, origen = 'ci'] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node scripts/vigilantes/smoke-a-hallazgos.mjs <playwright.json> <salida.json> [origen]');
  process.exit(2);
}

const informe = JSON.parse(readFileSync(entrada, 'utf8'));
const hallazgos = [];
const vigilantes = [];

function recorrer(suites) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        const intentos = t.results || [];
        const paso = intentos.some((r) => r.status === 'passed');
        const fallo = intentos.filter((r) => r.status === 'failed' || r.status === 'timedOut');
        const nombre = spec.title || 'sin nombre';
        const pantalla = nombre.replace(/^humo:\s*/, '');
        const ms = intentos.reduce((n, r) => n + (r.duration || 0), 0);

        vigilantes.push({ nombre: `humo/${pantalla}`, ambito: 'pantallas', ms, ok: paso && !fallo.length });

        if (!paso) {
          const err = fallo[fallo.length - 1]?.error?.message || 'sin mensaje';
          hallazgos.push({
            clave: `pantallas/rota-${pantalla}`,
            nivel: 'bloqueante',
            ambito: 'pantallas',
            titulo: `La pantalla ${pantalla} esta rota`,
            detalle: limpiar(err),
            fichero: 'tests/smoke/pantallas.spec.ts',
            linea: null,
          });
        } else if (fallo.length) {
          hallazgos.push({
            clave: `pantallas/flaky-${pantalla}`,
            nivel: 'aviso',
            ambito: 'pantallas',
            titulo: `La pantalla ${pantalla} falla ${fallo.length} de ${intentos.length} veces`,
            detalle:
              `Paso al reintento, asi que NO es una regresion; pero es inestable. ` +
              `Ultimo fallo: ${limpiar(fallo[fallo.length - 1]?.error?.message || '')}`,
            fichero: 'tests/smoke/pantallas.spec.ts',
            linea: null,
          });
        }
      }
    }
    recorrer(s.suites);
  }
}

// Los mensajes de Playwright traen colores ANSI y 40 lineas de contexto.
function limpiar(t) {
  return String(t).replace(/\x1B\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' · ').slice(0, 900);
}

recorrer(informe.suites);

writeFileSync(salida, JSON.stringify({
  version: 1,
  origen,
  commit: process.env.GITHUB_SHA || null,
  rama: process.env.GITHUB_REF_NAME || null,
  ejecutado_en: new Date().toISOString(),
  duracion_ms: informe.stats?.duration ?? null,
  vigilantes,
  hallazgos,
}, null, 2), 'utf8');

const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
console.log(`[smoke] ${vigilantes.length} pantallas, ${bloq} rotas, ${hallazgos.length - bloq} inestables.`);
```

- [ ] **Step 2: Probarlo en local**

```bash
npx playwright test tests/smoke --project=publico --reporter=json > C:/tmp/smoke.json
```

```bash
node scripts/vigilantes/smoke-a-hallazgos.mjs C:/tmp/smoke.json C:/tmp/vig-smoke.json local && node scripts/vigilantes/enviar.mjs C:/tmp/vig-smoke.json
```

Esperado: `[smoke] 17 pantallas, N rotas, M inestables.` y el informe publicado.
Comprobar en el panel → Salud que aparecen con ámbito **Pantallas**.

- [ ] **Step 3: Añadir el paso al job `e2e` de `.github/workflows/ci.yml`**

Después del paso `E2E públicos (sin credenciales)`:

```yaml
      # El smoke de pantallas, traducido a hallazgos para la pestana Salud.
      # `continue-on-error` NO: si una pantalla esta rota, la CI tiene que
      # ponerse roja. Lo que no puede tumbar la CI es el envio del informe.
      - name: Smoke de pantallas
        id: smoke
        run: npx playwright test tests/smoke --project=publico --reporter=json > smoke.json

      - name: Publicar el smoke en el panel
        if: always()
        env:
          VIGILANCIA_URL: ${{ secrets.VIGILANCIA_URL }}
          VIGILANCIA_TOKEN: ${{ secrets.VIGILANCIA_TOKEN }}
        run: |
          node scripts/vigilantes/smoke-a-hallazgos.mjs smoke.json vigilancia-smoke.json ci
          node scripts/vigilantes/enviar.mjs vigilancia-smoke.json
```

- [ ] **Step 4: Commit**

```bash
git add scripts/vigilantes/smoke-a-hallazgos.mjs .github/workflows/ci.yml
git commit -m "feat(smoke): verde / inestable / roto — un flaky no es una regresion"
```

---

## Fase 6 — El canario de producción

Lo que la CI no puede ver: caché mal servida, una variable de entorno de Vercel que no se
actualizó, un deploy a medias, Supabase caído. Casi gratis: `playwright.config.ts` ya
admite `PLAYWRIGHT_BASE_URL`.

### Task 18: El workflow programado

**Files:**
- Create: `.github/workflows/canario.yml`

- [ ] **Step 1: Escribir el workflow**

```yaml
name: Canario

# Cada hora, el mismo smoke de pantallas pero contra PRODUCCION. Detecta lo que
# la CI no puede ver: la cache, una variable de Vercel sin actualizar, un deploy
# a medias, Supabase caido. Ver
# docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md
on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:

concurrency:
  group: canario
  cancel-in-progress: true

jobs:
  humo:
    name: Humo contra www.mechaa.es
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Instalar navegador de Playwright
        run: npx playwright install --with-deps chromium

      # Contra produccion NO hace falta build:web ni servidor local: la app ya
      # esta desplegada. El webServer de playwright.config.ts se salta solo
      # porque reuseExistingServer no aplica cuando hay PLAYWRIGHT_BASE_URL
      # externo -- por eso se pasa tambien PW_NO_SERVER (ver el config).
      - name: Smoke contra produccion
        id: smoke
        continue-on-error: true
        env:
          PLAYWRIGHT_BASE_URL: https://www.mechaa.es
          PW_NO_SERVER: '1'
        run: npx playwright test tests/smoke --project=publico --reporter=json > smoke.json

      # El canario SIEMPRE publica, tanto si va bien como si va mal: si dejara de
      # publicar, el panel no distinguiria "todo verde" de "el canario esta muerto"
      # (por eso staff_vigilancia_resumen marca canario_mudo a las 26 h).
      - name: Publicar el resultado
        if: always()
        env:
          VIGILANCIA_URL: ${{ secrets.VIGILANCIA_URL }}
          VIGILANCIA_TOKEN: ${{ secrets.VIGILANCIA_TOKEN }}
        run: |
          node scripts/vigilantes/smoke-a-hallazgos.mjs smoke.json vigilancia-canario.json canario
          node scripts/vigilantes/enviar.mjs vigilancia-canario.json

      - name: Guardar el informe si algo falla
        if: steps.smoke.outcome == 'failure'
        uses: actions/upload-artifact@v4
        with:
          name: canario-report
          path: |
            playwright-report/
            smoke.json
          retention-days: 7

      - name: Poner el workflow en rojo si hay pantallas rotas
        if: steps.smoke.outcome == 'failure'
        run: exit 1
```

- [ ] **Step 2: Que Playwright no arranque el servidor local contra producción**

En `playwright.config.ts`, sustituir la clave `webServer` por:

```ts
  // Contra produccion no hay servidor local que arrancar. Sin esto, Playwright
  // intenta levantar scripts/serve-web.mjs en el runner del canario, no
  // encuentra web/app (no se ha compilado) y falla antes de empezar.
  webServer: process.env.PW_NO_SERVER
    ? undefined
    : {
        command: 'node scripts/serve-web.mjs',
        url: 'http://127.0.0.1:8080',
        reuseExistingServer: true,
        timeout: 30000,
      },
```

- [ ] **Step 3: Probar el canario en local**

```bash
PW_NO_SERVER=1 PLAYWRIGHT_BASE_URL=https://www.mechaa.es npx playwright test tests/smoke --project=publico --reporter=list
```

Esperado: las mismas pantallas que en local. Si alguna falla **solo** aquí, es exactamente
el tipo de fallo que este canario existe para cazar: anotarlo.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/canario.yml playwright.config.ts
git commit -m "feat(canario): humo horario contra produccion — lo que la CI no puede ver"
```

---

### Task 19: Los secrets del repositorio

**Manual, del usuario. No lo puede hacer un agente.**

- [ ] **Step 1: Generar el token**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 2: Ponerlo en los tres sitios**

1. **Supabase** → Edge Functions → Secrets → `VIGILANCIA_TOKEN` = el valor generado.
2. **GitHub** → repo → Settings → Secrets and variables → Actions:
   - `VIGILANCIA_TOKEN` = el mismo valor
   - `VIGILANCIA_URL` = `https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/registrar-vigilancia`
3. **`.env` local** (a mano, con el editor — nunca `echo >>` en PowerShell, escribe UTF-16
   y deja el fichero ilegible para el CLI de Supabase):
   ```
   VIGILANCIA_TOKEN=...
   VIGILANCIA_URL=https://vtrggiogjrhqtwbhbgia.supabase.co/functions/v1/registrar-vigilancia
   ```

- [ ] **Step 3: Comprobar de punta a punta**

Lanzar el canario a mano desde GitHub → Actions → Canario → "Run workflow", y después
mirar el panel → Salud: la tarjeta "Producción (canario horario)" debe dejar de decir
"Nunca ha corrido".

---

## Fase 7 — Dejarlo escrito

### Task 20: Documentar la decisión en CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Añadir la decisión de diseño 10**

Después de la decisión 9 (las claves de Supabase), añadir:

```markdown
10. **VIGILANTES: lo que se rompe en silencio ya tiene quien lo mire (29 ago 2026).**
    Detalle y runbook: `docs/superpowers/plans/2026-08-28-vigilantes-de-regresion.md`.
    - **Tres capas.** (1) `scripts/vigilantes/*.mjs`: invariantes estáticos, sin red, en
      cada PR (`npm run vigilar`). (2) `public.vigilancia_bd()`: lo que solo se puede
      comprobar dentro de Postgres (la regla del parámetro, RLS sin InitPlan, ayudantes
      volátiles). (3) `tests/smoke/`: una pantalla, un test — carga, consola, red y
      botones. Las tres publican en la pestaña **Salud** del panel de staff.
    - **Dos niveles.** `bloqueante` tumba la CI (un usuario real vería algo falso o roto);
      `aviso` solo informa. La deuda heredada nace en `aviso` con línea base congelada
      (`knip-baseline.json`): así el trinquete solo gira hacia abajo y nadie acaba
      quitando el linter porque la CI lleva un mes en rojo.
    - **Un ancla perdida FALLA.** Si un regex deja de casar, el vigilante se ha quedado
      ciego y eso es un hallazgo bloqueante, no un verde. Es el único modo de que esta
      herramienta no se pudra sola. Si molesta, se arregla el ancla, nunca la comprobación.
    - **Salud ≠ Errores.** `errores_cliente` es "se rompió en casa de un cliente real, ya
      pasó, hay alguien esperando". `vigilancia_*` es "lo cazamos antes". Mezclarlas
      entierra el crash de un salón que paga bajo 66 exports muertos. Por eso son dos
      tablas y dos pestañas.
    - **Los invariantes repartidos son la fábrica de regresiones**, no el código: precios
      en 3 sitios, referidos en 4, tipos de solicitud en 2. Al añadir uno nuevo, añade su
      vigilante en el mismo commit o la próxima deriva será silenciosa otra vez.
    - **GitHub Actions NUNCA ve una clave de Supabase.** El recolector
      (`registrar-vigilancia`) autoriza con `VIGILANCIA_TOKEN`, un token propio que solo
      sirve para escribir en `vigilancia_*`. Va con `verify_jwt = false` y por eso
      comprueba por su cuenta (regla 9).
    - **El canario mudo no es verde.** Si lleva más de 26 h sin correr,
      `staff_vigilancia_resumen` lo marca y el panel lo dice: un panel en verde porque
      nadie está mirando es peor que uno en rojo.
    - Correr: `npm run vigilar` · `npm run vigilar:bd` · `npm run vigilar:test` ·
      `npx playwright test tests/smoke --project=publico`.
```

- [ ] **Step 2: Corregir dos cosas que CLAUDE.md dice y ya no son verdad**

Detectadas al construir esto:
1. Las migraciones ya **no** están en `migrations/`: las históricas se movieron a
   `archive/migraciones-legacy/` y las nuevas van a `supabase/migrations/`. Actualizar las
   referencias de la sección "Stack y arquitectura" y de las decisiones 4 y 6.
2. La decisión 2 dice que las rutas exentas de auth son `r` y `resena`; en realidad son
   siete (`r`, `resena`, `cita`, `pago`, `pagar`, `presupuesto`, `contacto`). Actualizarla
   — es justo la deriva que el vigilante de la Task 4 existe para impedir.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(normas): regla 10 — los vigilantes, y dos cosas que ya no eran verdad"
```

---

## Repaso final

**Cobertura del diseño acordado en el brainstorming:**

| Acordado | Dónde queda |
|---|---|
| Precios cuadran en 3 sitios | Task 2 |
| Referidos cuadran en 4 sitios | Task 3 + `vigilancia_bd()` §5 |
| Regla del parámetro (RPC sin guard) | `vigilancia_bd()` §1 |
| Rutas exentas de auth | Task 4 |
| Caché de `/app` | Task 5 |
| Tipos de solicitud en 2 sitios | `vigilancia_bd()` §4 |
| Planes cuadran | **Parcial**: Task 2 cubre los precios. El gate por pantalla (`withPlanGate` ↔ `lib/planes.ts` ↔ el 402 del servidor) no tiene vigilante todavía — ver "Lo que este plan NO hace" |
| RLS InitPlan | `vigilancia_bd()` §2 y §3 |
| Código muerto con línea base | Task 6 |
| Recorridos demo y modelos IA absorbidos al runner | **No**: siguen como scripts propios en la CI. Absorberlos es cosmético y puede esperar |
| Smoke de pantallas | Tasks 15–17 |
| Canario de producción | Task 18 |
| Recolector sin claves de Supabase | Tasks 11–13 |
| Pestaña Salud separada de Errores | Task 14 |
| Tres estados (verde/flaky/rojo) | Task 17 |

**Lo que este plan NO hace, dicho claro:**

- **No comprueba que un botón haga lo correcto**, solo que no explote. Eso son los specs
  dedicados (`tests/*.spec.ts`), que siguen siendo necesarios.
- **No cubre el nativo.** Todo el smoke es web. El nativo va por detrás y hoy no es el
  producto real.
- **No vigila la coherencia de los gates de plan** (que `withPlanGate('inventario')` y el
  402 de la edge hablen de la misma función). Es un vigilante más, del mismo estilo que el
  de precios, pero necesita leer los `withPlanGate` de 23 pantallas y cruzarlos con
  `FuncionPlan`. Queda anotado como siguiente.
- **El smoke tarda ~4 min** y usa la Supabase real (tenant demo). Una caída de Supabase
  pone la CI en rojo sin que nadie haya roto nada — el mismo compromiso que ya asume el
  job `e2e` de hoy.
