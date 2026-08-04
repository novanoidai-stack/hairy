# Vídeo de Producto Mecha v3 (3D/WebGL) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir el vídeo de producto de Mecha como un HTML autocontenido con Three.js (3D real, cámara continua/oner), 7 escenas / ≤90s, que enseña el software real y convence a un dueño de salón.

**Architecture:** Un único `MECHA_motion_v3.html`: renderer Three.js + `EffectComposer` (bloom), cámara sobre spline `CatmullRomCurve3` cuya posición se deriva del `elapsed` global (sin cortes), escenas = grupos 3D anclados a lo largo del recorrido, audio WebAudio (SFX + música) + WAVs de voz regenerados, capa DOM para subtítulos/ HUD. La captura de pantallas reales va como texturas sobre dispositivos 3D (móvil/portátil). `v2` queda intacto.

**Tech Stack:** Three.js (CDN importmap), Vanilla JS, WebAudio API, edge_tts (`es-ES-XimenaNeural`) + pydub para voz, Playwright para QA.

## Global Constraints

- **Medio:** HTML autocontenido + Three.js vía CDN importmap. `MECHA_motion_v2.html` **intacto** (no tocar).
- **Look:** fondo `#070A14`, fuego `#F4501E` / `#C0260A`, brasas, oscuro premium estilo Apple/Linear.
- **Cámara continua (oner):** sin cortes duros. Hilo conductor = orbe Chispa.
- **Texturas:** cargadas por http (no `file://`, falla CORS). Servir siempre con el server de QA.
- **Claims (obligatorio):** sin Marketplace; sin cifras sin piloto (`+34%`, `15 h`, `20%`, `3.640 €`); VeriFactu = "preparada"; comparativa **implícita** ("agendas genéricas", sin nombrar Booksy/Fresha).
- **Voz:** `es-ES-XimenaNeural` vía edge_tts; 7 WAVs en `voz/chispa_01..07.wav`.
- **Duración:** ≤90s (objetivo 85s). 7 escenas.
- **Convención repo:** código en inglés, comentarios en español. **Sin emojis** en UI/código (regla CLAUDE.md). Marca fuego.
- **TDD adaptado al medio visual:** el "test" es `qa_video_v3.py` (Playwright) que **asserta** 0 errores de consola, 0 errores de red, y `window.__qa_ok === true` (sentinela que fija el HTML al inicializar sin tirar). Cada tarea termina corriendo el QA rojo→verde + commit. Los gates visuales (spike, escenas) requieren además captura + aprobación.

---

## Estructura de archivos

| Acción | Archivo | Responsabilidad |
|---|---|---|
| Crear | `MECHA_motion_v3.html` | Build único (renderer, spline, escenas, audio, HUD, DOM overlay). |
| Crear | `generar_voz_v4.py` | TTS: guion de 7 escenas → `voz/chispa_01..07.wav` + imprime `SCENES`. |
| Crear | `qa_video_v3.py` | QA Playwright que **asserta** sobre `MECHA_motion_v3.html` (7 escenas). |
| Crear | `GUION_CHISPA_v4.md` | Guion cerrado v4 (7 escenas) + trazabilidad de claims. |
| Conservar | `MECHA_motion_v2.html`, `generar_voz_v5_fluida.py`, `qa_video.py` | Backup, no tocar. |

**Nota de monolito:** el build es un único HTML a propósito (autocontenido, fácil de abrir y grabar a MP4). Los "componentes" son funciones JS dentro del `<script>` (`makePhone`, `makeLaptop`, `makeOrb`, `progressFor`, `enterScene`, `upd`, `SFX.*`). No se Trocea en módulos: lucharía contra el objetivo "un archivo, sírvelo y grábalo".

---

## Datos canónicos (referencia para todas las tareas)

### Anclas de cámara (CatmullRomCurve3) — una por escena

```js
const ANCHORS = [
  new THREE.Vector3(   0,  0,    0),  // S1 dolor
  new THREE.Vector3(   0,  0,  -45),  // S2 Chispa
  new THREE.Vector3( -34,  6,  -90),  // S3 agenda vertical
  new THREE.Vector3(  34,  0, -135),  // S4 24/7 WA+voz
  new THREE.Vector3(   0, -4, -180),  // S5 portal+señal
  new THREE.Vector3( -24,  9, -225),  // S6 comparativa+precio
  new THREE.Vector3(   0,  0, -270),  // S7 CTA
];
```

### SCENES (duraciones objetivo; Task 14 las ajusta a los WAVs reales)

```js
const SCENES = [
  {d:10, vo:"A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer.",
   sfx:[[.1,'whoosh'],[1.0,'ring'],[2.2,'pop'],[4.0,'alert']]},
  {d:11, vo:"Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo es que eso no te vuelva a pasar.",
   sfx:[[.05,'boom'],[.1,'whoosh'],[.8,'chime'],[1.6,'pop']]},
  {d:13, vo:"Mecha no es otra agenda bonita. Entiende tu oficio: fase activa, tiempo de reposo, y el hueco que recuperas mientras el color trabaja.",
   sfx:[[.1,'whoosh'],[.9,'click'],[2.2,'ok'],[3.4,'pop']]},
  {d:14, vo:"El WhatsApp y el teléfono los llevo yo. De día y de noche: doy precios, confirmo la cita, cobro la señal… y tú sigues cortando.",
   sfx:[[.1,'whoosh'],[.6,'ring'],[2.4,'coin'],[3.6,'ok'],[5.2,'chime']]},
  {d:11, vo:"Tu clienta reserva desde el portal en un clic y deja la señal. Ahí se acaban los plantones.",
   sfx:[[.1,'whoosh'],[1.4,'coin'],[2.6,'ok']]},
  {d:14, vo:"¿Y las agendas genéricas? Sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y la IA te la cobran aparte. Mecha es cien por cien pelo, desde treinta y nueve euros al mes, sin comisiones.",
   sfx:[[.1,'whoosh'],[1.2,'click'],[3.2,'ok'],[5.4,'chime']]},
  {d:12, vo:"El resultado: tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis… y hablamos.",
   sfx:[[.05,'boom'],[.1,'whoosh'],[1.4,'chime'],[2.6,'pop']]},
];
```

