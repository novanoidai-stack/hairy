# HANDOFF — Vídeo de producto Mecha v3 (Motion Design 3D/WebGL)

> **Archivo para transferir TODO el contexto a otra sesión de Claude y que esta no se abulte.**
> Creado: 2026-08-05 (sesión que dejó el esqueleto funcionando y parte del contenido de escenas).
> **No está commiteado a git** (contiene una credencial). Si se commitea, borrar la sección "Credencial".

---

## 0. PROMPT PARA ARRANCAR LA SIGUIENTE SESIÓN (copia y pega)

> Continúa la construcción del **vídeo de producto Mecha v3** (motion design 3D / WebGL, ~75 s, premium).
> **Lee primero `motion_design_pack/HANDOFF_continuar_v3.md`** y recupera: visión, decisiones cerradas, estado exacto, aprendizajes técnicos críticos y el **punto de resumen**.
> El esqueleto `MECHA_motion_v3.html` ya funciona (`__qa_ok=true`, cámara spline + timing + audio + voz sincronizados, 7 grupos de escena). Falta: wirear las animaciones del loop (S1 móvil sonando, S4 chat + moneda), añadir los overlays DOM de S2/S6/S7, y luego continuidad, tipografía cinética, SFX/música, timing fit y QA final.
> **Regla de oro de verificación:** las capturas headless (Playwright/swiftshader) NO renderizan WebGL — verifica la fidelidad visual siempre con **Chrome real (chrome-devtools MCP)**; Playwright solo para chequeos estructurales (`__qa_ok`, errores de consola). Arranca leyendo el handoff y luego sigue por el "Punto de resumen".

---

## 0.5 ACTUALIZACIÓN — Sesión 2026-08-06 (lo hecho + por dónde sigue)

> **Estado: las 7 escenas leen bien, premium, verificadas con Chrome real.** Esqueleto + animaciones + reframing + overlays + texturas HECHOS. Queda pulido opcional + docs. **Lee esto primero; §6 está desactualizado (sustituido por esta sección).**

### Hecho esta sesión (sobre el handoff original)
- **Animaciones del loop wireadas** (`loop()`, antes de `composer.render()`): S1 móvil tiembla (`Math.sin(t*0.04)`); S4 chat entra por beats `[0.6,2.5,4.0]` + moneda señal cae desde local≥4.0 (asentada a local≥5.2).
- **Consola limpia:** favicon SVG inline → 0 errores 404. `__qa_ok=true`, 0 errores consola, 0 red.
- **Reframing de las escenas-teléfono (el fix clave):**
  - `CONTENT_POS[]` (nuevo): cada dispositivo se coloca ADELANTE en el path (~65% del segmento) + offset lateral, para que la cámara lo aborde en vez de rebasarlo al inicio (que era lo que pasaba: el móvil quedaba detrás de la cámara).
  - **`camera.lookAt` ahora TRACKEA el contenido de la escena activa** (`_look.lerp(CONTENT_POS[cur], 0.06)`), no "hacia adelante" fijo por el spline. Esto fue lo que hizo visibles los móviles (antes salían de cuadro al acercarse la cámara, por geometría de offset lateral vs FOV).
  - El orbe mezcla 50% path-ahead + 50% contenido → guía la mirada al dispositivo, co-visible sin ocluir.
  - Móviles escalados 1.5, orientados hacia la cámara que aborda.
