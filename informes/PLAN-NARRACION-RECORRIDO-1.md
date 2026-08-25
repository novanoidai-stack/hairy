# Narrar el recorrido 1 de la demo con Gemini TTS — plan ejecutable

> **Este documento es autónomo.** Está escrito para pegarlo entero en una sesión
> nueva de Claude Code sin más contexto. Todo lo que hace falta saber está aquí:
> los hechos ya medidos, el guion completo, el prompt de dirección, los cambios
> de interfaz, la tubería y cómo se verifica.
>
> Repo: `novanoidai/Hairy` (Mecha). Rama de producción: `master`.
> Escrito el 24 ago 2026 tras dos rondas de casting con audio real.
> Todo lo etiquetado como *medido* sale de generaciones reales, no de la
> documentación del proveedor.

---

## 0. Qué hay que hacer, en una frase

Ponerle voz narrada al primer recorrido de la demo (`web/demo.html`, recorrido
`pilares`, 33 pasos), generada con `google/gemini-3.1-flash-tts-preview` a
través de OpenRouter, con un botón de sonido, cuatro efectos y un aviso en la
intro de que **con sonido se entiende mucho mejor**.

**El guion ya está escrito y validado**: `guion/pilares.json`.
**La voz ya está elegida**: `Gacrux`.
**El prompt de dirección ya está probado**: §4.

Lo que queda es producción: generar 33 audios, sintetizar 4 sonidos, y coser
todo a la máquina del recorrido sin romperla.

---

## 1. Contexto mínimo del repo

Sin esto, nada de lo demás se entiende.

**La demo es una página estática que embebe el software en un iframe.**
`web/demo.html` (≈3.100 líneas, HTML+CSS+JS a pelo, sin framework) contiene:

- La **intro** (`#intro`, clase `.dm-intro`): el plano negro de cine que es el
  primer fotograma. Nace con la clase `show` puesta. Se apaga una vez por
  pestaña vía `sessionStorage['mecha_demo_intro']`. Se puede forzar con
  `?intro=1` y saltar con `?intro=0`.
- El **iframe** `#appFrame`, que carga `/app?demo=1` (la app Expo/React Native
  Web compilada). La demo y la app hablan por `postMessage`.
- El **recorrido guiado**: el dock `#gtDock`, el foco `#gtSpot`, y el catálogo
  `RECORRIDOS` con tres recorridos. El primero es `TUT_PILARES`, 33 pasos.

**Cómo probar en local:**

```bash
npm run build:web            # solo si tocas app/, lib/ o components/
node scripts/serve-web.mjs   # espejo de Vercel en :8080
```
Demo sin gastar visitas: `http://localhost:8080/demo.html?share=1`
Forzando la intro: `.../demo.html?share=1&intro=1`

**Aviso importante sobre verificación**: el panel de navegador integrado congela
`requestAnimationFrame`, y el foco del recorrido vive en un bucle de rAF. Ahí el
foco **no aparece nunca** y cualquier conclusión sobre él es inválida. Usar el
MCP `chrome-devtools`, que levanta su propio Chrome headed.

**Convenciones**: código en inglés, **comentarios en español**, sin emojis en
código ni en UI. Nada de `any` en TypeScript. Acento de marca `#f4501e`.

---

## 2. Los hechos medidos (no repetir estas pruebas)

Todo esto ya está pagado y comprobado. Dar por bueno.

### 2.1 Las notas de dirección pasan por OpenRouter

Gemini TTS admite un prompt con perfil de voz, escena y notas del director, y
**actúa** el texto en vez de leerlo. Pero eso está documentado contra la API de
Google; nosotros vamos por `/api/v1/audio/speech` de OpenRouter, que solo tiene
un campo `input`. Medido con `scripts/tts-prueba-direccion.mjs`:

| Envío | Duración | Nivel | Silencio |
|---|---:|---:|---:|
| Texto pelado (165 car.) | 13,3 s | −17,6 dB | 26,0 % |
| Texto + etiquetas | 16,3 s | −19,2 dB | 39,7 % |
| **Prompt de dirección completo (1.412 car.)** | **14,6 s** | −19,2 dB | 34,6 % |

Si se leyera las notas duraría más de 90 s. Dura 14,6: **las interpreta**.
Y el nivel baja donde se le pidió bajarlo.

### 2.2 `[long pause]` está prohibido