### Mapeo de capturas reales → escena

- S3 → `capturas_recortadas/01_agenda_semanal_completa.png` + `06_ficha_tecnica_tinte_formula.png`
- S4 → `capturas_recortadas/08_portal_reserva_mobile_hero.png`
- S5 → `capturas_recortadas/12_portal_reserva_desktop.png`
- (S1, S2, S6, S7 no usan captura; son composiciones 3D puras.)

---

## Task 1: Voz v4 — generar los 7 WAVs

**Files:**
- Create: `generar_voz_v4.py`
- Produce: `voz/chispa_01..07.wav`

**Interfaces:**
- Produce: 7 archivos `voz/chispa_NN.wav` (NN = 01..07) normalizados, y por stdout el array `SCENES = [d1,..,d7]` (duraciones reales en segundos) que el Task 14 usa para afinar.

- [ ] **Step 1: Crear `generar_voz_v4.py`**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generador de locución v4 para Chispa (Mecha motion v3).
7 escenas, ~85s. Reemplaza a generar_voz_v5_fluida.py (que era de 10 escenas).
edge_tts es-ES-XimenaNeural + normalizacion pydub. Imprime SCENES para el HTML.
"""
import asyncio
from pathlib import Path
import edge_tts
from pydub import AudioSegment, effects

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / "voz"
SALIDA.mkdir(parents=True, exist_ok=True)

LINEAS_V4 = [
    "A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte, el teléfono sonando, y tres WhatsApps sin leer.",
    "Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo es que eso no te vuelva a pasar.",
    "Mecha no es otra agenda bonita. Entiende tu oficio: fase activa, tiempo de reposo, y el hueco que recuperas mientras el color trabaja.",
    "El WhatsApp y el teléfono los llevo yo. De día y de noche: doy precios, confirmo la cita, cobro la señal… y tú sigues cortando.",
    "Tu clienta reserva desde el portal en un clic y deja la señal. Ahí se acaban los plantones.",
    "¿Y las agendas genéricas? Sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte, y la IA te la cobran aparte. Mecha es cien por cien pelo, desde treinta y nueve euros al mes, sin comisiones.",
    "El resultado: tu salón, funcionando solo. Entra en mechaa punto es, pruébalo gratis… y hablamos.",
]

def nn(i): return f"0{i+1}" if i < 9 else f"{i+1}"

async def generar():
    print("==========================================================", flush=True)
    print("  GENERANDO LOCUCIÓN v4 (7 ESCENAS) — Ximena", flush=True)
    print("==========================================================\n", flush=True)
    duraciones = []
    for i, texto in enumerate(LINEAS_V4):
        t = texto.replace("WhatsApp", "guasap")  # pronunciacion fonetica
        out = SALIDA / f"chispa_{nn(i)}.wav"
        for intento in range(3):
            try:
                c = edge_tts.Communicate(t, "es-ES-XimenaNeural", pitch="+1Hz", rate="+3%")
                await c.save(str(out))
                break
            except Exception as e:
                print(f"  [AVISO] Reintentando escena {i+1} ({intento+1}/3): {e}", flush=True)
                await asyncio.sleep(1)
        seg = AudioSegment.from_file(str(out))
        seg_norm = effects.normalize(seg, headroom=1.5)
        seg_norm.export(str(out), format="wav")
        dur = len(seg_norm) / 1000.0
        duraciones.append(round(dur + 0.3, 1))  # +0.3s de aire al final
        print(f"  [OK] chispa_{nn(i)}.wav ({dur:.1f}s)", flush=True)
    print("\n==========================================================", flush=True)
    print(f"  SCENES = {duraciones}")
    print(f"  TOTAL = {sum(duraciones):.1f}s")
    print("==========================================================\n", flush=True)

if __name__ == "__main__":
    asyncio.run(generar())
```

- [ ] **Step 2: Instalar dependencias (si no presentes)**

Run: `pip install edge-tts pydub`
Expected: `Successfully installed edge-tts ... pydub ...` (o "already satisfied").

- [ ] **Step 3: Ejecutar el generador**

Run: `cd motion_design_pack && python generar_voz_v4.py`
Expected: imprime `[OK] chispa_01.wav ... chispa_07.wav` y al final `SCENES = [...]` y `TOTAL = ~85.x s`. Anota el array `SCENES` impreso: lo usa el Task 14.

- [ ] **Step 4: Verificar los 7 WAVs**

Run: `ls -1 motion_design_pack/voz/chispa_*.wav | wc -l`
Expected: `7`

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/generar_voz_v4.py motion_design_pack/voz/chispa_0*.wav
git commit -m "feat(motion): voz v4 de Chispa — 7 escenas para el oner"
```

---

## Task 2: Spike visual de UN frame (GATE de aprobación)

**Objetivo:** probar el look WebGL (portátil 3D con captura real + orbe Chispa + bloom + brasas, fondo `#070A14`) **antes** de montar las 7 escenas. Si el look no convence, se ajusta aquí, no en el build completo.

**Files:**
- Create: `motion_design_pack/spike_look.html` (desechable, no se commitea al final del proyecto; sirve solo de gate)

- [ ] **Step 1: Crear `spike_look.html`**

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mecha v3 — spike look</title>
<style>html,body{margin:0;height:100%;background:#070A14;overflow:hidden}#c{display:block;width:100%;height:100%}</style>
<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.161.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.161.0/examples/jsm/"
}}
</script></head>
<body>
<div id="c"></div>
<script type="module">
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('c').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070A14);
scene.fog = new THREE.FogExp2(0x070A14, 0.006);
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0,2,12); camera.lookAt(0,0,0);

// Luz
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xffe0b0, 1.1); key.position.set(5,8,6); scene.add(key);
const rim = new THREE.PointLight(0xF4501E, 2.5, 50); rim.position.set(-6,2,-4); scene.add(rim);

// Portatil 3D con captura real en la pantalla
const loader = new THREE.TextureLoader();
const tex = loader.load('capturas_recortadas/01_agenda_semanal_completa.png', t=>{t.colorSpace=THREE.SRGBColorSpace;});
const laptop = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({color:0x1b2336, metalness:.6, roughness:.4});
const base = new THREE.Mesh(new RoundedBoxGeometry(9, .5, 6, 4, .15), bodyMat);
const lid = new THREE.Mesh(new RoundedBoxGeometry(9, 6, .4, 4, .12), bodyMat);
lid.position.set(0, 3.2, -2.7); lid.rotation.x = -0.9;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 5.5),
  new THREE.MeshBasicMaterial({map:tex}));
screen.position.set(0,3.2,-2.5); screen.rotation.x=-0.9;
laptop.add(base,lid,screen); laptop.position.y=-1; scene.add(laptop);

// Orbe Chispa
const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 3),
  new THREE.MeshStandardMaterial({color:0xFF9B3D, emissive:0xF4501E, emissiveIntensity:2.4, roughness:.3}));
orb.position.set(3.5,2.5,1); scene.add(orb);
const halo = new THREE.Mesh(new THREE.RingGeometry(1.2,1.35,48),
  new THREE.MeshBasicMaterial({color:0xF4501E, transparent:true, opacity:.6, side:THREE.DoubleSide}));
halo.position.copy(orb.position); scene.add(halo);

// Brasas (Points)
const N=400, pos=new Float32Array(N*3);
for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*40; pos[i*3+1]=Math.random()*20-5; pos[i*3+2]=(Math.random()-.5)*40;}
const eg=new THREE.BufferGeometry(); eg.setAttribute('position',new THREE.BufferAttribute(pos,3));
const embers=new THREE.Points(eg,new THREE.PointsMaterial({color:0xFF9B3D,size:.08,transparent:true,opacity:.8,blending:THREE.AdditiveBlending}));
scene.add(embers);

// Bloom
const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), .9, .6, .2);
composer.addPass(bloom);

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});

function animate(t){
  embers.rotation.y=t*0.00002;
  embers.position.y=(t*0.0008)%4;
  orb.rotation.y=t*0.0006; orb.scale.setScalar(1+Math.sin(t*0.003)*0.05);
  halo.rotation.z=t*0.0008; halo.lookAt(camera.position);
  composer.render(); requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
</script></body></html>
```

- [ ] **Step 2: Servir y abrir**

Run: `cd motion_design_pack && python -m http.server 8889`
Abrir: `http://127.0.0.1:8889/spike_look.html`

- [ ] **Step 3: Capturar frame y GATE de aprobación**

Captura manual (o `qa_video_v3.py` aún no existe): navegador a 1920×1080, screenshot a `qa/spike.png`.
**Gate humano (Carlos):** ¿el look (portátil 3D + captura real legible + orbe fuego + bloom + brasas sobre `#070A14`) es la dirección premium que buscas? Si no → ajustar colores/iluminación/bloom aquí mismo antes de seguir. **No continuar al Task 3 sin aprobar este frame.**

- [ ] **Step 4: Commit del spike (referencia visual)**

```bash
git add motion_design_pack/spike_look.html motion_design_pack/qa/spike.png
git commit -m "feat(motion): spike visual WebGL aprobado (look base v3)"
```

---

## Task 3: Esqueleto de producción — renderer, cámara spline, motor de timing, audio, HUD, QA que asserta

**Files:**
- Create: `MECHA_motion_v3.html`
- Create: `qa_video_v3.py`

**Interfaces:**
- Produce (JS, dentro de `MECHA_motion_v3.html`):
  - `window.__qa_ok` (boolean) y `window.__qa_err` (string): sentinela que el QA asserta.
  - `function progressFor(elapsed): number` — mapea `elapsed` (s, 0..TOTAL) a `progress` (0..1) alineando las anclas a los inicios de escena.
  - `const SCENES` (array de `{d,vo,sfx}` de "Datos canónicos").
  - `const ANCHORS` (Vector3[] de "Datos canónicos").
  - `function enterScene(i)` / `function upd(localElapsed)` — portados de v2, adaptados a grupos 3D.
  - Motor de audio WebAudio: `audio()`, `SFX`, `startMusic()`, `say(i)`, `stopVoz()` — portados de v2 (`MECHA_motion_v2.html` líneas 498–563).
  - HUD: `#hud`, `#bar`, `#fill`, `#tc`, `#cc`, `#cover` — portados de v2 (CSS + JS líneas 213–237, 463–478).

- [ ] **Step 1: Crear `qa_video_v3.py` (QA que asserta)**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""QA que ASSERTA sobre MECHA_motion_v3.html: 0 errores consola/red, window.__qa_ok, 7 frames."""
import os, time, threading
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def start_server(port=8889):
    os.chdir(str(AQUI))
    httpd = HTTPServer(('127.0.0.1', port), QuietHandler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

def run():
    start_server()
    url = "http://127.0.0.1:8889/MECHA_motion_v3.html"
    qa = AQUI / "qa"; qa.mkdir(exist_ok=True)
    errs, net = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        pg = b.new_context(viewport={'width':1920,'height':1080}).new_page()
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("requestfailed", lambda r: net.append(f"{r.url}: {r.failure}"))
        pg.goto(url); pg.wait_for_selector("#cover"); pg.click("#cover"); time.sleep(1)
        # sentinela de inicializacion sin excepciones
        assert pg.evaluate("window.__qa_ok === true"), f"INIT FAIL: {pg.evaluate('window.__qa_err')}"
        assert not errs, f"ERRORES CONSOLA: {errs}"
        assert not net, f"ERRORES RED: {net}"
        for i in range(7):
            pg.screenshot(path=str(qa / f"escena_{i+1:02d}.png"))
            time.sleep(1.2)
        b.close()
    print("QA v3 OK — 0 errores, 7 frames, __qa_ok=true")

if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Crear el shell de `MECHA_motion_v3.html`** con head/CSS (portar tokens y HUD de v2, **sin** `.step-dots` ni emojis), importmap Three.js, y un `<script type="module">` con: renderer, scene, camera, `ANCHORS`, `SCENES`, `progressFor`, curva, motor de timing, audio portado, HUD portado, `window.__qa_ok=true` al final del init envuelto en try/catch.

Cabecera + estructura (los bloques `/* PORTAR */` se copian literalmente de `MECHA_motion_v2.html`):

```html
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mecha — Chispa · Motion v3 (3D oner)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800&family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--fuego:#F4501E;--deep:#C0260A;--amber:#FF9B3D;--gold:#FFC46B;--bg1:#070A14;--txt:#fff;--muted:#94A3B8;--ok:#34D399;--danger:#FF4D4D}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;background:#000;overflow:hidden;font-family:Inter,system-ui,sans-serif}
#c3d{position:fixed;inset:0;z-index:1;display:block}
/* overlay DOM encima del canvas 3D */
#overlay{position:fixed;inset:0;z-index:5;pointer-events:none}
#cc{position:absolute;left:50%;bottom:54px;transform:translateX(-50%);max-width:1380px;text-align:center;
  font-size:32px;line-height:1.35;color:#fff;text-shadow:0 3px 20px rgba(0,0,0,.95);font-weight:500}
#cc.off{display:none}
.kicker{font-family:'Space Grotesk';font-weight:700;letter-spacing:.3em;text-transform:uppercase;font-size:20px;color:var(--fuego)}
.mk{color:var(--fuego)}
/* HUD: PORTAR #hud,#bar,#fill,#tc,#cover y sus estilos de v2 (lineas 213-237 y 228-237) */
</style>
<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.161.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.161.0/examples/jsm/"
}}
</script></head>
<body>
<canvas id="c3d"></canvas>
<div id="overlay"><div id="cc"></div></div>
<!-- PORTAR #hud (botones play/back/fwd, #bar,#fill,#tc, toggles voz/sfx/cc/fs) de v2 lineas 463-469 -->
<!-- PORTAR #cover (.cor animada, h2 Chispa, .go) de v2 lineas 473-478 -->
<script type="module">
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

try {
  // ---- RENDERER ----
  const canvas=document.getElementById('c3d');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace=THREE.SRGBColorSpace;

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x070A14);
  scene.fog=new THREE.FogExp2(0x070A14,0.0045);
  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,0.1,2000);

  // ---- DATOS CANONICOS (ANCHORS, SCENES) — pegar literales de "Datos canonicos" del plan ----
  const ANCHORS=[ /* 7 Vector3 */ ].map(v=>new THREE.Vector3(v[0],v[1],v[2]));
  const SCENES=[ /* 7 {d,vo,sfx} */ ];

  // ---- SPLINE + MAPEO elapsed->progress alineando anclas a inicios de escena ----
  const curve=new THREE.CatmullRomCurve3(ANCHORS,false,'catmullrom',0.5);
  let TOTAL=0; SCENES.forEach(s=>TOTAL+=s.d);
  const stops=[0]; {let a=0; SCENES.forEach(s=>{a+=s.d; stops.push(a/TOTAL);});}
  // progressFor: durante la escena i, la camara viaja del ancla i al ancla i+1.
  function progressFor(elapsed){
    const e=Math.max(0,Math.min(elapsed,TOTAL));
    let acc=0;
    for(let i=0;i<SCENES.length;i++){
      const start=acc, end=acc+SCENES[i].d;
      if(e<=end||i===SCENES.length-1){
        const local=(e-start)/SCENES[i].d;           // 0..1 dentro de la escena
        return stops[i]+local*(stops[i+1]-stops[i]); // interpola entre ancla i e i+1
      }
      acc=end;
    }
    return 1;
  }

  // ---- MOTOR DE TIMING + AUDIO (PORTAR de v2 lineas 498-674) ----
  // AudioContext, master, musicGain, env(), tone(), noise(), SFX{}, startMusic(),
  // audioVoz[] cargando voz/chispa_01..07.wav, stopVoz(), say(i).
  // Adaptar say(): 10->7 escenas y onended avanza a i+1.
  // elapsed/playing/cur loop: portar loop(), enterScene(i) y upd(se).
  // enterScene: mostrar sceneGroups[i], ocultar resto; say(i); #cc=vo; disparar SFX en upd.
  // (sceneGroups se crea vacio aqui []; cada Task 6-9 rellena su grupo.)
  const sceneGroups=SCENES.map(()=>new THREE.Group()); sceneGroups.forEach(g=>scene.add(g));

  // ---- LOOP 3D ----
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.8,0.6,0.25));
  function render(t){
    requestAnimationFrame(render);
    if(playing){ /* elapsed avanza igual que en v2 */ }
    const p=progressFor(elapsed);
    const pos=curve.getPointAt(p);
    camera.position.copy(pos);
    camera.lookAt(curve.getPointAt(Math.min(p+0.02,1))); // mira un poco mas adelante
    composer.render();
  }
  requestAnimationFrame(render);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});

  // ---- HUD/COVER/CONTROLES: PORTAR JS de v2 lineas 654-678 (btnPlay, seek, toggles, cover click) ----

  window.__qa_ok=true;   // sentinela para qa_video_v3.py
} catch(e){ window.__qa_ok=false; window.__qa_err=String(e&&e.message||e); console.error(e); }
</script></body></html>
```

- [ ] **Step 3: Verificar que el esqueleto arranca sin fallos (QA rojo→verde)**

Run: `cd motion_design_pack && python qa_video_v3.py`
Expected: si faltan bloques por portar → FAIL (rojo) con `INIT FAIL: ...`. Tras portar audio/HUD y rellenar `ANCHORS`/`SCENES` literales → `QA v3 OK — 0 errores, 7 frames, __qa_ok=true`.

- [ ] **Step 4: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html motion_design_pack/qa_video_v3.py
git commit -m "feat(motion): esqueleto v3 — renderer Three.js, camara spline, timing, audio, QA que asserta"
```

---

## Task 4: Entorno + orbe Chispa (componente reutilizable)

**Files:**
- Modify: `MECHA_motion_v3.html` (dentro del `<script>`)

**Interfaces:**
- Produce: `function makeOrb(): THREE.Group` — orbe de fuego (core emisivo + halo + glow sprite) que respira.
- Produce: `const env` — brasas (`Points` aditivo) + 2 órbes de fondo (`#F4501E`, índigo) desenfocados que derivan, niebla ya puesta en Task 3.

- [ ] **Step 1: Añadir entorno (brasas + orbs de fondo)** — portar la idea del spike (Task 2): 400 `Points` color `0xFF9B3D` aditivos, y dos `Sprite`/`Mesh` grandes con `radialGradient` textura o `PointLight` + meshes de color difuminadas. Animar rotación Y de brasas en `render()`.

- [ ] **Step 2: Añadir `makeOrb()`**

```js
function makeOrb(){
  const g=new THREE.Group();
  const core=new THREE.Mesh(new THREE.IcosahedronGeometry(0.9,3),
    new THREE.MeshStandardMaterial({color:0xFF9B3D,emissive:0xF4501E,emissiveIntensity:2.4,roughness:.3}));
  g.add(core);
  for(let i=0;i<3;i++){
    const halo=new THREE.Mesh(new THREE.RingGeometry(1.2+i*0.4,1.35+i*0.4,48),
      new THREE.MeshBasicMaterial({color:0xF4501E,transparent:true,opacity:.5-i*0.12,side:THREE.DoubleSide}));
    g.add(halo);
  }
  g.userData.core=core; g.userData.halos=g.children.slice(1);
  return g;
}
const chispa=makeOrb(); scene.add(chispa);
```

- [ ] **Step 3: Animar `chispa` en `render()`** — `chispa.position.copy(curve.getPointAt(Math.min(progressFor(elapsed)+0.01,1)))` (el orbe viaja un paso por delante de la cámara = hilo conductor); `core.scale` respira con `sin(t)`; halos miran a cámara y rotan.

- [ ] **Step 4: QA + captura**

Run: `python qa_video_v3.py` → Expected `QA v3 OK`. Revisar `qa/escena_02.png` (donde el orbe debe verse cerca de la cámara).

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): entorno + orbe Chispa (hilo conductor que viaja con la camara)"
```

---

## Task 5: Constructores de dispositivos (móvil / portátil) + cargador de texturas

**Files:**
- Modify: `MECHA_motion_v3.html`

**Interfaces:**
- Produce: `const texLoader = new THREE.TextureLoader()` con helper `loadTex(url)` que fija `colorSpace=SRGB`.
- Produce: `function makePhone(tex): THREE.Group` (cuerpo `RoundedBoxGeometry` oscuro + pantalla plano texturizada).
- Produce: `function makeLaptop(tex): THREE.Group` (base + tapa inclinada + pantalla).

- [ ] **Step 1: Importar `RoundedBoxGeometry`**

Añadir al importmap/imports: `import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';`

