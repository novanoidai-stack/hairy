# Plan maestro V2 — Rediseño de la capa de IA "Chispa" de Mecha

> Fecha: 2026-07-07 · Sesión: Carlos + Claude (Opus 4.8)
> Origen: feedback de Jose tras probar la capa de IA v1 (las 15 sesiones de `informes/PLAN-IA-CHISPA.md`).
> Veredicto de Jose: "no la veo reflejada en el software, no es de la calidad/magnitud acordada,
> no nos diferencia del mercado". Este documento reordena y ELEVA la capa de IA, no la empieza de cero:
> reutiliza lo que ya funciona y repara/rehace lo que falla.
> Fuentes hermanas: `informes/PLAN-IA-CHISPA.md` (v1, estado por sesión), `informes/DIFERENCIADORES-IA-MECHA.md`,
> `informes/MEGA_INFORME_MECHA.md`. Skills: `hairy-design-system`, `hairy-agenda-rules`, `hairy-domain-data`, `hairy-ui-craft`.

---

## 0. Diagnóstico que motiva este plan (verificado en código el 7 jul)

La raíz de todos los síntomas: **la "capa de IA" es UN chatbot (`agenda-asistente`) y todo lo demás
está atornillado encima disparándole prompts de texto libre.** De ahí:

- **Chatbot seco, no actúa, pide demasiado:** solo sabe conversar (texto entra, texto/tarjeta simple sale).
  No hay bloques de entrada (formularios/botones/selectores) para recoger datos sin escribir. No hay
  pantalla completa, ni memoria de sesión, ni adaptación visible al rol.
- **"IA por página" que no se ve / no ayuda:** Mi Jornada, Caja, Reseñas, Bandeja **no tienen IA propia**:
  mandan un prompt al chatbot y pintan lo que vuelva. Si falla, **se quedan en blanco sin avisar**
  (p.ej. "Analizar mi día": el handler traga el error → `if (!err && data)`). Fallos silenciosos por doquier.
- **No hay botón organizador de agenda:** `optimizar_agenda` existe SOLO como herramienta del chatbot,
  no como botón dedicado en la Agenda. Solo aparece si se lo pides hablando.
- **Voz robótica:** sí llama a ElevenLabs (`chispa-tts`, verificado 200 con audio real), pero **degrada
  en silencio** a la voz del navegador cuando ElevenLabs falla (créditos/cuota). Sin ningún indicador.
- **"Configúrame el salón" → te dice que lo hagas tú:** existe un motor de onboarding que SÍ escribe
  config (`lib/onboardingAgent.ts`), pero vive en un overlay aparte y **está desconectado de Chispa**;
  además es casi todo texto libre.
- **Sin descubribilidad:** hay sistema de manuales (`lib/manuals/`) pero **nada cataloga la IA**. Ni el
  propio autor sabe qué funciones hay.
- **Redundancia:** el import CSV (`components/config/TabImportarCitas.tsx`) duplica la Migración Mágica.
- **Bugs visuales sin testear:** avisos/dashboard se solapan (sobre todo en Informes); micro pide activar
  permiso "a mano" en vez de un flujo claro; pestañas lentas de cargar.
- **Lección de hoy ("HECHA" ≠ desplegado):** 7 edge functions de S11-13 estaban commiteadas pero sin
  desplegar (404) y con bugs (escaping, modelos OpenRouter muertos). Reparadas y desplegadas hoy
  (commit `e602c1f6a`). Ver [[edge-functions-ia-s11-13-deploy-gap]].

## 1. La visión (reencuadre)

La IA de Mecha **no es "un chatbot que lo hace todo"**. Es una **capa de inteligencia ambiental**:
proactiva, por superficie, mayormente **botones/visual**, con el chatbot como **una entrada opcional
más** — nunca obligatoria. "IA propone, profesional dispone" (PR-12), pero las propuestas deben ser de
**un clic**, contextuales y aparecer **donde ya estás trabajando**. La IA tiene que hacer la vida MÁS
FÁCIL que hacerlo a mano; si tarda más que a mano, sobra.

## 2. Global Constraints (aplican a TODAS las sesiones)

- **Complementaria, no obligatoria:** todo lo que haga la IA debe poder hacerse también por botones/UI normal.
- **Determinista primero, LLM donde aporta:** cálculos y flujos con orden fijo los orquesta el cliente;
  el LLM interpreta/redacta/sugiere. Nunca el LLM decide el orden ni ejecuta escrituras.
- **PROHIBIDOS los fallos silenciosos:** toda superficie de IA tiene estados VISIBLES de cargando / vacío /
  error (con reintento). Nada de "se queda pensando y no pasa nada".
- **Actúa con mínima info:** si faltan datos, se piden con UN formulario/opciones (no preguntando por texto,
  ni de uno en uno). Rellenar/pulsar > escribir.
- **Rol y multi-tenant:** el edge deriva `negocio_id` + rol del JWT; tools y sugerencias por `can()`.
  Todo SELECT `.eq('negocio_id', ...)`; todo INSERT lo incluye. Profesional ve lo suyo; gestor todo.
- **Regla dura de salud:** datos de salud/alergias/medicación NUNCA al LLM (art. 9 RGPD). Flag `consiente_ia`.
- **Transparencia:** Chispa se identifica SIEMPRE como IA. **Sin claims falsos** (nada de precios/reseñas inventados).
- **Verificar antes de construir:** grep + git log. Mucho YA existe; este plan repara/eleva, no duplica.
- **"HECHA" = desplegado + verificado E2E**, no solo build limpio. Protocolo de cierre obligatorio (abajo).
- **Código en inglés, comentarios en español, sin emojis en UI/código. Móvil primero (`useResponsive`). Sin `any`.**
  Tokens fuego (`#f4501e`/`#c0260a`, cremas `#f6f1ea`/`#fffdfb`), `lib/designTokens.ts`.

### Protocolo de cierre de CADA sesión (obligatorio)
1. `npx tsc --noEmit` limpio + `npm run build:web` OK (sin `any`).
2. Si hay edge functions nuevas/tocadas: **desplegar por CLI** (`npx supabase functions deploy <fn>
   --project-ref vtrggiogjrhqtwbhbgia`) y **probar el endpoint real** (401 desplegada / 404 no) + una
   llamada autenticada con la cuenta demo (`demo.publico@mecha.app` / `MechaDemoView_2026`).
3. Si hay migración: aplicarla en remoto + pasar advisors (security).
4. **Verificación E2E en la demo** (`/demo.html?share=1`, iframe `?demo=1`) del flujo real, no solo que compila.
5. Commit `feat:`/`fix:` + push a `master` (producción despliega de ahí).
6. Actualizar este plan (marcar la sesión HECHA con su commit + qué se verificó) y el MEGA_INFORME.
7. WhatsApp/n8n real y envíos reales quedan siempre abiertos para Alexandro.

## 3. Prerrequisitos externos (usuario / Alexandro — desbloquean sesiones)
- **Créditos ElevenLabs** al día (si no, la voz cae a la del navegador). Necesario para que la voz "premium" se oiga (S1).
- **`LIGHTX_API_KEY` válida** en Supabase secrets (la actual la rechaza LightX) para el try-on de color (fuera de este plan, ya desplegado).
- **DPO/abogado:** visto bueno del consentimiento IA antes de clientes reales.

---

## 4. Mapa de sesiones (orden + dependencias)

| # | Fase | Sesión | Modelo | Esfuerzo | Depende |
|---|------|--------|--------|----------|---------|
| 1 | A Fundación | Bloques interactivos + panel (fullscreen, micro, voz honesta) — **HECHA 8 jul** | Opus 4.8 | alto | — |
| 2 | A Fundación | Chispa hospeda "Configúrame el salón" + rol + memoria opcional — **HECHA 8 jul** | Opus 4.8 | alto | 1 |
| 3 | A Fundación | Config guiada completa + "actúa con mínima info" en el chatbot — **HECHA 8 jul** (e84311dd9; verificada + fix rol 3f1b27f11) | Opus 4.8 | medio-alto | 1,2 |
| 4 | B Por página | Motor "IA por página" sin fallos silenciosos (+ arreglar Mi Jornada) — **HECHA 8 jul** | Opus 4.8 | medio | 1 |
| 5 | B Por página | Agenda: botón "Organizar mi agenda" real — **HECHA 8-9 jul** | Opus 4.8 | alto | 1,4 |
| 6 | B Por página | Caja + Presupuestos proactivos — **HECHA 9 jul** | Sonnet 5 | medio | 4 |
| 7 | B Por página | Clientes + Informes + Mi Jornada proactivos — **HECHA 9 jul** | Sonnet 5 | medio | 4 |
| 8 | B Por página | Reseñas + Bandeja proactivas — **HECHA 9 jul** (547dd08aa; estaba sin commitear, verificada y cerrada 9 jul) | Sonnet 5 | medio | 4 |
| 9 | D Descubrir | Hub "Qué hace la IA" + manuales IA + quitar import CSV | Sonnet 5 | medio | — |
| 10 | E QA | Bugs + QA visual + verificación E2E de toda la capa IA — **HECHA 9 jul** | Opus 4.8 | medio-alto | 1-9 |

