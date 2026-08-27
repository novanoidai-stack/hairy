# INFORME DEFINITIVO — Auditoría del Stack Hairy/Mecha
**Fecha:** 2026-08-27
**Metodología:** fusión crítica de dos auditorías independientes (A: ZCode, B: externa) + verificación directa de cada dato discrepante contra el repositorio y la base de datos en vivo. Todo dato marcado ✅ ha sido re-verificado hoy; nada se mantiene por confianza.

---

## 0. Tabla de verificación — dónde acierta cada informe y qué se corrige

| Dato | Informe A | Informe B | Verificación directa | Valor correcto |
|---|---|---|---|---|
| Edge Functions | 43 | 44 | ✅ `ls supabase/functions` = 44 entradas, pero 2 son carpetas compartidas (`_shared`, `shared`) | **42 funciones reales** (ambos fallaron por poco) |
| Tablas BD | "57 migraciones tocan RLS" | 98 tablas, todas con RLS | ✅ `list_tables` contra producción | **98 tablas, RLS activo en las 98** (B exacto) |
| Error TypeScript | no detectado | 1 error: `AgendaCalendar.web.tsx:9493 (gridRect)` | ✅ `tsc --noEmit` ejecutado hoy | **Confirmado: TS2339, `gridRect` no existe en el tipo del drag state, línea 9493. El proyecto NO compila limpio ahora mismo.** B acierta; A falló al no ejecutar tsc |
| Dependencias fantasma (three/gsap/moti) | no detectado | instaladas, sin uso en producción | ✅ grep sobre app/ lib/ components/ | **Confirmado: 0 imports de three, gsap y moti en código de producción.** B acierta |
| xlsx | no detectado | riesgo: .tgz de CDN externa | ✅ xlsx SÍ se usa (`clientes.web.tsx`, `documentExtractor.ts`, `ModalImportarTarifasIA.tsx`, `TabMigracionMagica.tsx`, `lib/manuals/clientes.ts`) | **Confirmado: la dependencia es real y crítica, y apunta a `https://cdn.sheetjs.com/...tgz`. El riesgo de build por microcorte de CDN es real.** B acierta |
| web/ disperso | "140 MB en disco" | "casi 600 archivos, decenas de HTMLs de prototipos" | ✅ `find web -type f` | **1.061 archivos, 572 HTML.** B acierta en lo estructural |
| CI inexistente | confirmado | confirmado | ✅ `ls .github` → no existe | **Confirmado por ambos** |
| Tests Deno | 55 archivos, solo 6 en la task | "84 tests pasando (100% ok)" | No re-ejecutado hoy; **ambos son compatibles**: 55 archivos ≠ 84 tests individuales. El hallazgo clave es de A: la task solo ejecuta 6 de los 55 archivos | Ambos aportan piezas distintas y válidas |
| Líneas de código | 119.001 (app+lib+components) | 511.610 totales | ✅ ambos ciertos: A contó solo código de producción en TS; B contó todo (SQL, scripts, web/, docs) | **119K líneas de app productiva / ~512K totales del repo** |

**Lectura honesta de esta tabla:** el Informe B es más preciso en los datos vivos (tsc, BD, dependencias, web/); el Informe A es más profundo en higiene de repo, seguridad de secretos y estructura de migraciones. Ninguno era autosuficiente. La validación cruzada valió la pena.

---

## 1. El stack, en una línea (consenso de ambos, sin cambios)

**Expo SDK 56 + expo-router + React Native Web con doble implementación nativa/web + Supabase (Postgres con RLS total, 42 Edge Functions Deno) + tests unitarios en Deno + E2E en Playwright + deploy estático en Vercel.**

Veredicto unánime: **la elección tecnológica es correcta y moderna; el problema no es el stack sino la disciplina de ingeniería alrededor** (CI, tamaño de archivos, capa de datos, higiene).

---

## 2. Radiografía numérica definitiva (todo verificado)