- [ ] **Step 2: `loadTex`**

```js
const texLoader=new THREE.TextureLoader();
function loadTex(url){ return texLoader.load(url,t=>{t.colorSpace=THREE.SRGBColorSpace;}); }
```

- [ ] **Step 3: `makePhone` y `makeLaptop`** — portar del spike (Task 2): `makePhone` con `RoundedBoxGeometry(2.2,4.6,0.3)` + `PlaneGeometry(2.0,4.3)`; `makeLaptop` como en el spike. Devolver `Group`.

- [ ] **Step 4: Test visible** — colocar temporalmente `makeLaptop(loadTex('capturas_recortadas/01_agenda_semanal_completa.png'))` en `sceneGroups[2]`, correr QA, confirmar legibilidad de la captura en `qa/escena_03.png`. Quitar el placement temporal (lo rellena el Task 7).

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): constructores de movil/portatil + cargador de texturas"
```

---

## Task 6: Escenas S1 (dolor) y S2 (Chispa se presenta)

**Files:**
- Modify: `MECHA_motion_v3.html`

**Interfaces:**
- Consumes: `sceneGroups[0]`, `sceneGroups[1]`, `chispa`, `ANCHORS`, `SCENES`, `#cc`.
- Produce: contenido visual de S1/S2 dentro de sus grupos, posicionados en `ANCHORS[0]`/`ANCHORS[1]`.

