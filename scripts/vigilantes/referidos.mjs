// La red de referidos vive en CUATRO sitios (CLAUDE.md, fijado el 23 ago 2026):
//
//   1. la funcion recompute_referral_discount de la BD  (la mira vigilancia_bd())
//   2. la seccion #hermano de web/index.html + su FAQ en los datos estructurados
//   3. el modal "Recomendar" de web/demo.html
//   4. TabReferidos en app/(tabs)/configuracion.web.tsx
//
// Aqui no hay un lib/*.ts que mande, asi que la tabla se declara AQUI y los
// cuatro sitios se comparan contra ella. Que este fichero sea el quinto sitio es
// deliberado: convierte una deriva silenciosa en una edicion consciente de un
// solo fichero, y el diff la canta.

import { leer, capturar, debenCuadrar } from './nucleo.mjs';

export const TABLA_REFERIDOS = {
  nivel1: 10, // por cada salon que traes tu
  nivel2: 4, // por los que traen ellos
  nivel3: 2, // tercer nivel
  tope: 30, // maximo de descuento; por encima, meses gratis
  bienvenida: 15, // lo que se lleva quien entra con tu enlace
};

const LANDING = 'web/index.html';
const DEMO = 'web/demo.html';
const CONFIG = 'app/(tabs)/configuracion.web.tsx';

// El guion se escribe unas veces con signo menos (U+2212) y otras con guion
// normal. Esa diferencia tipografica no es el invariante que nos importa: el
// numero si. Por eso [−-] y no un caracter fijo.
const ANCLAS = [
  // --- Landing: la FAQ de los datos estructurados (lo que indexa Google) ---
  [LANDING, 'nivel1', /un (\d+)\s*% por cada salón que traes tú/, 'FAQ JSON-LD nivel 1'],
  [LANDING, 'nivel2', /un (\d+)\s*% por cada uno que traigan ellos/, 'FAQ JSON-LD nivel 2'],
  [LANDING, 'nivel3', /un (\d+)\s*% por el tercer nivel/, 'FAQ JSON-LD nivel 3'],
  [LANDING, 'tope', /hasta un máximo del (\d+)\s*%/, 'FAQ JSON-LD tope'],
  [LANDING, 'bienvenida', /recibe un (\d+)\s*% de bienvenida/, 'FAQ JSON-LD bienvenida'],
  // --- Landing: la seccion #hermano que ve el visitante ---
  [LANDING, 'nivel1', /[−-](\d+)%<\/b><span>Por cada salón que traes tú/, 'seccion #hermano nivel 1'],
  // --- Demo: el modal "Recomendar" ---
  [DEMO, 'nivel1', /[−-](\d+)% por cada salón que traes/, 'modal Recomendar nivel 1'],
  [DEMO, 'nivel2', /[−-](\d+)% y [−-]\d+% por los que traen ellos/, 'modal Recomendar nivel 2'],
  [DEMO, 'nivel3', /[−-]\d+% y [−-](\d+)% por los que traen ellos/, 'modal Recomendar nivel 3'],
  [DEMO, 'tope', /class="rw-amt">[−-](\d+)%<span>máx\./, 'modal Recomendar tope'],
  // --- El software: TabReferidos ---
  [CONFIG, 'nivel1', /tu cuota baja un (\d+)%/, 'TabReferidos nivel 1'],
  [CONFIG, 'nivel2', /un (\d+)% por los que traigan ellos/, 'TabReferidos nivel 2'],
  [CONFIG, 'nivel3', /un (\d+)% por el tercer nivel/, 'TabReferidos nivel 3'],
  [CONFIG, 'bienvenida', /se lleva su (\d+)% de bienvenida/, 'TabReferidos bienvenida'],
  // El tope de TabReferidos lo manda la BD (stats.descuento_tope). Esto vigila el
  // valor de reserva, que es lo que ve el usuario si la RPC no contesta.
  [CONFIG, 'tope', /descuento_tope \|\| (\d+)/, 'TabReferidos tope (valor de reserva)'],
];

async function ejecutar() {
  const hallazgos = [];
  const cache = new Map();
  const contenido = (f) => {
    if (!cache.has(f)) cache.set(f, leer(f));
    return cache.get(f);
  };

  for (const [fichero, clave, re, nombre] of ANCLAS) {
    const { valor, linea } = capturar(contenido(fichero), re, { fichero, ancla: nombre });
    const h = debenCuadrar({
      clave: `referidos/${clave}`,
      ambito: 'referidos',
      que: nombre,
      esperado: TABLA_REFERIDOS[clave],
      encontrado: valor,
      fichero,
      linea,
      porque:
        'La tabla de referidos vive en cuatro sitios que hay que cambiar a la vez: la ' +
        'funcion recompute_referral_discount de la BD, #hermano de la landing, el modal ' +
        'Recomendar de la demo y TabReferidos del software. Si la regla ha cambiado de ' +
        'verdad, actualiza TABLA_REFERIDOS en este mismo fichero.',
    });
    if (h) hallazgos.push(h);
  }

  return hallazgos;
}

export default {
  nombre: 'referidos',
  ambito: 'referidos',
  descripcion: 'La tabla de referidos (10/4/2, tope 30, bienvenida 15) cuadra en los cuatro sitios',
  ejecutar,
};
