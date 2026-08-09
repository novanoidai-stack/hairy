# Portal de reservas: desbloquear reserva, móvil y reseñas reales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente pueda reservar de verdad desde el móvil en `/app/r/<slug>`, que nada se recorte, y que las reseñas mostradas sean las reales del salón y no un mock.

**Architecture:** Todo el trabajo de UI vive en un solo fichero, `app/r/[slug].web.tsx` (983 líneas). Se corrige primero el bloqueo funcional en un commit aislado y desplegable, después se extraen cuatro primitivas de maquetación que hacen imposible volver a introducir los recortes, y por último se amplía la RPC `resenas_publicas` y se conecta el bloque de reseñas a datos reales. No se reescribe la página: contiene i18n, analytics, captcha, reserva exprés, reserva de grupo y pagos que funcionan.

**Tech Stack:** Expo Router (web build), React 18 con estilos inline, Supabase (Postgres + RPC `SECURITY DEFINER`), Playwright para E2E, Deno para tests unitarios de lógica pura en `lib/`.

**Spec:** `docs/superpowers/specs/2026-08-09-portal-reservas-movil-resenas-design.md`

## Global Constraints

- Proyecto Supabase: **Mecha**, ref `vtrggiogjrhqtwbhbgia`. No confundir con `aujlzfmrtafbmmjybjxz` (novanoidai-stack).
- El repositorio real es `C:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy`. **Nunca `git add -A`**: el árbol tiene ficheros temporales sueltos (`temp_*.txt`, `diff_*.txt`, `tsc_output.txt`). Añadir siempre rutas explícitas.
- Ninguna columna del grupo `mecha_*` puede salir al portal público. Tampoco `respuesta_borrador`, `ip_origen`, `cliente_id` ni `cita_id`.
- Nunca mostrar un número de reseñas o una media inventados. Sin datos, no se pinta el bloque.
- El portal se sirve en `/app/r/<slug>`, no en `/r/<slug>` (rewrite de `vercel.json`).
- Idioma de la UI: español. Los textos nuevos siguen el tono de los existentes.
- Tests unitarios de lógica pura: `deno test <fichero>`. E2E: `npx playwright test`.
- `deno.lock` se regenera solo y rompe `git stash pop`. Si estorba: `git checkout deno.lock` antes del pop.
- Verificar **en producción** además de en local: CSP, `buildCommand` y latencia esconden bugs que en local no aparecen.

---

## File Structure

| Fichero | Responsabilidad | Acción |
|---|---|---|
| `app/r/[slug].web.tsx` | Portal público completo | Modificar |
| `lib/reservaPublica.ts` | Tipos y llamadas RPC del portal | Modificar (tipos de reseña) |
| `lib/portalResenas.ts` | Lógica pura de reseñas: distribución, filtrado de campos públicos | **Crear** |
| `migrations/portal-resenas-campos-publicos.sql` | Ampliar `resenas_publicas` | **Crear** |
| `tests/portal-reserva.spec.ts` | E2E del portal | **Crear** |
| `lib/portalResenas.test.ts` | Tests deno de la lógica pura | **Crear** |

`lib/portalResenas.ts` existe para sacar de la página la única lógica que se puede testear en aislamiento (calcular porcentajes de barras, decidir qué sub-notas se pintan). El resto es render y se cubre con Playwright.

---

### Task 1: Desbloquear la reserva

Commit aislado y desplegable por sí solo. Sin rediseño, sin migración. Es lo que hace que un cliente pueda reservar hoy.

**Files:**
- Modify: `app/r/[slug].web.tsx:248`, `:267`, `:709`, `:747`, `:822`, `:823`
- Test: `tests/portal-reserva.spec.ts` (crear)

**Interfaces:**
- Consumes: nada.
- Produces: nada que consuman tareas posteriores. La Task 8 amplía `tests/portal-reserva.spec.ts`.

- [ ] **Step 1: Escribir el test E2E que falla**

Crear `tests/portal-reserva.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

const SLUG = 'demo';

test.describe('Portal de reservas — flujo de reserva', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('al elegir servicio se piden dias y horas al servidor', async ({ page }) => {
    const rpcCalls: string[] = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/rest/v1/rpc/')) rpcCalls.push(u.split('/rpc/')[1].split('?')[0]);
    });

    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Corte caballero/ }).click();

    await expect
      .poll(() => rpcCalls.filter((c) => c === 'disponibilidad_publica').length, { timeout: 15000 })
      .toBeGreaterThan(0);
    expect(rpcCalls).toContain('portal_dias_disponibles');
  });

  test('al pulsar un dia se pinta una respuesta de horas, no el vacio mudo', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Corte caballero/ }).click();

    const dia = page.getByRole('button', { name: /Hoy|Mañana/ }).first();
    await dia.click();

    const horas = page.locator('button', { hasText: /^\d{1,2}:\d{2}$/ });
    const sinHuecos = page.getByText(/Sin huecos este día/);
    await expect(horas.first().or(sinHuecos)).toBeVisible({ timeout: 15000 });
  });

  test('no hay mojibake en el texto renderizado', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    const texto = await page.locator('body').innerText();
    expect(texto).not.toMatch(/â€|Ã¡|Â¡|â‚¬|Ã©/);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: FAIL. El primer test agota los 15s porque `disponibilidad_publica` no se llama nunca. El tercero falla encontrando `â€"` y `â‚¬`.

