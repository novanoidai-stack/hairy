# GUION_CHISPA v4 — Vídeo de producto Mecha (motion 3D, 7 escenas)

- **Fecha:** 2026-08-06
- **Sustituye a:** `GUION_CHISPA_v3.md` (10 escenas / 1:41, con Marketplace y cifras sin piloto).
- **Voz:** edge-tts `es-ES-XimenaNeural` (`generar_voz_v4.py` → `voz/chispa_01..07.wav`).
- **Duración total:** 71.1 s (voz 69.0 s). Cada escena `d` ≥ duración de su WAV con ~0.3 s de margen.
- **Concepto:** *"Mecha funciona solo. Tú solo cortas."* Oner; la cámara viaja sin cortes siguiendo al orbe Chispa; enseña el software real.

## Integridad de claims (obligatorio)
- **Sin Marketplace** (no existe). **Sin cifras sin piloto** (+34%, 15 h, 20%…). **VeriFactu = "preparada"**.
- **Comparativa S6 IMPLÍCITA** ("agendas genéricas", sin nombrar Booksy/Fresha).
- Precio real (CLAUDE.md, 3 ago 2026): Esencial **39 €/mes**, 1 mes gratis, sin tarjeta, sin permanencia, 0 % comisiones.

## Escenas (índice → in–out → dur → visual 3D → locución → captions → SFX)

| # | Escena | In–Out | d (s) | Visual 3D (asset) | Locución (voz) | Captions cinéticos | SFX (beat local) |
|---|---|---|---|---|---|---|---|
| 1 | El dolor | 0:00–0:10.6 | 10.6 | Móvil 3D sonando (temblor) + 3 notificaciones apiladas; wallpaper "11:40". | "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer." | WhatsApp (0.5) · 3 mensajes (2.2) | whoosh .1 · ring 1.0 · pop 2.4 · alert 4.2 |
| 2 | Chispa se presenta | 0:10.6–0:19.3 | 8.7 | Orbe Chispa se enciende (bloom); **overlay DOM** "Hola, soy Chispa". | "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo es que eso no te vuelva a pasar." | _(overlay hero, sin caption)_ | boom .05 · chime .4 · pop 1.8 |
| 3 | Gestión vertical de pelo | 0:19.3–0:29.2 | 9.9 | Portátil 3D con la **agenda real** (`agenda_full_clean.png`); fase activa/reposo/hueco. | "Mecha no es otra agenda bonita. Entiende tu oficio: fase activa, tiempo de reposo, y el hueco que recuperas mientras el color trabaja." | Fase activa (1.0) · Reposo (3.4) · Hueco recuperado (6.0) | whoosh .1 · click 1.0 · ok 3.4 · pop 6.0 |
| 4 | Chispa 24/7 (WA + voz + señal) | 0:29.2–0:38.7 | 9.5 | Móvil 3D con **chat animado** (burbujas por beats) + **moneda señal** cae a local≥4.0. | "El WhatsApp y el teléfono los llevo yo. De día y de noche: doy precios, confirmo la cita, cobro la señal… y tú sigues cortando." | WhatsApp (.6) · Señal cobrada (4.0) | whoosh .1 · ring .6 · coin 4.0 · ok 5.4 · chime 7.0 |
| 5 | Portal + señal → cero plantones | 0:38.7–0:45.8 | 7.1 | Móvil 3D con el **portal real** (`portal_mobile_clean.png`, de `/app/r/demo`) + chip verde "señal". | "Tu clienta reserva desde el portal en un clic y deja la señal. Ahí se acaban los plantones." | Portal (.6) · Señal (3.0) | whoosh .1 · coin 1.4 · ok 3.0 |
| 6 | Por qué no las genéricas + precio | 0:45.8–1:02.7 | 16.9 | **Overlay DOM** tabla "Mecha vs genéricas" (ficha de color · fases de tinte · IA incluida) + "desde 39 €/mes · sin comisiones · 1 mes gratis · sin permanencia". | "¿Y las agendas genéricas? Sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y la IA te la cobran aparte. Mecha es cien por cien pelo, desde treinta y nueve euros al mes, sin comisiones." | _(overlay hero, sin caption)_ | whoosh .1 · click 1.2 · ok 8.0 · chime 12.5 |
| 7 | CTA | 1:02.7–1:11.1 | 8.4 | **Overlay DOM** wordmark **Mecha** + `mechaa.es` + píldora "Pruébalo gratis"; orbe pulsa. | "El resultado: tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis… y hablamos." | _(overlay hero, sin caption)_ | boom .05 · whoosh .1 · chime 2.0 · pop 4.0 |

## Trazabilidad de claims
- "Fase activa / reposo / hueco" → Documento Modular 1 (agenda vertical de pelo); visible en la captura real de la agenda (S3).
- "WhatsApp + teléfono por IA", "señal Stripe", "portal público", "lista de espera" → features reales (mega informe §IA/mensajería/pagos).
- "39 €/mes, sin comisiones, 1 mes gratis, sin permanencia" → `lib/planes.ts` + `#precios` de la landing (CLAUDE.md 3 ago 2026).
- Comparativa "genéricas no tienen ficha de color / fases de tinte / IA aparte" → posicionamiento de verticalización (veraz y verificable; sin nombrar marcas).
