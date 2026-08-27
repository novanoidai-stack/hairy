# MEGA INFORME — Validación Cruzada del Stack Hairy/Mecha
**Fecha:** 2026-08-27
**Contenido:** Fusión en crudo de los dos informes de auditoría (Informe A = análisis independiente ZCode; Informe B = análisis externo recibido). No se ha alterado ni omitido ningún dato. La comparación crítica entre ambos vendrá en un paso posterior.

---

# PARTE I — INFORME A (auditoría independiente ZCode)

## 1. El stack actual, en una línea

**Expo SDK 56 + expo-router + React Native Web (doble implementación nativa/web) + Supabase (Postgres, RLS, 43 Edge Functions) + Deno para tests unitarios + Playwright para E2E + despliegue estático en Vercel.** Es un stack moderno y razonable. El problema **no es la elección tecnológica, es la falta de disciplina estructural alrededor de ella**.

## 2. Lo que está bien (según Informe A)

- **119.000 líneas TS con `strict: true`** y solo 4 `@ts-ignore` en total. Eso es inusualmente limpio.
- **55 archivos de tests unitarios** en `lib/` con lógica de negocio pura y testeada (comisiones, fiscal/veri factu, escandallos). Muchos proyectos comerciales no tienen ni la mitad.
- **53 tests E2E reales** con Playwright, incluyendo flujo de caja, agenda realtime y portal de reserva.
- **Manejo de errores centralizado**: `lib/errores.ts` + `lib/reportarError.ts` usado en 38 archivos, con telemetría sin PII.
- **RLS seria**: migración de lockdown final + 57 migraciones tocando RLS, más tests de validador RPC y sanitizador.
- Separación por dominios en `lib/` (caja, fiscal, inventario, ia) es correcta a nivel conceptual.

## 3. Problemas según Informe A

### 🔴 Crítico 1: `AgendaCalendar.web.tsx` — 25.683 líneas
Un solo componente con más líneas que muchos proyectos enteros. Es imposible de revisar en PR, imposible de testear unitariamente, y cada modificación es un riesgo. Le siguen `configuracion.web.tsx` (6.307), `clientes.web.tsx` (4.755). **Este es el mayor riesgo técnico del proyecto**, más que cualquier decisión de stack.

### 🔴 Crítico 2: No hay capa de acceso a datos
**199 llamadas `supabase.from(...)` directamente en pantallas/componentes** (156 en `app/` + 43 en `components/`; el 80% del acceso a datos fuera de `lib/`; otras 55 en `lib/`; 81 archivos importan `lib/supabase`). Consecuencias: lógica de negocio duplicada, imposibilidad de cachear/refetchear de forma consistente, y cada cambio de esquema rompe pantallas dispersas. No hace falta un ORM ni Redux: haría falta una capa de repositorios por dominio (`lib/clientes/repositorio.ts`...) consumida por las pantallas.

### 🔴 Crítico 3: Migraciones bifurcadas
16 migraciones en `supabase/migrations/` (la canónica, 1.321 líneas en total, incluye `20260811000000_s28_final_rls_lockdown.sql`) y **265 archivos / 37.033 líneas en `migrations/` raíz** — el 95% del schema real vive fuera del sitio que Supabase CLI usa. 57 de ellos mencionan ROW LEVEL SECURITY. Nadie puede reconstruir la base de datos desde el repo. Esto es riesgo existencial para un proyecto "serio": sin schema reproducible, no hay entornos de staging, no hay rollback, no hay nada. Además `update_rpc.sql` suelto en raíz y `scripts/APLICAR_INVENTARIO_SUPABASE.sql`.