- [ ] **Step 3: Quitar la guarda del asistente viejo**

En `app/r/[slug].web.tsx:248`, sustituir:

```typescript
    if (step !== 'fecha' || !servicio) return;
```

por:

```typescript
    if (!servicio) return;
```

En `:267`, la misma sustitución (es la línea inicial del segundo `useEffect`, el que llama a `getDisponibilidad`).

Motivo: la página ya no es un asistente por pasos. Las tres secciones se pintan apiladas a la vez, así que `step` nunca llega a `'fecha'` y ninguno de los dos efectos llegaba a ejecutarse.

- [ ] **Step 4: Corregir el mojibake**

Cuatro sustituciones literales en el mismo fichero:

| Línea | Buscar | Sustituir |
|---|---|---|
| `:709` | `'â€"'` | `'—'` |
| `:747` | `Â¡Reserva confirmada!` | `¡Reserva confirmada!` |
| `:822` | `Â¡Perfecto, {nombre}!` | `¡Perfecto, {nombre}!` |
| `:823` | `â€"` (dentro del texto de espera) | `—` |

Después barrer el fichero entero por si queda alguno:

```bash
grep -n 'â€\|Ã¡\|Â¡\|â‚¬\|Ã©' 'app/r/[slug].web.tsx'
```

Expected: sin resultados. Si aparece alguno más, corregirlo igual.

Nota: el `12â‚¬` que se ve en producción no está en este fichero como literal — sale de formatear el precio. Si tras el barrido sigue apareciendo en el navegador, el origen es el formateador de moneda y hay que revisar `lib/` en la Task 8.

- [ ] **Step 5: Ejecutar los tests para verificar que pasan**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS los tres.

- [ ] **Step 6: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "fix(portal): desbloquear la seleccion de dia y hora

Los dos efectos que piden dias y horas seguian atados al step machine
del asistente viejo. La pagina se convirtio a scroll unico, asi que step
nunca llega a 'fecha' y disponibilidad_publica no se llamaba nunca:
nadie podia reservar. Ademas corrige el mojibake heredado de un
round-trip a Latin-1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: La etiqueta de la señal, y fuera las queries muertas

**Files:**
- Modify: `app/r/[slug].web.tsx:179`, `:190-192`, `:728`
- Test: `tests/portal-reserva.spec.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: nada.

**Contexto:** `cobroReserva` se alimenta de `supabase.from('negocios')`, tabla que **no existe** (es el 404 de la consola). Se usa en un solo sitio, `:728`, y sólo elige el texto de una etiqueta. No entra en ninguna lógica de cobro. Pero hoy el portal promete "Pago en el salón el día de la cita" incluso en servicios que exigen señal.

No hay columna de depósito a nivel de negocio: el prepago es **por servicio**, y `portal_info(slug)` ya devuelve `prepago` (booleano) dentro de cada elemento de `servicios[]`. O sea, el dato ya está cargado.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/portal-reserva.spec.ts`, dentro del `describe`:

```typescript
  test('la etiqueta de pago respeta el prepago del servicio elegido', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /Corte caballero/ }).click();
    const etiqueta = page.getByText(/Pago en el salón el día de la cita|Se requerirá señal de reserva/);
    await expect(etiqueta).toBeVisible();
  });

  test('no se piden tablas ni columnas inexistentes', async ({ page }) => {
    const fallos: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400 && res.url().includes('/rest/v1/')) {
        fallos.push(`${res.status()} ${res.url()}`);
      }
    });
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    expect(fallos.filter((f) => f.includes('negocios'))).toHaveLength(0);
  });
```

Nota para quien implemente: el primer test es deliberadamente laxo (acepta cualquiera de las dos etiquetas) porque el salón demo puede no tener ningún servicio con prepago. Lo que de verdad blinda el comportamiento es el segundo test más el test unitario del Step 3.

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium -g "tablas ni columnas"`

Expected: FAIL, con un `404 .../rest/v1/negocios?select=cobro_reserva&slug=eq.demo` en la lista.

- [ ] **Step 3: Borrar el estado y la query muertos**

En `app/r/[slug].web.tsx:179`, borrar la línea entera:

```typescript
  const [cobroReserva, setCobroReserva] = useState(0);
```

En `:190-192`, borrar el bloque entero:

```typescript
        const { data: negData } = await supabase.from('negocios').select('cobro_reserva').eq('slug', slug).single();
        if (negData && !cancel) {
          setCobroReserva(negData.cobro_reserva || 0);
        }
```

Dejar la query de `fondo_portal_url` de `:194` **tal cual**, pero añadirle encima este comentario:

```typescript
        // OJO: negocio_portal.fondo_portal_url NO existe como columna (da 400).
        // Se conserva la llamada a proposito para poder recuperar la funcion de
        // fondo de portal mas adelante; hoy no hace nada. Ver el spec del 2026-08-09.
