// LO QUE SE PROMETE A HACIENDA TIENE QUE SER LO QUE SE HACE.
//
// El 30 ago 2026 la landing vendia "Facturacion VeriFactu (AEAT) con cadena
// SHA-256, QR de cotejo y envio a Hacienda", y su FAQ --marcado en JSON-LD, o
// sea candidato a respuesta destacada de Google-- respondia "Si" a "¿Mecha
// cumple con la normativa VeriFactu de la AEAT?". A la vez, los comentarios del
// propio codigo decian textualmente "no hay alta en VeriFactu ni QR de
// verificacion oficial", y en produccion no habia ni una columna donde anotar un
// envio: 1.600 tickets encadenados en local y cero enviados.
//
// Lo caro de esa deriva no es el SEO. Es que un salon contrata Esencial creyendo
// que ya cumple, y no cumple; y la expectativa se la creo Mecha.
//
// COMO DECIDE ESTE VIGILANTE
//
// No puede preguntarle a la base de datos (la capa 1 no toca red), asi que el
// ancla vive en el repo: `lib/fiscal/estadoVerifactu.ts`. Mientras
// ENVIO_AEAT_DISPONIBLE sea false, las palabras de abajo son un claim falso; el
// dia que se ponga a true --en el mismo commit que despliega el worker-- dejan
// de serlo solas. Primero funciona, luego se anuncia.
//
// EL FALSO POSITIVO QUE HAY QUE CONOCER
//
// La redaccion honesta MENCIONA lo que no hay ("el envio a la AEAT y el QR de
// cotejo estan en desarrollo"). Si esto se limitara a buscar "a la AEAT" haria
// imposible escribir la verdad, que es la peor manera de fallar que tiene un
// vigilante: obligaria a callarse en vez de a ser exacto. Por eso cada hallazgo
// se mira EN SU FRASE y se perdona si esa misma frase lleva un desmentido.

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, capturar, hallazgo } from './nucleo.mjs';

const ESTADO = 'lib/fiscal/estadoVerifactu.ts';

// Superficies que ve un cliente o un buscador. Las tres ultimas no son HTML pero
// se recitan igual: son lo que la IA contesta cuando le preguntan.
const SUPERFICIES_VIVAS = [
  'web/index.html',
  'web/especificaciones.html',
  'web/carta-comercial.html',
  'web/terminos.html',
  'web/demo.html',
  'web/acceso.html',
  'supabase/functions/chispa-landing/index.ts',
  'supabase/functions/chispa-dudas-demo/kb.ts',
  'supabase/functions/chispa-dudas-demo/index.ts',
  'lib/planes.ts',
  // La FUENTE de las landings de SEO, y la unica que se puede vigilar en CI.
  //
  // `web/verifactu-peluqueria/`, `web/alternativa-*/` y `web/software-*/` estan
  // GITIGNORADAS: las genera el build a partir de este fichero. En un checkout
  // limpio no existen, asi que recorrer web/ no las ve --y era ahi donde estaba
  // publicado "Mecha genera el XML de Alta y lo envia a la AEAT". Vigilando el
  // generador se caza el claim ANTES de que exista la pagina, que es cuando
  // todavia es barato.
  'scripts/seo/pages.mjs',
];

// OJO CON \w EN UN VIGILANTE ESCRITO EN ESPANOL: en JavaScript es [A-Za-z0-9_] y
// NO incluye acentos ni la ñ. La primera version de esto no cazaba "adaptado a los
// requisitos TECNICOS de la AEAT" -- la comadreja exacta que estaba publicada --
// porque `\w+` se paraba en la "é". Cualquier salto de palabra de aqui abajo tiene
// que usar PAL, no \w.
const PAL = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]';
const HUECO = (n) => `(?:${PAL}+\\s+){0,${n}}?`;