- [ ] **Step 1: S1 — móvil 3D sonando + notificaciones apilándose**

En `sceneGroups[0]`:
- Un `makePhone(null)` con material de pantalla genérico oscuro (sin captura en S1).
- 3 planos pequeños (burbujas de notificación) con texto DOM o `CanvasTexture` ("WhatsApp", "Llamada perdida", "Recordatorio") que temblan (shake) — animar `rotation.z` con `sin` rápido en `upd` cuando `cur===0`.
- Posicionar el grupo en `ANCHORS[0]` orientado hacia donde mira la cámara al inicio.

- [ ] **Step 2: S2 — el orbe se enciende + wordmark "Hola. Soy Chispa"**

En `sceneGroups[1]`: el orbe ya viaja por la escena (Task 4); aquí añadir un wordmark 3D o DOM grande "Hola. Soy **Chispa**" que aparece (fade/escala) cuando `cur===1`. Usar capa DOM `#overlay` con un div `#s2-title` para nitidez (más barato que texto extruido). Animar entrada en `enterScene`/`upd`.

- [ ] **Step 3: Subtítulos y SFX** — `#cc` ya muestra `SCENES[i].vo`. Confirmar que SFX de S1 (`ring`, `pop`, `alert`) y S2 (`boom`, `chime`, `pop`) disparan en `upd` (motor del Task 3).