Orden recomendado: 1→2→3 en cadena (fundación). Desde la 4 se puede paralelizar B (4 antes que 5-8).
La 9 es independiente (se puede colar cuando convenga). La 10 cierra. Cuidado con conflictos git multi-sesión
(stash/pull/pop rutinario, ver [[multi-sesion-reconciliacion-git]]).

---

# PROMPTS POR SESIÓN (copy-paste)

> Uso: abre una sesión nueva de Claude Code en el repo Hairy con el MODELO indicado y pega el prompt.
> El CLAUDE.md y la memoria se cargan solos. Cada sesión: brainstorming breve si hay dudas de diseño,
> luego implementar, luego el Protocolo de cierre. NO hacer todo en una sola sesión.

## Prompt Sesión 1 — Bloques interactivos + panel de Chispa (Opus 4.8, alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 1.
Carga las skills hairy-design-system, hairy-ui-craft y hairy-agenda-rules antes de tocar UI.

OBJETIVO: construir la FUNDACIÓN del agente: bloques de entrada interactivos + arreglar el panel.
Esto es la base de todo el plan; hazlo sólido y reutilizable.

YA EXISTE (verifica con grep/git log; NO reconstruir):
- Protocolo de bloques: lib/chispaBloques.ts (tipos texto|enlace|accion|grafica|comparativa, unión extensible).
- Renderer: components/chispa/BloqueRenderer.web.tsx.
- Panel: components/chispa/ChispaPanel.web.tsx (drawer lateral) + ChispaLauncher (montado global en app/_layout.tsx).
- Voz: lib/hooks/useChispaVoz.web.ts (ElevenLabs chispa-tts con fallback a speechSynthesis; micro Web Speech + fallback chispa-stt).

CONSTRUYE:
1) Bloques de entrada nuevos en lib/chispaBloques.ts (unión + espejo en el edge agenda-asistente):
   - 'formulario': { tipo:'formulario', id, titulo, campos: Campo[], enviarLabel }
     Campo = { key, label, tipo:'texto'|'numero'|'euro'|'tel'|'hora'|'select', opciones?, valor?, requerido? }
   - 'opciones': { tipo:'opciones', id, titulo?, opciones:{valor,label,descripcion?}[], multiple? }
   - 'progreso': { tipo:'progreso', paso, total, etiqueta? }  (indicador para flujos guiados)
2) Renderer de esos bloques en BloqueRenderer.web.tsx con los átomos de formulario/tokens existentes
   (reutiliza SettingsAtoms/FieldRow si encajan). Cada bloque interactivo tiene estado local y, al enviar/elegir,
   llama a un callback onRespuestaInteractiva(blockId, payload) que el ChispaPanel convierte en el siguiente turno.
   Móvil primero, accesible (labels, foco), sin emojis.
3) PANTALLA COMPLETA del panel: botón para expandir el drawer a fullscreen (y volver). Persistir preferencia por
   navegador. Que en fullscreen los bloques (formularios, gráficas) tengan aire y no se aplasten en móvil.
4) VOZ HONESTA: cuando la salida caiga de ElevenLabs a la voz del navegador (r.status!=200 o 501), mostrar un
   indicador discreto y persistente en la cabecera del panel ("voz básica del navegador — ElevenLabs no disponible")
   y no fingir que es premium. Mantener el A/B (?vozab=1). No romper el contrato de bloques.
5) MICRO UX: al pulsar el micro por primera vez, provocar el prompt nativo de permiso del navegador (getUserMedia)
   ANTES de intentar Web Speech, y si está denegado, mensaje claro con el paso exacto. Nada de "actívalo a mano"
   sin guía. Reutiliza los mensajes ya buenos de useChispaVoz; mejora el primer contacto.

ACEPTACIÓN: un mensaje de prueba puede devolver un 'formulario' y un 'opciones' que se rellenan/pulsan y
mandan el payload de vuelta; el panel abre a pantalla completa sin romper móvil; el indicador de voz básica
aparece cuando ElevenLabs falla; el micro pide permiso nativo. tsc + build limpios.

Cierra con el Protocolo de cierre (incluye desplegar y probar el edge agenda-asistente si tocas su contrato).
```

**Verificado 8 jul:** tipos `formulario`/`opciones`/`progreso` en `lib/chispaBloques.ts` (espejados en el
edge, tipo-solo, sin cambio de comportamiento) + renderer en `BloqueRenderer.web.tsx` (átomos reutilizados
de `SettingsAtoms`, campos `texto/numero/euro/tel/hora/select`) + wiring en `ChispaPanel.web.tsx`
(`respuestasInteractivas` + `onRespuestaInteractiva` → siguiente turno real). Arnés de pruebas dev-only
`?chispatest=1` + mensaje `/testbloques` (mismo patrón que `?vozab=1`) para poder probar el contrato sin
esperar a las Sesiones 2-3 que ya lo usarán de verdad. E2E en la demo (`/demo.html?share=1`, iframe
`?demo=1&chispatest=1`): formulario relleno → enviado → turno real al edge → la IA respondió pidiendo el
campo que faltaba (confirma ida y vuelta real, no solo mock); opción única enviada al instante. Pantalla
completa: botón en cabecera (oculto en móvil, que ya es fullscreen), columna centrada de 760px persistida en
`localStorage` (sobrevivió a un reload de la demo). Voz honesta: badge oculto con ElevenLabs sano (200 real
en la demo), aparece correctamente al forzar un fallo de `chispa-tts` (fetch interceptado a 500). Micro:
`getUserMedia` deniega en el entorno de preview → mensaje claro con los pasos exactos, antes de tocar Web
Speech. `npx tsc --noEmit` y `npm run build:web` limpios. Edge `agenda-asistente` redesplegado (curl → 401
sin auth) y ejercitado con llamadas autenticadas reales de la demo (200).

## Prompt Sesión 2 — Chispa hospeda "Configúrame el salón" + rol + memoria (Opus 4.8, alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 2.
Depende de la SESIÓN 1 (bloques interactivos ya existen). Carga hairy-design-system, hairy-domain-data, hairy-ui-craft.

OBJETIVO: el flujo estrella. Que pedir a Chispa "configúrame el salón" (o un botón "Poner en marcha")
lance un asistente guiado, VISUAL, que ESCRIBE la configuración — dentro de Chispa, no en un overlay aparte.

YA EXISTE (NO reconstruir; reutiliza sus escrituras):
- Motor de onboarding que SÍ escribe config: lib/onboardingAgent.ts (temas datos_negocio, servicios, equipo,
  horario_salon, reserva_online, fotos_servicios, notificaciones; ejecutores reales RLS-safe; presets de horario;
  fallbacks deterministas) + edge onboarding-agent + components/onboarding/OnboardingAgentOverlay.web.tsx.
- Bloques 'formulario'/'opciones'/'progreso' (Sesión 1). RPC set_negocio_config_key (merge atómico por clave).

CONSTRUYE:
1) Modo "config guiada" dentro de ChispaPanel: al detectar la intención (texto/voz "configúrame/ponme en marcha")
   o desde un botón "Poner en marcha tu salón" (enlazar el que ya existe en Avisos si aplica), Chispa recorre la
   secuencia FIJA de temas del onboarding, pintando CADA tema como 'formulario'/'opciones' (no campo de texto),
   con 'progreso' (paso X de Y). El LLM (onboarding-agent) solo PRE-RELLENA el formulario desde el contexto;
   el usuario edita y confirma; el ejecutor de onboardingAgent.ts escribe. Fallback determinista intacto.
2) Unificación: reutiliza los ejecutores de onboardingAgent.ts (no dupliques escrituras). Decide si el overlay
   OnboardingAgentOverlay se retira o queda como lanzador que abre este modo en Chispa (evita dos caminos divergentes).
3) ROL: el flujo y las tools se adaptan al rol (owner ve todo; recepción/profesional, subconjunto). El edge ya
   deriva rol del JWT (permisos.ts / can()); asegúralo también en la UI del flujo. Un profesional no configura el negocio.
4) MEMORIA DE SESIÓN (opcional, no bloqueante): persistir el hilo de Chispa (mensajes/bloques) por usuario+negocio
   para que un reload no lo pierda. Tabla ligera o storage; respeta multi-tenant y demo (en demo, no persistir cross-visitante).

ACEPTACIÓN: "configúrame el salón" abre el flujo guiado visual dentro de Chispa; rellenas datos del negocio /
servicios / horario con formularios y opciones; al terminar la config está REALMENTE escrita (verificar en BD real);
un profesional no ve el flujo de configuración del negocio; recargar no borra el hilo. En demo, escrituras simuladas
(guardrail) o revertibles. tsc + build limpios; edge desplegado y probado.

Cierra con el Protocolo de cierre (verificación E2E del flujo escribiendo config real en un tenant de prueba).
```

