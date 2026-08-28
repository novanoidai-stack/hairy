// Decision 7 de CLAUDE.md (17 ago 2026): los estaticos del export de Expo llevan
// hash en el nombre, asi que /app/_expo y /app/assets van immutable. Estuvo TODO
// en no-store y eso obligaba a re-descargar el bundle de ~7 MB en cada carga,
// cada login y cada apertura de la demo.
//
// Volver a poner no-store a /app/(.*) no rompe ningun test ni ningun tipo: solo
// hace la aplicacion lenta para todo el mundo, en silencio. Por eso hay que
// vigilarlo desde fuera.

import { leer, hallazgo } from './nucleo.mjs';

const VERCEL = 'vercel.json';

// Rutas que TIENEN que cachearse para siempre (sus nombres llevan hash).
const INMUTABLES = ['/app/_expo/:path*', '/app/assets/:path*'];

function cacheControlDe(regla) {
  const cc = (regla.headers || []).find((h) => String(h.key).toLowerCase() === 'cache-control');
  return cc ? cc.value : null;
}

async function ejecutar() {
  const conf = JSON.parse(leer(VERCEL));
  const headers = conf.headers || [];
  const hallazgos = [];

  for (const source of INMUTABLES) {
    const regla = headers.find((h) => h.source === source);
    if (!regla) {
      hallazgos.push(
        hallazgo({
          clave: `cache-app/falta-${source}`,
          nivel: 'bloqueante',
          ambito: 'rendimiento',
          titulo: `${VERCEL} ya no cachea ${source}`,
          detalle:
            'Sin esta regla el navegador vuelve a descargar el bundle de ~7 MB en cada ' +
            'carga, cada login y cada apertura de la demo. Los nombres llevan hash: ' +
            'cachearlos para siempre es seguro. Ver decision 7 de CLAUDE.md.',
          fichero: VERCEL,
        }),
      );
      continue;
    }
    const cc = cacheControlDe(regla);
    if (!cc || !/immutable/.test(cc) || /no-store/.test(cc)) {
      hallazgos.push(
        hallazgo({
          clave: `cache-app/rota-${source}`,
          nivel: 'bloqueante',
          ambito: 'rendimiento',
          titulo: `${source} ha dejado de ser immutable (ahora: "${cc ?? 'sin Cache-Control'}")`,
          detalle: 'Ver decision 7 de CLAUDE.md. No volver a poner no-store a /app/(.*).',
          fichero: VERCEL,
        }),
      );
    }
  }

  // Una regla comodin que pille TAMBIEN _expo/ y assets/ y les meta no-store.
  for (const regla of headers) {
    const src = String(regla.source || '');
    if (!src.startsWith('/app')) continue;
    const cc = cacheControlDe(regla);
    if (!cc || !/no-store/.test(cc)) continue;
    // La regla legitima excluye _expo/ y assets/ con un lookahead negativo, o
    // apunta solo a /app (el index.html, que si debe ir sin cache).
    const excluye = /\(\?!\s*_expo\/\s*\|\s*assets\/\s*\)/.test(src) || src === '/app';
    if (excluye) continue;
    hallazgos.push(
      hallazgo({
        clave: 'cache-app/comodin-no-store',
        nivel: 'bloqueante',
        ambito: 'rendimiento',
        titulo: `La regla "${src}" pone no-store a los estaticos de /app`,
        detalle:
          'La regla de no-store tiene que excluir _expo/ y assets/, como hace ' +
          '"/app/:path((?!_expo/|assets/).*)". Ver decision 7 de CLAUDE.md.',
        fichero: VERCEL,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'cache-app',
  ambito: 'rendimiento',
  descripcion: 'Los estaticos con hash de /app siguen sirviendose immutable',
  ejecutar,
};