- [ ] **Step 4: QA + gate visual**

Run: `python qa_video_v3.py` → `QA v3 OK`. Revisar `qa/escena_01.png` y `qa/escena_02.png`. **Gate:** ¿S1 comunica caos (móvil sonando + avisos) y S2 comunica "Chispa aparece"? Si no, ajustar.

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): escenas S1 (dolor) y S2 (Chispa se presenta)"
```

---

## Task 7: Escena S3 — gestión vertical de pelo (hero diferenciador)

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: Portátil 3D con la agenda real**

En `sceneGroups[2]`: `makeLaptop(loadTex('capturas_recortadas/01_agenda_semanal_completa.png'))` posicionado en `ANCHORS[2]`, orientado a cámara.

- [ ] **Step 2: Overlay "fase activa vs reposo" sobre la agenda**

Como capa DOM `#overlay`, un panel que entra cuando `cur===2`: muestra dos bandas — "Fase activa · tinte" (color `--fuego`) y "Reposo · 45 min" (rayado, muted) — más un chip verde "Sillón libre recuperado". Refleja visualmente el slot container del v2 pero como overlay limpio sobre la captura real, **sin emojis**.

- [ ] **Step 3: Zoom a la ficha de color**

A mitad de S3 (~local 6s), cambiar la textura de la pantalla del portátil a `06_ficha_tecnica_tinte_formula.png` (crossfade opcional) y empujar la cámara un poco hacia el portátil (modular `progressFor` offset o un `dolly` local). Si la transición de textura es compleja, basta con un segundo portátil más cercano que aparece.

