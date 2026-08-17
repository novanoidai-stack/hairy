// Post-build del export web (expo export -p web --output-dir web/app).
// El index.html que genera Expo es un cascaron vacio: mientras el bundle (~7 MB)
// descarga y arranca, el usuario veia una pantalla BLANCA varios segundos.
// Este script inyecta en web/app/index.html:
//   1. Un splash de marca inline (fondo crema + logo + spinner CSS puro) dentro
//      de #root: pinta al instante y React lo reemplaza solo al montar.
//   2. preconnect a Supabase y a las fuentes + la hoja de Google Fonts, para que
//      esas conexiones avancen en paralelo con la descarga del bundle (antes las
//      inyectaba el propio bundle en runtime, tarde).
// Y ademas copia el motor de comisiones a web/assets (ver mas abajo).
// Vercel ejecuta build:web, asi que el deploy lleva esto siempre.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// Motor de comisiones para la landing publica
//
// /calculadora-comisiones es HTML estatico y no pasa por el bundle de Expo, pero
// tiene que calcular EXACTAMENTE igual que el simulador de dentro de la app. En
// vez de duplicar la logica (que acabaria dando cifras distintas en el marketing
// y en el producto), se copia el modulo tal cual: es JavaScript puro ESM sin
// dependencias justo para poder hacer esto.
//
// Las copias van gitignoradas: la fuente unica vive en lib/comisiones/.
// Este bloque va ANTES de los early-exit de abajo a proposito, para que se ejecute
// aunque el index.html ya estuviera parcheado.
// ---------------------------------------------------------------------------
const destinoComisiones = join(root, 'web', 'assets', 'comisiones');
mkdirSync(destinoComisiones, { recursive: true });
for (const fichero of ['motor.js', 'parametrosLegales.js']) {
  const origen = join(root, 'lib', 'comisiones', fichero);
  if (!existsSync(origen)) {
    console.error(`[postbuild-web] Falta lib/comisiones/${fichero}: la calculadora publica no funcionara.`);
    process.exit(1);
  }
  copyFileSync(origen, join(destinoComisiones, fichero));
}
console.log('[postbuild-web] Motor de comisiones copiado a web/assets/comisiones/');

const indexPath = join(root, 'web', 'app', 'index.html');

if (!existsSync(indexPath)) {
  console.error('[postbuild-web] No existe web/app/index.html (¿fallo el export?)');
  process.exit(1);
}

let html = readFileSync(indexPath, 'utf8');

if (html.includes('mecha-splash')) {
  console.log('[postbuild-web] index.html ya tiene el splash, nada que hacer.');
  process.exit(0);
}

const headInject = `
    <meta name="theme-color" content="#f4501e" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="preconnect" href="https://vtrggiogjrhqtwbhbgia.supabase.co" crossorigin />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />
    <!-- UNICA hoja de fuentes de la app (antes se pedia tambien desde _layout.tsx y
         WebScrollbarStyles: tres descargas de lo mismo). Las tres familias que usa
         el software: Inter (texto), Bricolage Grotesque (titulares) e Instrument
         Serif. Se carga sin bloquear el render (media=print + onload) para que el
         splash pinte de inmediato; el <noscript> cubre el caso sin JS. -->
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bricolage+Grotesque:wght@600;700;800&family=Instrument+Serif:ital@0;1&display=swap" />
    <link rel="stylesheet" media="print" onload="this.media='all';this.onload=null" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bricolage+Grotesque:wght@600;700;800&family=Instrument+Serif:ital@0;1&display=swap" />
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bricolage+Grotesque:wght@600;700;800&family=Instrument+Serif:ital@0;1&display=swap" /></noscript>
    <style id="mecha-splash-css">
      #root { background: #f6f1ea; }
      .mecha-splash {
        position: fixed; inset: 0; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 18px;
        background: #f6f1ea; z-index: 0;
      }
      .mecha-splash-mark {
        font-family: 'Bricolage Grotesque', 'Inter', system-ui, sans-serif;
        font-size: 34px; font-weight: 800; letter-spacing: -1.2px; color: #1c1814;
      }
      .mecha-splash-mark span { color: #f4501e; }
      .mecha-splash-spinner {
        width: 26px; height: 26px; border-radius: 999px;
        border: 3px solid rgba(244,80,30,0.18); border-top-color: #f4501e;
        animation: mecha-spin 0.8s linear infinite;
      }
      .mecha-splash-hint { font-family: 'Inter', system-ui, sans-serif; font-size: 12.5px; color: #736658; }
      @keyframes mecha-spin { to { transform: rotate(360deg); } }
    </style>
`;

const splashHtml = `<div class="mecha-splash" id="mecha-splash" aria-hidden="true">
      <div class="mecha-splash-mark">Mecha<span>.</span></div>
      <div class="mecha-splash-spinner"></div>
      <div class="mecha-splash-hint">Cargando tu salon…</div>
    </div>`;

html = html.replace('</head>', `${headInject}</head>`);
html = html.replace('<div id="root"></div>', `<div id="root">${splashHtml}</div>`);
html = html.replace('<title>Mecha</title>', '<title>Mecha — Software de gestion para salones</title>');

writeFileSync(indexPath, html, 'utf8');
console.log('[postbuild-web] Splash + preconnects inyectados en web/app/index.html');