**Verificado 8 jul:** modo "config guiada" vive DENTRO de `ChispaPanel.web.tsx`
(sin overlay aparte): deteccion determinista de intencion (`detectaIntencionConfigGuiada`, sin LLM) sobre el
mensaje de texto/voz + boton "Que te ayude Chispa" nuevo en `OnboardingCard.web.tsx` (evento
`CHISPA_CONFIG_GUIADA_EVENT` en `lib/chispaBloques.ts`) + auto-disparo una vez por navegador (mismo criterio que
el overlay: gestor, negocio real, nucleo pendiente). Recorre `TEMA_ORDEN` de `lib/onboardingAgent.ts` pintando
CADA tema como bloque `formulario`/`opciones` con `progreso` (Sesion 1); reutiliza `pedirPregunta` +
`ejecutarAccion` de onboardingAgent.ts SIN duplicar escrituras (datos_negocio, servicios y equipo con formulario
+ bucle "¿anades otro?"; horario_salon con los 2 presets deterministas como opciones; reserva_online con
confirmacion de riesgo en dos pasos, igual que el overlay retirado; fotos_servicios con enlace a Configuracion;
notificaciones con si/no). `OnboardingAgentOverlay` (.web.tsx y su stub nativo) RETIRADO por completo (borrado +
quitado de `app/_layout.tsx`): un solo camino. ROL: `esGestorOnboarding` (owner/admin) gatea el auto-disparo, el
detector de intencion y el arranque manual; `ChispaLauncher.web.tsx` ahora monta el panel aunque
`asistenteAgendaActivo` este apagado SI el negocio necesita onboarding (antes el overlay era independiente de
ese toggle; se preserva ese comportamiento) — pestana flotante permanece oculta en ese modo hasta que se abre.
MEMORIA: hilo completo (mensajes + estado de la config guiada) en `localStorage` por negocio+usuario, nunca en
demo. Guardrail demo: `pedirPreguntaConDemoLimite` comparte el contador `DEMO_LIMITE_MSGS` ya existente (evita
abrir una via de coste de LLM nueva en el tenant compartido) y `ejecutarPasoOnboarding` simula el recibo
(`Hecho (demostración): ... En tu cuenta esto se guardaría de verdad.`) sin tocar la fila real.
**E2E real (no demo):** logueado como gestor en el tenant de prueba `testeo4_03801` (negocio limpio, 0 filas en
todas las tablas de onboarding), el auto-disparo abrio Chispa solo; se completaron los 7 temas end-to-end desde
la UI y se verifico por SQL directo en Supabase que CADA paso escribio de verdad: `negocio_config.config`
(nombre/direccion/telefono, pre-rellenado el nombre desde el perfil), `servicios` (1 fila), `profesionales`
(1 fila) + `horarios_profesional` (cascada correcta del horario elegido), `negocio_horarios` (7 dias del preset
"Lunes a viernes 9-20, sabado 9-14"), `negocio_portal` (portal activado tras el paso de confirmacion de riesgo),
`negocio_config.config.notifRecordatorioActiva`. Recarga de pagina a mitad/al final: el hilo completo (incluida
la ultima respuesta) se restauro identico desde `localStorage`. **E2E demo:** mismo flujo en
`/demo.html?share=1` (iframe `?demo=1`) via texto libre "configurame el salon": recibo
"Hecho (demostración): ... En tu cuenta esto se guardaría de verdad."; verificado por SQL que
`negocio_config` de `demo_salon_001` NO cambio. `npx tsc --noEmit` y `npm run build:web` limpios. Sin
migraciones ni edge functions nuevas/tocadas esta sesion (no aplica desplegar).

## Prompt Sesión 3 — Config guiada completa + "actúa con mínima info" (Opus 4.8, medio-alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 3.
Depende de 1 y 2. Carga hairy-design-system, hairy-domain-data.

OBJETIVO: (a) que Chispa configure MÁS que los 7 temas de onboarding — un set curado y extensible de toda la
Configuración; (b) que el chatbot general "actúe con mínima info": cuando falten datos para una acción, los pida
con UN formulario, no preguntando por texto de uno en uno.

YA EXISTE (NO reconstruir): app/(tabs)/configuracion.web.tsx (ConfigState/DEFAULT_CONFIG, muchas secciones:
notificaciones, reserva online, políticas, señales/pagos, fidelización, idioma, festivos/cierres...). RPC
set_negocio_config_key. Ejecutor general lib/chispaOps.ts (acciones crear/editar cita, servicio, horario, config...).
Edge agenda-asistente con tools + construirPropuesta.

CONSTRUYE:
1) Catálogo curado de ajustes configurables por Chispa (los de más valor: recordatorios y sus tiempos, señal/depósito,
   políticas de cancelación, idioma del portal, festivos/cierres, fidelización on/off...). Cada uno como acción
   'cambiar_config' con su 'formulario'/'opciones'; el ejecutor usa set_negocio_config_key (merge atómico). Extensible.
2) "Actúa con mínima info" en el chatbot: cuando una tool necesita N params y faltan, el edge devuelve un bloque
   'formulario' con los campos faltantes PRE-RELLENADOS con lo inferible, en vez de responder texto pidiéndolos.
   Al enviarlo, se completa la AccionPropuesta y se confirma. Aplícalo primero a crear_cita, crear/editar servicio y
   crear_presupuesto (los que más fricción tienen). Objetivo: crear un servicio por Chispa debe ser ≤ que a mano.
3) Regla de oro: si el usuario ya dio suficiente en su frase, NO abrir formulario — actúa directo con tarjeta de
   confirmación. El formulario es solo para lo que falta.

ACEPTACIÓN: "sube el IVA/activa la señal de 10€/pon el portal en inglés" abre un formulario mínimo y lo escribe;
"crea el servicio corte 15€ 30min" actúa directo sin pedir nada; "crea un servicio" abre un formulario con los 3
campos, no un interrogatorio. Verificado E2E. tsc + build limpios; edge desplegado y probado.

