# 🎙️ GUION v3 — CHISPA presenta Mecha · 1:55

Narrado **en primera persona por Chispa**, la IA de Mecha. Se presenta a sí misma y al producto.
Implementado en `MECHA_motion_v2.html`. Mismo texto en `generar_voz_chispa.py`.

**Dirección de voz:** femenina, cercana, ritmo de conversación real — no de anuncio. Las muletillas
(*a ver, ¿vale?, pues, mira, básicamente*) y los puntos suspensivos **están en el texto a propósito**:
los TTS buenos los convierten en pausas y respiraciones. No los quites.

---

## Tabla de escenas

| # | Escena | In | Out | Dur | Cámara | Locución |
|---|--------|----|-----|-----|--------|----------|
| 1 | El problema | 0:00 | 0:10 | 10s | dolly in | "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer." |
| 2 | Chispa se presenta | 0:10 | 0:21 | 11s | dolly out | "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo, básicamente, es que eso no te vuelva a pasar." |
| 3 | Gestión vertical | 0:21 | 0:33 | 12s | tilt | "Mecha no es otra agenda bonita, ¿vale? Es un sistema que entiende tu oficio. Fase activa, tiempo de reposo, y el hueco que queda libre mientras el color trabaja." |
| 4 | Automatización | 0:33 | 0:46 | 13s | pan izq. | "Y a partir de ahí, va solo. Confirmo la cita, mando el recordatorio, cobro la señal, pido la reseña… y aviso a la lista de espera cuando alguien cancela." |
| 5 | El WhatsApp lo llevo yo | 0:46 | 0:58 | 12s | órbita | "El WhatsApp lo llevo yo. Precios, huecos, cambios, cancelaciones… a las once de la noche o un domingo. Tú sigues cortando." |
| 6 | Portal + señal | 0:58 | 1:09 | 11s | pan der. | "Tu clienta reserva desde el portal en un clic, y deja la señal. Mira, eso solo ya te quita la mayoría de los plantones." |
| 7 | Dónde se quedan cortas | 1:09 | 1:22 | 13s | dolly in | "¿Y Booksy o Fresha? Pues sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y su inteligencia artificial o es un chat básico, o te la cobran aparte." |
| 8 | Un solo pago + VeriFactu | 1:22 | 1:35 | 13s | dolly out | "Aquí es distinto: desde 39 euros al mes, sin comisiones por cita, con los profesionales y conmigo incluidos. Y preparada para VeriFactu, si tu gestoría te la pide." |
| 9 | Resultados | 1:35 | 1:45 | 10s | tilt | "¿El resultado? Unas quince horas libres a la semana, más sillón ocupado, y una agenda que se llena sola." |
| 10 | CTA | 1:45 | 1:55 | 10s | dolly in | "Soy Chispa. Entra en mechaa punto es, pruébalo gratis… y hablamos." |

---

## Cómo generar la voz de Chispa

El HTML busca `voz/chispa_01.wav` … `voz/chispa_10.wav` al abrirse. Si están, los usa; si no,
cae a la voz del navegador. Arriba a la derecha te dice cuál está usando.

```bash
# opción rápida, sin GPU ni configuración (Kokoro-82M, Apache 2.0)
pip install kokoro soundfile
python generar_voz_chispa.py --motor kokoro

# opción buena: clonar una voz concreta para Chispa (F5-TTS, MIT)
# graba 5-10 s de la voz que quieras -> referencia.wav
pip install f5-tts
python generar_voz_chispa.py --motor f5 --referencia referencia.wav \
    --texto-referencia "lo que dice exactamente ese audio" --modelo jpgallegoar/F5-Spanish

# opción máximo realismo, respira y hace micro-pausas (Fish-Speech, necesita GPU)
python generar_voz_chispa.py --motor fish --referencia referencia.wav
```

El script avisa si alguna línea dura más que su escena y te dice cómo cuadrarla
(`--velocidad 1.08`, o alargar esa escena en el array `SCENES` del HTML).