// Los claims prohibidos mientras no exista el envio. Cada uno con el motivo,
// porque un vigilante que solo dice "prohibido" no ensena nada a quien lo pisa.
const CLAIMS = [
  {
    clave: 'homologado',
    re: new RegExp(`homologad${PAL}*`, 'gi'),
    porque:
      '"Homologado" no significa nada en VeriFactu: la AEAT no homologa software, ' +
      'el fabricante emite una declaracion responsable y el sistema envia (o conserva) ' +
      'los registros. Decirlo sugiere una certificacion que no existe.',
  },
  {
    clave: 'envio-aeat',
    re: new RegExp(`(env[íi]${PAL}*|remit${PAL}*|manda${PAL}*|a la)\\s+${HUECO(4)}(?:AEAT|Hacienda|Agencia Tributaria)`, 'gi'),
    porque: 'No hay envio. No existe ni la columna donde anotar el resultado de uno.',
  },
  {
    clave: 'qr-cotejo',
    // Este NO depende del envio: el QR se compone en local, con el NIF, el numero
    // de serie, la fecha y el importe que se sellaron al emitir. Por eso tiene su
    // propio interruptor, y desde el 30 ago 2026 esta a true.
    gate: 'QR_COTEJO_DISPONIBLE',
    re: /QR\s+(?:de\s+)?(?:cotejo|verificaci[óo]n|tributario)/gi,
    porque:
      'El QR de cotejo lleva la URL de verificacion de la AEAT y no se genera en ningun sitio.',
  },
  {
    // La redaccion con comadreja: no dice "homologado" ni "envio", dice que el
    // modulo esta "adaptado a los requisitos tecnicos de la AEAT". Suena a
    // conformidad verificada y no lo es. Asi estaba escrita la FAQ original.
    clave: 'conforme-aeat',
    re: new RegExp(`(adaptad${PAL}*|conforme${PAL}*|seg[úu]n|ajustad${PAL}*)\\s+${HUECO(5)}(?:requisitos|normativa|especificaciones)\\s+${HUECO(4)}(?:AEAT|Agencia Tributaria)`, 'gi'),
    porque:
      'Decir que el modulo esta "adaptado a los requisitos tecnicos de la AEAT" da a ' +
      'entender una conformidad que nadie ha verificado. Lo que hay es una cadena de ' +
      'hash propia; los requisitos de la AEAT incluyen el envio, que no existe.',
  },
  {
    clave: 'cumple-verifactu',
    re: new RegExp(`cumpl${PAL}*\\s+${HUECO(4)}VeriFactu|VeriFactu\\s+${HUECO(2)}cumpl${PAL}*`, 'gi'),
    porque: 'Lo que se cumple hoy es la parte de la Ley Antifraude que prohibe el software de doble uso.',
  },
];

// Un desmentido en la MISMA frase exonera: asi la redaccion honesta ("el envio a
// la AEAT esta en desarrollo") no queda prohibida.
const DESMENTIDO =
  /\b(no est[áa]n?|no hay|todav[íi]a no|aun no|a[úu]n no|en desarrollo|llegan? despu[ée]s|llegan? en|pr[óo]ximamente|sin construir|no disponible|no digas|prohibido)\b/i;

function frasesDe(texto, indice) {
  // La "frase" util aqui no es la gramatical: en HTML y en un prompt los limites
  // reales son el punto, el salto de linea y el cierre de etiqueta.
  const desde = Math.max(0, texto.lastIndexOf('.', indice - 1) + 1);
  const cortes = [texto.indexOf('.', indice), texto.indexOf('\n', indice)]
    .filter((i) => i >= 0);
  const hasta = cortes.length ? Math.min(...cortes) + 1 : Math.min(texto.length, indice + 400);
  const ini = Math.max(desde, texto.lastIndexOf('\n', indice - 1) + 1);
  return texto.slice(ini, hasta);
}

function lineaEn(texto, indice) {
  let n = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === '\n') n++;
  return n;
}

// TODOS los .html bajo web/, subcarpetas incluidas.
//
// EL PUNTO CIEGO QUE ESTO ARREGLA (31 ago 2026). Aqui habia un `readdirSync`
// PLANO sobre web/, asi que este vigilante no veia `web/<carpeta>/index.html` --
// y ahi es exactamente donde viven las landings de SEO. Ocho paginas indexables
// (`verifactu-peluqueria`, `alternativa-booksy`, `alternativa-treatwell`,
// `alternativa-square-appointments`, `software-barberia`, `software-estetica`,
// `software-unas-manicura`...) prometian "envio a Hacienda", "facturas
// homologadas por la AEAT" y "QR de cotejo", y el vigilante daba VERDE. Una de
// ellas es una landing entera dedicada a VeriFactu, con el claim repetido en la
// meta description, el og:description, el twitter:description y el JSON-LD.
//
// Es la segunda vez que un vigilante de esta familia se queda ciego por donde
// mira (la primera fue `planes.mjs`, que leia el prompt para los precios pero no
// para el contenido). La leccion ya esta escrita en el CLAUDE.md y conviene
// repetirla: **un vigilante con un punto ciego es peor que ninguno, porque da
// por cerrado justo lo que vigila.**
function htmlsDeWeb() {
  const raizWeb = path.join(RAIZ, 'web');
  if (!existsSync(raizWeb)) return [];
  const out = [];
  const anda = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // `web/app` es el export de Expo (gitignored, ~8 MB): ni es fuente ni se
      // edita a mano. Lo suyo lo vigila `claves.mjs` contra el bundle.
      if (e.name === 'app' || e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) anda(abs, r);
      else if (e.name.endsWith('.html')) out.push(`web/${r}`);
    }
  };
  anda(raizWeb, '');
  return out;
}

// Un boceto es una pagina que se marca `noindex` a proposito (index_v4, index_v5,
// diseno-*). Todo lo demas que sirva el dominio lo puede indexar un buscador.
function esBoceto(rel) {
  return /noindex/i.test(leer(rel));
}