Cierra con el Protocolo de cierre.
```

**Verificado 8 jul:** **Investigado antes de construir** (grep + BD real via MCP Supabase) que
IVA, "politicas de cancelacion" (fase 4, `SoonBanner`/`Section soon disabled` con valores
hardcodeados, `configuracion.web.tsx:3179-3197`) y un interruptor GLOBAL de fidelizacion NO
existen en el producto (fidelizacion vive por fila `activo=true` en `recompensas`/`logros`, sin
flag maestro) — se EXCLUYERON del catalogo en vez de fabricar ajustes falsos (regla "sin claims
falsos"). "Senal/deposito" es real pero por SERVICIO (`servicios.prepago_requerido` +
`prepago_cantidad_fija`, `migrations/pagos.sql`), no un importe global; "idioma del portal" vive
en `negocio_portal.idioma` (no en `negocio_config`); "festivos/cierres" vive en `cierres_negocio`
(insercion, no cambio de config). Diseno resultante:
1. **Catalogo curado real:** `CONFIG_EDITABLE` del edge suma `depositoDinamicoActivo` +
   `depositoFactorRiesgo` + `depositoVipExento` (el sistema de deposito dinamico por riesgo ya
   vivia en `negocio_config` pero Chispa no llegaba). `cambiar_config` pasa de {clave,valor}
   plano a `cambios: {clave,valor}[]` (permite 1+ ajustes relacionados en una sola confirmacion,
   p.ej. activar recordatorio + fijar sus horas = accion `cambiar_config_multiple` nueva). Idioma
   del portal y festivos/cierres, al no encajar en `set_negocio_config_key`, se implementaron
   como DOS acciones dedicadas nuevas con el MISMO patron propone->confirma:
   `cambiar_idioma_portal` (`negocio_portal.idioma`, es/en) y `crear_cierre_negocio`
   (`cierres_negocio`, con un tipo de campo NUEVO `'fecha'` espejo de `'hora'`). `editar_servicio`
   suma `prepago_requerido`/`prepago_cantidad_fija` (esto hace REAL el ejemplo "activa la senal de
   10€" del plan, que antes no tenia ningun camino).
2. **"Actua con minima info":** nuevo tipo de retorno `pedirInfo: Bloque` en
   `construirPropuesta`/`construirPropuestaConfig` del edge — si falta o es ambiguo un dato
   requerido, corta el bucle del LLM y devuelve un `'formulario'`/`'opciones'` PRE-RELLENADO en
   vez de dejar que el LLM lo pida en texto. Aplicado a `crear_cita` (servicio/profesional
   resueltos por nombre real o listados como opciones si faltan/son ambiguos; `scope=self` se
   auto-resuelve al propio profesional sin preguntar), la tool NUEVA `crear_servicio` (antes solo
   existia dentro del onboarding, no para el chat general), `editar_servicio` (resolucion de
   servicio por opciones + formulario de edicion PRE-RELLENADO con los valores actuales cuando no
   se indica ningun cambio) y `crear_presupuesto` (un campo de precio por cada linea sin precio,
   no un interrogatorio). Regla de oro verificada en ambos sentidos para cada tool: info completa
   -> tarjeta de confirmacion directa; info incompleta/ambigua -> formulario/opciones con SOLO lo
   que falta.
3. **Ajuste de prompt tras probar en vivo:** el modelo inicialmente prefería preguntar en TEXTO en
   vez de llamar a la tool con un campo vacio/ambiguo (visto en `cambiar_config` sin valor,
   `editar_servicio` con nombre ambiguo "el corte", `crear_presupuesto` con concepto sin precio).
   Se reforzo el system prompt con la regla explicita + 3 ejemplos concretos worked-example; tras
   redesplegar, los 3 casos pasaron a llamar la tool y devolver el formulario/opciones correcto.
**E2E real** contra el edge YA desplegado (curl autenticado como `demo.publico@mecha.app`,
lecturas/propuestas reales, sin escribir nada — el edge nunca ejecuta escrituras): verificadas las
8 combinaciones (falta info -> formulario/opciones vs. info completa -> accion directa) de
`crear_servicio`, `editar_servicio` (incl. senal y ambiguedad "el corte" -> opciones con las 2
candidatas reales), `crear_cita` (bare -> formulario con selects reales del catalogo; 1 campo
faltante -> opciones), `crear_presupuesto`, `cambiar_config` (single/multi-clave), 
`cambiar_idioma_portal` y `anadir_cierre_negocio`. **En navegador real** (iframe de
`/demo.html?share=1`, mismo origen, manipulado por DOM nativo porque los selectores CSS no
atraviesan el iframe): "crea un servicio" mostro el formulario de 3 campos con las etiquetas
correctas; rellenar y enviar completo el turno con el LLM y produjo la tarjeta de confirmacion
(Confirmar/Cancelar) sin errores de consola. Esquema/RLS de `servicios.prepago_*`,
`negocio_portal.idioma` y `cierres_negocio` verificados contra la BD real antes de escribir
codigo (MCP Supabase), no asumidos. `npx tsc --noEmit`, `npm run build:web` y `deno check` del
edge limpios; 22 tests Deno en verde (19 previos + 3 nuevos de permisos para las tools añadidas).
Edge `agenda-asistente` redesplegado 3 veces (funcionalidad + 2 ajustes de prompt) y verificado
(curl sin auth -> 401). Sin migraciones nuevas (todo el esquema ya existia). Nota: los ejemplos
literales de ACEPTACION citaban "sube el IVA" (no existe como ajuste real hoy; se verifico con
otro ajuste real del catalogo, p.ej. deposito/recordatorio) y "activa la senal de 10€" (se hizo
real via `editar_servicio`, no como clave global).

## Prompt Sesión 4 — Motor "IA por página" sin fallos silenciosos (Opus 4.8, medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 4.
Depende de 1. Carga hairy-design-system, hairy-ui-craft.

OBJETIVO: crear el PATRÓN reutilizable de "IA proactiva por página" que NO falle en silencio, y arreglar la
primera víctima (Mi Jornada). Todas las páginas de la Fase B se apoyarán en esto.

YA EXISTE (revisar y mejorar, no duplicar): lib/hooks/useChispaSugerencia.ts (invoca agenda-asistente),
componentes de sugerencia en Reseñas/Bandeja/Mi Jornada/Caja (Sesión 9 v1), BloqueRenderer, chispaOps.ejecutarAccion.
BUG confirmado: app/(tabs)/mi-jornada.web.tsx analizarDiaIA traga el error (if (!err && data)) → se queda en blanco.

CONSTRUYE:
1) Un hook/patrón "AyudaIA por página" con estados EXPLÍCITOS: idle / cargando / vacío / error(+reintento) / listo.
   Nunca queda en blanco: si el edge falla o no devuelve bloques útiles, muestra mensaje + botón reintentar.
   Determinista primero: si el dato se puede calcular sin LLM (resumen del día, cifras), calcularlo y usar el LLM
   solo para la redacción/sugerencia. Un componente de "tarjeta proactiva de página" consistente (misma estética),
   que NO se solape con el dashboard/avisos (coordinar z-index/layout con la Sesión 10).
2) Arreglar Mi Jornada: "Analizar mi día" usa el patrón nuevo; muestra cargando y, pase lo que pase, un resultado
   o un error accionable. Resumen determinista (citas/horas/comisión) + sugerencia LLM opcional encima.
3) Documentar el patrón para las Sesiones 6-8 (dónde va la tarjeta, cómo se gatea por rol, cómo se degrada).

ACEPTACIÓN: "Analizar mi día" nunca se queda colgado (o resultado o error con reintento); el patrón es reutilizable
y consistente; el determinista funciona aunque el LLM falle. tsc + build limpios; verificado en demo.

Cierra con el Protocolo de cierre.
```

**Verificado 8 jul:** patrón nuevo `lib/hooks/useAyudaIA.ts` (estado explícito idle/cargando/vacío/
error+reintentar/listo sobre `invocarChispa`, extraída de `useChispaSugerencia.ts` para no duplicar la
llamada al edge) + `components/chispa/TarjetaAyudaIA.web.tsx` (tarjeta única y consistente, icono SVG sin
emoji — corrige el `✨` que llevaba la tarjeta vieja —, en flujo normal, nunca `position: fixed/absolute`,
para no chocar con `AvisosBell`/dashboard de la Sesión 10). Documentado para las Sesiones 5-8 en
`informes/PATRON-IA-POR-PAGINA.md` (dónde va la tarjeta, cómo se gatea por rol, cómo se degrada, tabla de
"determinista candidato" por página). De paso se encontró y arregló un bug gemelo en
`useChispaSugerencia.ts`: `setBloques` nunca se llamaba (una constante local tapaba el estado del mismo
nombre), así que **Equipo, Inventario y Presupuestos tenían su sugerencia de IA invisible desde que se
escribió** (Sesión 9 v1 del plan v1) — corregido sin tocar el contrato público del hook (los 4 consumidores
existentes siguen igual). Bug gemelo del de Mi Jornada detectado en `bandeja.web.tsx` `proponerAccionIA`
(mismo `if (!err && data)` que traga el error): documentado para que la Sesión 8 lo repare al adoptar el
patrón, no arreglado aquí por estar fuera de alcance. Mi Jornada: resumen determinista (citas/horas/
comisión, respeta `puede_ver_comision` server-side) siempre visible + "Analizar mi día" añade la lectura del
LLM encima vía `useAyudaIA`; prompt ajustado tras probar en vivo (ya no invita a `crear_cita` con datos
incompletos, que producía un `formulario` no rellenable en esta tarjeta — eso es del panel guiado, no de
esta superficie). **E2E real en la demo** (`/demo.html?share=1`, iframe `/app/mi-jornada?demo=1`, DOM nativo
por el iframe): estado cargando→listo con respuestas REALES del LLM en vivo en varias ejecuciones (texto +
bloque `enlace` "Ver clientas para reactivar", y solo `enlace` en otra pasada); error forzado (fetch de
`agenda-asistente` interceptado para rechazar) → mensaje legible + botón "Reintentar", con el resumen
determinista siempre visible; "Reintentar" repitió el mismo fallo de forma estable (sin crash ni cuelgue);
tras restaurar el fetch, "Analizar"/"Reintentar" recuperó `listo` con una respuesta nueva. Cero errores de
consola en todo el flujo. `npx tsc --noEmit` y `npm run build:web` limpios. Sin migraciones ni edge
functions nuevas/tocadas esta sesión (no aplica desplegar).

## Prompt Sesión 5 — Agenda: botón "Organizar mi agenda" (Opus 4.8, alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 5.
Depende de 1 y 4. Carga hairy-agenda-rules (OBLIGATORIO), hairy-design-system, hairy-ui-craft.

OBJETIVO: el diferencial más vistoso del día a día. Un BOTÓN dedicado en la Agenda que "arregla tu día":
detecta retrasos, huecos muertos y solapes y ofrece arreglos de UN CLIC — sin tener que hablar con el chatbot.

YA EXISTE (reutilizar, NO reconstruir): lib/retrasos.ts (motor puro: calcularEstrategiasRetraso cascada/reposo/
hueco/pedir, duracionRealAprendida, mejorAlternativaSlot), components/agenda/RetrasoEstrategiasModal.web.tsx,
acción 'optimizar_agenda' en chispaOps + tool en el edge (hoy SOLO accesible por chatbot). Reglas de fases
activa/reposo/transición en hairy-agenda-rules.

