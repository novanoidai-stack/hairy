# SPEC — Vídeo de producto Mecha v3 (Motion Design 3D)

- **Fecha:** 2026-08-04
- **Autor:** Carlos + Claude
- **Estado:** Aprobado (pendiente de revisión final del spec antes de construir)
- **Sustituye a:** `MECHA_motion_v2.html` (v2 se conserva intacto como backup)
- **Entregable:** `MECHA_motion_v3.html` (HTML autocontenido, Three.js/WebGL) + WAVs regenerados + QA

---

## 1. Contexto y problema

El vídeo actual (`MECHA_motion_v2.html`, 10 escenas / 1:41) no cumple el objetivo de
"motion design ultra-profesional para enseñar el producto y convencer a un dueño de salón".
Diagnóstico concreto:

1. **No enseña ni una pantalla real del software.** Todo son emojis (📅⏱📦🎨🛡️📊) y barritas
   CSS. Las 12 capturas de `capturas_recortadas/` no se usan.
2. **No hay 3D real**, solo CSS `perspective`+`translateZ` (2.5D falso).
3. **Corta en seco** (flash blanco + corte duro), sin fluidez ni conexión entre temas.
4. **Demasiado largo** (1:41; techo 1:30). Escenas débiles: S5 (ROI), S7 (Marketplace).
5. **Timing suelto:** SFX por temporizador, no anclados a beats de animación.
6. **Pinta a "explainer genérico de IA"** (4 bolitas + chips numerados).
7. **Claims frágiles:** "+34% rentabilidad", "15 h", "20% comisión" sin respaldo de piloto;
   escena Marketplace anuncia una feature que **no existe** (CLAUDE.md: "No hacer aún").

## 2. Meta y no-metas

**Meta:** un vídeo de producto de Mecha de ≤90s (objetivo ~85s), en HTML/WebGL con 3D real,
que **enseña el software de verdad**, con cámara continua (oner), voz hiperrealista y SFX,
capaz de convencer a un dueño de salón de elegir Mecha antes que Booksy/Fresha. Servible en
la landing (interactivo) y grabable a MP4 para redes.

**No-metas (fuera de este vídeo):**
- Marketplace (no existe; no se anuncia).
- App nativa del cliente final, inventario, contabilidad, precios dinámicos.
- Renderizar en After Effects/Blender (medio elegido: HTML/WebGL construido por Claude).

## 3. Decisiones cerradas

| Decisión | Valor |
|---|---|
| Medio | HTML autocontenido + Three.js (WebGL). CDN vía importmap. |
| Look | Oscuro premium `#070A14`, marca fuego `#F4501E`/`#C0260A`, brasas. Estilo Apple/Linear. |
| Estructura visual | **Oner:** cámara continua sobre spline, sin cortes duros. Hilo conductor = orbe Chispa. |
| Capturas | Las necesarias de `capturas_recortadas/` (mapping autoritativo en §5) como texturas sobre dispositivos 3D. |
| Guion | Re-cortado a **7 escenas / ~85s**. Sale Marketplace y cifras sin respaldo. |
| Voz | Regenerar `voz/chispa_01..07.wav` con TTS existente contra el guion nuevo. |

## 4. Concepto

**"Mecha funciona solo. Tú solo cortas."** Un *oner*: la cámara viaja sin cortes por la semana
de un dueño de salón mientras **vemos el software real** manejándolo todo. El orbe de fuego
**Chispa** es el hilo que la cámara sigue de escena en escena (resuelve la petición de fluidez
y conexión entre temas). Entre escenas la cámara vuela y un elemento se transforma en el
siguiente (teléfono que suena → WhatsApp; pantalla de agenda → portal público).

## 5. Guión — 7 escenas / ~85s

Primera persona de Chispa, tono conversacional con muletillas (estilo guion v3 que gustaba).
Marcas extranjeras reescritas fonéticamente al generar voz (Fresha/Booksy/WhatsApp).