// Superficie viva = la que puede ver un cliente o un buscador.
//
// Ya NO es solo la lista de arriba: es la lista MAS cualquier html de web/ que no
// se declare `noindex`. Con la lista sola, cada landing nueva nacia invisible
// para este vigilante y habia que acordarse de anadirla a mano -- que es
// justamente lo que no paso con las ocho de SEO. Ahora nace vigilada, y para
// salir de la vigilancia hay que decir explicitamente que es un boceto.
function superficiesVivas() {
  const explicitas = SUPERFICIES_VIVAS.filter((f) => existsSync(path.join(RAIZ, f)));
  const htmlVivas = htmlsDeWeb().filter((f) => !esBoceto(f));
  return [...new Set([...explicitas, ...htmlVivas])];
}

// Bocetos: siguen SIRVIENDOSE (el dominio publica la carpeta entera), asi que un
// claim viejo ahi sigue siendo publico -- pero como llevan noindex y no los ve
// casi nadie van de aviso, no tumban la CI. El arreglo de verdad es borrarlos,
// como ya se hizo con demo_v2.html.
function copiasMuertas() {
  const vivas = new Set(superficiesVivas());
  return htmlsDeWeb().filter((f) => !vivas.has(f));
}

export function revisar(texto, fichero, nivel, claims = CLAIMS) {
  const out = [];
  for (const c of claims) {
    for (const m of texto.matchAll(c.re)) {
      const frase = frasesDe(texto, m.index);
      if (DESMENTIDO.test(frase)) continue;
      out.push(
        hallazgo({
          clave: `claims-fiscales/${c.clave}`,
          nivel,
          ambito: 'fiscal',
          titulo: `Se promete "${m[0].trim()}" y el envio a la AEAT no existe`,
          detalle:
            `${fichero} dice:\n\n  ...${frase.trim().slice(0, 200)}...\n\n${c.porque}\n\n` +
            `Mientras ENVIO_AEAT_DISPONIBLE sea false en ${ESTADO}, esto es un claim falso ` +
            '(decision 5 del CLAUDE.md). Se puede contar lo que SI hay --cadena SHA-256, ' +
            'numeracion correlativa, tickets que se rectifican y no se borran, RD 1007/2023-- ' +
            'y decir de lo demas que esta en desarrollo: esa frase no la marca este vigilante.',
          fichero,
          linea: lineaEn(texto, m.index),
        }),
      );
    }
  }
  return out;
}

async function ejecutar() {
  // El ancla. Si desaparece o cambia de forma, esto FALLA en vez de pasar en verde.
  const estado = leer(ESTADO);
  const interruptores = {
    ENVIO_AEAT_DISPONIBLE: capturar(estado, /export const ENVIO_AEAT_DISPONIBLE = (true|false);/, {
      fichero: ESTADO,
      ancla: 'ENVIO_AEAT_DISPONIBLE',
    }).valor === 'true',
    QR_COTEJO_DISPONIBLE: capturar(estado, /export const QR_COTEJO_DISPONIBLE = (true|false);/, {
      fichero: ESTADO,
      ancla: 'QR_COTEJO_DISPONIBLE',
    }).valor === 'true',
  };

  // Cada claim mira SU interruptor: el QR se puede anunciar en cuanto se pinta de
  // verdad, aunque el envio siga sin existir. Anunciar de menos tambien es un
  // fallo -- lo construido se vende.
  const vigilados = CLAIMS.filter((c) => !interruptores[c.gate ?? 'ENVIO_AEAT_DISPONIBLE']);
  if (vigilados.length === 0) return [];

  const hallazgos = [];
  for (const f of superficiesVivas()) {
    if (!existsSync(path.join(RAIZ, f))) continue;
    hallazgos.push(...revisar(leer(f), f, 'bloqueante', vigilados));
  }
  for (const f of copiasMuertas()) {
    const encontrados = revisar(leer(f), f, 'aviso', vigilados);
    if (!encontrados.length) continue;
    hallazgos.push(
      hallazgo({
        clave: 'claims-fiscales/copia-muerta',
        nivel: 'aviso',
        ambito: 'fiscal',
        titulo: `${f} no la enlaza nadie y publica ${encontrados.length} claim(s) fiscales viejos`,
        detalle:
          'El dominio sirve la carpeta web/ entera, asi que esta pagina es publica y ' +
          'indexable aunque no haya ningun enlace hacia ella. Como no la ve casi nadie ' +
          'esto es aviso y no bloqueante, pero el arreglo bueno es borrarla --igual que se ' +
          'hizo con demo_v2.html-- y no ir actualizandole el texto a una copia muerta.',
        fichero: f,
      }),
      ...encontrados,
    );
  }
  return hallazgos;
}

export default {
  nombre: 'claims-fiscales',
  ambito: 'fiscal',
  descripcion: 'Ninguna superficie publica promete a la AEAT lo que el producto no hace',
  ejecutar,
};
