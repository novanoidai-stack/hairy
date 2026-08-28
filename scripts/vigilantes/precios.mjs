// Los precios publicos viven en TRES sitios que hay que cambiar a la vez
// (CLAUDE.md, reestructura del 7 ago 2026):
//
//   1. lib/planes.ts                                        <- fuente de verdad
//   2. la seccion #precios de web/index.html                <- lo que ve el visitante
//   3. el SYSTEM_PROMPT de supabase/functions/chispa-landing <- lo que recita la IA
//
// El fallo que esto evita no es teorico: si cambias planes.ts y te dejas el
// prompt, el asistente de la landing le recita precios viejos a un cliente real.
// Todo compila, todos los tests pasan y nadie se entera.

import { leer, capturar, debenCuadrar } from './nucleo.mjs';

const PLANES = 'lib/planes.ts';
const LANDING = 'web/index.html';
const CHISPA = 'supabase/functions/chispa-landing/index.ts';

// Saca un numero de un Record<...> de TypeScript: `esencial: 39,`
function delRecord(texto, bloque, clave) {
  const re = new RegExp(`${bloque}[^{]*\\{[^}]*?\\b${clave}\\s*:\\s*(\\d+)`);
  return Number(capturar(texto, re, { fichero: PLANES, ancla: `${bloque}.${clave}` }).valor);
}

async function precios() {
  const t = leer(PLANES);
  return {
    esencial: delRecord(t, 'PLAN_PRECIO_EUR', 'esencial'),
    estudio: delRecord(t, 'PLAN_PRECIO_EUR', 'estudio'),
    whatsapp: delRecord(t, 'IA_PRECIO_EUR', 'whatsapp'),
    voz: delRecord(t, 'IA_PRECIO_EUR', 'voz'),
    completa: delRecord(t, 'IA_PRECIO_EUR', 'completa'),
  };
}

// [fichero, clave de precio, regex con grupo 1, nombre humano del ancla]
const ANCLAS = [
  // --- Landing: datos estructurados (esto es lo que lee Google) ---
  [LANDING, 'esencial', /"lowPrice":\s*"(\d+)"/, 'JSON-LD lowPrice'],
  [LANDING, 'estudio', /"highPrice":\s*"(\d+)"/, 'JSON-LD highPrice'],
  // --- Landing: los botones de la calculadora de comisiones ---
  [LANDING, 'esencial', /data-plan="(\d+)"[^>]*>\s*Esencial/, 'boton Esencial de la calculadora'],
  [LANDING, 'estudio', /data-plan="(\d+)"[^>]*>\s*Estudio/, 'boton Estudio de la calculadora'],
  // --- Landing: el addon de IA ---
  [LANDING, 'whatsapp', /IA por WhatsApp<\/b>[\s\S]{0,400}?>(\d+)\s*€\/mes</, 'tarjeta IA WhatsApp'],
  [LANDING, 'voz', /IA de voz telefónica<\/b>[\s\S]{0,400}?>(\d+)\s*€\/mes</, 'tarjeta IA voz'],
  [LANDING, 'completa', /Las dos juntas:\s*\+(\d+)\s*€\/mes/, 'pack IA completa'],
  // --- El prompt que recita Chispa en la landing ---
  [CHISPA, 'esencial', /·\s*Esencial:\s*(\d+)\s*€\/mes/, 'prompt Chispa · Esencial'],
  [CHISPA, 'estudio', /·\s*Estudio:\s*(\d+)\s*€\/mes/, 'prompt Chispa · Estudio'],
  [CHISPA, 'whatsapp', /·\s*Solo WhatsApp:\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · WhatsApp'],
  [CHISPA, 'voz', /·\s*Solo voz:\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · voz'],
  [CHISPA, 'completa', /·\s*Completo \(WhatsApp \+ voz\):\s*\+(\d+)\s*€\/mes/, 'prompt Chispa · pack'],
];

async function ejecutar() {
  const p = await precios();
  const hallazgos = [];
  const cache = new Map();
  const contenido = (f) => {
    if (!cache.has(f)) cache.set(f, leer(f));
    return cache.get(f);
  };

  for (const [fichero, clave, re, nombre] of ANCLAS) {
    const { valor, linea } = capturar(contenido(fichero), re, { fichero, ancla: nombre });
    const h = debenCuadrar({
      clave: `precios/${clave}`,
      ambito: 'precios',
      que: nombre,
      esperado: p[clave],
      encontrado: valor,
      fichero,
      linea,
      porque:
        `La fuente de verdad es ${PLANES}. Si el precio ha cambiado de verdad, cambialo ` +
        `en los TRES sitios: ${PLANES}, ${LANDING} y ${CHISPA}.`,
    });
    if (h) hallazgos.push(h);
  }

  // El pack se anuncia como "en vez de 48 € sueltos": ese 48 es whatsapp + voz.
  const sueltos = p.whatsapp + p.voz;
  const { valor, linea } = capturar(contenido(CHISPA), /en vez de\s*(\d+)\s*€\s*sueltos/, {
    fichero: CHISPA,
    ancla: 'prompt Chispa · comparativa del pack',
  });
  const h = debenCuadrar({
    clave: 'precios/pack-comparativa',
    ambito: 'precios',
    que: 'la comparativa "en vez de N € sueltos"',
    esperado: sueltos,
    encontrado: valor,
    fichero: CHISPA,
    linea,
    porque: `Tiene que ser whatsapp (${p.whatsapp}) + voz (${p.voz}).`,
  });
  if (h) hallazgos.push(h);

  return hallazgos;
}

export default {
  nombre: 'precios',
  ambito: 'precios',
  descripcion: 'Los precios cuadran en lib/planes.ts, la landing y el prompt de Chispa',
  ejecutar,
  precios,
};