```

- [ ] **Step 4: Hacer que la etiqueta lea el servicio**

En `:728`, sustituir `cobroReserva > 0` por `servicio?.prepago`:

```typescript
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5c5249' }}><Icon name="check" size={13} color="#0f9d6b" /> {servicio?.prepago ? 'Se requerirá señal de reserva' : 'Pago en el salón el día de la cita'}</div>
```

- [ ] **Step 5: Ejecutar para verificar que pasa**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS todos.

- [ ] **Step 6: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "fix(portal): la senal se decide por servicio, no por una tabla que no existe

cobroReserva salia de supabase.from('negocios'), tabla inexistente, asi
que valia siempre 0 y el portal prometia pago en el salon incluso en
servicios con senal. El prepago es por servicio y portal_info ya lo
devuelve: cero queries nuevas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Fuera la serif y los números inventados de la cabecera

**Files:**
- Modify: `app/r/[slug].web.tsx:498`, `:523`, `:592`, `:614`, `:671`, `:747`, `:772`, `:822`
- Test: `tests/portal-reserva.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

**Contexto:** `'Instrument Serif',serif` aparece en 7 encabezados y además de forma incoherente (la sección 1 va en Inter, las secciones 2 y 3 en serif). Decisión del usuario: fuera del todo, Inter en todo.

Aparte, `:498` pinta `{resenas?.media || '4.9'}` y `{resenas?.total || 182}` en la cabecera fija. Si la petición falla, el portal de un salón real anuncia 4,9 estrellas sobre 182 reseñas inexistentes.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/portal-reserva.spec.ts`:

```typescript
  test('no queda Instrument Serif en ningun estilo computado', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const conSerif = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((e) =>
        getComputedStyle(e).fontFamily.includes('Instrument Serif')
      ).length
    );
    expect(conSerif).toBe(0);
  });

  test('la cabecera no inventa una nota ni un numero de resenas', async ({ page }) => {
    await page.route('**/rest/v1/rpc/resenas_publicas', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    );
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain('182');
    expect(texto).not.toContain('4.9');
  });
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium -g "Instrument Serif|no inventa"`

Expected: FAIL ambos. El primero cuenta 3 o más elementos; el segundo encuentra `182`.

- [ ] **Step 3: Quitar la serif**

Sustituir en las 7 apariciones `fontFamily: "'Instrument Serif',serif"` por `fontFamily: 'Inter,system-ui,sans-serif'`. Están en `:523`, `:592`, `:614`, `:671`, `:747`, `:772`, `:822`.

Comprobar que no queda ninguna:

```bash
grep -n 'Instrument Serif' 'app/r/[slug].web.tsx'
```

Expected: sin resultados.

- [ ] **Step 4: Quitar los fallbacks inventados de la cabecera**

En `:498`, sustituir el bloque:

```typescript
              <IconStarFilled size={14} /> <b style={{ color: '#1c1814' }}>{resenas?.media || '4.9'}</b>&nbsp;· {resenas?.total || 182} reseñas
```

por una versión que sólo pinta si hay datos reales:

```typescript
              {resenas && resenas.total > 0 ? (
                <><IconStarFilled size={14} /> <b style={{ color: '#1c1814' }}>{resenas.media}</b>&nbsp;· {resenas.total} {resenas.total === 1 ? 'reseña' : 'reseñas'}</>
              ) : null}
```

- [ ] **Step 5: Ejecutar para verificar que pasa**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS todos.

- [ ] **Step 6: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "fix(portal): Inter en todo y fuera la nota inventada de la cabecera

Instrument Serif estaba aplicada de forma incoherente (seccion 1 en Inter,
2 y 3 en serif). Y la cabecera caia a '4.9 sobre 182 resenas' si la
peticion fallaba: una afirmacion cuantificada y falsa sobre un negocio
real en una pagina publica.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Primitivas de maquetación

**Files:**
- Modify: `app/r/[slug].web.tsx` (añadir componentes cerca del inicio, antes del componente de página; sustituir usos en `:489`, `:521`, `:527`, `:592`, `:614`, `:929`, `:944`)
- Test: `tests/portal-reserva.spec.ts`

**Interfaces:**
- Consumes: `useResponsive()` de la línea 118, que ya devuelve `{ isMobile }`.
- Produces:
  - `PortalContainer({ children, padMobile, padDesktop }: { children: React.ReactNode; padMobile: string; padDesktop: string })`
  - `SectionHeading({ children }: { children: React.ReactNode })`
  - `ResponsiveGrid({ children, mobile, desktop, gap }: { children: React.ReactNode; mobile: string; desktop: string; gap: number })`

**Contexto:** los recortes del móvil (#2 y #3 del spec) los causa la falta de esta abstracción: `gridTemplateColumns: '260px minmax(0,1fr)'` se escribió sin rama móvil porque nada obligaba a declararla. `ResponsiveGrid` hace que no se pueda pintar una rejilla sin decir qué hace bajo el breakpoint.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/portal-reserva.spec.ts`:

```typescript
  test('nada se recorta a 375px', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const recortados = await page.evaluate(() => {
      const malos: string[] = [];
      document.querySelectorAll('*').forEach((e) => {
        const el = e as HTMLElement;
        if (el.scrollWidth <= el.clientWidth + 2) return;
        const ox = getComputedStyle(el).overflowX;
        if (ox === 'auto' || ox === 'scroll') return;
        malos.push(
          `${el.tagName} cw=${el.clientWidth} sw=${el.scrollWidth} :: ${(el.innerText || '').slice(0, 40).replace(/\n/g, '|')}`
        );
      });
      return malos;
    });

    expect(recortados, `Elementos recortados:\n${recortados.join('\n')}`).toHaveLength(0);
  });
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium -g "nada se recorta"`

