# Original User Request

## Initial Request — 2026-08-16T18:30:19Z

You are the Project Orchestrator for Mecha OS.

Workspace Root: c:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy
Your Working Directory: c:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy\.agents\orchestrator
Original Request File: c:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy\ORIGINAL_REQUEST.md

Please execute a complete overhaul and bug-fix implementation across all pillars of Mecha OS:
1. R1. Landing Page UI/UX, Touch Unblocking & Conversion Optimization (mecha-sections.css, direct WhatsApp/phone CTAs, access modal).
2. R2. SEO Traditional & Generative Engine Optimization (JSON-LD FAQPage/SoftwareApplication/Product/Org, llms.txt, llms-full.txt).
3. R3. Performance Optimization & React Stutter Elimination in Agenda Calendar (isolate 30s timeline timer to TimelineNowIndicator, memoize cards/columns, debounce search).
4. R4. Staff Panel & Mi Jornada Visual & Functional Modernization (equipo.web.tsx, mi-jornada.web.tsx, RendimientoEquipo.web.tsx, shift clocking Art. 34.9 ET, color formulas access).
5. R5. Marketplace & Public Booking Portal Responsiveness (salones.html, salon.html, app/r/[slug].web.tsx, 360-390px viewports, chemical rest breakdowns, Turnstile).
6. R6. Verification & Zero-Defect Standard (tsc --noEmit clean, Playwright E2E tests: agenda-jornada, config, landing, marketplace, portal-reserva 100% pass).

Follow full orchestration protocols: plan, explore, delegate to workers/reviewers, ensure continuous tracking in progress.md, and report victory upon complete verification.

## 2026-08-30T16:52:01Z

Construir e integrar el mega-sistema de auto-observabilidad, salud profunda y vigilancia autónoma en MECHA (SaaS de peluquerías), compuesto por un Orquestador IA central, una suite de salud de PostgreSQL de 10 monitores, vigilancia visual y funcional separada en 3 pilares (Landing, Portal de Reservas, Software SPA), métricas extremas de rendimiento/código y meta-vigilantes que auditan a los propios vigilantes.

Working directory: c:\Users\carli\OneDrive\Escritorio\Trabajo\novanoidai\Hairy
Integrity mode: development

## Requirements

### R1. Orquestador IA y Cerebro Central de Diagnósticos
Crear un motor de análisis autónomo (`orquestador-ia` / `compilar-estado.mjs`) que consolide los hallazgos de todas las capas (estática, base de datos, navegador, producción y código) y genere diagnósticos estructurados con causa raíz, archivo/línea exactos y prompts ejecutables de auto-reparación para desarrolladores e IAs colaboradoras, persistiendo el estado en `public.vigilancia_diagnosticos_ia` y `.sistema/ESTADO_SALUD.md`.

### R2. Suite de Salud Profunda de Base de Datos PostgreSQL
Extender las funciones `public.vigilancia_bd*()` y automatizaciones cada 6 horas para monitorizar 10 vectores críticos: claves foráneas sin índice, contención de locks/deadlocks (>5s), tuplas muertas e hinchazón de tablas (bloat), desborde de secuencias numéricas, 100% de cobertura RLS en esquema public, saturación del pool de conexiones, estado de crons (`pg_cron`), privacidad de buckets de Storage, continuidad de la cadena criptográfica SHA-256 de VeriFactu y detección de registros huérfanos.

### R3. Vigilancia Visual y Funcional Separada en 3 Pilares
Implementar suites de Playwright y scripts de invariantes segmentados por dominio:
- **Pilar 1 (Landing y Web Pública)**: Enlaces rotos, SEO JSON-LD, claims legales honestos, layout shifts y contraste AA.
- **Pilar 2 (Portal de Reservas y Checkout)**: Flujo de reserva E2E simulado, responsive estricto a 390px (mobile), touch targets (>44px), prevención de doble reserva concurrente y liberación de bloqueos temporales.
- **Pilar 3 (Software de Salón SPA)**: Smoke de 17 pantallas, detección de botones silenciosos (promesas no capturadas), modales apilados, latido de WebSocket Supabase Realtime y fugas de memoria por listeners.

### R4. Métricas Extremas de Rendimiento y Calidad de Código
Incorporar vigilantes de rendimiento y deuda técnica en `npm run vigilar`:
- Rendimiento: presupuestos de carga (<1.8s por pantalla), límite de Long Tasks (máx 2 >50ms), cuota de peticiones N+1 (máx 6 por carga inicial) y latencia p95 de Edge Functions (<350ms).
- Calidad de Código: detección de componentes React monstruo (>450 líneas), funciones con complejidad ciclomática alta (>4 levels de anidamiento) y duplicación de lógica transversal.

### R5. Meta-Vigilancia ("Vigilantes que Vigilan a los Vigilantes")
Implementar guardianes de integridad (`meta-anclas.mjs`, `meta-cobertura.mjs`) que garanticen que ningún vigilante dé falsos verdes: verificación de anclas vivas obligatorias, bloqueo de CI si se crean pantallas o migraciones no registradas en la vigilancia, y fallo automático ante fallos de conexión o ausencia de datos en pruebas.

## Acceptance Criteria

### Diagnóstico y Orquestación IA
- [ ] `npm run vigilar:ia` o `node scripts/vigilantes/compilar-estado.mjs` genera exitosamente el snapshot unificado en JSON y `.sistema/ESTADO_SALUD.md`.
- [ ] La Edge Function de diagnóstico produce sugerencias de código con archivo, línea y prompt de corrección directo.
- [ ] El Panel de Staff (`web/admin.html`) renderiza la tarjeta del Cerebro IA en la pestaña Salud.

### Base de Datos y Postgres
- [ ] `public.vigilancia_bd()` y la nueva suite profunda ejecutan las 10 comprobaciones sin romper y reportan hallazgos categorizados (`bloqueante` / `aviso`).
- [ ] Ninguna tabla pública queda exenta de RLS ni existen funciones `definer` expuestas indebidamente.
- [ ] El workflow `vigilancia-bd.yml` ejecuta la suite completa y reporta sin exponer claves de Supabase.

### 3 Pilares UI y Visual
- [ ] Las 3 suites de Playwright (`landing`, `portal`, `app`) corren de forma independiente.
- [ ] El test E2E de reserva en `/r/demo` completa un ciclo de selección, confirmación y validación en agenda.
- [ ] Se detecta y bloquea cualquier desbordamiento horizontal en viewport de 390px.

### Rendimiento y Meta-Vigilancia
- [ ] `npm run vigilar` incluye las comprobaciones de meta-anclas, peso de componentes y complejidad sin ralentizar el ciclo local.
- [ ] Si se introduce un fallo simulado (ej. ancla borrada o botón con promesa huérfana), la suite falla en rojo de forma determinista.
- [ ] Todos los tests de los propios vigilantes (`npm run vigilar:test`) pasan al 100% en verde.
