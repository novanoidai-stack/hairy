# 🎙️ GUION DE LOCUCIÓN v2 — MECHA · B2B · 1:28

Guion exacto implementado en `MECHA_motion_video.html`. Úsalo tal cual si grabas la voz con un locutor profesional o con ElevenLabs (recomendado: voz femenina española, tono cercano-profesional, ritmo medio).

**Audiencia:** propietario/a de salón que decide la compra.
**Ángulo:** dolor operativo concreto → producto → dinero recuperado → por qué no Booksy/Fresha → CTA.

---

## Tabla de tiempos

| # | Escena | In | Out | Dur | Locución |
|---|--------|----|-----|-----|----------|
| 1 | El problema | 0:00 | 0:09 | 9s | "Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, y el teléfono no para de sonar." |
| 2 | El coste | 0:09 | 0:18 | 9s | "Cada llamada que no coges es una cita que no entra. Cada plantón, una hora de sillón que ya has pagado." |
| 3 | Reveal Mecha | 0:18 | 0:25 | 7s | "Esto es Mecha. El software que gestiona tu salón mientras tú trabajas." |
| 4 | Agente IA | 0:25 | 0:38 | 13s | "Una recepcionista con inteligencia artificial contesta tu WhatsApp. Responde precios, agenda, cambia y confirma citas. Sola, veinticuatro horas al día." |
| 5 | Verticalidad | 0:38 | 0:51 | 13s | "Y no es una agenda genérica: Mecha entiende la química. Fase activa, tiempo de reposo, y el sillón libre que ningún otro software vio. Más la ficha de color de cada clienta." |
| 6 | Cero plantones | 0:51 | 1:02 | 11s | "Tu clienta reserva en un clic desde el portal y deja la señal. Los plantones caen más de un ochenta por ciento." |
| 7 | Resultados | 1:02 | 1:12 | 10s | "El resultado: quince horas libres cada semana, un veinticinco por ciento más de sillón ocupado, y una agenda que se llena sola." |
| 8 | Vs. competencia | 1:12 | 1:20 | 8s | "Booksy y Fresha sirven igual para uñas, masajes o tatuajes. Mecha solo entiende de pelo. Por eso ve lo que ellos no ven." |
| 9 | CTA | 1:20 | 1:28 | 8s | "Mecha. Entra en mechaa punto es, y pruébalo gratis." |

Ritmo medio: **2,0 palabras/segundo** — cómodo, sin atropellar.

---

## Notas de dirección

- **Escena 1–2:** tono bajo, casi confidencial. El espectador se tiene que reconocer. No vender todavía.
- **Escena 3:** golpe seco de graves + silencio de medio segundo antes del nombre. Es el giro del vídeo.
- **Escena 4–5:** tono más rápido y luminoso, demostrativo.
- **Escena 6–7:** aquí está el dinero. Marcar los números con pausa antes de cada cifra.
- **Escena 8:** frase corta, seca, con seguridad. No sonar defensivo.
- **Escena 9:** cálido y directo. Deletrear la URL con claridad: "meCHAa punto es".

---

## Cifras usadas (revísalas antes de publicar)

Las de escena 2 son **una estimación ilustrativa**, no un dato tuyo:

- 9 llamadas sin coger/día · 3 plantones/semana · 420 €/semana (21.840 €/año)

Si tienes datos reales de un salón piloto, sustitúyelos: un número real y citado convierte mucho más que uno redondo. Las de escena 6 y 7 (+15 h, −80 %, +25 %) vienen de tu `README_MOTION_DESIGN.md`; si no tienes aún cohorte que las respalde, conviene rotularlas como "objetivo" o "según salones piloto" para no exponerte en publicidad comparativa.

**Aviso sobre la escena 8:** citas a Booksy y Fresha por nombre. La publicidad comparativa es legal en España y la UE si cada afirmación es veraz, verificable y sobre características esenciales (Ley 3/1991 de Competencia Desleal, art. 10). Asegúrate de poder documentar cada fila de la tabla con sus términos publicados vigentes, o cambia los nombres por "las agendas genéricas".

---

## Trazabilidad de la tabla comparativa (escena 8)

Cada fila viene de tus propios informes. Antes de publicar, **revalida** contra las páginas de producto vigentes de Booksy y Fresha, porque los datos son de junio–julio de 2026.

| Fila | Fuente en el repo |
|---|---|
| Fases de tinte y tiempo de reposo | `informes/ANALISIS_COMPARATIVO_MECHA.md` §1 — "Fases activa/espera: ❌ Booksy, ❌ Fresha, ✅ Mecha" |
| Ficha técnica de color | idem §2 — "Mecha único" |
| Sensibilidades de cuero cabelludo | idem §2 — "Mecha gana (específico sector)" |
| Perfil de riesgo de clienta | idem §2 — "Mecha único" |
| Agente de WhatsApp incluido (vs. add-on / básico) | `informes/DIFERENCIADORES-IA-MECHA.md` — "Fresha: IA solo como add-on de pago (AI Concierge). Booksy: chatbot básico" (verificado 4 jul 2026) |

---

## Claims retirados en esta versión (y por qué)

- **Voz IA que atiende el teléfono.** No hay ninguna referencia a Retell ni Zadarma en `app/`, `lib/`, `components/`, `supabase/` ni `migrations/`. `CLAUDE.md` lo tiene como pendiente #5, "se deja para el final". La escena 4 se quedó solo con WhatsApp, que sí está hecho y validado E2E.
- **Dictado de fórmulas sin quitarse los guantes.** Retirado del producto en el commit `43125fd77` (1 ago 2026, "…y eliminar dictado por voz"). En `clientes.web.tsx` quedó `iniciarEscucha` declarado sin usar y la edge function `color-formula-parser` sigue desplegada pero sin UI que la invoque. La escena 5 muestra ahora la ficha de color sin mencionar voz.
- **"Te cobran comisión por tu propia clienta".** El `ANALISIS_COMPARATIVO` documenta comisión de pasarela (Booksy 2,49–2,69 %) y el Boost de marketplace (30 % de la primera visita), no una comisión sobre tu clientela propia. Se cambió por el ángulo de verticalidad, que sí es defendible al 100 %.

## Lo que el vídeo aún NO cuenta y podrías añadir

Está desplegado en `supabase/functions/` pero fuera del guion: `migracion-magica` (cambiarse desde Booksy/Fresha — según tu `DIFERENCIADORES-IA-MECHA.md` es *la* barrera de venta y nadie lo ofrece), `try-on-color`, `traductor-marcas`, `chispa-vision-corte`, `chispa-vision-instagram`, `agenda-asistente`, `terminal-cobro-intent` y `redsys-notificacion`, más el directorio de salones (`f704e9710`).