### 🔴 Crítico 4: Cero CI
No existe `.github/workflows` (no hay directorio `.github`). Nada ejecuta `tsc --noEmit`, ni los tests Deno, ni Playwright en cada push. Todo depende de que alguien se acuerde de ejecutarlo localmente. Además, la task `deno test` solo ejecuta **6 de los 55 archivos de test** (`lib/metricasNegocio.test.ts lib/caja/ lib/citasEstados.test.ts lib/utils/appointment.test.ts lib/horariosFranjas.test.ts lib/migracionParserLocal.test.ts`) — hay ~49 tests escritos que nadie corre. Hay además `scripts/verifactu-worker.test.ts` y tests co-located en `supabase/functions/` (p. ej. `agenda-asistente/permisos.test.ts`). Residuo: `tests/booking.spec.ts.rescatado`.

### 🟠 Grave 5: Doble implementación nativa/web sin control
El patrón `.tsx` / `.web.tsx` es legítimo en Expo, pero aquí la versión web es sistemáticamente 3–5× mayor que la nativa (`clientes`: 956 vs 4.755 líneas). En la práctica son **dos productos distintos compartiendo nombre**, con duplicación de lógica de negocio en cada par. Coste de mantenimiento ×2 y divergencia garantizada.

### 🟠 Grave 6: Higiene del repo (Informe A)
- **824,96 MiB de pack git** (82.955 objetos in-pack) con 32.919 archivos trackeados y 1.701 PNGs versionados. El repo tardará cada vez más en clonarse.
- 69 archivos sueltos en raíz: 8 PNGs (algunos de 500 KB–1 MB: `v4-hero-nuevo.png`, `verif-pricing.png`, `navbar-calc-fixed.png`, `comparativa-premium.png`), `Neuronal_Dynamics_Book.pdf` (28 MB, ajeno al proyecto), `neuronal_dynamics_master.html` (8,4 MB), `test_pw.pdf`, 5 `temp_*.txt` (trackeados), `diff_all.txt`, `filters_block*.txt`, `CV_Carlos_Hosteleria.html`, `QA_AUDIT_REPORT.md` ×2, `tsc_output.txt` (21 KB de errores de tsc commitado), `llms*.txt`, y un archivo con nombre literal "lista los archivos del directorio actual" (0 bytes, creado por error de shell).
- `.gitignore` cubre `node_modules/`, `dist/`, `.env`, `web/app/` (build), `web/salon/*/`; no ignora los PNGs de raíz ni los temp_.
- `scratch/` + `scratch_redesign/` + `design-demos/` + `project/` + `html_pages/` = **212 archivos** (≈20 MB) de residuo/sandbox versionados (no importados desde app/lib). `project/`, `dist/`, `scratch/`, `scripts/`, `ui-references/` y todos los `**/*.test.ts` excluidos del tsconfig.
- Tamaños en disco: `node_modules` 591 MB, `web` 140 MB, `dist` 22 MB, `html_pages` 11 MB, `design-demos` 5,4 MB, `scratch` 2,9 MB, `supabase/` 942 KB.
- Anomalías menores: `app/app/.expo/` (carpeta `.expo` anidada), `app/screens/` (3 archivos no-ruta dentro de `app/`).

### 🟡 Medio 7: Detalles de seguridad (Informe A)
- **Anon key hardcodeada como fallback en `lib/supabase.ts:22-24`** (JWT completo del proyecto `vtrggiogjrhqtwbhbgia`). El comentario lo justifica ("publishable, pensada para vivir en el cliente"). Es la anon key, no service_role — riesgo bajo pero es un secreto en el código.
- **URL de Supabase hardcodeada** en `lib/supabase.ts:14`, `app/(tabs)/configuracion.web.tsx:4053,4182` (webhooks Stripe/Redsys) y **un segundo proyecto** `https://aujlzfmrtafbmmjybjxz.supabase.co` hardcodeado en `scripts/delete-professionals.ts:4` y `scripts/seed-data.ts:4`.
- **Credenciales de cuenta demo en claro**: `lib/supabase.ts` exporta `DEMO_VIEWER = { email: 'demo.publico@mecha.app', password: 'MechaDemoView_2026' }` (documentado como público a propósito, protegido por RLS).
- `scripts/importar-osm-salones.mjs:15` usa `SUPABASE_SERVICE_ROLE_KEY` solo como variable de entorno (correcto). No se encontró `service_role` con valor inline.
- **`.vercel-token.txt` (60 bytes, 1 línea) existe en la raíz del working tree** — no trackeado en git, pero es un token vivo en disco sin cifrar.
- `.env` y `.env.challenger_bak2` presentes en disco, no trackeados; `.gitignore` incluye `.env`.
- 882 `any` explícitos (`: any` / `as any` / `<any>`) en app+lib+components; solo 4 `@ts-ignore/@ts-expect-error` y 22 `eslint-disable`.
- Mitigación presente: `supabase/migrations/20260811000000_s28_final_rls_lockdown.sql` + `lib/security/` (`sanitizadorCliente.test.ts`, `validadorRPC.test.ts`) y RLS en 57+ migraciones.

