# S16 · Coach intra-página que te sigue

**Fase:** D · Guía · **Dueño:** Carlos · **Esfuerzo:** alto · **Depende:** S03

> Movimiento de verdad: un Chispa flotante que **explica en el sitio** y te acompaña — no te redirige y
> te suelta.

## Lee antes
- [`../README.md`](../README.md). Carga `hairy-ui-craft` + `hairy-design-system`.

## Objetivo (resultado deseado)
Una capa de guía intra-página: la mascota/burbuja de Chispa puede aparecer flotando, señalar un
elemento concreto de la pantalla (coach mark), explicarlo y ofrecer la acción — sin sacarte de donde
estás.

## Ya existe (no reconstruir — verifica)
- `components/chispa/ChispaMascota.web.tsx` (avatar + moods), panel (S03). Bloque `enlace`/navegación.
  Posible infraestructura de tour previa (verifica; memoria menciona "tour v2").

## Construir
1. **Coach overlay:** componente que ancla una burbuja de Chispa a un elemento (por selector/ref),
   con flecha/resalte, texto breve y CTA; se cierra fácil. No bloquea la página.
2. **Seguimiento:** puede encadenar varias explicaciones en la misma pantalla ("y aquí…") sin navegar.
3. **Disparadores:** desde el panel ("enséñame cómo") o proactivo (S15) para explicar algo en contexto.
4. **Accesible + móvil:** foco/teclado, no tapa contenido crítico, respeta reduced-motion.

## Reglas duras que te aplican
- Móvil primero, sin emojis, no intrusivo (se cierra siempre fácil).

## Criterios de aceptación (verificables)
- Chispa resalta un elemento real de una pantalla y lo explica in-situ, con acción, sin redirigir
  (verificado E2E móvil+escritorio); se cierra sin fricción.

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo  [ ] manuales+iaCatalogo  [ ] specs landing  [ ] commit+push
[ ] S16 marcada`

## Estado
HECHA (10 jul 2026). Coach intra-pagina que sigue al elemento y explica in-situ sin redirigir.

**Que se construyo:**
- `lib/coachGuias.ts`: contrato de datos — evento `CHISPA_COACH_EVENT`, tipos `CoachPaso`/`CoachGuia`,
  registro de guias (universal `orientacion` con `pagina:'*'` + por pagina `agenda`/`clientes`),
  helpers `guiaParaPagina`/`guiaPorId`/`lanzarCoach()`.
- `components/chispa/CoachLauncher.web.tsx` (+ stub nativo `.tsx`): motor global montado en
  `app/_layout.tsx`. Ancla una burbuja de Chispa a un elemento REAL por selector, con anillo de
  resalte NO bloqueante (capa `pointer-events:none`, los clics pasan al elemento), sigue al target
  con rAF (aguanta scroll/resize), encadena pasos, salta anclas inexistentes (rol/movil) y respeta
  `prefers-reduced-motion`. Accesible (role dialog, foco al CTA, Esc cierra). Movil = hoja inferior;
  escritorio = burbuja anclada (320px).
- Anclas `data-coach`: nav lateral (`Sidebar`) + tab bar (`MobileTabBar`) con `nav-<slug>`, y burbuja
  cerrada de Chispa (`chispa-bubble`, ancla siempre presente).
- Disparadores: boton "Ensename esta pantalla" (icono diana) en la cabecera del panel, y entrada
  proactiva "Ensename la pantalla" en la tarjeta de iniciativa (S15).
- Docs: `lib/manuals/chispa.ts`, `lib/iaCatalogo.ts` (`chispa-coach-intrapagina`) y
  `web/especificaciones.html`.

**Verificado E2E** en `/demo.html?share=1` (iframe `?demo=1`): anclas presentes; el evento lanza la
guia de la pagina (Agenda); anillo envuelve la pestana Agenda (top/left/width correctos) sobre capa
no bloqueante; "Siguiente" encadena al paso "Aqui me tienes siempre"; "Entendido" cierra y retira la
capa; rama movil (hoja inferior <768) y escritorio (burbuja 320px, iframe ensanchado a 1200px);
boton del panel presente; sin errores de consola. Screenshot adjunto en la sesion.

**Checklist:** [x] tsc  [x] build  [x] E2E demo  [x] manuales+iaCatalogo  [x] specs landing
[ ] commit+push (a continuacion)  [x] S16 marcada
