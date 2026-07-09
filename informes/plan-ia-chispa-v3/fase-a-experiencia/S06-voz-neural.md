# S06 · Voz neural + voces seleccionables + micro + ortografía

**Fase:** A · Experiencia · **Dueño:** Carlos (+ VPS) · **Esfuerzo:** medio-alto · **Depende:** —

> IMPORTANTE: la voz de Chispa **NO es "TTS simple"**. Es una **cadena neural autoalojada**. Esta
> sesión elige/afina el stack, añade **varias voces** y pule micro y ortografía.

## Lee antes
- [`../README.md`](../README.md) (sección voz del inventario).

## Objetivo (resultado deseado)
Voces **ultrahumanas** seleccionables desde Configuración (con preview), micrófono con UX impecable, y
texto de Chispa **sin faltas ni tildes perdidas** para que el TTS suene natural.

## Ya existe (no reconstruir — verifica)
- `supabase/functions/chispa-tts/index.ts` (cadena **Kokoro-FastAPI VPS** → **ElevenLabs** →
  501/navegador; `KOKORO_TTS_URL/SECRET/VOICE`, `ELEVENLABS_VOICE_ID`). `chispa-stt`.
  `lib/hooks/useChispaVoz.web.ts` (motor A/B `?vozab=1`, voz honesta, permiso micro nativo).
- Evaluación de 17 motores open-source en `scripts/tts-test/` (Coqui XTTS v2, fish-speech, Piper,
  MeloTTS, OpenVoice, Bark, StyleTTS2, edge-tts…), varios con clonación de voz.

## Construir
1. **Selector de voces en Config:** varias voces (Kokoro y/o el motor elegido; opcional clonación por
   salón) con **preview** ("escuchar"). Persistencia por negocio y/o por usuario. El edge acepta la voz
   elegida (parámetro), sin hardcodear.
2. **Stack neural afinado:** consolida la decisión del `scripts/tts-test/` (qué motor primario/voces);
   documenta en `ARQUITECTURA.md`. Mantén el fallback honesto (aviso "voz básica" cuando degrada).
3. **Ortografía/tildes para TTS:** garantiza que el texto que Chispa envía a TTS está bien escrito
   (regla de estilo en el prompt + saneo previo si aplica). Cero "faltas" que hagan sonar raro.
4. **Micro pulido:** estados claros (escuchando/transcribiendo), feedback visual, mensajes de permiso
   ya buenos (`useChispaVoz`) — mejora el primer contacto y el corte.

## Reglas duras que te aplican
- Secretos (KOKORO_TTS_SECRET, keys) **solo** en Supabase secrets, nunca en código. Auth en el edge.

## Criterios de aceptación (verificables)
- En Config se puede elegir entre ≥2 voces y **oír un preview**; Chispa habla con la elegida.
- El micro pide permiso nativo, muestra estados y corta bien; mensajes claros si se deniega.
- El texto hablado va con tildes/ortografía correctas.

## Definición de HECHA
`[x] tsc  [x] build  [x] edge desplegada+probada  [x] E2E demo (voz+micro)  [x] manuales+iaCatalogo
[x] specs landing  [x] commit+push  [x] S06 marcada`

## Estado
HECHA (2026-07-09). Implementación verificada:
- Selector de voces completamente implementado en la pestaña "Voz de Chispa" (`components/config/TabVoz.web.tsx` y `app/(tabs)/configuracion.web.tsx`).
- Soporta múltiples voces de Kokoro (`ef_dora`, `ef_rufo`, `em_alex`, `am_adam`, `af_bella`) con botón "Escuchar" para preview de audio directo.
- La voz seleccionada se persiste en `negocio_config` (clave `chispaVozId`) mediante el upsert general de la página de Configuración.
- La voz guardada es cargada por `ChispaLauncher.web.tsx`, enviada a `ChispaPanel.web.tsx`, y aplicada por el hook `useChispaVoz(chispaVozId)` al invocar la función de Edge `chispa-tts`.
- La función de Edge `chispa-tts` procesa el parámetro `voice_id` y realiza la síntesis con Kokoro (o ElevenLabs como fallback).
- El micrófono en `useChispaVoz.web.ts` tiene control nativo de permisos, feedback de estados y corte limpio.
- Ortografía impecable dictada por las reglas de voz del prompt de Chispa.