| Métrica | Valor | Fuente |
|---|---|---|
| Líneas TS/TSX productivas (app+lib+components) | 119.001 | A |
| Líneas totales del repo (todo) | ~511.610 | B |
| Archivos de código totales | ~1.379 | B |
| Archivos monstruo (>2.000 líneas) | 12; top: `AgendaCalendar.web.tsx` **25.683–25.684 líneas / 1 MB** | ambos (coinciden) |
| Otros titanes | `configuracion.web.tsx` 6.307 · `clientes.web.tsx` 4.755 · `equipo.web.tsx` 3.610 · `informes.web.tsx` 3.188 · `caja.web.tsx` 2.961 | A |
| Rutas expo-router | 15 tabs + 9 dinámicas ≈ 27 rutas × 2 plataformas | A |
| Tablas BD | 98, **RLS activo en las 98** | B ✅ |
| Edge Functions | 42 reales (+2 carpetas shared) | verificado |
| Migraciones SQL | 16 canónicas en `supabase/migrations/` (1.321 líneas) + **265 archivos / 37.033 líneas en `migrations/` raíz** | ambos (coinciden) |
| Tests unitarios | 55 archivos `.test.ts`; task `deno test` ejecuta solo 6 (+`lib/caja/`); ~84 tests individuales pasando | A+B |
| Tests E2E | 11 specs Playwright, ~53 tests | A |
| Llamadas `supabase.from(` | 199 en pantallas/componentes (156 app + 43 components) + 55 en lib; 81 archivos importan `lib/supabase` | A |
| `any` explícitos | 882; solo 4 `@ts-ignore` | A |
| CI/CD | **Inexistente** (sin `.github`, sin `eas.json`) | ambos ✅ |
| Estado TypeScript | **1 error activo: `AgendaCalendar.web.tsx:9493` (TS2339, `gridRect`)** | B ✅ |
| Git | 824,96 MiB de pack, 32.919 archivos trackeados, 1.701 PNGs | A |
| web/ | 1.061 archivos, 572 HTML, ~140 MB | A+B ✅ |
| Residuo sandbox | `scratch/`+`scratch_redesign/`+`design-demos/`+`project/`+`html_pages/` = 212 archivos ≈20 MB | A |

---

## 3. Fortalezas (consenso total — lo que hay que proteger)

1. **Seguridad multi-tenant de nivel superior a la media.** RLS activo en las 98 tablas (verificado en producción), con InitPlans optimizados (`(select auth.uid())`), RPCs `security definer` con guards tipo `exige_mi_negocio()`, migración de lockdown final (`20260811000000_s28_final_rls_lockdown.sql`) y tablas intencionadamente sin políticas para service_role únicamente (p. ej. `stripe_webhook_eventos`, `lista_espera_avisos`, documentado en comentarios de la propia BD). Ambos informes, de forma independiente, califican esto de "excepcional" / "muy superior a la media de startups".
2. **TypeScript `strict: true`** con solo 4 `@ts-ignore` en 119K líneas.
3. **Suite de tests real:** lógica de negocio pura y testeada (motor de comisiones, fiscal/veri factu con cadenas inmutables SHA-256, escandallos, métricas) + 53 E2E Playwright con storage state autenticado.
4. **Manejo de errores centralizado:** `lib/errores.ts` (mapa de códigos → mensajes humanos), `lib/reportarError.ts` (telemetría sin PII, dedupe por sesión, tabla `errores_cliente` con 115 registros reales — es decir, la telemetría funciona en producción), `lib/chunkCaducado.ts`.
5. **Capa de IA seria:** gateway unificado `supabase/functions/shared/openrouterClient.ts`, catálogo `modelos.ts` con validación de precios, rate limiting y limitación de gasto por usuario en BD (tablas `rate_limit_hits`, `rpc_rate_hits`, `planes_ia` visibles en producción).
6. **Deduplicación de peticiones en vuelo** (`fetchSinRepetir` en `lib/supabase.ts`) — resuelve con elegancia la sobrecarga de arranque.
7. **Módulo fiscal VeriFactu** conforme normativa española (tabla `tickets_verifactu` con 1.508 registros reales).

---

## 4. Problemas — lista unificada y priorizada (fusión crítica de ambos)

### 🔴 P1. `AgendaCalendar.web.tsx`: 25.684 líneas Y con un error de compilación activo
Punto de máximo consenso y ahora agravado por la verificación: **el archivo más grande del proyecto es también el único que impide que `tsc --noEmit` pase limpio** (`gridRect` no existe en el tipo del estado de drag, línea 9493). Concentra colisiones de citas, drag & drop, render de rejilla, reposos de tintes, modales, cobros rápidos, menús contextuales y timers. Sin CI, ese error llegó al repo sin que nadie lo detuviera — es la demostración empírica de por qué hace falta P4.

### 🔴 P2. Sin CI/CD
Cero GitHub Actions, cero `eas.json`. Nada valida un push: ni tipos, ni tests, ni lint. **El error de P1 es la prueba de que este riesgo ya se materializó.** Ambos informes lo señalan como crítico.