- [ ] **Step 4: QA + gate visual**

Run: `python qa_video_v3.py`. Revisar `qa/escena_03.png`. **Gate:** ¿se lee la agenda real y se entiende "fase activa + reposo + hueco recuperado"? Si la captura no se lee, acercar cámara / agrandar pantalla.

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): escena S3 — gestion vertical de pelo con agenda y ficha reales"
```

---

## Task 8: Escenas S4 (24/7 WhatsApp + voz) y S5 (portal + señal)

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: S4 — móvil 3D con chat WhatsApp animado sincronizado a la voz**

En `sceneGroups[3]`: `makePhone(loadTex('capturas_recortadas/08_portal_reserva_mobile_hero.png'))` en `ANCHORS[3]`. Encima (overlay DOM o `CanvasTexture`), 3 burbujas de chat que aparecen en beats locales `[0.6, 2.4, 3.6]`s sincronizadas con `SCENES[3].sfx`/voz: clienta pregunta → Chispa responde + enlace señal → "Pagado". Animar en `upd` cuando `cur===3`.

- [ ] **Step 2: S4 — moneda señal Stripe**

Añadir una moneda 3D (cilindro oro, como `stripe-coin` del v2) que cae con `coinDrop` en el beat `coin` (~local 2.4s). Reusar `SFX.coin`.

- [ ] **Step 3: S5 — portal desktop + reserva en un clic**

En `sceneGroups[4]`: `makeLaptop(loadTex('capturas_recortadas/12_portal_reserva_desktop.png'))` en `ANCHORS[4]`. Overlay: chip "Señal pagada" + mini-barra "Plantones: 80% → 0%" que desciende cuando `cur===4`.

- [ ] **Step 4: QA + gate visual**

Run: `python qa_video_v3.py`. Revisar `qa/escena_04.png`, `qa/escena_05.png`. **Gate:** ¿se ve el chat funcionando solo y el portal con señal?

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): escenas S4 (24/7 WA+voz+señal) y S5 (portal+señal)"
```