Expected: FAIL, con al menos estos recortes listados: la cabecera (`cw=375 sw=540`), el bloque de reseñas (`cw=343 sw=524`), una tarjeta de reseña (`cw=59 sw=240`) y la columna principal (`cw=302 sw=336`).

- [ ] **Step 3: Añadir las primitivas**

Insertar en `app/r/[slug].web.tsx`, justo antes de la declaración del componente de página (el que contiene `const { isMobile } = useResponsive();` en la línea 118):

```typescript
function PortalContainer({ children, padMobile, padDesktop, style }: {
  children: React.ReactNode;
  padMobile: string;
  padDesktop: string;
  style?: React.CSSProperties;
}) {
  const { isMobile } = useResponsive();
  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: isMobile ? padMobile : padDesktop, ...style }}>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 800, fontSize: 24, marginBottom: 12 }}>
      {children}
    </div>
  );
}

// Obliga a declarar que hace la rejilla bajo el breakpoint. Sin esto se colaron
// los recortes de la cabecera y de las resenas: rejillas de escritorio pintadas
// tal cual en un viewport de 375px.
function ResponsiveGrid({ children, mobile, desktop, gap, style }: {
  children: React.ReactNode;
  mobile: string;
  desktop: string;
  gap: number;
  style?: React.CSSProperties;
}) {
  const { isMobile } = useResponsive();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? mobile : desktop, gap, ...style }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Sustituir los usos**

En `:929`, sustituir:

```typescript
          <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
```

por:

```typescript
          <ResponsiveGrid mobile="minmax(0,1fr)" desktop="260px minmax(0,1fr)" gap={24} style={{ alignItems: 'start' }}>
```

y su `</div>` de cierre correspondiente por `</ResponsiveGrid>`.

En `:944`, sustituir:

```typescript
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
```

por:

```typescript
            <ResponsiveGrid mobile="minmax(0,1fr)" desktop="repeat(auto-fill,minmax(240px,1fr))" gap={12}>
```

y su cierre por `</ResponsiveGrid>`.

En `:489`, `:521` y `:527`, sustituir los tres `<div style={{ maxWidth: 1360, margin: ..., padding: isMobile ? X : Y, ... }}>` por `<PortalContainer padMobile="X" padDesktop="Y" style={{ ...el resto de propiedades... }}>`, conservando en `style` lo que cada uno tuviera de más (`display`, `position`, `zIndex`, `margin` no estándar, etc.) y cerrando con `</PortalContainer>`.

En `:592` y `:614`, sustituir los `<div style={{ fontFamily: ..., fontSize: 24, marginBottom: 12 }}>` por `<SectionHeading>`, cerrando con `</SectionHeading>`.

- [ ] **Step 5: Ejecutar para verificar que pasa**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS todos, incluido "nada se recorta a 375px".

Si algún elemento sigue recortado, el mensaje del test lo nombra: aplicarle la misma primitiva. No silenciar el test relajando el umbral.

- [ ] **Step 6: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "refactor(portal): primitivas de maquetacion que impiden los recortes

Los recortes en movil los causaba la falta de abstraccion: rejillas de
escritorio escritas sin rama movil porque nada obligaba a declararla.
ResponsiveGrid obliga. Con el test de recorte a 375px, el defecto pasa a
ser inalcanzable en vez de parcheado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Ampliar `resenas_publicas`

**Files:**
- Create: `migrations/portal-resenas-campos-publicos.sql`

**Interfaces:**
- Consumes: nada.
- Produces: la RPC `resenas_publicas(p_slug text) returns jsonb` gana:
  - `distribucion`: objeto `{"5": int, "4": int, "3": int, "2": int, "1": int}`
  - dentro de cada elemento de `ultimas[]`: `trato` (int|null), `productos` (int|null), `profesional` (text|null), `profesional_puntuacion` (int|null), `servicio` (text|null)

**Contexto:** hoy la RPC devuelve por reseña sólo `puntuacion`, `comentario`, `autor`, `fecha`, `verificada`. Las barras 5→1 que se pintan en el portal son datos inventados en el cliente porque la distribución no existe en la RPC.

`CREATE OR REPLACE` basta: la función sigue devolviendo `jsonb`, no cambia el `RETURNS`, así que **no se pierden los grants** (a diferencia de `disponibilidad_publica`, que sí necesitó `DROP` + re-`GRANT`).

- [ ] **Step 1: Anotar los grants actuales**

Run:

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'resenas_publicas';
```

Expected: filas para `anon`, `authenticated`, `service_role`. Anotarlas: hay que comprobar que siguen igual después.

- [ ] **Step 2: Escribir la migración**

Crear `migrations/portal-resenas-campos-publicos.sql`:

