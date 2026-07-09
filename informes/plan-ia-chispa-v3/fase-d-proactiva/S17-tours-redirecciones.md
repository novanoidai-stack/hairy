# S17 · Tours y redirecciones guiadas

**Fase:** D · Guía · **Dueño:** Carlos · **Esfuerzo:** medio-alto · **Depende:** S16

> "Te llevo y te enseño": recorridos guiados paso a paso entre pantallas, no soltarte en una ruta.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-ui-craft`.

## Objetivo (resultado deseado)
Que Chispa pueda guiar un flujo multi-pantalla (p.ej. "configurar reserva online", "hacer tu primer
cobro") llevándote paso a paso, resaltando qué tocar en cada pantalla y confirmando avance.

## Ya existe (no reconstruir — verifica)
- Coach intra-página (S16), navegación por bloque `enlace`/rutas (`CHISPA_RUTAS`), config guiada
  (`onboardingAgent.ts`), posible tour previo (verifica).

## Construir
1. **Motor de tour** declarativo: pasos {ruta, elemento, explicación, criterio de avance}; navega y
   ancla el coach (S16) en cada pantalla; barra de progreso (bloque `progreso`).
2. **Catálogo de tours** curados (los flujos de más valor). Reanudable; se puede salir siempre.
3. **Entrada:** desde Chispa ("guíame para X"), desde Avisos/onboarding, o proactivo.

## Reglas duras que te aplican
- Móvil primero. Salir siempre disponible. No bloquear al usuario.

## Criterios de aceptación (verificables)
- Un tour real lleva al usuario por ≥2 pantallas, resaltando el paso y avanzando al completarlo;
  reanudable y abandonable (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo  [ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push
[ ] S17 marcada`

## Estado
HECHA (10 jul 2026). Tours guiados multi-pantalla reusando el coach de S16.

**Que se construyo:**
- `components/chispa/CoachMark.web.tsx`: se EXTRAJO el visual del coach (anillo no bloqueante +
  burbuja + colocacion movil/escritorio + foco al CTA) a un componente compartido. S16
  (`CoachLauncher`) se refactorizo para usarlo — misma experiencia, cero duplicidad; re-verificado.
- `lib/tours.ts`: contrato de datos — evento `CHISPA_TOUR_EVENT`, tipos `TourPaso`/`Tour`, catalogo
  curado (`primeros-pasos`, `primer-cobro`), `lanzarTour`/`reanudarTour` y persistencia reanudable en
  localStorage (`mecha-tour-progreso`). Cada paso usa anclas presentes en movil Y escritorio
  (nav-agenda/nav-clientes/nav-caja/chispa-bubble).
- `components/chispa/TourLauncher.web.tsx` (+ stub nativo): motor global en `app/_layout.tsx`. Navega
  a la ruta de cada paso (`router.push`), sigue el ancla con rAF, pinta CoachMark + barra de progreso,
  guarda progreso en cada paso, y si un ancla no aparece en ~4s AVANZA solo (no encalla). Salir/Esc/x
  = abandonar conservando progreso; completar el ultimo paso = limpiar progreso.
- Entrada: bloque "Tours guiados" en el panel de Chispa (al inicio de la conversacion), con boton por
  tour + "Reanudar: <tour>" si hay progreso. Determinista (sin depender del LLM/edge).
- Docs: `lib/manuals/chispa.ts`, `lib/iaCatalogo.ts` (`chispa-tours-guiados`), `web/especificaciones.html`.

**Verificado E2E** en `/demo.html?share=1`: tour `primeros-pasos` navega Agenda -> Clientes -> Caja ->
(Chispa), resaltando el ancla correcto en cada pantalla (ring sobre nav-clientes/nav-caja, coords
verificadas) y avanzando con barra "paso N de 4"; localStorage refleja el idx en cada paso; cerrar con
"x" conserva el progreso y "Reanudar" reabre en el paso 2; "Finalizar" limpia el progreso; entrada
desde el boton del panel funciona; S16 (coach) sigue OK tras el refactor; sin errores de consola.
Screenshot de la demo da timeout (limitacion conocida del iframe); verificado por DOM.

**Checklist:** [x] tsc  [x] build  [x] E2E demo  [x] manuales+iaCatalogo  [x] specs landing
[ ] commit+push (a continuacion)  [x] S17 marcada