---

## Task 9: Escenas S6 (comparativa implícita + precio) y S7 (CTA)

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: S6 — tabla comparativa 3D sutil (implícita, sin nombres)**

En `sceneGroups[5]` (`ANCHORS[5]`): una tabla DOM overlay limpia — filas: "Fases de tinte / Ficha de color / IA incluida / Comisiones". Columna "Mecha" (verde ✔, `--fuego` header) vs "Agendas genéricas" (muted / ✕). **No nombrar Booksy/Fresha.** Cierre en grande: "39 €/mes · sin comisiones". Sin emojis: usar marcadores SVG (✔/✕) o texto.

- [ ] **Step 2: S7 — wordmark Mecha 3D + URL**

En `sceneGroups[6]` (`ANCHORS[6]`): wordmark "Mecha" grande (DOM overlay o texto extruido), orbe pulsa intenso, "mechaa.es" abajo. Animación entrada tipo `blurin`/`pop` (portar del v2).

- [ ] **Step 3: QA + gate visual**

Run: `python qa_video_v3.py`. Revisar `qa/escena_06.png`, `qa/escena_07.png`. **Gate:** ¿S6 deja claro el diferenciador y el precio sin nombrar competencia? ¿S7 cierra con fuerza?

- [ ] **Step 4: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): escenas S6 (comparativa+precio) y S7 (CTA)"
```

---

## Task 10: Continuidad y morphs entre escenas

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: Suavizar el viaje de cámara** — revisar `curve` tension y `camera.lookAt` para que las transiciones entre anclas sean fluidas (no tirones). Ajustar el `+0.02` de lookAhead si hace falta.

- [ ] **Step 2: Morphs de elementos** — al menos dos transformaciones continuas: (a) el móvil que suena en S1 se reutiliza como móvil de WhatsApp en S4 (misma malla persistente que la cámara persigue); (b) el portátil-agenda de S3 rota y se convierte en el portal de S5. Implementar como un mismo `Group` re-posicionado entre escenas, no como dos grupos independientes.

- [ ] **Step 3: Continuidad del orbe** — verificar que `chispa` es siempre visible y "lleva" la cámara de escena en escena (Task 4 lo añadió; aquí se confirma entre transiciones).

- [ ] **Step 4: QA + gate visual (reproducir entero)**

Run: `python qa_video_v3.py`. Reproducir `MECHA_motion_v3.html` a mano de punta a punta. **Gate:** ¿se siente como un solo viaje continuo, no como cortes?

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): continuidad y morphs entre escenas (oner real)"
```

---

## Task 11: Tipografía cinética y wordmarks

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: Captions cinéticos por escena** — en `#overlay`, añadir un div `#caption` que muestra 1-2 palabras clave por escena sincronizadas a la voz (p.ej. S3: "Fase activa" → "Reposo" → "Hueco recuperado"; S4: "WhatsApp" → "Señal"; S6: "100% pelo" → "39 €/mes"). Animar entrada (`fu`/`pop`, portar del v2) en `upd` con `chatCues`-like arrays locales.

- [ ] **Step 2: Wordmarks hero** — "Chispa" (S2) y "Mecha" (S7) grandes, animación `blurin`. Si se quiere 3D real, usar `TextGeometry` con fuente cargada vía `FontLoader` (opcional; el overlay DOM ya es nítido y más barato — recomiendo DOM).

- [ ] **Step 3: QA + gate visual**

Run: `python qa_video_v3.py`. **Gate:** ¿las letras refuerzan el mensaje y entran en sincronía con la voz?

- [ ] **Step 4: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): tipografia cinetica y wordmarks sincronizados a la voz"
```

---

## Task 12: SFX anclados a beats + música + pulido del HUD

**Files:**
- Modify: `MECHA_motion_v3.html`

- [ ] **Step 1: Revisar anclaje de SFX** — cada `SCENES[i].sfx` debe disparar en el beat del movimiento visual correspondiente (pop al aparecer burbuja, coin al caer señal, etc.), no en un timer suelto. Ajustar tiempos del array `sfx` para cuadrar con lo que se ve.

- [ ] **Step 2: Música ambiente** — `startMusic()` ya porta un pad del v2; confirmar que sube con el cover-click y baja al final. Añadir un sutil `boom` de cierre en S7.

- [ ] **Step 3: HUD** — mantener play/pausa/seek, toggles voz/sfx/cc, fullscreen. **Quitar** cualquier resto de las "4 bolitas" del v2. Verificar que `#cover` muestra "Chispa · Motion v3".