## 4. Otros datos fácticos del Informe A

- **Estructura:** `app/` 59 archivos (53 `.tsx`); patrón dual sistemático nativo `.tsx` + `.web.tsx`. 15 tabs en `app/(tabs)/` (index, citas, clientes, caja, informes, inventario, equipo, configuracion, presupuesto, campanas, resenas, lista-espera, mi-jornada, bandeja, ayuda) + rutas dinámicas: `app/cita/[id]`, `app/contacto/[slug]`, `app/pagar/[token]`, `app/pago/[ref]`, `app/pago/ok`, `app/presupuesto/[token]`, `app/r/[slug]`, `app/resena/[slug]`, `app/login`. ~27 rutas únicas ×2 plataformas. `lib/` 207 archivos; `components/` 107 archivos.
- **Archivos más grandes:** `AgendaCalendar.web.tsx` 25.683; `configuracion.web.tsx` 6.307; `clientes.web.tsx` 4.755; `equipo.web.tsx` 3.610; `informes.web.tsx` 3.188; `caja.web.tsx` 2.961.
- **Estado:** sin zustand/redux; solo 3 React Contexts (`lib/calendarContext.tsx`, `lib/themeContext.tsx`, `lib/privacyConsentContext.tsx`). Cliente Supabase único en `lib/supabase.ts` con modo demo (storageKey aislado) y wrapper `fetchSinRepetir`.
- **E2E Playwright:** config con testDir `./tests`, workers=1, storage state `playwright/.auth/user.json`; 11 specs, ~53 tests: portal-reserva (15), landing (8), staff-jornada (8), marketplace (7), config (4), demo (4), agenda-jornada (2), recursos-puestos (2), caja-sesion (1), agenda-realtime (1), inventario-gramos (1). Además `tests/e2e/tier1-4 *.test.mjs` (runner propio).
- **CI/CD:** sin GitHub Actions, sin `eas.json`, sin scripts EAS. `vercel.json` (5.193 bytes): build estático `expo export -p web --output-dir web/app` + `scripts/postbuild-web.mjs` + `generate-seo.mjs` + `generate-sitemap.mjs`, output `web`, rewrites y redirects SEO.
- **Edge Functions:** 43 (chispa-* ×7 de IA/voz, stripe-* ×2, crear-checkout-* ×3, agenda-asistente/optimizador, verifactu vía scripts, notificar-*, etc.), con `supabase/functions/shared/` común.
- **Manejo de errores/logging:** sistema centralizado (`lib/errores.ts` con mapa de códigos Postgres/Supabase → mensajes humanos en español, `mensajeDeError`; `lib/reportarError.ts` telemetría con dedupe por sesión, sin PII, desactivado en demo; `OrigenError = 'app'|'portal'|'landing'|'marketplace'|'edge_function'`). Usado en 38 archivos. Por debajo, try/catch ad-hoc en pantallas.
- **Scripts:** 77 archivos trackeados en `scripts/`: postbuild-web.mjs, generate-seo/sitemap.mjs, serve-web.mjs, verificar-app/landing/modelos.mjs, test-e2e-seo.mjs, importar-osm-salones.mjs, importar_jose_suarez.mjs, tts-* ×6 (ElevenLabs), narrar-recorrido.mjs, stripe-catalogo-suscripcion.mjs, crear-demo-marketing.mjs, generar-fotos-demo.mjs; mezcla de .py de marketing personal (generate_linkedin_assets.py, generate_instagram_avatar.py, generate_post1_*.py).