- **Texturas de pantalla:** S5 = **portal real** de producción (`capturas_recortadas/portal_mobile_clean.png`, de `/app/r/demo` — público/anónimo, viewport móvil, cookies aceptadas). S1/S4 = wallpaper canvas sutil (`makePhoneWallpaper`, reloj "11:40" cuadrando con la voz "son las once y cuarenta"). `makePhone` ahora usa `color:white` cuando hay textura (no multiplicar por oscuro).
- **Overlays DOM S2/S6/S7** (clase `.hero`, toggle `.show` en `enterScene`): S2 wordmark "Hola, soy Chispa" + kicker + sub; S6 tabla "Mecha vs genéricas" (checks vs guiones) + "desde 39 €/mes · sin comisiones · 1 mes gratis · sin permanencia"; S7 wordmark **Mecha** + `mechaa.es` + píldora "Pruébalo gratis". En escenas hero se suprime el caption cinético superior (lo lleva el overlay); el subtítulo inferior (#cc) sigue mostrando la voz.
- **Timing fit verificado:** cada `d` ≥ duración real del WAV con ~0.3s de margen. Total 71.1s (≤90s). La voz nunca se corta.
- **Hooks de QA en `window.__mecha`** (inofensivos en prod): `seek(e)`, `hideFx(bool)`, `cam()`, `cur()`, `groups()`.
- **Guion v4 documentado:** `GUION_CHISPA_v4.md`.

### Aprendizajes NUEVOS (añadir a §3)
12. **`camera.lookAt` debe trackear el contenido, no el path.** Con cámara sobre spline, los objetos en el ancla quedan detrás al instante; los offset lateral salen de cuadro al acercarse (el ángulo lateral supera el medio-FOV). Mirar a `CONTENT_POS[cur]` suavizado (`.lerp`) resuelve ambos; el spline queda solo para POSICIÓN (sensación oner).
13. **Verificación sin chrome-devtools MCP:** si el MCP no está conectado, **Playwright headed con Chrome real** (`channel="chrome"`, `headless=False`, args `--ignore-gpu-blocklist --enable-gpu-rasterization`) renderiza WebGL con GPU de verdad. El `Read` del harness sube el PNG a CDN sin mostrar píxeles → **usar el MCP `analyze_image` (zai) sobre el archivo local** para interpretarlo. `verify_v3.py` (7 escenas + `__qa_ok` + errores) y `debug_v3.py` (frames en momentos concretos) hacen seek vía `window.__mecha.seek` + pausa + screenshot.
14. **Offset lateral + lookAt tracking** = flyby limpio: el dispositivo se centra mientras la cámara se acerca y el orbe (que deriva hacia el contenido) guía sin tapar.

### Por dónde sigue (pulido opcional + docs)
1. **Música ambiente (Task 12):** los SFX por beat ya disparan; falta una cama musical sutil. Subjetivo → mejor la elige Carlos.
2. **Continuidad/morphs (Task 10):** el oner + orbe + lookAt ya dan continuidad; opcional reutilizar el mismo mesh de móvil S1→S4 y portátil S3→S5 (hoy son instancias separadas por escena).
3. **Tipografía cinética (Task 11):** el `#caption` ya resalta keywords; pulido fino opcional.
4. **Chat WhatsApp real en S4:** hoy es wallpaper + planos verdes animados (metáfora honesta; Mecha no tiene pantalla in-app de WA). Si se quiere más realismo, montar un mockup.
5. **MP4 final:** grabar la pieza. `verify_v3.py` con `device_scale_factor:2` da frames nítidos; o OBS sobre el `#c3d`; o tanda de PNGs por seek para encodar con ffmpeg.

### Verificación rápida (reproducir)
```bash
cd motion_design_pack && python -m http.server 8889
# abrir http://127.0.0.1:8889/MECHA_motion_v3.html  → click cover → play
python verify_v3.py        # __qa_ok + 0 errores + 7 frames
python debug_v3.py         # frames en momentos concretos (editar shots[])
```

---

## 1. VISIÓN Y MAGNITUD (lo que es este proyecto)

**Qué:** un vídeo de presentación de **Mecha** (SaaS de gestión para peluquerías/barberías) para colgar en la landing, redes y enviar a prospectos. Debe convencer a un **dueño de salón** de por qué Mecha antes que Booksy/Fresha.

**Estilo objetivo (lo que pide Carlos, el usuario):** motion design **ultra-profesional**, tipo Apple/Linear/Stripe. **3D real (no 2D ni 2.5D falso)**, movimientos originales, **cámara continua (oner, sin cortes duros)** con fluidez/conexión entre temas, **enseña el software real** (capturas reales sobre dispositivos 3D), **tipografía cinética** sincronizada a la voz, **SFX por cada beat** de animación, **voz hiperrealista** (edge-tts `es-ES-XimenaNeural` por ahora; el salto a "humana real" requiere clonación F5/Fish o voz humana — fuera de este build).
**Duración:** ≤90 s (objetivo 75-85 s). Actualmente 71.1 s de voz.
**Marca "fuego":** acento `#F4501E` (profundo `#C0260A`), ámbar `#FF9B3D`, fondo navy `#070A14`. Brasas. Oscuro premium.

**Concepto del vídeo:** *"Mecha funciona solo. Tú solo cortas."* Un **oner**: la cámara viaja sin cortes por la semana de un dueño de salón mientras **vemos el software real** manejándolo todo. El **orbe de fuego "Chispa"** es el hilo conductor que viaja por delante de la cámara de escena en escena.

**Por qué se reconstruye (v2 → v3):** el v2 (`MECHA_motion_v2.html`) era 10 escenas/1:41, todo CSS 2D con emojis, no enseñaba el software, cortaba en seco, y anunciaba Marketplace (feature que NO existe) y cifras sin piloto (+34%, 15 h, 20%). v3 es 3D real, 7 escenas, claims honestos.

**Fuente de verdad del proyecto:** `informes/MEGA_INFORME_MECHA.md` (carpeta informes, fuera de este pack). Spec y plan del vídeo:
- `motion_design_pack/SPEC_motion_v3_2026-08-04.md` (spec aprobado)
- `motion_design_pack/PLAN_motion_v3_2026-08-04.md` (plan de 14 tareas)

---

## 2. DECISIONES CERRADAS (no revertir sin hablar con Carlos)

| Decisión | Valor |
|---|---|
| Medio | HTML autocontenido + **Three.js 0.161** (CDN importmap), un solo archivo `MECHA_motion_v3.html`. |
| Look | Navy `#070A14`, fuego `#F4501E`/`#C0260A`, brasas, oscuro premium. Bloom SOLO en elementos HDR (orbe/brasas), **umbral 1.1**. |
| Estructura visual | **Oner**: cámara sobre spline `CatmullRomCurve3`, sin cortes. Hilo = orbe Chispa. |
| Capturas reales | Como texturas sobre dispositivos 3D (móvil/portátil). Servir siempre por http. |
| Guion | 7 escenas / 71.1 s. **Sin Marketplace, sin cifras sin piloto, VeriFactu = "preparada", comparativa IMPLÍCITA** (no nombrar Booksy/Fresha). |
| Voz | edge-tts `es-ES-XimenaNeural` (+1 Hz, +3 % rate), pydub normalize. 7 WAVs en `voz/chispa_01..07.wav`. |
| Convención repo | Código en inglés, comentarios en español. **Sin emojis en UI/código.** |

---

## 3. APRENDIZAJES TÉCNICOS CRÍTICOS (lo que costó descubrir)

1. **Headless Playwright + swiftshader NO renderiza materiales WebGL** (planos `MeshBasicMaterial` salen negros/invisibles; solo lo emisivo/aditivo se ve). ⇒ **Verificación visual = chrome-devtools MCP (Chrome real)**. Playwright (`qa_video_v3.py`) solo para asertos estructurales: `window.__qa_ok===true`, 0 errores de consola, 0 errores de red. Las capturas headless SIRVEN para detectar errores pero NO para juzgar el look.

2. **`UnrealBloomPass` satura a blanco las pantallas LDR.** El fondo blanco/clear de la app está por encima del umbral → bloom la convierte en mancha blanca. **Fix: umbral (4º arg) = 1.1** (solo brilla lo HDR >1: orbe emisivo 2.5, brasas aditivas). Mantener este valor.

3. **Pantalla = hija de la tapa (group-pivot en la bisagra).** Si el plano-pantalla y la tapa rotan con pivotes distintos, se separan/z-fight. Construir la tapa como `Group` posicionado en el borde trasero de la base, hijos offset, y `rotation.x` leve (~-0.16). Añadir un cilindro oscuro de bisagra visible.

4. **Textura cacheada por Chromium.** Al sobrescribir un PNG en disco, el navegador sirve la cacheada. **Añadir `?v=YYYYMMDDx` a la URL** de `TextureLoader.load` (ej.: `agenda_full_clean.png?v=20260805a`).

5. **`import` ES module DEBE ir al top-level del módulo, NO dentro de `try {}`.** Poner imports dentro de try lanza `SyntaxError: Unexpected token '*'` (por `import * as THREE`). Imports arriba, luego `try { init... } catch {}`.

6. **No chocar nombres: `fill`** (luz directional) vs `fill` (barra de progreso DOM) ⇒ `SyntaxError: Identifier 'fill' has already been declared`. La luz se renombró a `fillLight`.

7. **Viewport del navegador limitado al monitor físico.** `resize_page(1920,1080)` puede quedar en ~1540×732. Para captura alta resolución usar **`emulate(viewport='1920x1080x2')`** (deviceScaleFactor 2 → captura 3840×2160). La emulación persiste al navegar/recargar.

8. **La app de PRODUCCIÓN es tema OSCURO.** La captura de la agenda es un UI oscuro (no blanco) con chips de color. Esto es correcto y deseado.

9. **Capturar la agenda poblada:** el salón **demo** (`demo_salon_001`) tiene los datos (10 citas, bloques REPOSO/HUECO LIBRE). El salón real de la cuenta de Carlos (`/app` directo) está **vacío**. `/app?demo=1` directo NO activa demo (debe ir embebido en iframe). ⇒ Captura vía `demo.html` (iframe mismo origen) + ocultar banner + expandir iframe vía `iframe.contentDocument` (mismo origen) + `emulate(1920x1080x2)` + click "Saltar guía"/"Cerrar modal"/"Semana" dentro del iframe + screenshot. **Reutilizar `capturas_recortadas/agenda_full_clean.png` (ya capturada a 3840×2160)**; re-capturar solo si hace falta otra pantalla (portal, ficha cliente, etc.).

10. **`RoundedBoxGeometry`** se importa de `three/addons/geometries/RoundedBoxGeometry.js`. Para teclas usar `InstancedMesh` (12×4); labels QWERTY vía `CanvasTexture` en un plano alineado a la misma retícula.

11. **Git:** el equipo commitea a `master` directamente (trabajo de Chispa/agenda/pagos/seguridad entrelazado). `motion_design_pack/` está aislado (no afecta al deploy Expo→`web/app`). Trabajar y commitear motion en `master`. Existe una rama `feat/motion-v3-3d` con spec/plan/voz originales (obsoleta para trabajar; lo útil ya se cherry-pickeó a master).

---

## 4. ARCHIVOS (manifiesto)

| Archivo | Estado | Qué es |
|---|---|---|
| `MECHA_motion_v3.html` | **En construcción (funciona el esqueleto)** | El vídeo. Renderer + spline + timing + audio + HUD + cover + 7 grupos. |
| `MECHA_motion_v2.html` | Backup, NO tocar | Vídeo viejo de referencia. |
| `spike_look.html` | Hecho | Spike de look estático (portátil+orbe). Referencia visual. |
| `generar_voz_v4.py` | Hecho | TTS 7 escenas → `voz/chispa_01..07.wav`. Imprime `SCENES`. |
| `voz/chispa_01..07.wav` | Hecho (71.1 s total) | Locución v4. (`chispa_08..10.wav` son restos viejos del v2.) |
| `qa_video_v3.py` | Hecho | QA Playwright que **asserta** `__qa_ok`, 0 errores, 7 frames (headless). |
| `capturas_recortadas/agenda_full_clean.png` | Hecho (3840×2160) | Agenda real (semana, demo salon) para la pantalla de S3. |
| `capturas_recortadas/01..12_*.png` | **Posiblemente stale/wrong** | Capturas viejas; `01_*` resultó ser la entrada a la demo, no la agenda. **Re-capturar de producción** las que se necesiten (portal, ficha tinte, etc.) con el mismo método que la agenda. |
| `SPEC_motion_v3_2026-08-04.md` | Hecho | Spec aprobado. |
| `PLAN_motion_v3_2026-08-04.md` | Hecho | Plan de 14 tareas (referencia; el ritmo real va por este handoff). |
| `GUION_CHISPA_v3.md` | Viejo | Guion v3 (10 escenas). Rehacer como v4 en Task 14. |

---

## 5. ESTADO EXACTO (qué está hecho y qué no)

### ✅ Hecho y verificado
- **Voz v4** generada. `SCENES = [10.6, 8.7, 9.9, 9.5, 7.1, 16.9, 8.4]` (TOTAL 71.1 s).
- **Spike de look** iterado a v5: portátil 3D con bisagra, teclas oscuras con LED naranja debajo + labels QWERTY, webcam, fueguito de Mecha en el reposamuñecas, orbe Chispa + brasas, bloom umbral 1.1, captura de agenda real.
- **Captura de agenda** desde producción (demo salon, semana, 3840×2160).
- **Esqueleto `MECHA_motion_v3.html`** funcional:
  - Renderer Three.js + `EffectComposer` + `UnrealBloomPass(0.7, 0.55, 1.1)`.
  - Cámara sobre `CatmullRomCurve3` por 7 anclas; `progressFor(elapsed)` alinea anclas a inicios de escena.
  - Motor de timing: `elapsed`, `sceneIndexFor`, `enterScene(i)` (muestra/oculta grupos, dispara `say(i)` + SFX programados + captions cinéticas).
  - Audio: `ensureAudio()`, SFX WebAudio sintetizados (`whoosh/pop/chime/ring/alert/click/ok/coin/boom`), voz vía `new Audio('voz/chispa_NN.wav')`.
  - HUD (play/seek bar/tc, toggles Voz/SFX/CC) + cover ("Tu salón, funcionando solo").
  - `window.__qa_ok = true` al final del init (try/catch).
  - **Verificado:** `__qa_ok=true`, 0 errores de consola reales, los 7 WAVs y la textura cargan (200), el timing cuadra (tc "0:26 / 1:11"), voz y subtítulos se sincronizan por escena, la cámara viaja y en S3 se ve el portátil con la agenda.
- **Constructores:** `makeLaptop(texUrl)`, `makePhone(texUrl)`, `makeOrb()`, `makeLogoTexture()`, `makeKeyboardTexture()`, `loadTex()`.
- **Contenido 3D colocado:** S1 (idx0) móvil + 3 notificaciones; S3 (idx2) portátil con agenda; S4 (idx3) móvil con chat + moneda señal; S5 (idx4) móvil con chip "Señal pagada".

### ⚠️ Empezado, NO terminado (el punto de resumen)
- **Animaciones del loop NO wireadas todavía.** Se crearon las refs en `sceneFx` (`shakePhone`, `chat`, `coin`) y los `startTimes[]`, **pero el `loop()` aún no anima** el temblor del móvil en S1 ni el fade-in del chat/caída de la moneda en S4. Falta añadir ese bloque en `loop()` usando `const local = elapsed - startTimes[cur];`.
- **S2 / S6 / S7 sin overlay DOM todavía.** S2 ("Hola. Soy Chispa") hoy usa solo el caption cinético; falta el wordmark hero. S6 (tabla comparativa implícita + "39 €/mes") y S7 (wordmark **Mecha** + `mechaa.es`) no existen aún — hay que añadir `#s2`, `#compare`, `#cta` en el HTML+CSS y mostrarlos/ocultarlos desde `enterScene` según `cur`.
- **Pantallas de móvil vacías.** `phoneS1`, `phoneS4`, `phoneS5` se crean con pantalla oscura (sin textura). Para premium, deberían llevar capturas reales (portal móvil, chat WhatsApp). Re-capturar de producción.

### ❌ Pendiente (tareas del plan)
- **Task 6 (S1+S2):** wirear animación S1 + wordmark S2.
- **Task 7 (S3):** el portátil ya está; pulir framing y overlay "fase activa/reposo/hueco".
- **Task 8 (S4+S5):** wirear animación S4 (chat+moneda) + captura real del portal para S5.
- **Task 9 (S6+S7):** overlays DOM comparativa + CTA.
- **Task 10:** continuidad/morphs entre escenas (que el móvil de S1 se reutilice en S4, el portátil S3→S5).
- **Task 11:** tipografía cinética (el `#caption` ya existe con keywords resaltadas; pulir).
- **Task 12:** SFX anclados a beats (ya disparan por `sfx[][]` en SCENES), música ambiente, pulido HUD.
- **Task 13:** timing fit (cada escena `d` ≥ duración real de su WAV) + QA final completo (seek a cada escena, screenshot con chrome-devtools, ≤90 s, consola limpia).
- **Task 14:** `GUION_CHISPA_v4.md` + actualizar `README_MOTION_DESIGN.md` + nota de exportación MP4 (OBS o headless Chrome grabando el `#c3d`).

---

## 6. PUNTO DE RESUMEN (por dónde sigue exactamente)

**Próximo paso concreto:** editar `MECHA_motion_v3.html` y dentro de `loop()` añadir (justo antes de `composer.render()`):
```js
const local = elapsed - startTimes[cur];
// S1: movil sonando (temblor)
if(cur===0 && sceneFx.shakePhone){
  sceneFx.shakePhone.rotation.z = Math.sin(t*0.04)*0.05;
  sceneFx.shakePhone.position.x = Math.sin(t*0.05)*0.08;
}
// S4: chat entra por beats + moneda señal cae
if(cur===3 && sceneFx.chat){
  const th=[0.6,2.5,4.0];
  sceneFx.chat.forEach((b,i)=>{ b.material.opacity = local>=th[i] ? Math.min(0.92,(local-th[i])*4) : 0; });
  if(local>=4.0 && sceneFx.coin){
    sceneFx.coin.visible=true;
    sceneFx.coin.position.y = Math.max(0.4, 4 - (local-4.0)*3);
    sceneFx.coin.rotation.z = (local-4.0)*6;
  }
}
```
Después: añadir los overlays DOM de S2/S6/S7 (HTML + CSS + mostrar en `enterScene` según `cur`).
Luego: capturas reales para las pantallas de móvil (portal, chat) → re-capturar de producción.
Verificar cada paso con chrome-devtools (seek a la escena vía click en `#bar` a X %, screenshot a archivo, leer el PNG).

**Duración / orden de las escenas (índice → contenido):** 0 S1 dolor · 1 S2 Chispa · 2 S3 agenda vertical (hero) · 3 S4 24/7 WhatsApp+voz+señal · 4 S5 portal+señal · 5 S6 comparativa+precio · 6 S7 CTA.

**Anclas de cámara (`ANCHORS`, una por escena):** `(0,0,0)`, `(0,0,-45)`, `(-10,3,-88)`, `(10,0,-132)`, `(0,-3,-176)`, `(-8,6,-220)`, `(0,2,-264)`.

---

## 7. CÓMO EJECUTAR Y VERIFICAR

```bash
# server estático del pack (necesario: WebGL y texturas no cargan con file://)
cd motion_design_pack && python -m http.server 8889
# abrir http://127.0.0.1:8889/MECHA_motion_v3.html
```
- **QA estructural (Playwright headless):** `python qa_video_v3.py` → debe imprimir `QA v3 OK — __qa_ok=true...`. Las capturas `qa/v3_escena_*.png` saldrán oscuras (swiftshader); **no juzgar el look por ellas**.
- **Verificación visual (Chrome real):** con **chrome-devtools MCP**:
  1. `navigate_page` a `http://127.0.0.1:8889/MECHA_motion_v3.html`.
  2. (opcional) `emulate viewport='1920x1080x2'` para captura nítida.
  3. `evaluate_script` que haga `document.getElementById('cover').click()` y/o mueva `elapsed` cliqueando la barra (`#bar`) a un %  (`bar.dispatchEvent(new MouseEvent('click',{clientX: rect.left+rect.width*PCT, bubbles:true}))`).
  4. `take_screenshot filePath=...png` y luego `Read` ese PNG para verlo (los MCP de vision externos fallan con error 1210 en estas URLs; fiarse del `Read` que muestra la imagen en la UI).
- **Regenerar voz:** `python generar_voz_v4.py` (requiere `pip install edge-tts pydub` y ffmpeg). Imprime `SCENES` para pegar en `MECHA_motion_v3.html` si cambian las duraciones.
- **Typecheck del repo (no del vídeo):** `npx tsc --noEmit` (ignora errores de `supabase/functions`, son Deno).

---

## 8. CREDENCIAL (⚠️ SENSIBLE — borrar antes de commitear este archivo)

Producción: `https://www.mechaa.es`. Para capturar pantallas del software real:
- Login (cuenta de Carlos): `carlitosocanamartinez@gmail.com` / `minicharlie2007`.
- El salón de esta cuenta está **vacío**; los datos poblados (10 citas, reposos) están en el **salón demo** accesible vía `/demo.html` (que embebe `/app?demo=1`). Usar `demo.html` + expandir iframe + `emulate` para capturar.
- **NO guardar esta contraseña en código commitado ni en memoria permanente.** Este handoff no se commitea mientras la contenga.

---

## 9. NOTAS DE GUSTO DE CARLOS (lo que ha pedido/pedido)

- Le gusta más la composición **oscura/cinematográfica** (no el look sobre-iluminado). El portátil debe verse nítido pero el ambiente premium oscuro.
- El portátil quiere con **detalle real**: teclas (oscuras, **no brillantes**, con LED naranja por debajo), trackpad, webcam, relieves, y el **fueguito de Mecha**.
- Las pantallas deben **leerse** (la agenda real) → pantalla grande, poco inclinada, sin bloom que la sature.
- Quiere **fluir** entre temas (oner), **3D real**, **SFX con cada animación**, letras que acompañen.
- Cero claims falsos: sin Marketplace, sin cifras inventadas, comparativa implícita.

---

## 10. REGLA DE REPARTO (del CLAUDE.md del repo)

Si una tarea envía mensajes reales, mueve dinero, usa IA o integra OAuth → es de **Alexandro**. El resto → **Carlos** (quien suele estar en esta sesión). Este vídeo es todo de Carlos (frontend/UX/motion). Backend/IA/pagos son de Alexandro.