CONSTRUYE:
1) Botón "Organizar mi agenda" visible en la Agenda (cabecera/toolbar; en móvil, en la hoja "Más" o similar).
   Al pulsarlo, un panel que analiza el día actual y lista los PROBLEMAS detectados (retrasos, solapes, huecos
   muertos, tiempos de reposo desaprovechados) con una PROPUESTA de arreglo por cada uno (reutiliza el motor
   lib/retrasos.ts y optimizar_agenda), aplicables de un clic o en lote, con vista previa. Respeta la regla dura
   (mueve las 4 marcas inicio/fin/fin_activa/fin_espera coherentes; nunca solape activa-activa).
2) Sacar 'optimizar_agenda' del monopolio del chatbot: la lógica vive en un módulo reutilizable que usan tanto el
   botón como (si se quiere) el chatbot. Auditoría en citas_historial (motivo "Reorganizada por Chispa").
3) Avisos: al reorganizar, resetear confirmacion_enviada para que el motor n8n reavise (envío real = Alexandro).

ACEPTACIÓN: con una agenda con un retraso y un hueco, el botón detecta ambos y propone arreglos aplicables de un
clic; tras aplicar, la BD queda coherente (sin solapes activa-activa, 4 marcas movidas); funciona sin usar el chat.
Verificado E2E en demo (escenario sembrado y revertido). tsc + build limpios.

Cierra con el Protocolo de cierre.
```

**Verificado 8-9 jul:** analizador determinista nuevo `lib/organizarAgenda.ts` (puro, sin BD/UI):
`analizarAgendaDia()` agrupa las citas activas de HOY por profesional y prioriza 1) retraso real (cita
cuyo fin ya paso y sigue abierta) 2) solape activa-activa (dato inconsistente) 3) huecos muertos/reposo
desaprovechado (compactacion secuencial de citas futuras, excluye cadenas `grupo_id`) — para no proponer
dos arreglos que se pisen sobre la misma cita, solo se buscan huecos en un profesional si no tiene ya un
retraso o solape activo esa pasada (se vuelve a pulsar el boton tras aplicar para ver lo que quede).
Reutiliza `calcularEstrategiasRetraso` tal cual para retrasos y las primitivas de fase de `lib/retrasos.ts`
(exportadas sin tocar su logica) para solapes/huecos: nunca solapa activa-activa, siempre mueve las 4
marcas juntas. 11 tests Deno nuevos (`lib/organizarAgenda.test.ts`, ejecutados junto a los 9 de
`retrasos.test.ts`: 20/20 en verde) cubren cada tipo de problema, el umbral de ruido, el filtro al dia
de "ahora" y la exclusion de cadenas. Panel nuevo `components/agenda/OrganizarAgendaPanel.web.tsx`: lista
cada problema con su propuesta y un boton "Aplicar" (+ "Aplicar todos"); para retrasos con varias
estrategias, "Ver opciones" reabre el `RetrasoEstrategiasModal` YA existente en vez de duplicar esa UI.
Aplica via `chispaOps.ejecutarAccion({tipo:'optimizar_agenda'})` — el MISMO camino que usaria el chatbot —
y se reanaliza solo tras cada aplicacion. Bug de la regla dura encontrado y arreglado en el ejecutor de
`optimizar_agenda`: colapsaba `fin_espera` (`fin_activa = nuevo_fin` siempre) en CUALQUIER movimiento,
chatbot incluido; ahora usa `nuevo_fin_activa`/`nuevo_fin_espera` cuando vienen (el boton siempre los
manda) y cae al comportamiento previo solo si faltan (compat con el chatbot sin redesplegar). Se anadio
tambien la auditoria en `citas_historial` (motivo "Reorganizada por Chispa") que faltaba en esa accion,
para ambos caminos. Boton en la Agenda con icono chispa tintado por rol (`roleTheme`), visible en movil
y escritorio. Arnes dev-only `?orgnow=<ISO>` (mismo patron que `?chispatest=1`/`?vozab=1`) para fijar la
hora "ahora" del analisis sin depender del reloj real ni de la hora de cierre. **E2E real** (tenant
`testeo4_03801`, cuenta owner provisionada para la sesion y borrada al terminar): sembradas 2 citas
reales (retraso de 40 min en un profesional, hueco de 2h en otro) — el boton detecto AMBOS a la vez;
"Aplicar" en cada uno escribio de verdad, verificado por SQL que las 4 marcas se movieron coherentes,
`confirmacion_enviada` volvio a `false` y `citas_historial` quedo con el motivo exacto; tras aplicar
ambos, "Tu agenda de hoy esta en orden". Se descubrio que `completarManual=false` (default) autocompleta
citas pasadas al cargar la Agenda — la primera siembra se marco `completada` sola antes de poder
verificarla; se ajusto el negocio de prueba y se reseto al terminar. **E2E demo:** en
`/demo.html?share=1` (iframe con `?orgnow=` anadido a su `src`), "Aplicar" sobre un retraso sembrado
mostro "Hecho (demostracion)... en la demo no se guardan cambios"; verificado por SQL que la fila real
de `demo_salon_001` no cambio y no genero historial. Datos de prueba revertidos en ambos tenants.
`npx tsc --noEmit` y `npm run build:web` limpios (se anadio `allowImportingTsExtensions` a
`tsconfig.json` para el import `.ts` explicito que exige `deno test`). Sin migraciones ni edge functions
nuevas/tocadas (el chatbot sigue con su propio criterio en `optimizar_agenda`; unificarlo es opcional
segun este mismo plan).

## Prompt Sesión 6 — Caja + Presupuestos proactivos (Sonnet 5, medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 6.
Depende de 4 (patrón de página). Carga hairy-design-system, hairy-domain-data.

OBJETIVO: IA proactiva de verdad en Caja y Presupuestos (no un botón que llama al chatbot).

YA EXISTE (revisar; la v1 puede estar rota/invisible): upsell IA en el cobro (Sesión 9), presupuesto desde NL
y "N días sin respuesta" (Sesión 9-B), backend de presupuestos (lib/presupuestos.ts), edge agenda-asistente.

CONSTRUYE:
1) Caja: al seleccionar una cita para cobrar, una sugerencia de upsell CORTA y comercial (producto/servicio
   complementario) usando el patrón de la Sesión 4 (determinista para elegir candidatos por servicio/ficha; LLM
   solo para el copy). Visible, de un clic para añadir al ticket. Nada de fallo silencioso. (Fiscal: NO improvisar.)
2) Presupuestos: crear presupuesto desde lenguaje natural (parser → líneas de catálogo) con formulario de
   revisión (bloque 'formulario') antes de guardar; alerta proactiva "N días sin respuesta, ¿reenvío?" como
   tarjeta de página. Envío real WhatsApp = Alexandro (dejar stub claro).

ACEPTACIÓN: en Caja aparece un upsell accionable al cobrar; en Presupuestos se crea uno desde una frase y se
revisa antes de guardar; la alerta de seguimiento se ve. Estados visibles, sin cuelgues. tsc + build limpios; E2E en demo.

Cierra con el Protocolo de cierre.
```

**Verificado 9 jul (commit `1970dd6bd`):** **Investigado antes de construir** (lectura completa de
`caja.web.tsx`/`presupuestos.web.tsx`/`useChispaSugerencia`/`BloqueRenderer`): la v1 (Sesión 9) SÍ estaba rota
como avisaba el prompt — Caja mostraba un emoji `✨` suelto y dejaba que el LLM eligiera libremente el producto
del catálogo completo (nada determinista); el creador de presupuestos por NL se tragaba el error en silencio
(`useChispaSugerencia` no actualiza `bloques` si `generar()` falla) y su bloque `'formulario'` de precio
faltante (Sesión 3, `pedirInfo`) tenía el botón muerto (`onRespuestaInteractiva` nunca se pasaba a
`BloqueRenderer`); la cabecera del icono "Crear presupuesto rápido" usaba `Icon name="sparkles"` sin esa
entrada en el mapa → svg vacío.
1. **Candidato de upsell determinista:** `lib/upsellCandidato.ts` (+ `lib/upsellCandidato.test.ts`, 6 casos,
   `deno test` verde) — `elegirCandidatoUpsell(servicioNombre, productos)` mapea palabras clave del servicio
   (color/tinte/mecha/balayage → categoria `color`; keratina/tratamiento/mascarilla → `tratamiento`;
   corte/peinado → `shampoo`) a `productos.categoria`, sin LLM; si no hay match o no hay producto de esa
   categoria, no sugiere nada (mejor callar que inventar). Sin tabla nueva de relación servicio-producto
   (no existía; heurística por nombre es lo proporcionado al esfuerzo de la sesión).
