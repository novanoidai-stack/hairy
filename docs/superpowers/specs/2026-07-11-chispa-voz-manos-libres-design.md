# Chispa: voz manos libres (animación + auto-envío real + modo conversación + "Hola Mecha") — Diseño

> 2026-07-11 · Carlos + Claude (Sonnet 5). Aprobado en sesión ("me encaja, haz el plan y procede
> automáticamente"). 100% cliente (Expo/RN web), sin cambios de edge ni de BD. Solo Carlos.

## Diagnóstico (código real, no supuesto)

`lib/hooks/useChispaVoz.web.ts` ya tiene una máquina de estados
(`inactivo|escuchando|transcribiendo|hablando`) que `ChispaPanel.web.tsx` usa para pintar el botón
del micro — pero solo cambia borde/fondo a rojo y un texto debajo; sin animación real.

El bug de fondo del "auto-envío raro": el motor nativo (`SpeechRecognition`) usa
`continuous: false, interimResults: false`. En ese modo, el propio navegador decide cuándo
termina la frase con su *endpointing* interno (corto, ~1-2s, NO configurable) y dispara
`onresult` una sola vez con lo que haya pillado hasta ahí; `manejarClicMicro` en
`ChispaPanel.web.tsx:965` ya llama `enviarMensaje` inmediatamente en ese callback (el "auto-envío"
ya existía). El problema no es que falte auto-envío: es que dispara demasiado pronto, en la
primera pausa corta (p.ej. pensando), no en una pausa real de "he terminado". Eso explica el
"hola hola hola hala" del ejemplo: varias re-aperturas cortas concatenadas.

## 1. Indicador visual real (audio-reactivo)

- Nuevo: `voz.nivelAudio` (0–1), medido con Web Audio (`AudioContext` + `AnalyserNode`) sobre el
  MISMO `MediaStream` que ya se pide con `getUserMedia` en `iniciarEscucha`. Se added SIN afectar
  al motor nativo (que gestiona su propio audio internamente): abrimos un stream **paralelo** solo
  para medir volumen mientras se escucha (se cierra al parar). Throttle a ~15fps con
  `requestAnimationFrame` (no re-render de React por cada frame: se guarda en un ref y se anima por
  CSS custom property, no por estado).
- `ChispaPanel.web.tsx`: el botón de micro pasa a tener un anillo (`box-shadow`/`transform: scale`)
  que reacciona a `nivelAudio` durante `escuchando`, con una animación base tipo "respirar" cuando
  el nivel es bajo (silencio) para que nunca se vea estático. Mismos tokens de motion
  (`cubic-bezier(0.16,1,0.3,1)`), `prefers-reduced-motion` respetado (ya hay un media query en
  `PANEL_STYLES`, se añade ahí).
- Transcripción parcial en vivo: nuevo `voz.transcripcionParcial` (interim) se muestra en el área
  de estado bajo el input (donde hoy dice "Escuchando... habla ahora"), reemplazándolo por el texto
  real que se va reconociendo.
- Durante `hablando`: un pulso sutil en el avatar/mascota de Chispa en la cabecera (reutiliza el
  patrón `chispa-status-dot`/`chispaStatusPulse` ya existente, con otro color/timing).

## 2. Auto-envío por silencio real (fix del bug)

- Motor nativo: `continuous: true, interimResults: true`. Ya no depende del corte corto del
  navegador — con `continuous:true` Chrome NO auto-termina en cada pausa; sigue escuchando hasta
  que se llama `.stop()`.
- Nuevo temporizador propio en el hook: cada `onresult` (interim o final) con texto nuevo resetea
  un `setTimeout` de `SILENCIO_ENVIO_MS = 4500`. Al cumplirse sin habla nueva, se llama
  `.stop()` y se entrega el texto acumulado (concatenación de los resultados `isFinal`) al callback
  — igual que hoy, pero con el trigger correcto.
- Techo de seguridad: si no llega NINGÚN resultado (silencio total) en `TIMEOUT_SIN_HABLA_MS =
  30000` desde que se empezó a escuchar, se para sola sin enviar nada (evita que el micro se quede
  abierto indefinidamente si nadie habla, sobre todo relevante para el modo conversación del punto 3).
- Forzar envío ya: tocar el botón de micro mientras escucha ya NO descarta lo oído (como hoy) —
  finaliza y envía de inmediato lo acumulado hasta ese momento (nueva función interna
  `finalizarEscucha()`, que el botón usa en vez de `detenerEscucha()`; `detenerEscucha()` se
  mantiene para cancelaciones reales como cerrar el panel).
- Fallback Safari/iPad (`MediaRecorder`): no tiene resultados intermedios de texto. Se reutiliza el
  MISMO `nivelAudio` (Web Audio) para decidir cuándo cortar la grabación: si el nivel baja de un
  umbral de ruido y se mantiene bajo `SILENCIO_ENVIO_MS`, se para sola y se manda a transcribir
  (antes había que soltar el botón a mano; con esto queda con el mismo comportamiento manos libres,
  aunque menos preciso que el basado en texto por ser solo amplitud).

## 3. Modo conversación (bucle de turnos)

- Nuevo toggle en el panel (junto al micro): "Conversación" (icono auriculares/bucle),
  persistido en `localStorage` (mismo patrón que `motorVoz`/`vozActiva`).
- Con el toggle ON: al terminar un turno (mensaje del usuario enviado → respuesta de Chispa
  añadida a `mensajes` → si `voz.vozActiva`, termina de hablar) el panel vuelve a llamar
  `iniciarEscucha` sola, sin nuevo clic. Implementación: un `useEffect` que vigila la transición
  `voz.estado: 'hablando' -> 'inactivo'` (si se habla la respuesta) y otro que vigila `cargando:
  true -> false` cuando `!voz.vozActiva` (no hay nada que escuchar primero). Nunca se re-arma
  mientras `voz.estado === 'hablando'` (evita que el micro capte la propia voz de Chispa por los
  altavoces — aunque `getUserMedia` ya pide cancelación de eco por defecto, no se confía solo en eso).
- Se para (sin apagar el toggle, solo la escucha activa) si: el panel se cierra, hay 2 errores de
  micro seguidos, o salta el techo de silencio total del punto 2. Apagar el toggle para de verdad.
- Nunca se activa el toggle a un modo "siempre escuchando sin que el usuario lo haya encendido":
  sigue naciendo de un gesto explícito (activar el toggle o tocar el micro una vez), coherente con
  el comentario ya existente en el código ("Chispa NUNCA escucha sola").

## 4. "Hola Mecha" (palabra de activación, alcance separado y explícito)

- Nuevo hook independiente `lib/hooks/useChispaWakeWord.web.ts`: instancia de reconocimiento
  PROPIA (distinta de la del panel), `continuous: true, interimResults: true`, siempre reiniciada
  sola en su `onend` mientras el toggle esté activo (con backoff si el error es `not-allowed`:
  para de reintentar y apaga el toggle, avisando una vez).
- Normaliza cada resultado (minúsculas, sin tildes) y busca las frases `"hola mecha"` / `"hola
  chispa"`. Al detectarla, dispara el MISMO evento global que ya usa el Hub IA para abrir el panel
  (`window.dispatchEvent(new CustomEvent('mecha-chispa-open'))`, patrón visto en
  `ChispaPanel.web.tsx:621`) — sin acoplar el hook al estado interno del panel. Si tras la frase de
  activación queda texto en la misma frase ("hola mecha, cuánto llevo hoy"), se pasa como primer
  mensaje via un evento/campo adicional; si no, simplemente abre el panel y activa modo escucha.
- Se pausa (sin apagar el toggle) cuando `document.visibilityState !== 'visible'` (pestaña en
  segundo plano) y se reanuda al volver, para no procesar audio innecesariamente.
- Gate de disponibilidad: solo se ofrece el toggle si `soportaReconocimientoNativo` (Chrome/Edge);
  en el resto se muestra "No disponible en este navegador" sin toggle activable.
- **Nunca en la demo compartida** (`IS_DEMO_MODE`/`demo_salon_001`): ni se monta el hook.
- Toggle en **Configuración > Voz** (`TabVoz.web.tsx`), por defecto **OFF**, con copy honesto:
  "Al activarla, este dispositivo escucha de forma continua para detectar 'Hola Mecha'. El audio lo
  procesa el reconocimiento de voz del navegador; Mecha no lo recibe ni lo guarda hasta que se
  detecta la frase y empieza una conversación normal." Preferencia por dispositivo (`localStorage`,
  igual que el resto de ajustes de voz), no por negocio.

