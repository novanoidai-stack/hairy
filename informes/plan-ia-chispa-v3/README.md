# Plan IA Chispa V3 — RAÍZ (leer esto primero, y solo esto + tu sesión)

> Fecha de arranque: 2026-07-09 · Autoría: Carlos + Claude (Opus 4.8).
> Origen: visión V3 de Jose/Carlos tras el V2 (`informes/PLAN-IA-CHISPA-V2-REDISENO.md`).
> Este plan es un **ÁRBOL**. Este archivo es el **padre** (contexto común). Cada sesión vive en
> `fase-*/S##-*.md` y es **autosuficiente**.

---

## 0. MANUAL DE USO DE ESTE PLAN (para el ejecutor de una sesión)

**Objetivo del formato árbol:** que un ejecutor con **poca ventana de contexto** no tenga que leer
todo. Máximo resultado con mínimo contexto.

**Qué leer (y nada más):**
1. **Este README** (contexto general + constraints globales + protocolo de cierre).
2. **Solo el archivo de TU sesión** (`fase-*/S##-*.md`).
3. Si tocas UI: carga las skills `hairy-design-system` y `hairy-ui-craft` (agenda → además
   `hairy-agenda-rules`; datos/dominio → `hairy-domain-data`). No leas las otras sesiones.
4. **NO leas `informes/MEGA_INFORME_MECHA.md` entero.** Esta RAÍZ ya destila el contexto de la capa
   IA que necesitas (aunque `CLAUDE.md` lo declare "fuente de verdad del producto", para estas
   sesiones la RAÍZ lo sustituye). Si te falta un dato puntual del producto, usa `grep`; leerlo
   completo malgasta contexto y va contra el diseño en árbol. Solo se **toca** al cerrar (append de
   UNA línea marcando la sesión); la reconciliación global del MEGA_INFORME se hace en **S27**.

**Cómo trabajar (regla de oro):**
- **Prima el RESULTADO DESEADO y la LIMPIEZA sobre la astucia.** Ante la duda, elige lo simple,
  verificable y coherente con lo que ya existe. Un método distinto al sugerido es válido **si el
  resultado cumple los criterios de aceptación** de tu sesión.
- **Eleva, no reconstruyas.** Casi todo tiene base. Cada sesión lista "YA EXISTE (no reconstruir)".
- **Anti-alucinación (obligatorio):** verifica en el repo (`grep`/`git log`) y en la BD (MCP
  Supabase) **antes** de asumir. Si algo no existe, **NO lo inventes**: docúmentalo y ajusta el
  alcance. Nunca claims/cifras/reseñas inventadas.
- **Coherencia entre ejecutores:** los contratos (tipos de bloques, RPCs, tokens de diseño,
  protocolo de cierre) son la interfaz común. No rompas un contrato existente; si necesitas
  cambiarlo, actualízalo en `S01` (arquitectura) y en este README.

**Cómo se navega:** ve al §5 (mapa) y abre solo tu `S##`.

---

## 1. CONTEXTO GENERAL (qué es Chispa y estado hoy)

**Mecha** (repo "Hairy"): SaaS multi-tenant para peluquerías/barberías. **Chispa** es su capa de IA.
Hoy el producto real es la **web** (Expo + react-native-web; cada pantalla `.web.tsx`). Supabase
proyecto `vtrggiogjrhqtwbhbgia`, multi-tenant por `negocio_id` (text). Dominio canónico
`https://www.mechaa.es`. Producción despliega desde `master`.

**Estado de la capa IA (inventario de arquitectura, punto de partida — verifícalo, no lo asumas):**
- **Panel/chat:** `components/chispa/ChispaPanel.web.tsx` (drawer) + `BloqueRenderer.web.tsx` +
  protocolo de bloques `lib/chispaBloques.ts` (tipos `texto|enlace|accion|grafica|comparativa|
  formulario|opciones|progreso`). Montado global en `app/_layout.tsx` vía `ChispaLauncher.web.tsx`.
- **Cerebro (LLM):** edge `supabase/functions/agenda-asistente/` (tools + `construirPropuesta` +
  `pedirInfo`). "IA propone, profesional confirma" (PR-12).