2. **Caja:** reemplazado el bloque `useChispaSugerencia` por `useAyudaIA` + `TarjetaAyudaIA` (patrón Sesión 4):
   al seleccionar 1 cita con servicio reconocido, se auto-dispara `analizar()` con el candidato ya elegido;
   `resumenDeterminista` (producto + precio) SIEMPRE visible con botón "Añadir al ticket" que preselecciona el
   carrito de "Venta rápida" YA EXISTENTE (`crear_cobro_walkin`) — cero cambios a tablas/lógica fiscal ("NO
   improvisar"), dos tickets separados (servicio vía `crear_cobro_desde_cita`, producto vía el carrito). La
   frase comercial la escribe el LLM sobre el candidato ya fijado, nunca lo elige.
3. **Presupuestos:** el creador NL pasa a `useAyudaIA` (5 estados explícitos, arregla el fallo silencioso);
   se cablea `onRespuestaInteractiva` para el `'formulario'` de precio faltante (reenvía la descripción
   original + los datos que faltaban como texto, sin gestionar historial de turnos). "Confirmar" sobre la
   propuesta YA NO llama a `chispaOps.ejecutarAccion` directo (guardaba sin revisión): abre el `EditorModal`
   YA EXISTENTE prellenado (líneas/cliente/notas editables, no un formulario plano nuevo — reutiliza la UI de
   revisión más completa que ya había) con badge "Borrador creado por Chispa (IA) · revisa los datos antes de
   guardar"; fix del ternario de cabecera (`initial?.id` en vez de `initial`, para no mostrar "P-null" en un
   borrador sin guardar). Alerta "N días sin respuesta" migrada de texto suelto por fila a tarjeta de PÁGINA
   con botón "Reenviar" REAL (`enviarPresupuestoPorCorreo`, ya desplegado); WhatsApp real sigue siendo de
   Alexandro. Fix icono `sparkles` indefinido (añadido al mapa local).
**E2E real en demo** (`demo_salon_001`, datos sembrados vía SQL y revertidos al terminar — no había ni un solo
producto en el catálogo demo, hubo que sembrar uno): sembrada 1 cita de HOY con servicio "Mechas completas" +
1 producto "categoria=color"; al seleccionarla, la tarjeta mostró el producto correcto con su precio
determinista al instante, y tras la llamada real al edge una frase de Chispa genuina y no inventada ("Es el
momento ideal para añadir la Mascarilla Protectora Color (16 €) y prolongar el resultado de las mechas recién
aplicadas."); "Añadir al ticket" abrió el modal de Venta rápida con el producto ya en el carrito (cantidad 1,
total 16,00€). Presupuestos: "Presupuesto para Sofia Muñoz: corte caballero y barba" produjo una propuesta con
los precios REALES del catálogo (Corte caballero 18€ + Barba 12€ = 30,00€, sin inventar nada); "Confirmar" abrió
el editor con el badge de IA, la clienta ya vinculada a su ficha y las 2 líneas editables — verificado por SQL
que NO se escribió ninguna fila hasta cerrar sin guardar (conteo de `presupuestos` sin cambiar); "Reenviar"
sobre un presupuesto real sin `pdf_path` disparó la llamada real a `enviar-presupuesto` (400 `sin_pdf`,
comportamiento correcto — nunca se llega a intentar el envío SMTP) con el botón recuperándose sin quedarse
colgado. Cero errores de consola en todo el flujo. `npx tsc --noEmit` y `npm run build:web` limpios (el único
ruido de `tsc` es preexistente en `scripts/tts-test/fish-speech-repo/`, un vendored ajeno a esta sesión). Sin
migraciones ni edge functions nuevas/tocadas (todo el trabajo es cliente; el edge `agenda-asistente` ya tenía
`crear_presupuesto`+`pedirInfo` de la Sesión 3).

## Prompt Sesión 7 — Clientes + Informes + Mi Jornada proactivos (Sonnet 5, medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 7.
Depende de 4. Carga hairy-design-system, hairy-domain-data. RESPETA la regla dura de salud.

OBJETIVO: IA proactiva en Clientes, Informes y Mi Jornada.

YA EXISTE: riesgo de no-show + fuga (Sesión 7 v1: RiesgoNoShowIndicator, clientes_riesgo_no_show, recuperar_cliente),
tools de analítica (resumen_caja/ocupacion/citas_hoy/metas), bloques grafica/comparativa, briefing (BriefingAgenda).

CONSTRUYE:
1) Clientes: la pastilla de riesgo/fuga es ACCIONABLE (de un clic: "recuperar", "avisar"), no solo informativa;
   Q&A de ficha por lista blanca (salud fuera del LLM) accesible desde la ficha.
2) Informes: "informe narrado" proactivo (resumen en lenguaje natural de la evolución) + comparativas/alertas de
   caída, usando las tools de analítica ya existentes y los bloques grafica/comparativa. Tarjeta de página, no chatbot.
3) Mi Jornada: sobre lo arreglado en la Sesión 4, añadir coaching suave/sugerencias de aprovechar huecos.
4) Coordinar con la Sesión 10 para que estas tarjetas NO se solapen con avisos/dashboard.

ACEPTACIÓN: desde una ficha en riesgo se recupera/avisa de un clic; Informes muestra un resumen narrado real
(cifras server-side, nunca inventadas); Mi Jornada sugiere algo útil. Estados visibles. tsc + build; E2E en demo.

