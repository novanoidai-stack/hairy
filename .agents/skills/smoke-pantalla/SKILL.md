---
name: smoke-pantalla
description: Cómo añadir una pantalla al smoke test de Mecha (tests/smoke/, "una pantalla, un test" con Playwright) y cómo interpretar o actualizar sus líneas base de rendimiento y silencios. Usar SIEMPRE al añadir una pantalla al smoke, tocar pantallas.ts, actualizar rendimiento-baseline.json o silencios-baseline.json, investigar un fallo del smoke en CI, o usar los flags --aprobar / --origen canario.
---

# Smoke: una pantalla, un test (Mecha)

Cada pantalla de Mecha tiene un test de humo que la carga de verdad y comprueba que no está
rota, no grita por consola, no hace peticiones 4xx/5xx, sobrevive a que le pulsen los
botones, no falla en silencio y no se ha vuelto lenta. Viven en `tests/smoke/` y corren en
la CI y en el canario horario.

## Añadir una pantalla: solo tocar DATOS

`tests/smoke/pantallas.ts` no es un test: es el registro. Añade una entrada a `PANTALLAS`
y el spec se genera solo (`pantallas.spec.ts` hace `for (const p of PANTALLAS) test(...)`).

```ts
{
  nombre: 'agenda',            // clave del hallazgo: pantallas/rota-<nombre>
  ruta: '/agenda',             // ruta dentro de la SPA
  ancla: /Texto que DEBE aparecer al cargar/i,
  tipo: 'software',            // 'software' = dentro del iframe de la demo (modo demo
                               //   solo se activa embebido); 'publica' = carga directa
  lenta: true,                 // opcional: timeout mayor
}
```

Cada test generado comprueba, en orden: (1) carga y aparece el ancla, (2) cero errores de
consola, (3) cero peticiones 4xx/5xx, (4) `manosearBotones()` pulsa hasta 25 botones
visibles (saltando salir/eliminar...) y la pantalla no queda en blanco, (4bis) apunta
silencios, (5) mide rendimiento al JSONL.

Si una pantalla da ruido DE VERDAD conocido (telemetría, favicon...), añade el patrón a
`RUIDO_CONSOLA` / `RUIDO_RED` en el mismo fichero, con su porqué en un comentario.

## Correrlo en local

```bash
npx playwright test tests/smoke --project=publico
```

El config levanta solo el espejo de Vercel (`node scripts/serve-web.mjs` en :8080).
`PW_NO_SERVER=1` lo desactiva (así corre el canario) y `PLAYWRIGHT_BASE_URL` cambia el
destino. `workers: 1`, no paraleliza a propósito. El proyecto `publico` es el sin
credenciales (landing, marketplace, portal, demo, pantallas, silencios); el proyecto
`chromium` necesita el setup de login.

## Rendimiento: dos líneas base POR ORIGEN

- `tests/smoke/rendimiento-baseline.json` — la CI local sobre el espejo (fría y lenta:
  la agenda tarda ~24 s en arrancar en frío).
- `tests/smoke/rendimiento-baseline.canario.json` — el canario contra PRODUCCIÓN (~4 s).
  **Comparar una contra la base de la otra es puro ruido**: si existe la de canario,
  se usa preferentemente.

Lo vigilado de verdad: `ms_carga`, `long_tasks`, `peticiones` (el detector de N+1) y
latencia edge p95 — CPU y red, que un runner headless mide bien. **El fps NO avisa** (se
mide y se guarda, pero en un runner sin GPU da 106 fps imposibles: es ruido de compositor
software, lo delataron seis pantallas distintas en cuatro corridas).

- Degeneración extrema (carga >3× base Y >15 s) es bloqueante; todo lo demás avisa.
- Presupuestos absolutos en `scripts/vigilantes/rendimiento.mjs`
  (`PRESUPUESTO_MS_CARGA = 1800`, `CUOTA_PETICIONES_N1 = 6`...).
- **Bajar una línea base es `--aprobar`** (`--origen canario` para la del canario): un
  acto consciente cuyo diff se ve en el repo. Nunca la edites a mano tras un fallo.

## Silencios

`tests/smoke/silencios.ts` escucha tres cosas durante el manoseo: promesas rotas
(`unhandledrejection` en todos los documentos e iframes), diálogos nativos (`alert()`
descartados automáticamente) y texto de error que aparece tras un clic. Su línea base es
`silencios-baseline.json` (`--aprobar` / `--origen canario` igual que rendimiento). El
catálogo de frases de error `ERRORES_DE_SISTEMA` está anclado a `lib/errores.ts`: si
borras o reescribes una frase de ahí, `comprobarAnclas()` falla a propósito — actualiza
el catálogo en el mismo commit.

## Recordatorio de contexto

Los hallazgos del smoke acaban en la pestaña Salud del panel (igual que `npm run vigilar`
y `vigilar:bd`), y el canario los traduce con `scripts/vigilantes/smoke-a-hallazgos.mjs`.
Si añades un tipo de hallazgo nuevo, ese traductor y `panel-ambitos.mjs` deben conocerlo.