| # | Escena | In–Out | Dur | Cámara | Visual 3D (asset real) | Locución |
|---|--------|--------|-----|--------|------------------------|----------|
| 1 | El dolor | 0:00–0:10 | 10s | dolly in | Móvil 3D sonando + notificaciones apilándose; caos. | "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer." |
| 2 | Chispa se presenta | 0:10–0:21 | 11s | dolly out | Orbe de fuego se enciende (bloom); wordmark 3D "Hola. Soy Chispa". | "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo es que eso no te vuelva a pasar." |
| 3 | Gestión vertical de pelo | 0:21–0:34 | 13s | vuelo hacia dentro | Portátil 3D con `01_agenda_semanal_completa` → fase activa + reposo rayado; zoom a `06_ficha_tecnica_tinte_formula`. | "Mecha no es otra agenda bonita. Entiende tu oficio: fase activa, tiempo de reposo, y el hueco que recuperas mientras el color trabaja." |
| 4 | Chispa 24/7 (WA + voz) | 0:34–0:48 | 14s | órbita al móvil | Móvil 3D con `08_portal_reserva_mobile`; chat WhatsApp animado sincronizado a la voz; moneda señal Stripe cae. | "El WhatsApp y el teléfono los llevo yo. De día y de noche: doy precios, confirmo la cita, cobro la señal… y tú sigues cortando." |
| 5 | Portal + señal → cero plantones | 0:48–0:59 | 11s | pan al desktop | Portal 3D `12_portal_reserva_desktop`; clienta reserva en un clic. | "Tu clienta reserva desde el portal en un clic y deja la señal. Ahí se acaban los plantones." |
| 6 | Por qué no las genéricas + precio | 0:59–1:13 | 14s | dolly in | Tabla comparativa 3D sutil Mecha vs "agendas genéricas"; cierre "39 €/mes, sin comisiones". | "¿Y las agendas genéricas? Sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y la IA te la cobran aparte. Mecha es cien por cien pelo, desde treinta y nueve euros al mes, sin comisiones." |
| 7 | CTA | 1:13–1:25 | 12s | dolly out | Wordmark **Mecha** 3D; orbe pulsa; URL `mechaa.es`. | "El resultado: tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis… y hablamos." |

**Salen vs v2:** Marketplace, suite de emojis, "+34%", "15 h", "20% comisión", escena
"antes/después", escena ROI "1 cita". Resultado: 10 escenas/1:41 → 7 escenas/~85s.

## 6. Integridad de claims (obligatorio)

- **Sin Marketplace.** No existe como feature.
- **Sin cifras sin piloto** ("+34% rentabilidad", "15 h/semana", "20% comisión",
  "−3.640 €/año"). Si se cita alguna cifra, rotularla como "objetivo" o sustituir por dato real
  cuando exista cohorte de salones.
- **VeriFactu siempre "preparada"**, nunca "certificada" ni "cumplimos".
- **Comparativa S6 implícita** ("agendas genéricas", sin nombrar Booksy/Fresha). Nombrarlos
  es **decisión de Jose/legal**: la publicidad comparativa es legal siendo veraz y verificable
  (Ley 3/1991 art. 10), pero para redes es más seguro lo implícito.
- Cualquier afirmación debe poder trazarse a un respaldo (ver tabla de trazabilidad del
  `GUION_CHISPA_v3.md`).

## 7. Arquitectura técnica

- **Archivo nuevo** `MECHA_motion_v3.html` (v2 intacto). Three.js vía CDN (importmap),
  un solo archivo autocontenido.
- **Cámara sobre spline CatmullRom:** posición/rotación derivadas del `elapsed` global → la
  cámara siempre viaja; las escenas son puntos del recorrido, no cortes.