- **Ejecutor determinista:** `lib/chispaOps.ts`, `lib/agendaOps.ts`, `lib/organizarAgenda.ts`,
  `lib/retrasos.ts`, `lib/upsellCandidato.ts`.
- **IA por página:** patrón `lib/hooks/useAyudaIA.ts` + `components/chispa/TarjetaAyudaIA.web.tsx`
  (estados idle/cargando/vacío/error+reintento/listo). Doc: `informes/PATRON-IA-POR-PAGINA.md`.
- **Voz (NO es "TTS simple"):** edge `chispa-tts` con cadena **Kokoro-FastAPI autoalojado en el VPS
  (primario)** → **ElevenLabs (respaldo)** → **speechSynthesis del navegador (último recurso, con
  aviso honesto)**. STT: `chispa-stt` + Web Speech. Hook `lib/hooks/useChispaVoz.web.ts`. Evaluación
  de 17 motores open-source (Coqui XTTS v2, fish-speech, Piper, MeloTTS, OpenVoice…) en
  `scripts/tts-test/`, varios con clonación de voz.
- **Descubribilidad:** catálogo estático `lib/iaCatalogo.ts` + `components/config/HubIA.tsx`.
  (Hoy documenta "qué/cómo"; NO registra ejecuciones ni resultados.)
- **Config guiada:** "configúrame el salón" dentro de Chispa (`lib/onboardingAgent.ts`).
- **Memoria hoy:** solo hilo de sesión en `localStorage` (no hay memoria durable en BD, ni por ficha,
  ni recuerdo temporal).
- **Proactividad hoy:** solo briefing de agenda (`lib/briefing.ts`); no hay escaneo 24/7 del negocio.

**Historia:** V1 = 15 sesiones (`informes/PLAN-IA-CHISPA.md`). V2 = 10 sesiones de rediseño
(`informes/PLAN-IA-CHISPA-V2-REDISENO.md`, HECHAS). **Este V3 eleva sobre eso.**

---

## 2. VISIÓN V3

Chispa deja de ser "un chat con superficies" y pasa a ser un **empleado digital del salón**:
- **Con memoria:** conoce el negocio y **cada ficha**; recuerda conversaciones y "qué pasó hace 4 meses".
- **Autónomo 24/7:** vigila retrasos, citas sin confirmar, fallos de config, presupuestos…, y **avisa**
  (lo urgente por WhatsApp/correo — el envío real lo hace Alexandro).
- **Que guía en contexto:** te sigue por la página y te enseña; no te suelta.
- **Premium y clara:** experiencia "gran tecnológica" donde **siempre sabes qué puedes hacer**.
- **Capaz:** resuelve casi cualquier petición y puede llegar a **sustituir al propietario/admin** en
  sus tareas de gestión — siempre **propone → confirma**.

---

## 3. CONSTRAINTS GLOBALES (NO NEGOCIABLES — aplican a las 27 sesiones)

1. **Reparto Carlos/Alexandro:** si una tarea **envía mensajes reales, mueve dinero, usa IA de
   terceros u OAuth de terceros → es de Alexandro.** El resto → Carlos. En sesiones mixtas: Carlos
   construye detección/cola/UI y **deja el envío/pago como stub claro** para Alexandro.
2. **Casi nunca texto plano:** toda respuesta de Chispa debe salir en la **mejor superficie** —
   acción de un clic, formulario, opciones, gráfica, tabla, enlace, navegación guiada, animación. El
   **texto llano solo como último recurso**. "Mil recursos antes que un párrafo seco."
3. **Determinista primero, LLM donde aporta:** cálculos y flujos de orden fijo los orquesta el
   cliente; el LLM interpreta/redacta/sugiere. El LLM **nunca** decide el orden ni ejecuta escrituras.
4. **Prohibido el fallo silencioso:** toda superficie IA tiene estados **visibles** de cargando /
   vacío / error (con reintento). Nada de "se queda pensando y no pasa nada".
5. **Actúa con mínima info:** si faltan datos, se piden con **un** formulario/opciones (pre-rellenado
   con lo inferible), no por texto ni de uno en uno. Si el usuario ya dio bastante, actúa directo.