## Fuera de alcance (YAGNI)

- Wake-word nativo/PWA en segundo plano fuera de la pestaña del navegador.
- Motores de detección de palabra offline de terceros (Picovoice/Porcupine u otros SDK de pago).
- Umbral de silencio configurable por el usuario (se deja fijo en 4.5s; ajustable en código si hace
  falta más adelante).

## Verificación

Sin edge/BD: `npx tsc --noEmit` + `npm run build:web`. Sin `any`. El micro real (audio de
verdad) NO se puede probar en el entorno de preview automatizado (sin hardware de audio,
`getUserMedia` deniega ahí) — se deja explícito que la prueba definitiva con micro real la hace
Carlos en su navegador. Lo que SÍ se verifica en preview: que los toggles nuevos
(Conversación / Hola Mecha) renderizan, persisten en localStorage, y que el gate de navegador
(`soportaReconocimientoNativo`) oculta el toggle de wake-word cuando corresponde.

## Estado

Implementado 2026-07-11. Tareas 1-4 (utilidades, eventos, `useChispaVoz` reescrito, hook
`useChispaWakeWord`) ya venían de una tanda anterior; esta sesión completó el cableado en la UI:
Tarea 5 (modo conversación + "Hola Mecha" en `ChispaPanel`), Tarea 6 (micrófono audio-reactivo +
transcripción en vivo + toggle "Conversación"), Tarea 7 (toggle "Hola Mecha" en Configuración >
Voz) y Tarea 8 (auto-conocimiento). Añadido fuera del plan original, por feedback del socio: botón
**"Nueva conversación"** (limpia el hilo en pantalla y el persistido) — un hilo que solo guarda
"hola" → saludo no aporta; y refinamiento del re-arme manos libres para que solo se reabra el micro
tras un turno HABLADO (no tras escribir), y para que "Hola Mecha" abra una conversación por voz
aunque el toggle de conversación esté apagado (`sesionVozRef`, se limpia al cerrar el panel).

Verificado: `tsc --noEmit` limpio + `npm run build:web` (exit 0) + `deno test` (9/9) + UI en preview
(demo iframe: botones renderizan, "Nueva conversación" aparece/limpia, toggle "Hola Mecha" persiste,
cero errores de consola). **Pendiente de prueba con micrófono real** (Carlos, navegador real): la
animación en vivo, el auto-envío por silencio de 4.5 s, el bucle de conversación y que "Hola Mecha"
oiga de verdad no se pueden verificar en el preview automatizado (sin hardware de audio).