- **Capturas como texturas** (`TextureLoader`) sobre mallas de móvil/portátil modelados en 3D
  (`BoxGeometry` redondeada; captura en la pantalla).
  ⚠️ `file://` falla por CORS al cargar texturas → **servir por http** (ya lo hace `qa_video.py`).
- **Postproceso:** `UnrealBloomPass` para orbe/brasas. Embers como `Points`.
- **Tipografía híbrida:** wordmarks hero ("Mecha", "Chispa") en 3D; subtítulos y captions
  cinéticos en capa DOM por encima (más nítido y barato).
- **Audio:** reusar sintetizador SFX WebAudio del v2, pero **anclado a beats de cámara/escena**
  (no timer); música ambiente; voz WAV por escena (regenerada).
- **Motor de timing:** mantener modelo elapsed + timeline de escenas; la posición de cámara
  sale del elapsed por el spline; SFX disparan en beats locales de escena.
- **Rendimiento:** `pixelRatio` capado, geometrías reutilizadas, texturas ≤2K. Meta 60 fps @
  1080p para captura MP4.
- **HUD/controles:** mantener play/pausa, seek, subtítulos, toggles de voz/SFX, fullscreen,
  cover de inicio.

## 8. Plan de voz

- Nuevo array de texto (7 líneas) en el script TTS, manteniendo diccionario de pronunciación
  (`PRONUNCIACION`: Fresha→"Frecha", Booksy→"Buksi", WhatsApp→"guasap(s)").
- Regenerar `voz/chispa_01..07.wav` con `generar_voz_v5_fluida.py` (motor por defecto kokoro).
- Dirección de voz intacta: femenina, cercana, ritmo de conversación real, muletillas y "…"
  como pausas respiradas.
- **Aviso honesto (limitación):** el TTS da paridad con la voz actual. El salto a "humana
  hiperrealista" real requiere clonación (F5/Fish, probado con Ximena) o voz humana. No bloquea
  el build; se puede iterar después sin tocar el vídeo.

## 9. QA y exportación

- Actualizar `qa_video.py` a 7 escenas; capturar `qa/escena_01..07.png`; avisar de imágenes
  rotas, overflows y errores de consola.
- **MP4 para redes:** grabar el HTML reproduciéndose (OBS, o headless Chrome tipo puppeteer +
  capture). No es código que Claude escribe; se documenta el flujo.
- La demo interactiva y el MP4 comparten el mismo `MECHA_motion_v3.html`.

## 10. Orden de construcción

1. **Spike visual de UN frame** (portátil 3D con la captura + orbe Chispa + bloom + brasas,
   fondo `#070A14`). **Gate de aprobación del look antes de seguir.**
2. Esqueleto: renderer + cámara sobre spline + motor de timing + audio base.
3. Escena por escena (S1→S7), con su captura y su WAV.
4. Transiciones/continuidad (transformaciones entre escenas, viaje del orbe).
5. Tipografía cinética y wordmarks 3D.
6. Pulido de SFX anclados a beats, música, HUD.
7. QA (`qa_video.py`) + ajuste de duraciones para cuadrar voz ≤ escena.
8. Documentación: GUION v4, README actualizado.

## 11. Decisiones abiertas

- **S6 — nombrar o no Booksy/Fresha.** Por defecto implícito. Confirmar con Jose.
- **Voz:** TTS (rápido, paridad) vs clonación/humana (calidad, más trabajo). Por defecto TTS.

## 12. Archivos

| Acción | Archivo |
|---|---|
| Crear | `MECHA_motion_v3.html` (build) |
| Crear | `voz/chispa_01..07.wav` (regenerados) |
| Editar/crear | script TTS con guion v4 (p.ej. `generar_voz_v4.py` o editar `generar_voz_v5_fluida.py`) |
| Editar | `qa_video.py` (7 escenas) |
| Crear | `GUION_CHISPA_v4.md` |
| Conservar | `MECHA_motion_v2.html` (backup, no tocar) |