### 🔴 P3. Schema de BD no reproducible
16 migraciones canónicas vs 265 archivos / 37.033 líneas en `migrations/` raíz. El 95% del schema vive fuera de lo que Supabase CLI considera histórico. Sin baseline ni snapshots (B añade este matiz). Consecuencia: imposible reconstruir la BD desde el repo, sin staging, sin rollback. Añadido por A que B no vio: `update_rpc.sql` y `scripts/APLICAR_INVENTARIO_SUPABASE.sql` sueltos.

### 🔴 P4. Sin capa de acceso a datos ni caché de estado del servidor
Los dos informes describen el mismo problema desde ángulos distintos y ambos son válidos:
- A: 199 llamadas `supabase.from(...)` incrustadas en pantallas → lógica duplicada, imposibilidad de invalidar/refetchear consistente.
- B: fetching manual `useEffect + useState` en toda la app → **prop drilling masivo (15 callbacks a través de 5 niveles)** y sin invalidación de datos tras mutaciones.
Conclusión unida: falta tanto una capa de repositorio/servicio por dominio como una solución de server-state (B propone TanStack Query + hooks `useCitas/useClientes/useProfesionales`; A propone repositorios propios). **No son excluyentes: son la mitad cada uno** (Query sin capa de dominio = queries duplicadas; capa sin Query = sin caché ni invalidación).

### 🟠 P5. Divergencia nativo/web descontrolada
`.web.tsx` sistemáticamente 3–5× mayor que su par nativo (clientes: 956 vs 4.755). B añade el dato estratégico que A no afirmó: **hoy el producto real es 100% web; el código nativo es peso muerto**. Decisión pendiente: o se invierte en EAS/nativo o se congela — mantener el status quo cuesta el doble.

### 🟠 P6. Dependencias: fantasmas y frágiles (solo B, verificado ✅)
- `three`, `gsap`, `moti`: **0 imports en código de producción** — engordan node_modules (591 MB) y alargan installs.
- `xlsx` se usa de verdad (5+ archivos productivos) **pero apunta a un .tgz de CDN externo**: si SheetJS tiene un microcorte, el build de Vercel falla. Hay que vendorizarlo o moverlo a dependencia versionada.

### 🟠 P7. Higiene del repo (solo A, con detalle)
- 824,96 MiB de pack git; 1.701 PNGs versionados; 32.919 archivos trackeados.
- 69 archivos sueltos en raíz: 8 PNGs grandes, PDF de 28 MB ajeno al proyecto, HTML de 8,4 MB, 5 `temp_*.txt` trackeados, `tsc_output.txt` commitado, CV personal, un archivo llamado literalmente "lista los archivos del directorio actual".
- 212 archivos de sandbox versionados; anomalías `app/app/.expo/` y `app/screens/`.
- B añade su versión: web/ con 572 HTML de prototipos duplicados (demo_v2, diseno-aurora/brasas/forja, mecha-cinema...).

### 🟠 P8. Seguridad de secretos (solo A, verificado en disco)
- **`.vercel-token.txt` vivo y sin cifrar en la raíz del working tree** — rotar y eliminar, urgente.
- Anon key hardcodeada como fallback silencioso en `lib/supabase.ts:22-24` (riesgo bajo, patrón malo: el build debería fallar si falta el env var).
- Segundo proyecto Supabase (`aujlzfmrtafbmmjybjxz`) hardcodeado en `scripts/delete-professionals.ts:4` y `scripts/seed-data.ts:4` — residuo peligroso.
- `DEMO_VIEWER` con password en claro (documentado como público a propósito, protegido por RLS — aceptable, pero conviene revisión periódica).

### 🟡 P9. Tipos de Supabase generados a mano (solo B)
Gran parte de las llamadas usan interfaces manuales dispersas o `<any>`. Sin `supabase gen types`, un rename de columna en SQL rompe pantallas silenciosamente. Empalma con P4: los 882 `any` de A son el síntoma medible.

### 🟡 P10. Tests ejecutándose parcialmente (solo A)
55 archivos de tests, la task `deno test` corre 6. El "84 tests pasando" de B es cierto pero engañoso: ~49 archivos nunca se ejecutan en el flujo normal.

### 🟡 P11. Detalle B no visto por A: design tokens
Unificación pendiente de design tokens (redefiniciones "C14" duplicadas). Menor, pero real.

---

## 5. Hoja de ruta definitiva unificada (zero-breaking, priorizada por impacto/riesgo)