```sql
-- Amplia resenas_publicas con los campos que el portal necesita para pintar
-- resenas reales en vez del mock que habia.
-- Proyecto Supabase Mecha: vtrggiogjrhqtwbhbgia
--
-- Que gana:
--   1) distribucion: reparto real de 5 a 1 estrellas. Las barras del portal se
--      calculaban en el cliente con numeros inventados (164/15/2/1/0 sobre 182).
--   2) por resena: trato, productos, profesional (+ su nota) y servicio.
--
-- Que NO sale, a proposito: todo el grupo mecha_* (mecha_puntuacion,
-- mecha_facilidad_puntuacion, mecha_disponibilidad_puntuacion,
-- mecha_pagos_puntuacion, mecha_comentario, mecha_mejora_comentario) es el
-- cliente valorando Mecha como software, no al salon: no pinta nada en la
-- pagina publica de un cliente. Tampoco sale respuesta_borrador (es un
-- BORRADOR, no hay columna de respuesta publicada), ni ip_origen, cliente_id
-- o cita_id.
--
-- OJO grants: la funcion sigue devolviendo jsonb y no cambia su RETURNS, asi
-- que CREATE OR REPLACE basta y los grants existentes (anon, authenticated,
-- service_role) NO se tocan ni se pierden.

CREATE OR REPLACE FUNCTION public.resenas_publicas(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio text;
  v_media numeric;
  v_total int;
  v_verificadas int;
  v_ultimas jsonb;
  v_distribucion jsonb;
begin
  select negocio_id into v_negocio
  from public.negocio_portal
  where slug = p_slug and portal_activo = true;
  if v_negocio is null then return null; end if;

  select coalesce(round(avg(puntuacion)::numeric, 1), 0),
         count(*),
         count(*) filter (where cita_id is not null)
    into v_media, v_total, v_verificadas
  from public.resenas where negocio_id = v_negocio and visible;

  select coalesce(jsonb_object_agg(estrella::text, n), '{}'::jsonb)
    into v_distribucion
  from (
    select g.estrella,
           count(r.id) as n
    from generate_series(1, 5) as g(estrella)
    left join public.resenas r
      on r.negocio_id = v_negocio
     and r.visible
     and round(r.puntuacion) = g.estrella
    group by g.estrella
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
           'puntuacion', x.puntuacion,
           'comentario', x.comentario,
           'autor', x.autor_nombre,
           'fecha', x.created_at,
           'verificada', (x.cita_id is not null),
           'trato', x.salon_trato_puntuacion,
           'productos', x.salon_productos_puntuacion,
           'profesional', x.profesional_nombre,
           'profesional_puntuacion', x.profesional_puntuacion,
           'servicio', x.servicio_nombre
         ) order by x.created_at desc), '[]'::jsonb)
    into v_ultimas
  from (
    select r.puntuacion, r.comentario, r.autor_nombre, r.created_at, r.cita_id,
           r.salon_trato_puntuacion, r.salon_productos_puntuacion,
           r.profesional_puntuacion,
           pr.nombre as profesional_nombre,
           sv.nombre as servicio_nombre
    from public.resenas r
    left join public.profesionales pr on pr.id = r.profesional_id
    left join public.servicios sv on sv.id = r.servicio_id
    where r.negocio_id = v_negocio and r.visible
    order by r.created_at desc limit 10
  ) x;

  return jsonb_build_object(
    'media', v_media,
    'total', v_total,
    'verificadas', v_verificadas,
    'distribucion', v_distribucion,
    'ultimas', v_ultimas
  );
end;
$function$;
```

- [ ] **Step 3: Aplicar la migración**

Aplicarla con `apply_migration` del MCP de Supabase sobre el proyecto `vtrggiogjrhqtwbhbgia`, con nombre `portal_resenas_campos_publicos`.

- [ ] **Step 4: Verificar la salida y los grants**

Run:

```sql
select jsonb_pretty(public.resenas_publicas('demo'));
```

Expected: incluye `distribucion` con las cinco claves `"1"`..`"5"`, y cada elemento de `ultimas` trae las claves nuevas (`trato`, `productos`, `profesional`, `profesional_puntuacion`, `servicio`), con `null` donde no haya dato.

Run:

```sql
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'resenas_publicas';
```

Expected: exactamente los mismos grants anotados en el Step 1.

Y verificar que no se cuela nada del grupo `mecha`:

```sql
select public.resenas_publicas('demo')::text ~ 'mecha' as filtra_mal;
```

Expected: `false`.

- [ ] **Step 5: Commit**

```bash
git add migrations/portal-resenas-campos-publicos.sql
git commit -m "feat(db): resenas_publicas devuelve distribucion y campos de salon

Las barras 5-1 del portal se calculaban en el cliente con numeros
inventados porque la distribucion no existia en la RPC. Ahora sale de la
base. Anade tambien trato, productos, profesional y servicio por resena.
Deja fuera todo el grupo mecha_* a proposito: es el cliente valorando
Mecha como software, no al salon.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Lógica pura de reseñas

**Files:**
- Create: `lib/portalResenas.ts`
- Create: `lib/portalResenas.test.ts`
- Modify: `lib/reservaPublica.ts:256-268`

**Interfaces:**
- Consumes: la forma del JSON que produce la Task 5.
- Produces:
  - `ResenaItem` ampliado en `lib/reservaPublica.ts` con `trato`, `productos`, `profesional`, `profesional_puntuacion`, `servicio` (todos opcionales y anulables)
  - `ResenaResumen` ampliado con `distribucion?: Record<string, number>`
  - `barrasDistribucion(distribucion: Record<string, number> | undefined, total: number): Array<{ star: number; count: number; pct: number }>`
  - `subNotas(r: ResenaItem): Array<{ etiqueta: string; valor: number }>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `lib/portalResenas.test.ts`:

