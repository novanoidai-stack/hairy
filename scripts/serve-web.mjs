// Servidor estatico local que reproduce el deploy de Vercel (vercel.json):
//   - sirve web/ como raiz                -> /  = landing, /acceso.html = login
//   - reescribe /app y /app/* al SPA      -> web/app/index.html (export de Expo)
// Un solo origen, un solo login. Sin dependencias (solo Node nativo).
//
// Uso:  node scripts/serve-web.mjs   (PORT configurable, por defecto 8080)
// Antes hay que generar el build del app:  npm run build:web

import http from 'node:http';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'web');
const APP_INDEX = path.join(ROOT, 'app', 'index.html');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

async function exists(file) {
  try {
    const st = await fs.stat(file);
    return st.isFile();
  } catch {
    return false;
  }
}

// Resuelve la peticion a un fichero dentro de web/ sin permitir traversal.
async function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  if (pathname === '/') pathname = '/index.html';

  // Candidato dentro de ROOT (web/)
  const candidate = path.normalize(path.join(ROOT, pathname));
  if (!candidate.startsWith(ROOT)) return null; // traversal -> fuera

  if (await exists(candidate)) return candidate;

  // Carpeta -> index.html
  if (await exists(path.join(candidate, 'index.html'))) {
    return path.join(candidate, 'index.html');
  }

  // Reescritura SPA del app (igual que rewrites de vercel.json): /app y /app/*
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    if (await exists(APP_INDEX)) return APP_INDEX;
  }

  // Directorio publico: mismas reescrituras que vercel.json, si no el espejo
  // local da 404 en las URLs limpias que si funcionan en produccion.
  if (pathname === '/salones') {
    const f = path.join(ROOT, 'salones.html');
    if (await exists(f)) return f;
  }
  if (/^\/salon\/[^/]+$/.test(pathname)) {
    const f = path.join(ROOT, 'salon.html');
    if (await exists(f)) return f;
  }
  if (pathname === '/calculadora-comisiones') {
    const f = path.join(ROOT, 'calculadora-comisiones.html');
    if (await exists(f)) return f;
  }

  return null;
}

// Mismas reglas de Cache-Control que vercel.json, para que medir en local se
// parezca a produccion. Los estaticos del export de Expo llevan hash en el
// nombre, asi que son immutable; el resto de /app (index.html, manifest) no.
const INMUTABLE = 'public, max-age=31536000, immutable';
function cacheControl(pathname) {
  if (pathname.startsWith('/app/_expo/') || pathname.startsWith('/app/assets/')) return INMUTABLE;
  if (pathname.startsWith('/app')) return 'no-store, must-revalidate';
  if (/^\/assets\/.*\.(png|jpg|jpeg|gif|webp|avif|svg|ico|mp3|woff|woff2|ttf|otf)$/.test(pathname)) return INMUTABLE;
  if (/^\/assets\/.*\.(css|js)$/.test(pathname)) return 'public, max-age=600, stale-while-revalidate=86400';
  return 'public, max-age=0, must-revalidate';
}

// Vercel comprime todo lo que sirve. Sin esto, medir tamanos en local engana:
// el bundle del app pasa de ~7 MB en claro a una fraccion por la red.
const COMPRIMIBLE = /^(text\/|application\/(javascript|json|manifest|xml)|image\/svg)/;
function encoding(req, type) {
  if (!COMPRIMIBLE.test(type)) return null;
  const acepta = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(acepta)) return 'br';
  if (/\bgzip\b/.test(acepta)) return 'gzip';
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const file = await resolveFile(req.url || '/');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>No encontrado. Si esperabas el software, ejecuta primero <code>npm run build:web</code>.</p>');
      return;
    }
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    const type = contentType(file);
    const enc = encoding(req, type);
    const headers = { 'Content-Type': type, 'Cache-Control': cacheControl(pathname) };
    if (enc) {
      headers['Content-Encoding'] = enc;
      headers['Vary'] = 'Accept-Encoding';
    }
    res.writeHead(200, headers);
    const origen = createReadStream(file);
    if (!enc) { origen.pipe(res); return; }
    const compresor = enc === 'br' ? zlib.createBrotliCompress() : zlib.createGzip();
    pipeline(origen, compresor, res, () => {});
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 ' + (err?.message || 'error'));
  }
});

server.listen(PORT, async () => {
  const hasBuild = await exists(APP_INDEX);
  console.log(`\n  Mecha — espejo local de Vercel`);
  console.log(`  Sirviendo:  ${ROOT}`);
  console.log(`  Landing:    http://localhost:${PORT}/`);
  console.log(`  Login:      http://localhost:${PORT}/acceso.html`);
  console.log(`  Software:   http://localhost:${PORT}/app`);
  if (!hasBuild) {
    console.log(`\n  AVISO: no existe web/app/index.html. Ejecuta:  npm run build:web\n`);
  } else {
    console.log('');
  }
});