6. **Rol + multi-tenant + RLS:** el edge deriva `negocio_id` + rol del JWT. Todo SELECT
   `.eq('negocio_id', …)`; todo INSERT lo incluye. **Toda tabla nueva con RLS por `negocio_id` + rol.**
   Nunca `USING(true)` de escritura, nunca `exec_sql`. RPC pública nueva necesita `grant execute … to
   anon` explícito; RPC interna sensible chequea rol dentro.
7. **Salud fuera del LLM:** datos de salud/alergias/medicación **NUNCA** al LLM (art. 9 RGPD). Flag
   `consiente_ia`. Memoria y Q&A de ficha por **lista blanca**.
8. **Memoria con retención y privacidad:** memoria durable por `negocio_id` (+ usuario/ficha según
   caso), con RLS, retención definida y borrable (RGPD). En **demo** (`demo_salon_001`, tenant
   compartido) **no** se persiste memoria cross-visitante.
9. **Transparencia y sin claims falsos:** Chispa se identifica siempre como IA; nada de
   precios/reseñas/cifras inventadas.
10. **Manuales + specs SIEMPRE al día:** una función IA nueva/cambiada **no está HECHA** si no está
    reflejada en `lib/manuals/` + `lib/iaCatalogo.ts` **y** en la landing `web/especificaciones.html`.
11. **Estilo:** código en inglés, comentarios en español, **sin emojis en UI/código**. **Móvil
    primero** (`useResponsive`, isMobile <768). **Sin `any`.** Tokens fuego (`#f4501e`/`#c0260a`,
    cremas `#f6f1ea`/`#fffdfb`), `lib/designTokens.ts`.
12. **"HECHA" = desplegado + verificado E2E** (no solo build limpio). Ver §4.

---

## 4. PROTOCOLO DE CIERRE DE CADA SESIÓN (obligatorio)

1. `npx tsc --noEmit` limpio + `npm run build:web` OK (sin `any`).
2. Edge functions nuevas/tocadas: **desplegar por CLI** (`npx supabase functions deploy <fn>
   --project-ref vtrggiogjrhqtwbhbgia`) y **probar el endpoint real** (401 sin auth = desplegada;
   404 = no) + una llamada autenticada real con la demo (`demo.publico@mecha.app` /
   `MechaDemoView_2026`).
3. Migración: aplicarla en remoto + **pasar advisors (security)** en verde.
4. **Verificación E2E en la demo** (`/demo.html?share=1`, iframe `?demo=1`) del flujo real.
5. **Actualizar manuales** (`lib/manuals/` + `lib/iaCatalogo.ts`) **y specs landing**
   (`web/especificaciones.html`) con lo nuevo/cambiado.
6. Commit `feat:`/`fix:` + push a `master`.
7. **Marcar la sesión HECHA** en su `S##-*.md` (commit + qué se verificó). En el MEGA_INFORME, como
   mucho un **append de una línea** (no lo reescribas ni lo leas entero: la reconciliación global es S27).
8. Envíos reales (WhatsApp/correo) y pagos quedan **siempre abiertos para Alexandro**.

**Definición de HECHA (checklist mínima, cópiala al cerrar):**
`[ ] tsc  [ ] build  [ ] edge desplegada+probada (si aplica)  [ ] migración+advisors (si aplica)
[ ] E2E demo  [ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push master  [ ] S## marcada`

---

## 5. MAPA DE FASES Y SESIONES (abre solo la tuya)

### Fase 0 · Fundación cognitiva/arquitectónica
- [S01 · Arquitectura + auto-conocimiento de la capa IA](fase-0-fundacion/S01-arquitectura-autoconocimiento.md)
- [S02 · Marco de razonamiento universal (+ casi-nunca-texto-plano)](fase-0-fundacion/S02-razonamiento-universal.md)

### Fase A · Experiencia y diseño
- [x] [S03 · Rediseño panel + chat](fase-a-experiencia/S03-rediseno-panel-chat.md)
- [x] [S04 · Solo UI/diseño de la capa IA](fase-a-experiencia/S04-ui-diseno-capa-ia.md)
- [x] [S05 · Deshacer / revertir acciones](fase-a-experiencia/S05-deshacer-acciones.md)
- [x] [S06 · Voz neural + voces seleccionables + micro + ortografía](fase-a-experiencia/S06-voz-neural.md)