**Marcas extranjeras:** el texto de las líneas no se toca, pero antes de mandarlo al TTS se
reescriben fonéticamente (`PRONUNCIACION` en `generar_voz_chispa.py`). Un TTS español lee *Fresha*
como "fresa" y *Booksy* como "bo-óksi"; se le pasan "Frecha", "Buksi" y "guasap(s)". Si añades una
marca nueva al guion, añádela también a ese diccionario.

**QA del vídeo:** `python qa_video.py` sirve el pack por http, recorre las 10 escenas a 1920×1080,
deja `qa/escena_01..10.png` y avisa de imágenes rotas, desbordes y errores de consola.
Con `--espera 8 --sufijo _tarde` captura el final de cada escena (elementos que entran tarde).

**Para la voz de Chispa conviene clonar, no usar una voz de catálogo.** Con F5 o Fish le das
5-10 segundos de la voz que quieras y la mantienes idéntica en todos los vídeos que hagas después.
Es lo que convierte a Chispa en un personaje reconocible y no en "una IA que narra".

---

## Trazabilidad de los claims

| Afirmación | Respaldo |
|---|---|
| Fases activa/reposo, hueco recuperado | `informes/ANALISIS_COMPARATIVO_MECHA.md` §1 — Mecha ✅, Booksy ❌, Fresha ❌ |
| Ficha técnica de color · sensibilidades · perfil de riesgo | idem §2 — "Mecha único" |
| IA de la competencia: add-on de pago o chat básico | `informes/DIFERENCIADORES-IA-MECHA.md`, verificado 4 jul 2026 |
| Agente de WhatsApp que agenda y confirma | `CLAUDE.md` — motor de notificaciones + agente entrante, validado E2E |
| Señal por Stripe | edge functions `crear-checkout-senal` + `stripe-webhook` |
| Lista de espera | `migrations/lista-espera*.sql` + `app/(tabs)/lista-espera.web.tsx` |
| 49 €/mes, sin comisiones | `web/index.html` — structured data Plan Pro 49 EUR + "Sin comisiones: todo es para ti" |
| **Preparada para** VeriFactu | `migrations/fiscal-a0…a6`, `lib/fiscal/huella.ts`, `scripts/verifactu-worker.ts` |

### Dos avisos antes de publicar

**VeriFactu — di "preparada", no "certificada".** El worker apunta a `prewww1.aeat.es`
(preproducción) y `PLAN-VERIFACTU-F1` acota: *"NADA de envío real a AEAT ni certificados (eso es
F2/Alexandro)"*. El texto en pantalla dice "Preparada para VeriFactu" y la locución dice "preparada
para VeriFactu, si tu gestoría te la pide" — eso es sostenible. No lo subas a "cumplimos VeriFactu"
hasta que F2 esté en producción con certificado real.

**Las cifras de la escena 9 (+15 h, −80 %, +25 %)** vienen de tu `README_MOTION_DESIGN.md` y no
están respaldadas por una cohorte de salones. Si aún no tienes datos de piloto, rotúlalas como
"objetivo" o sustitúyelas por cifras reales en cuanto las tengas. Es el punto más frágil del vídeo.

**Escena 7 nombra a Booksy y Fresha.** La publicidad comparativa es legal en España si cada
afirmación es veraz, verificable y sobre características esenciales (Ley 3/1991, art. 10). Revalida
las cinco filas contra sus páginas de producto vigentes antes de publicar: los datos son de
junio–julio de 2026.

---

## Lo que sigue fuera del vídeo

Tienes desplegado y sin contar: `migracion-magica` (cambiarse desde Booksy/Fresha — según tu propio
`DIFERENCIADORES-IA-MECHA.md` el coste de cambio es *la* barrera de venta y nadie lo ofrece),
`try-on-color`, `traductor-marcas`, `chispa-vision-corte`, `chispa-vision-instagram`,
`agenda-asistente`, `terminal-cobro-intent`, `redsys-notificacion` y el directorio de salones.

De todo eso, **migración mágica** es lo que más vende: es la objeción que mata la venta.
