# Tecnologías candidatas para Mecha — evaluadas contra problemas medidos

**Fecha:** 28 ago 2026 · **Autor:** Carlos
**Criterio:** cada candidata se juzga contra un problema **medido** de este repo, no contra su
popularidad. Lo que no resuelve un problema real que tengamos, se descarta aquí mismo.

---

## 0. Los agujeros reales, medidos hoy

| Hueco | Dato |
|---|---|
| Sin linter ni formateador | **ninguno**: no hay `.eslintrc`, `eslint.config`, `biome.json` ni `.prettierrc` |
| Sin validación en runtime | **ninguna**: ni zod, ni valibot, ni yup |
| Sin tests de componente | solo Deno (lógica pura) + Playwright (E2E) |
| Sin virtualización de listas | ninguna |
| Tipos flojos | **667 `any` explícitos** |
| Repo pesado | Knip se quedó **sin memoria (4 GB)** analizándolo entero |

Ese último es un hallazgo en sí: un analizador estático estándar no puede con el repo sin acotarlo.

---

## 1. YA IMPLEMENTADO en esta sesión

| Qué | Problema que resolvía | Resultado |
|---|---|---|
| **TanStack Query v5** | volver a la agenda = 14 peticiones, cero caché | **3-4 peticiones**, medido |
| **Zustand v5** | estado visual atrapado en el monolito | 2 campos fuera; base para seguir partiendo |
| **Biome 2.5** | el repo no tenía **ningún** linter | configurado y en verde (ver abajo) |

**Sobre Biome, cómo se configuró y por qué así.** Con las reglas recomendadas de fábrica saca
**2.158 hallazgos**. Un linter que grita dos mil cosas se ignora el primer día: ese es su modo
clásico de fracaso. Así que está afinado para que **cada aviso sea real**:

- **Apagado** el ruido cosmético que en react-native-web no aporta: `useButtonType` (696),
  `noSvgWithoutTitle` (138), `noLabelWithoutControl` (64), ordenación de imports (244)...
- **Apagado** `noExplicitAny`: hay 667: encenderlo es ruido, no una tarea.
- **Encendido como error** lo que es un fallo de verdad: `noBlankTarget`, `noDoubleEquals`,
  `noUnreachable`, `noSelfCompare`, `noDuplicateObjectKeys`, `useValidTypeof`.
- **Encendido como aviso** lo accionable: imports y variables sin usar, `isNaN` global,
  `parseInt` sin radix.

Resultado: **1 error y 340 avisos**. Ese 1 error era real y está arreglado: un
`target="_blank"` sin `rel="noopener"` en **la página donde la clienta paga**, o sea, la pestaña
que se abría podía redirigir la del pago a una copia falsa (reverse tabnabbing).

⚠️ Los 83 imports sin usar **no** se han limpiado en automático a propósito: el arreglo va marcado
como *unsafe* en Biome y tocaría 83 ficheros justo encima de un refactor de 14.000 líneas. Mezclar
las dos cosas hace irrevisable el diff. Es una tarea aparte, de cinco minutos.

Sobre Zustand, sin adornos: **aún no se ha ganado el sitio**. Aporta poco hoy; su valor llega
según se sigan extrayendo pantallas.

---

## 2. RECOMENDADAS — alto valor, atadas a un problema real

### 2.1 `supabase-cache-helpers` — 🟢 la más valiosa para nosotros

Genera la `queryKey` **automáticamente** a partir de la propia consulta de Supabase. Es exactamente
el trabajo manual que hice en `lib/datos/queryClient.ts`: mantener a mano las claves de cada
consulta no escala, y una clave mal puesta es un fallo de aislamiento entre salones.

- **Cuándo meterla:** al migrar la tercera o cuarta pantalla, no antes. Hoy tenemos 4 ficheros
  usando la capa nueva contra 61 con Supabase directo; cambiar de motor con tan poco migrado es
  gratis, y con mucho migrado es caro.
- **Aviso comprobado:** `skipToken` de TanStack Query **no funciona** con ella (da error de tipos).
- **Choque con lo nuestro:** su generación automática de claves no encaja con nuestra convención
  «la clave empieza por el nombre exacto de la tabla», que es la que habilita la invalidación
  automática al escribir. Hay que elegir un mecanismo u otro, no los dos.

Existe además un adaptador oficial **`supabase/tanstack-db`** que sincroniza consultas, mutaciones
y Realtime sin invalidación manual. Más ambicioso; mirarlo cuando la capa de datos esté asentada.

### 2.2 Zod v4 + `ts-to-zod` — 🟢 ataca los 667 `any`

Ya tenemos `types/database.types.ts` generado por Supabase, así que **`ts-to-zod` puede generar los
esquemas de validación a partir de esos tipos**: sin escribirlos a mano y sin que se desincronicen.

Dónde pondría el listón, por orden de valor:
1. **Entradas de las edge functions.** Hoy la IA recibe JSON y confía. Un `parse` en la puerta
   convierte un fallo silencioso en un error claro.