### Fase B · Superficies IA por página
- [x] [S07 · IA por página universal + Config (optimiza/ahorra tiempo)](fase-b-superficies/S07-ia-por-pagina-universal.md)

### Fase C · Cerebro con memoria
- [x] [S08 · Registro universal ("todo queda registrado")](fase-c-cerebro/S08-registro-universal.md)
- [x] [S09 · Memoria corto/largo plazo (estructura + retención)](fase-c-cerebro/S09-memoria-corto-largo.md)
- [x] [S10 · Memoria por ficha](fase-c-cerebro/S10-memoria-por-ficha.md)
- [x] [S11 · Recuerdo y búsqueda temporal ("¿hace 4 meses?")](fase-c-cerebro/S11-recuerdo-busqueda-temporal.md)
- [x] [S12 · Chispa consciente del ecosistema IA](fase-c-cerebro/S12-chispa-consciente-ecosistema.md) (E2E LLM bloqueada por 402 OpenRouter — créditos, Alexandro)

### Fase D · Proactividad, iniciativa y guía
- [x] [S13 · Motor de escaneo 24/7](fase-d-proactiva/S13-escaneo-24-7.md)
- [x] [S14 · Avisos de Chispa + urgentes (envío = Alexandro)](fase-d-proactiva/S14-avisos-urgentes.md)
- [x] [S15 · Iniciativa / próxima mejor acción](fase-d-proactiva/S15-iniciativa-proxima-accion.md)
- [x] [S16 · Coach intra-página que te sigue](fase-d-proactiva/S16-coach-intrapagina.md)
- [x] [S17 · Tours y redirecciones guiadas](fase-d-proactiva/S17-tours-redirecciones.md)

### Fase E · Completar el salón
- [S18 · Salón al 100% (arreglar "seguir onboarding")](fase-e-completar/S18-salon-100.md)

### Fase F · Capacidades / frontera
- [S19 · "Resuelve cualquier cosa" + dataviz ampliada](fase-f-capacidades/S19-resuelve-cualquier-cosa-dataviz.md)
- [S20 · Campañas (envío = Alexandro)](fase-f-capacidades/S20-campanas.md)
- [S21 · Chispa sustituto del propietario/admin](fase-f-capacidades/S21-sustituto-propietario.md)
- [S22 · Tools en vivo (I+D, guardarraíl)](fase-f-capacidades/S22-tools-en-vivo.md)

### Fase G · Experiencia, QA y cierre
- [S23 · Pulido de experiencia (cómo se siente en cada paso)](fase-g-cierre/S23-pulido-experiencia.md)
- [S24 · Testeo de UI (botones, fallos, bugs)](fase-g-cierre/S24-testeo-ui.md)
- [S25 · Testeo masivo (millones de casos)](fase-g-cierre/S25-testeo-masivo.md)
- [S26 · Seguridad y políticas de la capa IA](fase-g-cierre/S26-seguridad-politicas.md)
- [S27 · Coherencia con objetivos + solución final](fase-g-cierre/S27-coherencia-solucion-final.md)

**Orden y dependencias:** Fase 0 primero (S01→S02). Luego A en cadena. B (S07) tras S04. C
(S08→S09→S10/S11→S12). D tras C. E tras A. F tras C. G al final (S23 pule lo construido; S26
endurece; S27 cierra). Cuidado con conflictos git multi-sesión (stash/pull/pop rutinario).

---

## 6. PLANTILLA DE CADA ARCHIVO DE SESIÓN

Cada `S##-*.md` tiene esta forma fija (así el ejecutor sabe siempre qué esperar):
`Cabecera (fase/dueño/esfuerzo/depende)` · `Lee antes` · `Objetivo (resultado deseado)` ·
`Ya existe (no reconstruir)` · `Construir (pasos)` · `Reglas duras que te aplican` ·
`Criterios de aceptación (verificables)` · `Definición de HECHA` · `Estado` (se marca al cerrar).