Cierra con el Protocolo de cierre.
```

**Verificado 9 jul (commit `6c731b667`):** sin migraciones ni edge functions nuevas/tocadas (todo
cliente; `ficha_cliente`/`recuperar_cliente`/`mostrar_grafica`/`mostrar_comparativa` ya existian desde
Sesiones 6-7 de v1 y 6 de v1-analitica).
1. **Clientes — pastilla accionable:** "Recuperar" (fuga) construye la MISMA `AccionPropuesta
   recuperar_cliente` que usaria el chatbot y llama a `chispaOps.ejecutarAccion` directo (sin pasar por
   el LLM: el pill ya es la propuesta) — cero tools nuevas. "Avisar" (riesgo de no-show) es una accion
   NUEVA en el cliente (no una tool del edge): busca la proxima cita confirmada de la clienta y resetea
   `confirmacion_enviada`/`recordatorio_enviado` a `false`, el MISMO mecanismo ya usado al reagendar
   (`modificar_cita_publica`) y al reorganizar agenda (Sesion 5) para que el motor real de WhatsApp
   (n8n) la reenvie; si no hay cita proxima lo dice con franqueza ("No tiene ninguna cita proxima a la
   que reforzar el aviso") en vez de fingir que hizo algo. Ambas acciones tienen guardrail de demo
   client-side (simulan con "Hecho (demostracion)...") ademas del guardrail server-side ya existente en
   `registrar_aviso_fuga`. Se añadio tambien la pastilla "Fuga · Xd" a la ficha (antes solo estaba en la
   fila de la lista). Q&A de ficha: input libre + `useAyudaIA`, con el id de la clienta EMBEBIDO en el
   texto del prompt ("Su id EXACTO es... usa ficha_cliente con id=...") para que se resuelva sin
   ambiguedad sin tocar el edge (que hoy no lee el campo `contexto` que ya viaja en el body).
2. **Informes — informe narrado:** primera tarjeta de IA de esta pagina (antes no tenia ninguna).
   `resumenDeterminista` (citas/ingresos/no-shows YA cargados, sin LLM) siempre visible; "Analizar
   periodo" pide al LLM narrar interpretando esas cifras Y llamar a `mostrar_grafica` +
   `mostrar_comparativa` (calculo real server-side, Sesion 6 de v1) para contrastar con el periodo
   anterior equivalente.
3. **Mi Jornada — coaching de huecos:** `lib/organizarAgenda.ts` exporta `UMBRAL_HUECO_MIN_DEFAULT`
   (antes interno) para no duplicar el umbral de "hueco que merece mencionarse". Nueva consulta
   (solo si periodo=hoy y vista=personal) de las citas de HOY del profesional vinculado; `fasesDe` de
   `lib/retrasos.ts` (reusada tal cual, misma primitiva que "Organizar mi agenda") separa huecos de
   REPOSO (el profesional libre mientras un tinte actua, aunque el servicio siga abierto) de huecos
   ENTRE CITAS. El mas proximo se anade al resumen determinista; la lista completa se pasa al prompt de
   "Analizar mi dia" para que la sugerencia (contactar a una clienta, descansar...) este anclada a
   huecos REALES en vez de que el LLM adivine si los hay (antes solo veia `citas_lista`, que son citas
   YA completadas — nunca podia ver huecos futuros).
4. **Hallazgo corregido en vivo (Informes):** el primer intento del prompt narrado (pedia narrar Y
   llamar a 2 tools en la misma respuesta) hacia que el LLM escribiera el texto en un turno intermedio y
   cerrara con una llamada a `sugerir_enlace` en el turno FINAL — como `runAgente` solo toma el texto de
   la ULTIMA respuesta (los bloques visuales SI se acumulan entre turnos), el informe narrado llegaba
   vacio (grafica+comparativa sin una sola frase). Se reforzo el prompt (orden explicito 1-tools,
   2-texto-en-la-ultima-respuesta, "NO uses sugerir_enlace aqui, ya estamos en Informes") sin tocar el
   edge — mismo tipo de ajuste que la Sesion 3 V2, pero en el prompt de ESTA superficie, no en el system
   prompt compartido. Verificado tras el ajuste: informe narrado real (interpreta las cifras, no las
   repite) + grafica + comparativa juntos, sin enlace redundante.
5. **Nota para Sesion 8/10:** el mismo patron "texto + tool de cierre en el turno final vacio" puede
   reproducirse en cualquier superficie que combine narrativa con `sugerir_enlace` (se vio tambien en
   una prueba de la Q&A de ficha con "cuanto gasta de media" sobre Pedro Sanchez: la respuesta rica del
   turno intermedio se perdio igual). No se toco el `runAgente` compartido (fuera de alcance, riesgo de
   regresion en Sesiones 1-6 ya verificadas); si se repite en Sesion 8 (Reseñas/Bandeja), aplicar el
   mismo ajuste de prompt (pedir explicitamente que el texto vaya en la ultima respuesta y evitar
   `sugerir_enlace` cuando ya se esta en la pantalla de destino) en vez de encadenar tools+narrativa sin
   guiar el orden.
**E2E real en demo** (`demo_salon_001`, datos sembrados por SQL y revertidos al terminar — ninguna
clienta tenia riesgo de fuga/no-show ni Maria Garcia (profesional vinculada a `demo.publico`) citas
HOY): sembrado 1 `no_show` pasado para Elena Moreno (score 35, nivel medio) + su proxima cita
confirmada, y 2 citas de HOY para Maria Garcia (Corte caballero sin reposo + Color raiz con 30 min de
reposo) separadas por un hueco de 45 min. Clientes: "Riesgo de ausencia medio" + boton "Avisar" en la
ficha de Elena → clic → "Hecho (demostracion): en tu cuenta esto reforzaria el aviso de confirmacion de
su cita del 10 jul, 02:05" (verificado por SQL que `confirmacion_enviada`/`recordatorio_enviado` de esa
cita NO cambiaron, demo intacta). Pedro Sanchez calificaba de forma NATURAL para "Fuga · 9d" (sin
sembrar nada: `ultima_visita`/`frecuencia_dias` reales ya cumplian el umbral de `clientes_en_riesgo_fuga`
`> frecuencia*1.4`) → "Recuperar" → mismo mensaje de demostracion (verificado que no se creo fila en
`fuga_clientas_avisos`). Q&A: "¿Cada cuánto viene y cuánto gasta de media?" sobre Pedro Sanchez → el
edge llamo a `ficha_cliente` con el id exacto (confirmado leyendo `conversaciones_ia.transcripcion`) →
`tiene_notas_salud:true` manejado correctamente (nunca broto contenido de salud) → respuesta final con
texto + enlace a Clientes, sin error de consola. Mi Jornada: resumen determinista mostro "Tienes 45 min
libres a partir de las 02:27 antes de tu siguiente cita" (coincide exacto con el hueco sembrado);
"Analizar mi dia" sugirio contactar a una clienta para recuperarla, apoyandose en el hueco real. Informes:
tarjeta "Informe narrado" con el resumen determinista ("4 citas · 87 EUR estimados") siempre visible +
tras el ajuste de prompt, informe narrado real interpretando las cifras + grafica de ingresos + comparativa
"ultimos 30 dias +100%" (dato real server-side, ventana distinta al mes calendario mostrado arriba — no
contradictorio). Capturas de pantalla de las 3 superficies sin overlaps con AvisosBell/dashboard (tarjetas
siempre en flujo normal). Cero errores de consola nuevos en todo el flujo (el unico ruido son los
"Font loading error" y el 404 de `rpc_clientes_toca_recompra`, ambos preexistentes y ajenos a esta
sesion). `npx tsc --noEmit` y `npm run build:web` limpios.

## Prompt Sesión 8 — Reseñas + Bandeja proactivas (Sonnet 5, medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 8.
Depende de 4. Carga hairy-design-system, hairy-domain-data.

OBJETIVO: IA proactiva en Reseñas y Bandeja (integrada, no un botón que llama al chatbot).

YA EXISTE (revisar; v1 Sesión 9): "Sugerir respuesta" a reseñas, sentimiento, temas recurrentes; triage de bandeja
+ borradores + convertir mensaje en cita/presupuesto (useChispaSugerencia + BloqueRenderer).

CONSTRUYE:
1) Reseñas: borrador de respuesta con el tono del salón de un clic, alerta sutil de reseña negativa, resumen de
   temas recurrentes como tarjeta de página. Patrón Sesión 4 (estados visibles).
2) Bandeja: triage automático que propone acción (cita/presupuesto) directa desde el mensaje + borrador de respuesta.
   Envío real WhatsApp = Alexandro (stub claro). Guardar borrador en el hilo (ya soportado).

ACEPTACIÓN: responder una reseña con borrador de un clic; un mensaje entrante propone crear cita/presupuesto y
borrador. Sin cuelgues. tsc + build; E2E en demo.

Cierra con el Protocolo de cierre.
```

**Verificación retroactiva de Fase B (9 jul):** las Sesiones 4-7 ya estaban commiteadas; se re-verificó cada
una en código real (no solo se leyó el registro de cada sesión): `lib/hooks/useAyudaIA.ts` (máquina de estados
idle/cargando/vacio/error/listo, sin ningún camino silencioso, `reintentar()` guarda la última llamada) +
`components/chispa/TarjetaAyudaIA.web.tsx` (pinta los 5 estados, layout en flujo normal sin position
fixed/absolute — no compite con AvisosBell) son reales y Mi Jornada los usa de verdad (`analizarDiaIA`
→ `ayudaIA.estado`). `lib/organizarAgenda.ts` (Sesión 5): módulo puro, botón real en la toolbar de
`AgendaCalendar.web.tsx` (`showOrganizar` → `OrganizarAgendaPanel`), aplica vía `chispaOps.ejecutarAccion`
(auditoría ya cubierta); **11/11 tests Deno verdes** (`deno test lib/organizarAgenda.test.ts`). Sesión 6:
`elegirCandidatoUpsell` determinista + `useAyudaIA` en Caja; presupuesto NL con formulario de revisión en
Presupuestos. Sesión 7: pastilla de riesgo ACCIONABLE en Clientes (`avisarRiesgoNoShowUnClic`,
`recuperarClienteUnClic`, botones de un clic, no solo informativa), Q&A de ficha por id embebido (sin
ambigüedad de nombre), informe narrado real en Informes (`mostrar_grafica`/`mostrar_comparativa` vía
`useAyudaIA`), coaching de huecos en Mi Jornada reutilizando `UMBRAL_HUECO_MIN_DEFAULT` de la Sesión 5
(coherencia entre sesiones). **Bug encontrado y arreglado** en la Fase A (no B): el camino MANUAL de
"config guiada" (S2) no comprobaba el rol como sí lo hacía el auto-disparo — un profesional podía entrar a
configurar el negocio. Gateado (`esGestorOnboarding`) y desplegado, commit `3f1b27f11`.
**Sesión 8 (Reseñas + Bandeja): estaba CODIFICADA pero sin commitear** (working tree sucio: 3 archivos
modificados + migración SQL sin trackear). Se verificó que ya usaba correctamente el patrón `useAyudaIA`
(no una implementación provisional), la migración `resenas.respuesta_borrador` ya estaba aplicada en
remoto, `guardarBorradorConversacion` reutiliza el mismo shape de insert que `responderConversacion`
(ya cubierto por RLS) sin disparar el envío real; se descartó fuga a vistas públicas (`/app/contacto/[slug]`
no toca `mensajes_conversacion`). `npx tsc --noEmit` y `npm run build:web` limpios con el diff incluido.
Advisors: 140 lints (137→140; el delta +3 es del tipo ya aceptado `authenticated_security_definer_function_executable`
y viene de trabajo paralelo no relacionado en `pagos/`, no de esta migración). Commiteado y desplegado
(`547dd08aa`). Envío real WhatsApp/correo de los borradores sigue abierto para Alexandro.
**Fase B (Sesiones 4-8) queda verificada y cerrada 9 jul.**

## Prompt Sesión 9 — Hub "Qué hace la IA" + manuales IA + quitar import CSV (Sonnet 5, medio)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 9.
Independiente. Carga hairy-design-system.

OBJETIVO: descubribilidad. Que cualquiera (incluido Jose) vea qué sabe hacer la IA, y limpiar la redundancia.

YA EXISTE: sistema de manuales lib/manuals/ (configuracion.ts, clientes.ts...), Avisos con manuales/onboarding,
Migración Mágica (components/config/TabMigracionMagica.tsx), import CSV redundante (components/config/TabImportarCitas.tsx
+ migración 202606301915_importar_citas_csv.sql).