2. **Respuestas de las RPC.** Un `DROP COLUMN` en SQL hoy rompe pantallas en silencio — hay una
   memoria del proyecto justo sobre eso.
3. Formularios del software.

**No** ponerlo en el camino caliente de la agenda: validar cada cita en cada render es pagar por
nada.

### 2.3 Biome — 🟡 con una salvedad importante

No hay linter. Biome es un solo binario, `biome init` y listo, **10-25× más rápido** que ESLint.

**Pero no cubre `react-hooks/exhaustive-deps`**, y en este repo (207 `useState`, efectos por todas
partes, y varios bugs históricos documentados por dependencias mal puestas) esa es justamente la
regla que más valdría. La recomendación seria es **híbrida**: Biome para formato y lint base, más
un ESLint mínimo solo con `eslint-plugin-react-hooks`.

### 2.4 Knip — 🔴 PROBADO Y NO FUNCIONA AQUÍ (todavía)

La idea es buena: encontré código muerto a mano en esta sesión (un prop arrastrado por tres niveles
que nadie leía, un fichero entero sin usar), y Knip automatiza eso viendo el grafo completo de
módulos, algo que un linter por fichero no puede.

**Pero lo probé y no pasa de la línea de salida.** Dos intentos, los dos terminaron en
`JavaScript heap out of memory`:

1. sin configurar → reventó a los **4 GB**;
2. con `knip.json` acotado (ignorando `web/`, `scratch*`, `design-demos`, `ui-references`,
   `motion_design_pack`...) y `--max-old-space-size=8192` → reventó igual a los **8 GB**, tras
   ~29 minutos.

Dejo el `knip.json` en el repo como punto de partida, pero **hoy no es utilizable**. Antes de
volver a intentarlo hay que averiguar qué lo hace explotar; mi sospecha es el `entry` de
`app/**/*.tsx` (expo-router obliga a tratar cada ruta como entrada) combinado con el tamaño de los
ficheros. Merece una sesión propia, no colarlo aquí.

Y el dato en sí ya dice algo del repo: **un analizador estático estándar no puede con él**.

### 2.5 Vitest + Testing Library — 🟡 el hueco de test que queda

Hoy: Deno para lógica pura (466 pruebas, rápido) y Playwright para E2E (lento, ~7 min). Falta el
medio: probar un componente sin levantar un navegador. Es lo que permitiría probar de verdad los
modales ya extraídos.

### 2.6 `@tanstack/react-virtual` — 🟠 solo si un salón grande lo pide

La agenda pinta todas las tarjetas del día. En la demo son 9 y va sobrada. Con 6 profesionales y
jornada llena podrían ser 60-80, y ahí empezaría a notarse.

**No lo metería aún:** no tengo ni una medición que diga que duele, y tocar el render de la rejilla
es justo lo que más riesgo tiene. Primero medir con un salón real grande.

---

## 3. EVALUADAS Y DESCARTADAS (por ahora)

- **React Compiler.** Se midió: la memoización de la agenda ya está hecha a mano y aguanta (8 nodos
  mutados al arrastrar). Automatizaría trabajo ya hecho. Sigue siendo higiene a futuro, no una
  palanca de rendimiento.
- **Sentry u otro APM.** Ya hay telemetría propia (`lib/reportarError.ts`, tabla `errores_cliente`
  con registros reales). Cambiarlo es coste y decisión de gasto, no una carencia técnica.
- **Cambiar de infraestructura** (VPS, Postgres pelado). Ya analizado y cerrado: no.

---

## 4. Orden que propongo

1. **Biome + `eslint-plugin-react-hooks`** — barato, inmediato, y el repo hoy no tiene *nada*.
2. **Zod en las entradas de edge functions** — cierra el agujero de "la IA confía en el JSON".
3. **Vitest** cuando se extraiga el tercer modal, para probarlos sin navegador.
4. **`supabase-cache-helpers`** al migrar la tercera o cuarta pantalla.
5. Virtualización **solo** si un salón real la pide con datos.

---

## Fuentes

- [supabase-cache-helpers (GitHub)](https://github.com/psteinroe/supabase-cache-helpers) ·
  [Supabase: React Query + Cache Helpers](https://supabase.com/blog/react-query-nextjs-app-router-cache-helpers) ·
  [supabase/tanstack-db](https://github.com/supabase/tanstack-db) ·
  [limitación de `skipToken`](https://github.com/psteinroe/supabase-cache-helpers/issues/465)
- [Knip](https://knip.dev/) · [Knip: puntos ciegos de ESLint y depcheck](https://recca0120.github.io/en/2026/05/02/knip-dead-code-detector/)
- [Biome vs ESLint (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/biome-eslint/) ·
  [Biome vs ESLint vs Oxlint 2026](https://www.pkgpulse.com/guides/biome-vs-eslint-vs-oxlint-2026)
- [Zod: validación en TypeScript](https://oneuptime.com/blog/post/2026-01-25-zod-validation-typescript/view) ·
  [ts-to-zod](https://www.npmjs.com/package/ts-to-zod)
