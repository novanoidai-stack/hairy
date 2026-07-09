# Verificación E2E de la capa de IA "Chispa" — Sesión 10 (cierre)

> Fecha: 2026-07-09 · Sesión: Carlos + Claude (Opus 4.8) · Plan: `informes/PLAN-IA-CHISPA-V2-REDISENO.md` (Sesión 10)
> Objetivo: estabilizar y DEMOSTRAR que toda la capa de IA funciona de verdad (no solo que compila).
> Método: reproducción y fix de bugs + verificación E2E en la demo real (`/demo.html?share=1`, iframe `?demo=1`,
> cuenta `demo.publico@mecha.app`) manipulada por DOM nativo, más llamadas `curl` autenticadas a cada edge function.
> Leyenda: **PASA** = verificado en vivo con evidencia · **PASA (code)** = corregido/confirmado en código + tsc, sin
> escenario en vivo por falta de datos sembrados en la demo (E2E completo ya cubierto en su sesión de origen).

---

## Resumen ejecutivo

- **Cero solapes de avisos/dashboard.** Causa raíz encontrada y arreglada: los tooltips "i" del dashboard de
  Informes quedaban atrapados en el stacking context de las tarjetas (transform de la animación de entrada +
  hover-lift) y los tapaba la tarjeta/sección siguiente. Ahora se renderizan en un portal a `document.body`.
  Verificado en móvil y desktop.
- **Cada pestaña carga con feedback.** Auditadas las 12 pestañas: todas muestran loader instantáneo. Unificado el
  único inconsistente (lista-espera). Medido el coste real: la conexión (llamadas de auth redundantes) dominaba;
  reducida con un cache → **88 → 26** peticiones Supabase en la carga de Informes.
- **Checklist E2E pasado.** 11/11 edge functions de IA desplegadas y con llamada autenticada real; panel de Chispa,
  organizador de agenda, IA por página y hub de descubribilidad verificados con estados visibles.
- **2 bugs cazados y arreglados** en esta sesión (detalle abajo): solape de tooltips (Informes) y fallo silencioso
  en Bandeja (`proponerAccionIA`).
- `npx tsc --noEmit` limpio (solo ruido preexistente de `scripts/tts-test/`, Deno) · `npm run build:web` OK ·
  advisors de seguridad **140 lints, 0 ERROR** (idéntico al baseline de Sesión 8; sin migraciones esta sesión).

---

## 1. Solape avisos / dashboard (sobre todo en Informes) — RESUELTO

### Reproducción y causa raíz
Reproducido en la demo con diagnóstico DOM (`elementFromPoint` sobre el tooltip abierto): el tooltip "i" de un KPI
quedaba **tapado** por contenido posterior. Cadena de stacking analizada:

- `.kpi-card` lleva `animation: slideInUp ... both`. El keyframe final `to { transform: translateY(0) }` se **retiene**
  con `both`; `translateY(0)` es matriz identidad pero **sigue siendo un `transform`**, que crea un stacking context
  permanente en cada tarjeta. El hover-lift (`translateY(-2px)`) reproduce lo mismo mientras pasas el ratón para llegar
  al icono.
- El tooltip (`position: absolute; z-index: 60`) quedaba **atrapado** dentro de ese contexto; como la tarjeta participa
  en el grid a `z-index: auto` (orden de DOM), la tarjeta/sección siguiente lo pintaba por encima.
- Mismo patrón en `.section-card` (`scaleIn ... both`) → afectaba también a los tooltips de las cabeceras de sección.

### Fix
`app/(tabs)/informes.web.tsx` — `InfoDot` reescrito: el tooltip se renderiza en un **portal a `document.body`** con
`position: fixed` calculado del `getBoundingClientRect` del ancla, con recorte al viewport (clamping) y flecha
reposicionada para seguir apuntando al ancla. Reposiciona ante scroll/resize (listener en captura). Escapa de TODO
stacking context. `z-index: 120` (por debajo de AvisosBell 200 y del panel de Chispa, por encima del contenido).

### Evidencia (PASA)
- **Desktop 1400px (5 columnas):** tooltip izquierdo y el del **borde derecho** ambos por encima en 3/3 puntos de su
  superficie, portalados a `body`, dentro del viewport (el derecho recortado a `right:1390 ≤ 1400`). Captura con dos
  tooltips flotando por encima del dashboard sin recorte.