## 5. Plan de mejora del Informe A (incremental, sin romper nada)

**Fase 0 — Semana 1, riesgo cero (higiene)**
1. Rotar y borrar `.vercel-token.txt`; mover el segundo proyecto Supabase de los scripts a env vars.
2. `trash` de temp_*, tsc_output.txt, PDF/HTML ajenos, archivos `*.rescatado`, `scratch*/`, `design-demos/` (verificando antes que nada los importa). Gitignore PNGs de raíz.
3. Reconciliar `migrations/` raíz → `supabase/migrations/` (al menos documentar cuál es la fuente de verdad y congelar la otra).

**Fase 1 — Semana 1–2: CI mínima**
4. GitHub Actions: en cada push → `tsc --noEmit` + `deno task test` + lint. Después, Playwright nocturno.
5. Arreglar la task `deno test` para que corra los 55 archivos (o justificar cuáles se excluyen y por qué).

**Fase 2 — Meses 1–2: deuda estructural sin big bang**
6. Regla de congelación: ningún archivo crece por encima de ~800 líneas. Nuevas features en `AgendaCalendar.web.tsx` van a subcomponentes.
7. Extraer `AgendaCalendar.web.tsx` por capas con tests E2E como red de seguridad — la única refactorización larga que el Informe A emprendería este trimestre.
8. Crear `lib/<dominio>/repositorio.ts` y migrar llamadas pantalla por pantalla (empezando por `clientes`).

**Fase 3 — Decisión estratégica pendiente**
9. Decidir si la app nativa es producto real o experimento. Si es real: `eas.json` + builds EAS. Si no: congelar `.tsx` nativos y desarrollar solo en `.web.tsx` reduce el coste a la mitad.

## 6. Veredicto del Informe A

Stack: **7/10** — elecciones técnicas correctas y modernas, con puntos fuertes reales (tipado estricto, tests, RLS).
Ingeniería de proyecto: **4/10** — sin CI, schema no reproducible, un componente de 25K líneas, y un repo de 825 MiB usado como escritorio.
**No hace falta cambiar ninguna tecnología. Hace falta disciplina: CI primero, migraciones reconciliadas segundo, y luego comerse el calendario gigante por trozos.**

---

# PARTE II — INFORME B (análisis externo recibido)

## 1. Radiografía Numérica y Estructural del Proyecto

| Métrica | Valor Real Auditado | Veredicto Crítico |
|---|---|---|
| Archivos de código totales | 1.379 archivos | Volumen muy elevado para un equipo pequeño/medio |
| Líneas de código totales | 511.610 líneas | Masa de código comparable a un ERP de escala media |
| Archivos monstruo (> 2.000 líneas) | 12 archivos (Top: AgendaCalendar.web.tsx con 25.684 líneas / 1 MB) | 🔴 Riesgo crítico de mantenibilidad y regresiones |
| Tablas en Base de Datos | 98 tablas (todas con RLS activo) | 🟢 Excelente cobertura funcional y de seguridad multi-tenant |
| Edge Functions (Deno) | 44 funciones serverless | 🟢 Cobertura completa de pasarelas, IA, WhatsApp y auth |
| Archivos de Migración SQL | 265 archivos .sql | 🟡 Dispersión elevada; faltan snapshots y baseline unificado |
| Estado de TypeScript (tsc --noEmit) | 1 error activo de compilación | 🔴 Falla actualmente en AgendaCalendar.web.tsx:9493 (gridRect) |
| Tests Unitarios & IA (deno test) | 84 tests pasando (100% ok) | 🟢 Muy buena base en lógica pura de negocio y pasarela IA |
| Pipeline de CI/CD (GitHub Actions) | Inexistente (no hay .github/workflows) | 🔴 Riesgo de que código roto se despliegue a producción |