```typescript
// Tests puros de la logica de resenas del portal publico (deno test).
// Ejecutar: deno test lib/portalResenas.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { barrasDistribucion, subNotas } from './portalResenas.ts';

Deno.test('barrasDistribucion ordena de 5 a 1 y calcula porcentajes', () => {
  const r = barrasDistribucion({ '5': 7, '4': 2, '3': 1, '2': 0, '1': 0 }, 10);
  assertEquals(r.map((x) => x.star), [5, 4, 3, 2, 1]);
  assertEquals(r[0].pct, 70);
  assertEquals(r[1].pct, 20);
  assertEquals(r[4].pct, 0);
});

Deno.test('barrasDistribucion no divide por cero', () => {
  const r = barrasDistribucion({ '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 }, 0);
  assertEquals(r.every((x) => x.pct === 0), true);
});

Deno.test('barrasDistribucion tolera una distribucion ausente', () => {
  const r = barrasDistribucion(undefined, 10);
  assertEquals(r.length, 5);
  assertEquals(r.every((x) => x.count === 0 && x.pct === 0), true);
});

Deno.test('barrasDistribucion rellena las estrellas que falten', () => {
  const r = barrasDistribucion({ '5': 3 }, 3);
  assertEquals(r.find((x) => x.star === 5)?.count, 3);
  assertEquals(r.find((x) => x.star === 2)?.count, 0);
});

Deno.test('subNotas solo devuelve las que existen', () => {
  assertEquals(
    subNotas({ puntuacion: 5, comentario: null, autor: null, fecha: '', trato: 4, productos: null }),
    [{ etiqueta: 'Trato', valor: 4 }]
  );
});

Deno.test('subNotas devuelve vacio cuando no hay ninguna', () => {
  assertEquals(
    subNotas({ puntuacion: 5, comentario: null, autor: null, fecha: '' }),
    []
  );
});

Deno.test('subNotas devuelve las dos cuando estan las dos', () => {
  assertEquals(
    subNotas({ puntuacion: 5, comentario: null, autor: null, fecha: '', trato: 5, productos: 3 }),
    [{ etiqueta: 'Trato', valor: 5 }, { etiqueta: 'Limpieza/Prod', valor: 3 }]
  );
});
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `deno test lib/portalResenas.test.ts`

Expected: FAIL — el módulo `./portalResenas.ts` no existe.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/portalResenas.ts`:

```typescript
// Logica pura del bloque de resenas del portal publico. Vive fuera de la
// pagina para poder testearla en aislamiento con deno.
import type { ResenaItem } from './reservaPublica';

export interface BarraDistribucion {
  star: number;
  count: number;
  pct: number;
}

// Reparto de 5 a 1 estrellas, siempre con las cinco filas aunque la RPC no
// devuelva alguna. Nunca inventa: sin datos, todo a cero.
export function barrasDistribucion(
  distribucion: Record<string, number> | undefined,
  total: number
): BarraDistribucion[] {
  return [5, 4, 3, 2, 1].map((star) => {
    const count = distribucion?.[String(star)] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { star, count, pct };
  });
}

// Sub-notas del salon que se pintan en la tarjeta. Misma convencion que la
// pagina interna de resenas: solo se pintan las que no son nulas.
export function subNotas(r: ResenaItem): Array<{ etiqueta: string; valor: number }> {
  const out: Array<{ etiqueta: string; valor: number }> = [];
  if (r.trato != null) out.push({ etiqueta: 'Trato', valor: r.trato });
  if (r.productos != null) out.push({ etiqueta: 'Limpieza/Prod', valor: r.productos });
  return out;
}
```

- [ ] **Step 4: Ampliar los tipos**

En `lib/reservaPublica.ts:256`, sustituir las dos interfaces por:

```typescript
export interface ResenaItem {
  puntuacion: number;
  comentario: string | null;
  autor: string | null;
  fecha: string;
  verificada?: boolean; // true si la resena esta atada a una cita real (visita verificada)
  trato?: number | null; // salon_trato_puntuacion
  productos?: number | null; // salon_productos_puntuacion
  profesional?: string | null; // nombre de quien atendio
  profesional_puntuacion?: number | null;
  servicio?: string | null; // nombre del servicio de la cita
}
export interface ResenaResumen {
  media: number;
  total: number;
  verificadas?: number; // cuantas de las visibles provienen de una visita verificada
  distribucion?: Record<string, number>; // reparto de 5 a 1 estrellas
  ultimas: ResenaItem[];
}
```

- [ ] **Step 5: Ejecutar para verificar que pasa**

Run: `deno test lib/portalResenas.test.ts`

Expected: PASS los 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/portalResenas.ts lib/portalResenas.test.ts lib/reservaPublica.ts
git commit -m "feat(portal): logica pura de resenas, testeable en aislamiento

barrasDistribucion nunca inventa: sin datos, todo a cero. subNotas sigue
la convencion de la pagina interna, solo pinta las sub-notas que existen.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Pintar las reseñas reales

**Files:**
- Modify: `app/r/[slug].web.tsx:479-485` (borrar `ratingBars` mock), `:929-958` (bloque de reseñas)
- Test: `tests/portal-reserva.spec.ts`

**Interfaces:**
- Consumes: `barrasDistribucion`, `subNotas` de `lib/portalResenas.ts`; `ResenaItem`, `ResenaResumen` de `lib/reservaPublica.ts`; `ResponsiveGrid` de la Task 4.
- Produces: nada.