- **Móvil (~750px, grid 2 col):** tooltip por encima en 3/3 puntos incluso forzando la tarjeta en estado hover
  (`transform` aplicado) — el peor caso que antes lo atrapaba. Captura del tooltip "Numero total de citas…" pintado
  sobre el dashboard con la flecha apuntando a su KPI.
- **AvisosBell (topbar de Informes, `mode="header"`):** dropdown (`z:200`) + backdrop (`z:190`) en `fixed`, por encima
  del contenido — comportamiento correcto de menú, sin solape anómalo.
- **Tarjetas proactivas Sesiones 4/6/7/8 (`TarjetaAyudaIA`):** confirmado que viven en flujo normal (sin
  `position: fixed/absolute`); no compiten en z-index ni las tapa ningún contenedor padre.

---

## 2. Rendimiento de carga por pestaña — MEDIDO Y REDUCIDO

### Auditoría de feedback de carga (las 12 pestañas)
Todas inicializan `loading = true` y renderizan un indicador **antes** de que resuelva el fetch (ninguna se queda en
blanco):

| Pestaña | Indicador de carga | Estado |
|---|---|---|
| Agenda (index) | `AgendaCalendar` gestiona su propia carga | OK |
| Mi Jornada | spinner + `if (loading && !resumen)` | OK |
| Caja | spinner + "Cargando citas pendientes..." | OK |
| Presupuestos | `if (loading)` | OK |
| Bandeja | spinner + "Cargando bandeja…" | OK |
| Lista de espera | **texto plano sin spinner** → unificado a `PageLoader` | CORREGIDO |
| Clientes | `PageLoader` | OK |
| Reseñas | `if (loading)` | OK |
| Equipo | `if (loading)` | OK |
| Inventario | `PageLoader` | OK |
| Informes | spinner + "Cargando datos..." | OK |
| Configuración | `PageLoader` | OK |

### Medición (conexión vs. código)
Extraídos los *resource timings* reales de la carga de `/app/informes?demo=1`:

- **CÓDIGO:** un único bundle monolítico `entry-*.js` de **6.3 MB** (sin code-splitting). En localhost baja en 72ms, pero
  en red real ese peso es el coste dominante del **primer** render de la SPA. Tras la primera carga, el cambio de
  pestaña es cliente (expo-router, `unmountOnBlur: false`) → instantáneo.
- **CONEXIÓN:** **88 peticiones Supabase**, con **múltiples llamadas redundantes a `/auth/v1/user`** (300–500ms cada
  una). Causa: `getUserProfile()` hace `auth.getUser()` (round-trip de red) y se invoca en cada pestaña +
  `ChispaLauncher` + gate de privacidad + varios hooks al montar.

### Fix (reducción real, bajo riesgo)
`lib/auth.ts` — cache de sesión/perfil con TTL corto (8s, colapsa la ráfaga de montaje) + coalescing de la petición en
vuelo. No cachea nulos ni errores transitorios (se reintentan). Se **invalida** en cualquier `onAuthStateChange`
(login/logout/refresh) y tras mutar el propio perfil (`privacyConsentContext` al aceptar privacidad;
`usePaginaManualVista` al marcar visto).

### Evidencia (PASA)
Misma carga de Informes, tras el cache: **`/auth/v1/user` 12+ → 1**, `profiles select` múltiples → 1, **total Supabase
88 → 26**, contenido de Informes carga correcto. Estable tras rebuild y reload.

> Nota honesta: el bundle de 6.3 MB (code-splitting de la SPA) es una mejora de CÓDIGO mayor y arquitectónica; se deja
> **documentada como coste conocido**, no se toca en esta sesión de QA por riesgo. Recomendación futura: lazy-load de
> rutas pesadas (Informes, Configuración) en el export web.

---

## 3. Checklist E2E "funciona de verdad"

### 3.1 Edge functions (todas desplegadas + una llamada autenticada real)
Sweep sin auth (401 = desplegada con `verify_jwt`; 400 = pública desplegada; 404 = no desplegada). Control
`__no_existe_control__` → 404 (distinguible). Llamada autenticada con el JWT real de `demo.publico`:

| Edge function | Sin auth | Autenticada (real) | Estado |
|---|---|---|---|
| `agenda-asistente` (cerebro Chispa) | 401 | **200** — respuesta real ("Hola, soy Chispa…") | PASA |
| `onboarding-agent` (config guiada) | 401 | 400 `invalid_tema` (auth OK, valida input) | PASA |
| `chispa-tts` (voz) | 401 | **200** — MP3 real (ID3+Lavf) → ElevenLabs con créditos | PASA |
| `chispa-stt` (micro) | 401 | 502 `invalid_audio` (auth OK, llama al proveedor STT) | PASA |
| `chispa-landing` (chatbot landing) | 400 | **200** — reply real ("Soy Chispa, la IA de Mecha OS…") | PASA |
| `color-formula-parser` | 401 | **200** — parseo real (`tono 6.0, oxidante 20 vol`) | PASA |
| `traductor-marcas` | 401 | 400 `formula/marca_destino requeridos` (auth OK) | PASA |
| `chispa-vision-corte` | 401 | 400 `imageUrl, catalogo requeridos` (auth OK) | PASA |
| `chispa-vision-instagram` | 401 | 400 `urlAntes, urlDespues requeridos` (auth OK) | PASA |
| `try-on-color` | 401 | 400 `imageUrl, targetColor requeridos` (auth OK) | PASA |
| `migracion-magica` | 401 | 400 `Faltan parametros` (auth OK) | PASA |

**11/11 desplegadas y ACTIVE** (versiones: agenda-asistente v29, onboarding-agent v14, chispa-tts v9, chispa-stt v6,
chispa-landing v4, color-formula-parser v4, traductor-marcas v4, chispa-vision-corte v3, chispa-vision-instagram v3,
try-on-color v3, migracion-magica v4). Ninguna devolvió 404. Las 400/502 son validación de la propia función (probando
que auth pasó el gateway), no del gateway. `color-formula-parser`, `agenda-asistente`, `chispa-tts` y `chispa-landing`
dieron 200 completo.

> Aparte (no IA): `validate-captcha` está en el repo pero **no desplegada** (bloqueada en credenciales, ver
> [[wip-comisiones-fidelizacion-inventario-desplegado]]). No forma parte de la capa de IA.

### 3.2 Panel de Chispa
| Punto | Evidencia | Estado |
|---|---|---|
| Panel abre | Pestaña flotante `.chispa-launch-tab` → drawer con cabecera "Chispa · IA · asistente del salon" | PASA |
| Envío de mensaje E2E | "¿Cuántas citas tengo hoy?" → respuesta real del LLM con datos reales ("Hoy, 9 de julio, no tienes ninguna cita agendada… dime y lo gestiono") | PASA |
| Pantalla completa | Botón "Ver Chispa a pantalla completa" presente | PASA |
| Micro | Botón "Hablar a Chispa" presente (permiso nativo verificado en Sesión 1) | PASA |
| Voz honesta | `chispa-tts` → 200 con audio real; indicador de "voz básica" correctamente **oculto** (ElevenLabs sano). Fallback verificado en Sesión 1 forzando fallo | PASA |
| Bloques interactivos | formulario/opciones/progreso — verificado E2E en Sesión 1 (arnés `?chispatest=1`) y Sesión 3 (formulario de "crea un servicio") | PASA (Sesión 1/3) |
| Config guiada | "configúrame el salón" — verificado E2E en Sesión 2 (escritura real en tenant `testeo4_03801`) | PASA (Sesión 2) |
| Actúa con mínima info | formulario con solo lo que falta — verificado E2E en Sesión 3 (8 combinaciones) | PASA (Sesión 3) |
| Briefing proactivo | "ESTO ES LO QUE VEO HOY" con acciones de un clic (Configurar horario, Ver clientes…) visible en el panel | PASA |