## 2. Análisis Crítico por Capas (Informe B)

### 🟢 Lo Bueno (Puntos Fuertes Extraordinarios)
- **Seguridad y Multi-tenant en Base de Datos:** El aislamiento por negocio_id mediante RLS con InitPlans optimizados (`(select auth.uid())`), RPCs con security definer y guards como `exige_mi_negocio()` es de un nivel de rigor muy superior a la media de startups.
- **Capa de IA y LLMs Robusta:** El gateway unificado `supabase/functions/shared/openrouterClient.ts`, el catálogo con validación de precios reales `modelos.ts`, y la limitación de gasto por usuario en BD son ejemplares.
- **Módulo Fiscal y Antifraude (VeriFactu):** Cadenas inmutables de hash SHA-256 para facturación española según la normativa tributaria.
- **Deduplicación de Peticiones en Vuelo:** La capa en `lib/supabase.ts` que funde peticiones idénticas concurrentes en una sola respuesta resolvió con elegancia el problema de sobrecarga en el arranque.

### 🟡 Lo Malo (Deuda Técnica y Cuellos de Botella)
- **Ausencia de un Gestor de Estado del Servidor (Server State Cache):** Toda la app hace fetching manual con useEffect + useState + llamadas directas a `supabase.from(...)`. Esto causa prop drilling masivo (pasar 15 callbacks y props a través de 5 niveles de componentes) y dificultades para invalidar datos cuando ocurre una mutación.
- **Divergencia entre Web y Móvil Nativo:** Hay componentes `.tsx` (móvil) de 200 líneas y `.web.tsx` de 5.000 líneas. Hoy el producto real es 100% web; el código nativo ha quedado rezagado y representa peso muerto de mantenimiento si no se unifica o desacopla formalmente.
- **Dependencias Fantasma y Externas en package.json:** `three` (Three.js), `gsap` y `moti` están instaladas en package.json pero no se importan en el código de producción de la app React Native Web (solo estaban en demos de diseño o HTMLs con CDN). Engordan node_modules y alargan el tiempo de instalación.
- **xlsx** apunta directamente a un .tgz externo en `https://cdn.sheetjs.com/....` Si la CDN de SheetJS tiene microcortes, el `npm install` del build de Vercel fallará.
- **Dispersión en el directorio web/:** Casi 600 archivos en web/, con decenas de HTMLs duplicados de prototipos pasados (demo_v2.html, diseno-aurora.html, diseno-brasas.html, diseno-forja.html, mecha-cinema.html, etc.).

### 🔴 Lo Feo (Riesgos Críticos de Estabilidad)
- **Los "Archivos Titánicos":** AgendaCalendar.web.tsx con 25.684 líneas: un solo archivo concentra el cálculo de colisiones de citas, drag & drop, render de rejilla, cálculo de reposos de tintes, modales de edición, cobros rápidos, menús contextuales y timers. Cualquier refactorización o cambio en una variable puede romper otra funcionalidad sin que nadie se dé cuenta hasta llegar a producción.
- **Falta de Validación Automática Pre-Despliegue (CI/CD):** Al no existir GitHub Actions, cualquier persona o agente que haga git push a master o a una rama de staging puede colar errores de TypeScript (como el error actual de gridRect) o romper tests sin aviso previo.
- **Falta de Tipos Fuertes Generados de Supabase:** Gran parte de las llamadas a Supabase usan `<any>` o interfaces manuales dispersas por cada pantalla, propensas a desincronizarse cuando cambia una columna en la base de datos.

## 3. Hoja de Ruta de Modernización "Zero-Breaking" del Informe B (4 fases progresivas y no destructivas)