Segunda ronda de casting, 3 voces × 6 tratamientos
(`scripts/tts-casting-final.mjs`). La métrica es **la pausa más larga en
segundos**, que es lo que hace que una voz arrastre:

| Tratamiento | Vindemiatrix | Gacrux | Sulafat |
|---|---:|---:|---:|
| 1 · `[long pause]` explícita | 2,62 s | 2,82 s | 2,48 s |
| 2 · pausas solo con puntuación | 1,52 s | **0,82 s** | 1,00 s |
| 3 · `[long pause]` + nota "silencios breves" | **3,54 s** | **1,02 s** | 1,30 s |
| 4 · ritmo normal | 0,60 s | 0,68 s | 0,66 s |
| 5 · energía | 0,90 s · satura | 0,78 s | 0,86 s |
| 6 · cifras | 1,44 s | 0,94 s | 1,00 s |
| **Pausa máx media** | 1,77 s | **1,18 s** | 1,22 s |
| **Satura en** | 1 de 6 | **0 de 6** | 0 de 6 |

- Casi tres segundos de silencio se sienten como que se ha colgado el
  reproductor. **`[long pause]` no se usa jamás.**
- Las pausas largas se piden desde el `Pacing` de las notas de dirección.
  Medido: le baja la pausa a Gacrux de 2,82 a 1,02 s.
- Vindemiatrix **desobedece** la instrucción de pacing (va de 2,62 a 3,54 s) y
  es la única que satura. Descartada.
- **Elegida: Gacrux.**

### 2.3 Cosas de la API que hay que respetar

- Solo acepta `response_format: "pcm"`. Devuelve **PCM crudo 24 kHz / 16 bits /
  mono, sin cabecera**. Hay que envolverlo en WAV (44 bytes de RIFF) y luego
  codificar a MP3.
- **Las etiquetas se escriben en inglés** aunque el texto sea español. Lo
  recomienda Google explícitamente.