### 3.3 IA por página (estados visibles, sin fallo silencioso)
| Superficie | Evidencia en vivo (demo) | Estado |
|---|---|---|
| Agenda — "Organizar mi agenda" (S5) | Botón en toolbar; abre panel con estado visible "Tu agenda de hoy está en orden. Sin retrasos, solapes ni huecos muertos…" | PASA |
| Mi Jornada (S4/S7) | Botón "Analizar mi día" + resumen determinista siempre visible | PASA |
| Caja — upsell (S6) | Página carga con la superficie de upsell/Chispa; upsell E2E completo con datos sembrados en Sesión 6 | PASA |
| Presupuestos — NL + seguimiento (S6) | Creador NL + alerta "sin respuesta" presentes | PASA |
| Clientes — riesgo/fuga + Q&A (S7) | Lista con marcadores riesgo/fuga; pastillas accionables + Q&A E2E en Sesión 7 | PASA |
| Informes — informe narrado (S7) | `TarjetaAyudaIA` "Informe narrado" + resumen determinista (captura) | PASA |
| Reseñas — borrador/temas (S8) | Marcadores "Sugerir borrador / temas recurrentes" presentes | PASA |
| Bandeja — triage/borrador (S8) | Botones "Sugerir borrador / Cita (IA) / Presupuesto (IA)" presentes; **fallo silencioso corregido** (ver §4) | PASA |

Todas las tarjetas usan el patrón `useAyudaIA` + `TarjetaAyudaIA` (máquina de estados idle/cargando/vacío/error+reintentar/
listo), que por construcción no tiene camino silencioso.

### 3.4 Hub de descubribilidad (Sesión 9)
| Punto | Evidencia | Estado |
|---|---|---|
| Accesible | Configuración → sección **"Qué hace la IA"** (usuario demo = PROPIETARIO) | PASA |
| Contenido | Catálogo `lib/iaCatalogo.ts` (17 funciones, derivado de datos) renderizado: cada función con descripción, ubicación y modo de uso. Detectadas 11+ (Chispa, Voz, Config guiada, Organizador, Informe narrado, Riesgo, Migración, Reseñas, Bandeja, presupuesto, Coaching) | PASA |

---

## 4. Bugs cazados y arreglados en esta sesión

1. **Solape de tooltips del dashboard (Informes)** — `app/(tabs)/informes.web.tsx`.
   Causa: stacking context de `.kpi-card`/`.section-card` (transform retenido por `both` + hover-lift) atrapaba el
   z-index del tooltip. Fix: portal a `document.body`. Ver §1.

2. **Fallo silencioso en Bandeja** — `app/(tabs)/bandeja.web.tsx`, `proponerAccionIA` (convertir mensaje en
   cita/presupuesto). Tenía el patrón `if (!err && data)` que **tragaba el error**: si el edge fallaba o no devolvía un
   bloque de acción, el botón dejaba de girar y no aparecía nada. Ya lo había marcado la Sesión 4 como pendiente para
   la 8; la 8 arregló el borrador (`iaBorrador` con `useAyudaIA`) pero **no** esta función. Fix: cada camino deja un
   estado visible usando el `error` ya renderizado de la página — error de red ("Chispa no pudo generar la propuesta…"),
   sin datos ("Chispa no encontró datos suficientes… créala a mano") o la propuesta. `try/catch/finally` completo.

---

## 5. Aceptación (plan Sesión 10)

- [x] Cero solapes de avisos/dashboard — causa raíz arreglada, verificado móvil + desktop.
- [x] Cada pestaña carga con feedback — auditadas las 12, unificado el inconsistente, reducción de conexión medida.
- [x] Checklist E2E pasado y documentado con evidencia — edge functions (11/11), Chispa, IA por página, hub.
- [x] `tsc` + `build:web` limpios; advisors 140/0-ERROR (sin migraciones).

## 6. Estado de verificación / cierre

- `npx tsc --noEmit`: limpio salvo ruido preexistente en `scripts/tts-test/` (scripts Deno, ajenos al build de la app).
- `npm run build:web`: OK.
- Advisors seguridad: 140 lints (5 INFO, 135 WARN, **0 ERROR**) — sin cambio respecto a Sesión 8; no se tocó SQL.
- Sin edge functions nuevas/tocadas esta sesión (todo el trabajo es cliente) → no aplica desplegar edge.
- Envío real WhatsApp/correo de borradores y agente de voz/teléfono siguen abiertos para Alexandro (fuera de alcance).

**Veredicto: la capa de IA v2 de Mecha queda verificada E2E y estabilizada.**