**Contexto:** el bloque entero es un mock. El propio código lo dice: `{/* The rest of the reviews would be mapped here, using static for now as mock */}` y `{[1,2].map(...)}` con "Cliente feliz / Servicio x", siempre 5 estrellas. Las reseñas reales se piden y no se pintan nunca.

Mecha usa **llamas** (`FlamesRow`), no estrellas. El portal es el único sitio que dibuja estrellas.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/portal-reserva.spec.ts`:

```typescript
  test('las resenas mostradas son las reales, no el mock', async ({ page }) => {
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const texto = await page.locator('body').innerText();
    expect(texto).not.toContain('Cliente feliz');
    expect(texto).not.toContain('Servicio x');
    expect(texto).toContain('Lucia M.');
  });

  test('no viaja ningun campo mecha_ al cliente', async ({ page }) => {
    const cuerpos: string[] = [];
    page.on('response', async (res) => {
      if (res.url().includes('/rpc/resenas_publicas')) {
        cuerpos.push(await res.text().catch(() => ''));
      }
    });
    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    expect(cuerpos.length).toBeGreaterThan(0);
    expect(cuerpos.join('')).not.toContain('mecha_');
  });
```

Nota: `Lucia M.` es una reseña real del salón demo, verificada contra `resenas_publicas('demo')` el 2026-08-09. Si el dato del demo cambia, actualizar el nombre esperado.

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium -g "resenas reales"`

Expected: FAIL — encuentra `Cliente feliz` y no encuentra `Lucia M.`.

- [ ] **Step 3: Borrar el mock de las barras**

En `app/r/[slug].web.tsx:479-485`, borrar el bloque entero de `ratingBars` (el que lleva el comentario `// Mock rating data for UI if resenas doesn't have details`) y sustituirlo por:

```typescript
  const ratingBars = barrasDistribucion(resenas?.distribucion, resenas?.total ?? 0);
```

Añadir el import al principio del fichero:

```typescript
import { barrasDistribucion, subNotas } from '../../lib/portalResenas';
```

(Ajustar la ruta relativa a la que use el resto de imports de `lib/` en este fichero.)

- [ ] **Step 4: Pintar las reseñas reales**

Sustituir el bloque de `:942-958` (el comentario del mock más el `{[1,2].map(...)}`) por:

```typescript
            <ResponsiveGrid mobile="minmax(0,1fr)" desktop="repeat(auto-fill,minmax(240px,1fr))" gap={12}>
              {(resenas?.ultimas ?? []).map((r, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(40,30,24,0.08)', borderRadius: 16, padding: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', width: 34, height: 34, borderRadius: '50%', background: T.primarySoft, color: T.primaryHi, alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                      {(r.autor || 'A')[0].toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{r.autor || 'Anónimo'}</div>
                      <div style={{ fontSize: 11, color: '#736658' }}>
                        {[r.servicio, fmtFechaRelativa(r.fecha, loc)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {r.verificada && (
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#0f9d6b', background: 'rgba(15,157,107,0.08)', borderRadius: 6, padding: '2px 6px' }}>
                        Verificada
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 2, marginBottom: 7 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <IconStarFilled key={n} size={12} color={n <= Math.round(r.puntuacion) ? undefined : 'rgba(40,30,24,0.15)'} />
                    ))}
                  </div>

                  {r.profesional && (
                    <div style={{ fontSize: 11, color: '#736658', marginBottom: 6 }}>
                      Atendido por <b style={{ color: '#3a332c' }}>{r.profesional}</b>
                      {r.profesional_puntuacion ? ` · ${r.profesional_puntuacion}/5` : ''}
                    </div>
                  )}

                  {subNotas(r).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
                      {subNotas(r).map(sn => (
                        <span key={sn.etiqueta} style={{ fontSize: 10.5, color: '#736658', background: 'rgba(40,30,24,0.04)', borderRadius: 6, padding: '2px 6px' }}>
                          {sn.etiqueta}: {sn.valor}/5
                        </span>
                      ))}
                    </div>
                  )}

                  {r.comentario && (
                    <div style={{ fontSize: 12.5, color: '#3a332c', lineHeight: 1.5 }}>{r.comentario}</div>
                  )}
                </div>
              ))}
            </ResponsiveGrid>
```

Si `fmtFechaRelativa` no existe en el fichero, usar el formateador de fecha que ya se use para reseñas; si no hay ninguno, mostrar `new Date(r.fecha).toLocaleDateString(loc)`.

- [ ] **Step 5: No pintar el bloque cuando no hay reseñas**

Envolver toda la sección de reseñas (desde el encabezado `OPINIONES` hasta el cierre de la `ResponsiveGrid` exterior) en:

```typescript
{resenas && resenas.total > 0 && (
  ...
)}
```

El formulario de "Escribir una reseña" debe quedar **fuera** de esa condición: un salón sin reseñas todavía tiene que poder recibir la primera.

- [ ] **Step 6: Ejecutar los tests**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS todos, incluido "nada se recorta a 375px" (las tarjetas ahora son de una columna en móvil).

- [ ] **Step 7: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "feat(portal): pintar las resenas reales en vez del mock

El bloque entero era estatico: 'Cliente feliz / Servicio x', siempre 5
estrellas, y las resenas reales se pedian y se tiraban. Ahora salen de
resenas_publicas, con verificada, profesional, servicio y sub-notas de
trato y limpieza, y el bloque no se pinta si no hay resenas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Distintivo de reposo y verificación final