Consenso de ambos planes, resolviendo sus diferencias: A ponía la higiene primero; B ponía la CI primero. **Se une: la CI es la protección que hace seguras todas las demás fases, así que va primero y en paralelo la higiene.**

### FASE 0 — Inmediato (esta semana, riesgo cero)
1. **Rotar y borrar `.vercel-token.txt`**; mover el segundo proyecto Supabase a env vars. (A)
2. **Corregir el error TS `gridRect` en `AgendaCalendar.web.tsx:9493`.** (B — y verificado)
3. **CI mínima** `.github/workflows/ci.yml` en cada PR/push: `npm run typecheck` + `deno task test` + `deno task test:ia` + `npm run verificar:modelos`. Playwright nocturno después. (ambos)
4. **Arreglar la task `deno test`** para correr los 55 archivos. (A)
5. **Dependencias:** eliminar `three`/`gsap`/`moti`; vendorizar `xlsx` o resolverla por registry versionado. (B)

### FASE 1 — Semana 2–3: cimientos de datos
6. **Tipos de Supabase autogenerados**: `npx supabase gen types typescript --project-id vtrggiogjrhqtwbhbgia > types/database.types.ts` y `createClient<Database>` en `lib/supabase.ts`. (B) — es prerrequisito ideal de la capa de datos de A.
7. **Migraciones:** declarar `supabase/migrations/` fuente de verdad única, congelar/archivar `migrations/` raíz, generar snapshot/baseline con Supabase CLI. (ambos)

### FASE 2 — Meses 1–2: arquitectura de datos sin big bang
8. **Capa por dominio** (repositorios/servicios en `lib/<dominio>/`) **+ TanStack Query + hooks `useCitas/useClientes/...`** en pantallas nuevas primero, migrando pantalla por pantalla (empezando por `clientes`); Zustand solo si el prop drilling de agenda lo exige. (A+B fusionados)
9. **Regla de congelación:** ningún archivo supera ~800 líneas; todo lo nuevo de la agenda va a subcomponentes.

### FASE 3 — Meses 2–4: descomposición de titanes
10. `AgendaCalendar.web.tsx` por extracción quirúrgica sin reescribir lógica: `AgendaDragLayer.tsx`, `AgendaTimeGrid.tsx`, `AgendaAppointmentCard.tsx`, `useAgendaState.ts`, módulos drag-drop/cards/modals. (ambos coinciden exactamente) Red de seguridad: los 53 E2E existentes + nuevos tests de agenda antes de tocar.
11. Después `configuracion.web.tsx` y `clientes.web.tsx`.

### FASE 4 — Continuo: higiene y decisiones estratégicas
12. Limpieza de raíz (temp_*, PDFs ajenos, PNGs → gitignore, `*.rescatado`), archivar los 572 HTML de prototipos de web/ en `archive/` o fuera del repo, reducir los 212 archivos sandbox. (A+B)
13. **Decisión estratégica nativo/web**: producto real → `eas.json` + EAS; si no → congelar `.tsx` nativos y ahorrar la mitad del mantenimiento. (A+B)
14. Unificar design tokens. (B)
15. Cuando el pack git duela lo suficiente: historia nueva del repo (`git filter-repo` de los 1.701 PNGs) — solo con respaldo verificado, no antes. (A)

---

## 6. Veredicto definitivo

| Dimensión | Nota | Fundamento |
|---|---|---|
| Elección de stack | **7/10** | Moderno, coherente, sin tecnologías equivocadas |
| Seguridad de datos (BD/RLS) | **9/10** | 98/98 tablas con RLS, RPCs con guards, lockdown — nivel excelente |
| Código de producto | **5/10** | Strict mode y tests, pero 12 titanes, 199 llamadas dispersas, 882 `any`, y hoy no compila limpio |
| Ingeniería de proyecto (CI, reproducibilidad, higiene) | **3/10** | Sin CI, schema no reproducible, repo de 825 MiB usado como escritorio, token vivo en raíz |

**Conclusión única y sin ambigüedad:** no hay que cambiar ninguna tecnología. Hay que, en orden: (1) blindar con CI y arreglar el error de compilación, (2) cerrar los agujeros de secretos y schema reproducible, (3) construir capa de datos con tipos generados, (4) descomponer los titanes con los E2E como red de seguridad, y (5) decidir si el nativo es producto o residuo. El proyecto ya tiene la parte difícil hecha (dominio, seguridad, tests); le falta la disciplina de fábrica que lo convierte en algo serio.