**FASE 1: HIGIENE Y BLINDAJE CI/CD (Inmediato - 0 Riesgo de Regresión)**
- Arreglo del error TS en AgendaCalendar
- GitHub Actions CI (Typecheck + Deno tests + IA checks)
- Tipos de Supabase autogenerados (`types/database.types.ts`)
- Limpieza de dependencias fantasmas (three, moti, gsap)

**FASE 2: GESTIÓN DE ESTADO Y ARQUITECTURA DE DATOS (No invasivo)**
- Introducción progresiva de TanStack Query (React Query)
- Hooks de datos centralizados (useCitas, useClientes, useProfesionales)
- Stores ligeros con Zustand para UI compleja (evitar prop drilling)

**FASE 3: MODULARIZACIÓN CONTROLADA DE ARCHIVOS MONSTRUO**
- Descomposición de AgendaCalendar.web.tsx en submódulos encapsulados:
  - `agenda/drag-drop` (coordenadas, rejilla, ghost)
  - `agenda/cards` (render de citas, fases de reposo, estados)
  - `agenda/modals` (nueva cita, detalles, pago)
- Modularización de configuracion.web.tsx y clientes.web.tsx

**FASE 4: CONSOLIDACIÓN DE BASE DE DATOS Y LIMPIEZA DE ARTEFACTOS**
- Snapshot y baseline de migraciones en Supabase CLI
- Archivar páginas HTML huérfanas de web/ en archive/
- Unificación definitiva de design tokens (eliminar redefiniciones C14)

## 4. Detalle de Acciones Concretas Recomendadas (Informe B)

1. **Blindaje Inmediato con CI/CD (GitHub Actions):** crear `.github/workflows/ci.yml` que se ejecute en cada Pull Request y Push:
   - `npm run typecheck` (tsc --noEmit)
   - `deno task test` (tests unitarios de caja, métricas, estados de citas)
   - `deno task test:ia` (tests del gateway de IA)
   - `npm run verificar:modelos` (consistencia del catálogo de IA)
   - Resultado: es imposible que un error de compilación o de lógica llegue a producción.

2. **Generación Automatizada de Tipos de Supabase:**
   ```bash
   npx supabase gen types typescript --project-id vtrggiogjrhqtwbhbgia > types/database.types.ts
   ```
   Y tipar el cliente en `lib/supabase.ts`:
   ```typescript
   import { Database } from '@/types/database.types';
   export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, ...);
   ```
   Resultado: autocompletado inteligente de tablas, columnas y tipos de retorno; si una columna cambia o se renombra en SQL, TypeScript avisa al instante en el frontend.

3. **Modularización Quirúrgica de AgendaCalendar.web.tsx:** sin reescribir la lógica (para garantizar que no se rompa el drag & drop ni el cálculo de fases de reposo), extraer subcomponentes a `components/agenda/`:
   - `AgendaDragLayer.tsx`: manejo de coordenadas de arrastre y cálculo de fantasma visual.
   - `AgendaTimeGrid.tsx`: líneas horarias y columnas de profesionales.
   - `AgendaAppointmentCard.tsx`: tarjeta con fases activas/reposo y memoización estricta.
   - `useAgendaState.ts`: hook que encapsula el estado local y las operaciones CRUD.

## 5. Conclusión del Informe B

El proyecto tiene una funcionalidad de negocio y una seguridad en base de datos sobresalientes, pero sufre de gigantismo en componentes frontend y falta de automatización en CI/CD. Propone empezar de inmediato con las tareas de Fase 1 (0 riesgo, máximo beneficio): corregir el error de tipado actual en AgendaCalendar.web.tsx, crear el pipeline de GitHub Actions, y limpiar las dependencias huérfanas en package.json.

---

*Fin del mega informe en crudo. Pendiente: comparación crítica entre Informe A e Informe B (coincidencias, divergencias, datos contradictorios y plan de acción conjunto).*