CONSTRUYE:
1) Un HUB "Qué sabe hacer la IA" (una sección/página descubrible, p.ej. en Configuración o Avisos): catálogo de las
   funciones de IA por página (Chispa, organizador de agenda, riesgo/fuga, upsell, presupuestos NL, informe narrado,
   migración mágica, voz, etc.), cada una con: qué hace, dónde está (enlace) y cómo se usa. Derivado de datos, mantenible.
2) Manuales de IA: entradas en lib/manuals para las funciones de IA (con captura/highlight si el patrón lo soporta).
3) QUITAR el import CSV: retirar TabImportarCitas de la UI (y su punto de entrada); la Migración Mágica lo cubre.
   Verifica que no rompe imports; la migración SQL puede quedar (no molesta) o marcarse obsoleta — no borrar datos.

ACEPTACIÓN: existe un sitio donde se ve TODA la IA del software con enlaces que llevan a cada función; el import CSV
ya no aparece en la UI; los manuales de IA se abren. tsc + build; verificado en demo.

Cierra con el Protocolo de cierre.
```

## Prompt Sesión 10 — Bugs + QA visual + verificación E2E de toda la capa IA (Opus 4.8, medio-alto)

```
Trabajas en Mecha (repo Hairy). Lee ENTERO informes/PLAN-IA-CHISPA-V2-REDISENO.md y ejecuta la SESIÓN 10.
Depende de 1-9 (cierre). Carga hairy-design-system, hairy-ui-craft.

OBJETIVO: estabilizar y DEMOSTRAR que toda la capa de IA funciona de verdad. Cazar bugs y probar E2E.

CONSTRUYE / ARREGLA:
1) Solape de avisos/dashboard: reproducir y arreglar que al abrir avisos con el dashboard (abierto y cerrado) todo
   se tape, sobre todo en Informes. Revisar z-index/layout/scroll de las tarjetas proactivas de las Sesiones 4/6/7/8
   para que nunca se solapen. Testear en móvil y desktop.
2) Rendimiento de carga por pestaña: medir (preview_* / DevTools MCP) y reducir el tiempo de render de cada tab;
   añadir skeletons/loaders donde falte para que no parezca colgado. Documentar qué era conexión vs. código.
3) Verificación E2E de TODA la capa IA (checklist "funciona de verdad", no solo compila):
   - Edge functions: todas desplegadas (curl 401 vs 404) y una llamada autenticada real por cada una.
   - Chispa: bloques interactivos, config guiada, actúa con mínima info, voz (indicador de fallback), micro.
   - Por página: organizador de agenda, caja, presupuestos, clientes/informes/mi jornada, reseñas/bandeja —
     cada uno con estados visibles, sin fallo silencioso.
   - Hub de descubribilidad accesible.
   Deja un documento informes/VERIFICACION-IA-<fecha>.md con el resultado real de cada punto (pasa/falla + evidencia).

ACEPTACIÓN: cero solapes de avisos; cada pestaña carga con feedback; el checklist E2E está pasado y documentado con
evidencia. tsc + build; migraciones/advisors si aplica.

Cierra con el Protocolo de cierre + actualizar MEGA_INFORME marcando la capa IA v2 como verificada.
```

**Verificado 9 jul:** documento completo con evidencia en `informes/VERIFICACION-IA-2026-07-09.md`.
1. **Solape avisos/dashboard (RESUELTO):** reproducido en la demo con diagnóstico DOM. Causa raíz: `.kpi-card` y
   `.section-card` de Informes llevan `animation: ... both`, cuyo keyframe final retiene un `transform` (identidad
   `translateY(0)`/`scale(1)` — sigue creando stacking context); el hover-lift hace lo mismo. Eso atrapaba el z-index de
   los tooltips "i" (`InfoDot`, z:60) y los tapaba la tarjeta/sección siguiente. Fix: `InfoDot` reescrito para renderizar
   el tooltip en un **portal a `document.body`** (`position: fixed` del rect del ancla, clamping al viewport, flecha
   reposicionada, reposición ante scroll/resize). Verificado por DOM (`elementFromPoint`, 3/3 puntos por encima) + captura
   en **móvil y desktop** (incl. tarjeta forzada en hover = peor caso, y KPI del borde derecho = clamping). Confirmado que
   las `TarjetaAyudaIA` de S4/6/7/8 viven en flujo normal y no las rompe ningún padre.
2. **Rendimiento por pestaña (MEDIDO+REDUCIDO):** auditadas las 12 pestañas — todas muestran loader instantáneo
   (`loading=true` inicial); unificado el único plano (lista-espera → `PageLoader`). Medición real de la carga de Informes:
   el coste dominante de conexión eran las llamadas redundantes a `/auth/v1/user` (`getUserProfile` en cada pestaña + hooks,
   cada `auth.getUser()` es red). Fix: cache de sesión/perfil en `lib/auth.ts` (TTL 8s + coalescing in-flight, no cachea
   nulos/errores, invalidado en `onAuthStateChange` y tras mutar el perfil). Resultado medido: **`/auth/v1/user` 12+→1,
   total Supabase 88→26** en la misma carga. El bundle monolítico de 6.3 MB (code-splitting) se documenta como coste de
   CÓDIGO conocido, no se toca (riesgo alto en sesión de QA).
3. **E2E toda la capa IA (PASADO):** 11/11 edge functions de IA desplegadas (curl sin auth → 401/400, nunca 404; control
   inexistente → 404) + una llamada autenticada real por cada una con el JWT de `demo.publico` (200 completos en
   agenda-asistente, chispa-tts con MP3 real, chispa-landing, color-formula-parser; el resto 400/502 de validación propia =
   auth pasó). Panel de Chispa E2E (mensaje real "¿cuántas citas tengo hoy?" → respuesta con datos reales), pantalla
   completa, micro, briefing, voz honesta (indicador oculto con ElevenLabs sano). IA por página verificada en vivo:
   organizador de agenda (panel + "agenda en orden"), Mi Jornada, Caja, Presupuestos, Clientes, Informes, Reseñas, Bandeja.
   Hub "Qué hace la IA" (Configuración) accesible con el catálogo de 17 funciones.
4. **Bug extra cazado y arreglado:** `bandeja.web.tsx` `proponerAccionIA` seguía con el `if (!err && data)` que tragaba el
   error (la S8 solo arregló el borrador, no esta función) → ahora cada camino deja estado visible (error/sin datos/propuesta).
`npx tsc --noEmit` y `npm run build:web` limpios (ruido preexistente de `scripts/tts-test/`, Deno). Advisors seguridad
140 lints / **0 ERROR** (idéntico al baseline; sin migraciones ni edge functions nuevas/tocadas esta sesión).
**Con esto, la Fase E cierra y la capa de IA v2 (Sesiones 1-10) queda verificada E2E y estabilizada.**

---

## 5. Cobertura del feedback de Jose (checklist — nada se queda fuera)

| Feedback de Jose | Sesión(es) |
|---|---|
| Chatbot seco, no actúa, pide demasiado | 1, 3 |
| Respuestas visuales (botones/formularios), no texto plano | 1, 3 |
| Crear cosas por Chispa debe ser ≤ que a mano | 3 |
| Memoria al recargar (opcional) | 2 |
| Conoce el negocio y actúa según rol | 2 |
| Pantalla completa del panel | 1 |
| Voz no-ElevenLabs / robótica (indicador honesto) | 1 (+ créditos = externo) |
| Micro pide activar a mano en vez de permiso | 1 |
| Pestañas lentas de renderizar | 10 |
| Avisos/dashboard se solapan (Informes) | 10 (+ 4/6/7/8 coordinan) |
| IA en CADA página, no solo chatbot | 4, 5, 6, 7, 8 |
| Botón organizador de agenda | 5 |
| "Analizar mi día" no funciona | 4 |
| IA en Caja y Presupuestos | 6 |
| Complementaria, no obligatoria (botones, no hablar forzado) | 1, 4, 5 (principio global) |
| "Configúrame el salón" → onboarding que configura todo | 2, 3 |
| Proactividad / que ayude | 4, 5, 6, 7, 8 (tarjetas proactivas) |
| No hay sitio con las funciones de IA / manuales | 9 |
| Quitar import CSV redundante | 9 |
| Muchos bugs / no testeado | 10 |
| "HECHA" ≠ desplegado (lección de hoy) | Protocolo de cierre (todas) |

## 6. Reparto Carlos / Alexandro
- **Carlos:** todo lo de UI/UX, bloques interactivos, panel, config guiada, per-page proactivo, organizador de
  agenda, hub, bugs/QA. Ejecutores de escritura (cliente).
- **Alexandro:** envíos reales WhatsApp/mensajes, motor n8n, agente telefónico (Retell/Zadarma), pagos, y las
  tools de lectura/analítica del edge si se pactan. Créditos ElevenLabs y LIGHTX_API_KEY = prerrequisitos externos.
```