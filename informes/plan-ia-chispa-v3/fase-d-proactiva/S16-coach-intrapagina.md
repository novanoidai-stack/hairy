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
PENDIENTE.
