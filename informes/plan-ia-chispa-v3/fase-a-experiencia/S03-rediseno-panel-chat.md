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
HECHA (9 jul 2026). Commit `feat(chispa): S03 V3 - rediseno panel + chat (quien habla, identidad, onboarding sin ambiguedad)`.

**Qué se construyó (elevando lo existente, sin romper el contrato de bloques):**
- **Quién habla:** `Mensaje` gana `ts` (sellado al crear). Render agrupado por autor: cabecera
  con nombre (`Chispa` / nombre corto del usuario, hilo desde `ChispaLauncher`) + hora por turno;
  avatar de Chispa solo en el primero del grupo; separación de 14px entre turnos vs 4px dentro del
  grupo; radio de burbuja distinto en mensajes agrupados. La distinción acción/propuesta vs texto ya
  la daba `BloqueRenderer` (tarjeta con botones vs burbuja), se conserva.
- **Identidad/logo:** cabecera con avatar animado + `Chispa` (peso 800) + punto de estado "en línea"
  con glow (pulso `chispaStatusPulse`, respeta reduced-motion) + "IA de tu salón".
- **Animaciones:** se conservan entradas de mensaje/typing/drawer; añadido typing indicator con
  cabecera "Chispa", pulso del punto de estado y transición de ancho al entrar/salir de pantalla
  completa (desktop). Todo bajo `prefers-reduced-motion`.
- **Conflicto onboarding-vs-chat (definido, sin ambigüedad):** durante `configGuiada` el chat libre
  se **pausa a propósito**; un **banner siempre visible** ("Configuración guiada en curso" +
  "Saltar paso" / "Salir") declara el estado y da las dos salidas; al terminar o salir el chat se
  **reanuda**. Sustituye a los enlaces subrayados finos (estado antes poco visible).
- Limpieza: emojis fuera de UI (👋 y 📸), `BIENVENIDA` muerto eliminado.

**Verificado E2E** en `/demo.html?share=1` (iframe `?demo=1`), **móvil (375) y escritorio**:
cabecera con identidad + punto de estado; turno de usuario "Demo · HH:MM" y de Chispa "Chispa · HH:MM"
con separación clara; banner de config guiada con input pausado y botones Saltar/Salir; "Salir"
reanuda el chat (input habilitado, placeholder restaurado); móvil sin overflow ni aplastes; consola
sin errores. `tsc` limpio (sólo ruido pre-existente de `scripts/tts-test` y `supabase/functions`) +
`build:web` OK. Manuales (`lib/manuals/chispa.ts`), `lib/iaCatalogo.ts` y specs
(`web/especificaciones.html`) actualizados. Sesión de cliente: no toca edge, no aplica desplegar.

Checklist: `[x] tsc  [x] build  [x] E2E demo (móvil+escritorio)  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S03 marcada`