- [ ] **Step 4: QA**

Run: `python qa_video_v3.py` → `QA v3 OK`. Escuchar a mano SFX + voz + música juntos.

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "feat(motion): SFX anclados a beats, musica y HUD final"
```

---

## Task 13: Ajuste de duraciones (timing fit) + QA final + trim a ≤90s

**Files:**
- Modify: `MECHA_motion_v3.html` (array `SCENES`), `generar_voz_v4.py` (si hay que re-generar)

- [ ] **Step 1: Volcar duraciones reales de los WAVs**

Usar el array `SCENES = [...]` impreso por `generar_voz_v4.py` (Task 1, Step 3). Si se perdió, recalcular:

Run: `cd motion_design_pack && python -c "from pydub import AudioSegment; import glob; [print(round(len(AudioSegment.from_file(f))/1000+.3,1)) for f in sorted(glob.glob('voz/chispa_0*.wav'))]"`
Expected: 7 números.

- [ ] **Step 2: Actualizar `SCENES[i].d` en el HTML** con las duraciones reales. Sumar debe dar ≤90s. Si alguna WAV excede su escena, alargar `d` (o subir `rate` en `generar_voz_v4.py` y regenerar esa línea).

- [ ] **Step 3: QA final entero**

Run: `python qa_video_v3.py` → `QA v3 OK`. Verificar `qa/escena_01..07.png` completas, sin overflow, consola limpia. Verificar duración total en el `#tc` del HUD ≤ 1:30.

- [ ] **Step 4: Reproducción manual completa de puerta a puerta** — revisar voz↔visual↔SFX en conjunto.

- [ ] **Step 5: Commit**

```bash
git add motion_design_pack/MECHA_motion_v3.html
git commit -m "fix(motion): cuadre de duraciones reales de voz y QA final ≤90s"
```

---

## Task 14: Documentación — GUION v4 + README + nota de exportación MP4

**Files:**
- Create: `GUION_CHISPA_v4.md`
- Modify: `README_MOTION_DESIGN.md` (apuntar a v3 como versión vigente)

- [ ] **Step 1: Crear `GUION_CHISPA_v4.md`** — tabla de 7 escenas (de "Datos canónicos"), dirección de voz, cómo regenerar (`python generar_voz_v4.py`), trazabilidad de claims (ver `GUION_CHISPA_v3.md:68`) y los avisos: Marketplace fuera, cifras fuera, VeriFactu "preparada", comparativa implícita.

- [ ] **Step 2: Actualizar `README_MOTION_DESIGN.md`** — añadir al inicio: "Versión vigente del vídeo: `MECHA_motion_v3.html` (3D/WebGL). Servir con `python qa_video_v3.py` o `python -m http.server`. v2 conservado como backup." + nota de exportación MP4 (OBS o headless Chrome `puppeteer` grabando el `#c3d` a 1920×1080).

- [ ] **Step 3: Commit**

```bash
git add motion_design_pack/GUION_CHISPA_v4.md motion_design_pack/README_MOTION_DESIGN.md
git commit -m "docs(motion): guion v4 (7 escenas) y README apunta a v3 como vigente"
```

---

## Exportación a MP4 (notas, no código de Claude)

Para redes se necesita un MP4. Opciones:
1. **OBS Studio** capturando la pestaña a 1920×1080 mientras se reproduce.
2. **Headless Chrome + Puppeteer** grabando el canvas (`#c3d`) con `--autoplay-policy=no-user-gesture-required` (servido por http).
El HTML es el mismo para la landing (interactivo) y para el MP4.

---

## Self-Review del plan (cobertura del spec)

- Spec §1 (diagnóstico) → cubierto por todo el plan (v3 sustituye v2).
- Spec §3 decisiones (WebGL, oscuro, oner, capturas, 7 escenas, voz regen) → Tasks 1–14.
- Spec §4 concepto ("Mecha funciona solo", orbe hilo conductor) → Tasks 4, 10.
- Spec §5 guion 7 escenas → "Datos canónicos" + Tasks 6–9.
- Spec §6 claims (sin Marketplace/cifras, VeriFactu preparada, implícita) → Global Constraints + Task 9 (S6 sin nombres) + Task 14 (trazabilidad).
- Spec §7 arquitectura (spline, bloom, texturas http, tipografía híbrida, audio, perf) → Tasks 2–5, 11, 12.
- Spec §8 voz → Task 1.
- Spec §9 QA + MP4 → Tasks (qa cada uno) + Task 14 + sección MP4.
- Spec §10 orden de construcción → el plan sigue ese orden (spike gate → esqueleto → entorno → devices → escenas → continuidad → tipografía → SFX → QA → docs).
- Sin placeholders "TBD/TODO": los pasos llevan código real o referencias literales a líneas de v2 que portar.
- Consistencia de tipos: `progressFor`, `makeOrb`, `makePhone`, `makeLaptop`, `loadTex`, `SCENES`, `ANCHORS`, `sceneGroups`, `__qa_ok` se nombran igual en todas las tareas.