- El prompt necesita **preámbulo explícito** ("sintetiza lo que viene tras
  TRANSCRIPT; lo anterior es dirección"). Sin él, el clasificador puede rechazar
  la petición o **leer las notas en voz alta**.
- **Devuelve 500 al azar.** Medido: 2 de 5 en una tanda, 0 de 18 en la
  siguiente. Tres reintentos con espera creciente lo tapan.
- La calidad **se degrada pasados unos minutos** → un fichero por paso.
- Límites: 8.192 tokens de entrada, 16.384 de salida. Un paso son ~400. Sobra.

### 2.4 Coste

**0,0005 $ por segundo de audio** (≈25 tokens de audio/s a 20 $/M). El prompt de
dirección, a 1 $/M tokens de entrada, son ~0,0004 $ por paso: **dirigir es
gratis**.

Ritmo medido: **0,088 s por carácter hablado** en modo explicativo.

| | Recorrido 1 |
|---|---:|
| Pasos | 33 |
| Caracteres hablados (`guion/pilares.json`) | 4.913 |
| Duración estimada | **~7,2 min** |
| **Coste de generación** | **~0,22 $** |
| Peso en MP3 mono 48 kbps | ~2,6 MB |
| Peso por paso | ~80 KB |

---

## 3. La voz y el personaje

**Voz: `Gacrux`** (descriptor de Google: *Mature*). Del catálogo de 30.

**El personaje es lo que hace que suene a persona.** No es un narrador: es
Marta, 38 años, quince detrás de un sillón, que montó su salón sin software y se
comió todos los errores. Ahora le enseña la herramienta a una compañera que
acaba de abrir y va agobiada. **No vende: cuenta lo que hace.**

Esto no es literatura de plan: Google avisa de que el tono escrito tiene que
casar con la voz, y de que **la escena hace más por la interpretación que diez
adjetivos**. Por eso las notas describen una situación, no una lista de
parámetros.

---

## 4. El prompt de dirección — copiar tal cual

Va delante de **cada uno** de los 33 pasos, idéntico. Lo único que cambia es lo
que va detrás de `#### TRANSCRIPT`. Así la voz no deriva de un paso a otro.

```
Synthesize speech for the transcript at the end of this prompt.
Everything before the TRANSCRIPT heading is direction and must NOT be spoken.

# AUDIO PROFILE: Marta
## "La compañera de oficio"
Marta tiene 38 años y lleva quince detrás de un sillón. Montó su salón sin
software y se comió todos los errores. Ahora enseña la herramienta que le habría
salvado los primeros cinco años. No vende: cuenta lo que hace.

## THE SCENE: Un salón de barrio, martes por la mañana
Huele a tinte. Se oyen secadores de fondo, lejos. Marta está de pie junto a
recepción, señalando la pantalla con el dedo. Le habla a UNA persona: una
compañera que acaba de abrir su propio local y va agobiada. No hay cámara y no
hay público. Es una conversación entre dos que se dedican a lo mismo.

### DIRECTOR'S NOTES
Style: Cercana y segura, nunca comercial. La "sonrisa vocal" está ahí, pero
contenida: es una profesional explicando a otra, no una locutora leyendo un
anuncio. Cuando dice un dato concreto, baja medio tono y afirma. Cuando cuenta
un truco, baja el volumen como quien confía algo.
Pacing: Ágil dentro de la calma. Deja respirar después de cada idea, y sobre
todo ANTES del dato. Las pausas son BREVES: medio segundo, nunca dos. Un
silencio largo mata el ritmo de una demostración. Encadena las frases sin dejar
aire muerto entre ellas.
Accent: Castellano de España, de Madrid. Vocales limpias, "c" y "z" distinguidas
de la "s". Nada de seseo ni de entonación latinoamericana.
Breathing: Respiración audible pero suave antes de las frases largas.
Articulation: Los números y los nombres de pantalla, claros y separados.

### SAMPLE CONTEXT
Marta está en el minuto tres de una demostración de veinte. Ya ha roto el hielo;
ahora va soltándolo todo con la tranquilidad de quien se lo sabe de memoria.

#### TRANSCRIPT
<aquí el campo "texto" del paso, tal cual, con sus etiquetas>
```

**Ese bloque de `Pacing` es el que doma la pausa.** Medido en §2.2. No tocarlo
sin volver a medir la pausa máxima.

---

## 5. El guion — `guion/pilares.json`

**Ya está escrito y validado.** 33 pasos, 4.913 caracteres hablados (149 de
media), 94 etiquetas (2,8 por paso). Validaciones que pasa: cero `[long pause]`,
cero markdown, cero etiquetas fuera del catálogo conocido.

### 5.1 Las reglas con las que está escrito

El texto de pantalla y el hablado **no son el mismo texto**: leyendo puedes
volver atrás, escuchando no. El guion original de `demo.html` son 5.596
caracteres; el hablado son 4.913 porque:

1. **Una idea por frase.** Coma que puede ser punto, es punto.
2. **El dato, al final.** "La duración sale del catálogo… y puede ser distinta
   para cada profesional" pega más que al revés.
3. **Fuera las enumeraciones largas.** "Servicio, cliente, tiempos, color,
   productos, pagos e historial" son siete cosas seguidas: en audio se pierden
   todas. Se dicen tres y se cierra con "y todo se edita aquí".
4. **Nada de markdown.** El `**negrita**` de la pantalla se convierte en énfasis
   real. Si se cuela, Gemini dice "asterisco".
5. **Siglas deletreadas**: `I.V.A.`, `C.S.V.`, `Q.R.` con puntos, o las lee como
   palabra.
6. **Números en letra**: "diez segundos", "las once y media".
7. **Cuatro apelaciones directas en 33 pasos**, ni una más: `¿Ves?` (3),
   `Fíjate` (10), `Mira esto` (14), `Abre una cualquiera` (18). Más de eso suena
   a teletienda.
8. **El paso no repite su título.** El título está en pantalla; la voz cuenta lo
   que en el título no cabe.

### 5.2 El arco emocional

Los 33 pasos no pueden sonar igual: eso es lo que apaga una narración de siete
minutos a los dos.

| Acto | Pasos | Segundos | Tono | Qué hace la voz |
|---|---|---:|---|---|
| 1 · La agenda | 1-2 | ~29 | Apertura | Sitúa. Sin prisa. Bienvenida, no venta |
| 2 · Crear una cita | 3-8 | ~70 | Ritmo | Sube el pulso. Frases cortas encadenadas |
| 3 · La cita por dentro | 9-13 | ~69 | Profundidad | Baja el ritmo. Hay detalle que digerir |
| 4 · **Los reposos** | 14-16 | ~38 | **CLÍMAX** | Confidencial. Casi en voz baja |
| 5 · La ficha | 17-22 | ~69 | Cercanía | Cálido. Habla de personas, no de campos |
| 6 · Cobro y caja | 23-28 | ~77 | Seguridad | Firme. Cierra el día |
| 7 · Tu portal | 29-33 | ~80 | Orgullo | Sube otra vez. Termina mirando adelante |

**El acto 4 es el corazón** y es el más corto a propósito: 38 segundos para lo
único que ningún competidor tiene. El paso 15 es la frase que le vende el
producto a una peluquera, y es el único `[whispers]` de los 33 — si susurras
cinco veces, el susurro deja de significar nada:

> `[whispers]` Y mientras el tinte actúa solo… tú no estás ocupada.
> `[short pause]` `[warm]` Mecha libera ese hueco. Y te deja meter a otra
> clienta encima. `[serious]` Eso son horas. Cada semana.

### 5.3 Reparto de etiquetas

| Etiqueta | Usos | Para qué |
|---|---:|---|
| `[short pause]` | 33 | Una por paso: el respiro antes del dato |
| `[calm]` | 24 | El tono base de la explicación |
| `[warm]` | 16 | Cuando habla de la persona, no del software |
| `[serious]` | 8 | El dato que cierra y no admite discusión |
| `[excited]` | 6 | Los descubrimientos. Nunca dos seguidos |
| `[curious]` | 5 | Abre pregunta: "¿Y si entra alguien solo a por champú?" |
| `[amazed]` | 1 | Una sola vez, en el paso 7 |
| `[whispers]` | 1 | Una sola vez, en el paso 15 |

**La musicalidad sale de la variación, no de la cantidad.** 2,8 etiquetas por
paso alternando familias produce relieve; diez etiquetas por paso producen una
voz esquizofrénica. Google avisa: no sobre-etiquetar.

---

## 6. El aviso de sonido en la intro

**Qué hay hoy** en `web/demo.html`, dentro de `.dm-intro-actions`:

```html
<button class="dm-intro-btn-play" id="introGuided">
  <svg …></svg><span id="introGuidedLbl">Reproducir los tres recorridos</span>
</button>
<button class="dm-intro-free" id="introFree">…</button>
```

**Qué añadir**: entre el botón de play y el de "explorar por libre", una línea
con casilla, apagada por defecto:

```html
<label class="dm-intro-voz" id="introVoz">
  <input type="checkbox" id="introVozChk" />
  <svg class="ico-altavoz" …></svg>
  <span><b>Con voz</b> — se entiende mucho mejor</span>
</label>
```

**Reglas:**

- **Apagada por defecto**, salvo que `localStorage['mecha_demo_voz'] === '1'`.
- Marcarla **no reproduce nada todavía**: solo deja la preferencia lista. El
  gesto que desbloquea el audio del navegador es el clic en "Reproducir".
- El texto dice **"se entiende mucho mejor"**, no "activar sonido". Es el
  beneficio, no la función.
- Estilo: hereda el tono de `.dm-intro-fake` (11,5 px, `rgba(255,255,255,.45)`),
  pero con el `<b>Con voz</b>` a `.94` de opacidad para que se lea primero.
  Al pasar por encima, sube a blanco, como hace `.dm-intro-free`.
- `@media(prefers-reduced-motion:reduce)` no aplica aquí: es audio, no
  movimiento. No inventar una media query que no existe.

**Y en la barra superior de la demo** (`.dm-bar`), el mismo interruptor en
pequeño, para quien ya se saltó la intro (recuerda: la intro solo sale una vez
por pestaña).

---

## 7. El botón de sonido durante el recorrido

**Dónde**: en `#gtDock`, dentro de `.gt-controls`, a la izquierda de `#gtPrev`.
Icono de altavoz con dos estados, mismo tamaño que `.gt-prev`.

**Por defecto: apagado.** Tres razones, en orden de peso:

1. El navegador **bloquea el audio sin gesto previo**. Si intentamos sonar
   solos, no suena y además parece roto.
2. Media demo se abre desde el trabajo, o desde el propio salón con clientas
   delante.
3. Quien quiere voz la enciende en un clic; a quien no la quiere no se le puede
   pedir que la apague a la carrera.

**Persistencia**: `localStorage['mecha_demo_voz']`, no `sessionStorage`. Si
alguien la encendió una vez, la quiere encendida la próxima.

**Estados que hay que cubrir:**

| Situación | Qué pasa |
|---|---|
| Mute a mitad de paso | Pausa el audio; el recorrido sigue con el ritmo mudo |
| Unmute a mitad de paso | Arranca el audio del paso **desde el principio** |
| `←` `→` o clic en capítulo | Corta el audio en curso antes de cargar otro |
| Pestaña oculta (`visibilitychange`) | Pausa. Nada peor que una voz saliendo de una pestaña que ya no miras |
| Falla la carga del MP3 | El recorrido sigue mudo, sin avisos ni errores |

---

## 8. Ir atrás y adelante: los seis bugs y el antídoto

**Esta sección es la más importante del documento.** Una implementación ingenua
del audio rompe la navegación de seis maneras.

### El antídoto ya existe: `seq`

`renderStep()` hace `seq++` en cada cambio de paso (`web/demo.html`, ~línea
2774). Todo lo que queda pendiente del paso anterior captura ese número y lo
comprueba antes de actuar:

```js
function programarAvance(){
  var my = seq;                       // la generación de ESTE paso
  (function esperar(){
    if(my !== seq || !autoOn) return; // el paso ya cambió: me callo
    …
  })();
}
```

Es un contador de generación. `playTutorial()` también lo incrementa, así que
cambiar de recorrido entero queda cubierto por el mismo mecanismo.

> **La regla, y es una sola: todo callback de audio captura `my = seq` al
> empezar y se calla si `my !== seq`.**

### Los seis bugs

| # | El bug | Cuándo salta | Qué lo mata |
|---|---|---|---|
| 1 | **Voces superpuestas** | `→` tres veces rápido: tres audios a la vez | **Un solo** elemento `<audio>` reutilizado, con `pause()` y `currentTime = 0` antes de cargar. Nunca `new Audio()` por paso |
| 2 | **El `onended` viejo te empuja adelante** | Estás en el 5, el audio va a acabar, pulsas `←` para ir al 4. Doscientos milisegundos después el `onended` del 5 dispara `tourNext()` y **te devuelve al 5**. Parece un fantasma | `if(my !== seq) return;` dentro del `onended`. El más feo de los seis |
| 3 | **Carga fuera de orden** | Saltas cinco pasos; la descarga del 2 termina después de la del 6 y suena encima | Mismo `my !== seq` en el `canplay`. El fetch tardío se descarta |
| 4 | **Doble avance** | Acaba el audio *y* salta el temporizador de `lecturaDe()` → dos pasos de golpe | Con voz encendida, `programarAvance()` **no programa nada**. Un solo dueño del avance, nunca dos |
| 5 | **Un "TE TOCA" se avanza solo** | El audio acaba y el recorrido sigue sin esperar a que toques | Comprobar `ACCIONES_TOCA[s.action]` antes de avanzar |
| 6 | **Voz huérfana** | Cierras con "Ver por libre" y la voz sigue hablando sobre el software | `vozParar()` en `closeTour()` y en `visibilitychange` |

### El contrato del reproductor

Cuatro funciones. Ninguna sabe nada del recorrido salvo el número de paso:

```
vozIr(n)       corta lo que suene, carga el paso n, comprueba seq, reproduce
vozParar()     pausa y rebobina. Idempotente
vozSilencio()  alterna el mute y lo guarda en localStorage
vozLista(n)    precarga el paso n en segundo plano, sin reproducir
```

`renderStep()` llama a `vozIr(ti)` justo después de `driveSoftware(s)`, y a
`vozLista(ti+1)` cuando el audio arranca. Nada más.

**Si el reproductor se cae, el recorrido sigue mudo y nadie se entera.** Es la
única forma aceptable de que falle un adorno.

### La sincronización, que además arregla el ritmo

```
con voz:   audio.onended  →  + 900 ms de cola  →  siguiente paso
sin voz:   el comportamiento de ahora, sin tocar
```

Hoy `PASO_MS` y `lecturaDe()` dan a todos los pasos una duración parecida,
tengan 90 caracteres o 240. Con audio, cada paso dura lo que dura su frase.

**El foco no se toca.** El spotlight vive en su bucle de `requestAnimationFrame`
(`components/ui/DemoSpotlight.tsx`) y publica por `postMessage`. La voz se
engancha al mismo evento de "paso asentado" que ya existe. Cero cambios ahí.

---

## 9. Los efectos de sonido

Cuatro sonidos y un silencio. Ni uno más: un demo de software no es un
videojuego.

| # | Qué | Cuándo | Nivel | Por qué |
|---|---|---|---|---|
| 1 | **Tick** (40 ms) | Al cambiar de paso | −26 dB | Marca el corte sin robar atención |
| 2 | **Swell** (600 ms) | Al entrar en un acto (7 veces) | −22 dB | Da estructura de capítulos |
| 3 | **Dos notas ascendentes** | En los pasos "TE TOCA" | −20 dB | El único momento en que se te pide algo |
| 4 | **Whoosh** (340 ms) | Al salir la intro | −18 dB | La animación `dmIntroOut` ya existe; le falta el sonido |
| 5 | **Silencio** | Paso 15, antes de "tú no estás ocupada" | — | El recurso más potente y el que cuesta cero |

**Lo que NO va: ambiente de salón en bucle.** Secadores de fondo suenan bien
diez segundos y cansan en noventa, y compiten justo con la banda de frecuencia
de la voz. La escena de secadores va en el **prompt** (§4), para que la voz
suene como si estuviera ahí — no en la mezcla.

**Mezcla**: voz a −16 LUFS con 1 dB de margen de pico. Medido: los WAV de Gemini
salen pegados a 0 dBFS (27 muestras a tope de 567.360, rachas de 3 como máximo,
o sea sin distorsión audible pero sin margen). SFX de 6 a 10 dB por debajo. Sin
*ducking*: a −22 dB no le hace sombra a nada.

**De dónde salen**: sintetizados con `OfflineAudioContext` en un script, no
descargados de un banco. Cuatro sonidos de menos de un segundo son ~60 líneas y
pesan 8 KB en total, frente a licencias y atribuciones.

---

## 10. La tubería de producción

```
guion/pilares.json
        │
        ▼
scripts/narrar-recorrido.mjs          ← hay que escribirlo
        │  1. antepone el prompt de dirección de §4
        │  2. POST a OpenRouter → PCM 24 kHz mono
        │  3. cabecera WAV de 44 bytes
        │  4. normaliza a −16 LUFS con 1 dB de margen  (ffmpeg)
        │  5. MP3 mono 48 kbps
        │  6. reintenta los 500 (3 intentos, espera creciente)
        │  7. mide y valida (§11)
        ▼
web/narracion/pilares/01.mp3 … 33.mp3
web/narracion/pilares/manifiesto.json
```

**Ya existen y sirven de base** (copiar de ahí, no reinventar):

- `scripts/tts-casting-final.mjs` — llamada a OpenRouter, cabecera WAV,
  reintentos, medición de pausa máxima, lectura del coste real.
- `scripts/tts-muestras.mjs` — generación de página de escucha.
- `scripts/tts-prueba-direccion.mjs` — la prueba de §2.1.

**La clave**: `OPENROUTER_API_KEY` en `.env` (ya está en `.gitignore`).
Los scripts la leen de ahí y **no la imprimen nunca**.

**ffmpeg** está instalado y en el PATH (8.0.1).

**Un fichero por paso, no uno largo**: lo pide Google (la calidad deriva pasados
unos minutos), lo pide la carga (80 KB en vez de 2,6 MB) y lo pide el recorrido
(hay que poder saltar de paso).

**Carga en el navegador**: `preload="none"`, y al empezar el paso N se pide por
lo bajo el N+1. **Nunca se precargan los 33.** La lección del bundle de 7 MB
(decisión 7 del `CLAUDE.md`) es exactamente esta.

**Caché**: `web/narracion/**` es inmutable una vez generado. Entra en
`vercel.json` con `max-age=31536000, immutable`.

**Versionado**: los MP3 **se commitean**. Son 2,6 MB y no hay otro sitio de
donde sacarlos en el build de Vercel. Precedente: ya hay un
`web/mecha-narration-elevenlabs.mp3` de 1,1 MB en el repo.

**Idempotencia**: el manifiesto guarda el hash del texto de cada paso.
Regenerar solo toca los pasos cuyo texto ha cambiado. Cambiar una frase cuesta
0,007 $, no volver a pagar el recorrido entero.

---

## 11. Verificación

**Quien ejecute esto no puede escuchar el audio.** Hay que separar lo que se
mide de lo que solo puede juzgar una persona, y no hacer pasar lo segundo por lo
primero.

### Lo que se mide en el WAV, antes de codificar

| Qué | Cómo | Umbral |
|---|---|---|
| Hay voz y no ruido | RMS del PCM | −22 a −14 dB |
| No satura | rachas de muestras a fondo de escala | racha < 5 |
| Las pausas están | % de ventanas de 20 ms bajo −48 dB | 28-45 % |
| **No arrastra** | **la pausa más larga** | **< 1,6 s** |
| No se ha leído las notas | duración ÷ caracteres hablados | < 0,12 s/car. |
| No se ha colado markdown | grep de `*` y `_` en el guion | 0 |

El código de medida ya está escrito en `scripts/tts-casting-final.mjs`
(función `medir`). Reutilizarlo, no reescribirlo.

### Lo que se comprueba en Chrome real

Con el MCP `chrome-devtools`, nunca con el panel integrado (§1).

| Prueba | Qué se cuenta | Esperado |
|---|---|---|
| Cargar los 33 | `loadedmetadata` de cada uno | 33 de 33 |
| `→` diez veces en dos segundos | audios sonando a la vez | siempre 1 |
| Ir al paso 5, esperar a 200 ms del final, pulsar `←` | paso un segundo después | **4**, nunca 5 |
| Saltar entre capítulos seis veces | `src` sonando vs paso pintado | siempre el mismo |
| Recorrido entero con voz | avances totales | **33**, ni 32 ni 34 |
| Parar 30 s en un paso "TE TOCA" | avances | 0 |
| Cerrar con "Ver por libre" | audios sonando 1 s después | 0 |
| Ocultar la pestaña | `paused` del audio | `true` |

### Lo que solo puede juzgar una persona

El acento, si suena a persona o a locutor, y si el paso 15 pone la piel de
gallina. **Presentar los 33 en una página de escucha y pedir que se escuchen.**
No dar por buena la narración porque los ficheros existan.

---

## 12. Riesgos

| Riesgo | Probabilidad | Qué hacemos |
|---|---|---|
| Gemini devuelve 500 | Irregular: 2 de 5 en una tanda, 0 de 18 en la siguiente | 3 reintentos. Sale gratis y tapa las malas rachas |
| El clasificador rechaza el prompt | Baja, con el preámbulo de §4 | Fallback a solo transcripción + etiquetas |
| Lee las notas en voz alta | **Descartada** (§2.1) | El chequeo de duración/carácter lo cazaría igual |
| La voz deriva entre pasos | Media | Mismo prompt en los 33; si deriva, fijar `seed` |
| El modelo está en *preview* | Alta | Los MP3 están commiteados: si retiran el modelo, la demo sigue narrada |
| Alguien lo abre con clientas delante | Alta | Por eso arranca mudo (§7) |
| 7 minutos se hacen largos | Media | Medir dónde abandona la gente antes de tocar el guion |

---

## 13. Orden de trabajo

1. **`scripts/narrar-recorrido.mjs`** partiendo de `tts-casting-final.mjs`.
2. **Generar los 33** y pasar las medidas de §11. *(~0,22 $, unos 12 min)*
3. **Página de escucha** con los 33 seguidos, para validación humana.
4. **Los 4 SFX** con `OfflineAudioContext`.
5. **La casilla de la intro** (§6) y el botón del dock (§7).
6. **El reproductor** (§8): las cuatro funciones y la regla de `seq`.
7. **Las ocho pruebas de navegación** en Chrome real.
8. `vercel.json`: caché inmutable para `web/narracion/**`.

Los pasos 1-4 no tocan `demo.html` y se pueden hacer y validar por separado. El
riesgo de romper algo vive entero en los pasos 5-7, y ahí la red de seguridad es
§8: **si el audio falla, el recorrido sigue mudo**.

---

## 14. Recursos ya generados en el repo

| Ruta | Qué es |
|---|---|
| `guion/pilares.json` | **El guion completo, validado.** El entregable central |
| `scripts/tts-casting-final.mjs` | Casting 3×6. De aquí sale el código de llamada y medida |
| `scripts/tts-casting.mjs` | Primer casting, 5 voces |
| `scripts/tts-prueba-direccion.mjs` | La prueba de §2.1 |
| `scripts/tts-muestras.mjs` | Comparativa de 6 modelos + banco de voces + soporte de español |
| `scripts/tts-soporte-espanol.mjs` | Los 18 modelos de voz de OpenRouter contra una frase española |
| `web/tts-muestras/` | Todo el audio de las pruebas (en `.gitignore`) |

Para volver a escuchar cualquier cosa:

```bash
node scripts/serve-web.mjs
```
`http://localhost:8080/tts-muestras/` · `.../casting/` · `.../casting-final/`
