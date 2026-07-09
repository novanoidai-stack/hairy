# S03 · Rediseño del panel + chat de Chispa

**Fase:** A · Experiencia · **Dueño:** Carlos · **Esfuerzo:** alto · **Depende:** S01 (recomendado S02)

> El "se ve muy simplón" se ataca aquí: identidad, legibilidad de la conversación, animaciones y el
> conflicto onboarding-vs-chat.

## Lee antes
- [`../README.md`](../README.md). Carga skills `hairy-design-system` + `hairy-ui-craft`.
- Reglas: móvil primero, sin emojis en UI, tokens fuego, casi-nunca-texto-plano.

## Objetivo (resultado deseado)
Un panel/chat de nivel "gran tecnológica": identidad de Chispa clara, **se sabe quién habla en cada
momento** (nombre + separación/agrupación de mensajes + hora), animaciones cuidadas, y una regla clara
de qué pasa si el usuario escribe durante un flujo guiado.

## Ya existe (no reconstruir — verifica)
- `components/chispa/ChispaPanel.web.tsx` (drawer, `PANEL_STYLES`, tipo `Mensaje`, `BIENVENIDA`,
  fullscreen, bloqueo de input `bloqueado`/`configGuiada`). `BloqueRenderer.web.tsx`.
  `ChispaMascota.web.tsx` (avatar `chispa-avatar.png`, moods). `ChispaLauncher.web.tsx` (pestaña).

## Construir
1. **Identidad/logo:** cabecera del panel con la marca Chispa (avatar + nombre + estado "IA de tu
   salón"); pestaña/launcher acorde. Coherente con tokens fuego.
2. **Quién habla:** cada mensaje muestra **autor** (Chispa / nombre del usuario del equipo) + hora;
   **agrupación** de mensajes consecutivos del mismo autor y **separación** visual clara entre turnos
   (burbujas, alineación, avatar en el de Chispa). Diferenciar visualmente acción/propuesta de texto.
3. **Animaciones:** entrada de mensajes, typing indicator, transiciones del drawer/fullscreen; respeta
   `prefers-reduced-motion`. Nada que estorbe en móvil.
4. **Conflicto onboarding-vs-chat:** hoy el input se **bloquea** durante `configGuiada`. Rediseña a un
   modelo claro: permitir "pausar el flujo para preguntar algo" y **reanudar** (o, si se decide
   mantener el bloqueo, mostrar un aviso explícito con "salir/continuar" siempre visible). Define y
   documenta el comportamiento; sin estados ambiguos.

## Reglas duras que te aplican
- Móvil primero (grids con `minmax(0,1fr)`, `flexWrap`), sin emojis, sin `any`.

## Criterios de aceptación (verificables)
- En una conversación con varios turnos se distingue de un vistazo quién dijo qué y cuándo; mensajes
  consecutivos agrupados; separación clara entre turnos.
- El panel abre/cierra/expande con animación fluida; en móvil no hay overflow ni aplastes.
- Escribir durante el onboarding tiene un comportamiento definido y sin ambigüedad (verificado E2E).

## Definición de HECHA
`[ ] tsc  [ ] build  [ ] E2E demo (móvil+escritorio)  [ ] manuales+iaCatalogo  [ ] specs landing
[ ] commit+push  [ ] S03 marcada`

## Estado
PENDIENTE.