**Files:**
- Modify: `app/r/[slug].web.tsx:653-657` (botones de hora)
- Test: `tests/portal-reserva.spec.ts`

**Interfaces:**
- Consumes: `SlotDisponible` de `lib/reservaPublica.ts`, que ya declara `en_reposo: boolean` y `reposo_disponible_min: number | null`.
- Produces: nada.

**Contexto:** la BD ya resuelve el reposo entera. `disponibilidad_publica` devuelve `en_reposo` y `reposo_disponible_min`, y su cláusula de exclusión ya garantiza que el servicio **cabe** en el hueco. La UI simplemente nunca lee esos campos. Cero cambios en la lógica de reserva.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/portal-reserva.spec.ts`:

```typescript
  test('un hueco de reposo se marca visualmente', async ({ page }) => {
    await page.route('**/rest/v1/rpc/disponibilidad_publica', async (route) => {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      manana.setHours(11, 0, 0, 0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            profesional_id: '00000000-0000-0000-0000-000000000001',
            profesional_nombre: 'Laura Martinez',
            slot: manana.toISOString(),
            en_reposo: true,
            reposo_disponible_min: 30,
          },
        ]),
      });
    });

    await page.goto(`/app/r/${SLUG}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Corte caballero/ }).click();
    await page.getByRole('button', { name: /Hoy|Mañana/ }).first().click();

    await expect(page.getByTitle(/hueco entre servicios/i).first()).toBeVisible({ timeout: 15000 });
  });
```

- [ ] **Step 2: Ejecutar para verificar que falla**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium -g "hueco de reposo"`

Expected: FAIL — no existe ningún elemento con ese `title`.

- [ ] **Step 3: Marcar los huecos de reposo**

En `:653-657`, sustituir el `<button>` del slot por una versión que distinga el reposo:

```typescript
                                const sel = slotSel?.slot === s.slot;
                                const reposo = !!s.en_reposo;
                                return (
                                  <button
                                    key={s.slot}
                                    onClick={() => setSlotSel(s)}
                                    title={reposo ? `Aprovecha un hueco entre servicios${s.reposo_disponible_min ? ` (${s.reposo_disponible_min} min libres)` : ''}` : undefined}
                                    style={{ position: 'relative', padding: '10px 6px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', border: sel ? 'none' : `1.5px ${reposo ? 'dashed' : 'solid'} ` + (reposo ? T.primary : T.border), background: sel ? T.primary : '#fff', color: sel ? '#fff' : T.text, boxShadow: sel ? '0 7px 16px rgba(0,0,0,0.18)' : 'none' }}
                                  >
                                    {fmtHora(s.slot, loc)}
                                  </button>
                                );
```

El borde discontinuo distingue el hueco sin añadir texto que descuadre la rejilla. El `title` explica qué es.

- [ ] **Step 4: Ejecutar la suite entera**

Run: `npx playwright test tests/portal-reserva.spec.ts --project=chromium`

Expected: PASS los 11 tests.

- [ ] **Step 5: Verificar contra producción**

Desplegar y repetir la comprobación manual sobre `https://www.mechaa.es/app/r/demo` a 375px. Confirmar los diez puntos de verificación del spec, y en particular:

```bash
npx playwright test tests/portal-reserva.spec.ts --project=chromium
```

con `baseURL` apuntando a producción (es el valor por defecto en `playwright.config.ts`).

Comprobar además a mano que sigue funcionando lo que no se ha tocado pero comparte fichero: reserva exprés, reserva de grupo y el formulario de escribir reseña.

- [ ] **Step 6: Commit**

```bash
git add "app/r/[slug].web.tsx" tests/portal-reserva.spec.ts
git commit -m "feat(portal): marcar los huecos de reposo como aprovechables

La BD ya devolvia en_reposo y reposo_disponible_min y ya garantizaba que
el servicio cabe en el hueco; la UI no los leia. Borde discontinuo mas
title explicativo, sin tocar la logica de reserva.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Cobertura del spec:**

| Requisito del spec | Task |
|---|---|
| #1 día y hora | 1 |
| #2 reseñas cortadas | 4 |
| #3 cabecera cortada | 4 |
| #4 mojibake | 1 |
| #5 serif | 3 |
| #6 reposo | 8 |
| #7 reseñas mock | 5, 6, 7 |
| Fallbacks inventados (4.9 / 182) | 3 (cabecera), 7 (bloque) |
| Depósito / queries muertas | 2 |
| Distribución 5→1 real | 5, 6 |
| Campos públicos = grupo salon | 5 (RPC), 7 (UI) |
| Maquetación A | 4, 7 |
| Verificación en producción | 8 |

**Riesgos conocidos:**

- La Task 4 toca los mismos bloques que la Task 7. Ejecutar en orden.
- El test de "resenas reales" depende de un dato concreto del salón demo (`Lucia M.`). Si el demo se resiembra (hay un `resembrar_demo()` con `pg_cron` diario), el nombre puede cambiar. En ese caso, leer el nombre esperado de la propia RPC en vez de fijarlo.
- La suite E2E corre contra producción por defecto. Los tests de las Tasks 1-7 no pasarán en producción hasta que se despliegue el commit correspondiente. Durante el desarrollo, levantar el build local con `npm run web:local` y apuntar `baseURL` ahí.
