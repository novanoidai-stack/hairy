// QUE INCLUYE CADA PLAN, y que se dice por ahi que incluye.
//
// `precios.mjs` ya vigila los NUMEROS (39 / 59 / 19 / 29 / 39) en los tres
// sitios. Esto vigila el CONTENIDO, que es donde se miente sin querer: una
// feature anunciada en la landing que ninguna pantalla deja usar es venta falsa;
// una que el codigo regala y la landing cobra es dinero perdido; y una que no
// entra en ningun plan es una feature que nadie puede usar jamas.
//
// La fuente unica es lib/planes.ts (asi lo dice su propia cabecera y la decision
// de planes del CLAUDE.md). Todo lo demas se contrasta contra ella.
//
// Ojo con una trampa ya pisada al escribir este vigilante: la seccion #precios
// VISIBLE de la landing y sus DATOS ESTRUCTURADOS (JSON-LD) son dos sitios
// distintos y pueden discrepar entre si sin que se note, porque el JSON-LD no
// se ve en pantalla -- solo lo lee Google. Se comprueban los dos.

import { leer, capturar, hallazgo, AnclaPerdida } from './nucleo.mjs';

const PLANES = 'lib/planes.ts';
const LANDING = 'web/index.html';
// EL PUNTO CIEGO QUE TENIA ESTO (arreglado el 30 ago 2026). CLAUDE.md dice que lo
// que se anuncia vive en TRES sitios --lib/planes.ts, la seccion #precios de la
// landing y el SYSTEM_PROMPT de chispa-landing-- y `precios.mjs` mira los tres
// para los NUMEROS. Este miraba solo dos para el CONTENIDO, y por eso el prompt
// del asistente siguio recitando "DOS PLANES DE SOFTWARE, mismo contenido en los
// dos (... cobro de senales con Stripe, campanas de marketing, lista de espera
// inteligente ...)" MESES despues de que se corrigiera en los otros dos sitios.
// O sea: la trampa que este vigilante existe para cazar seguia viva, en el unico
// sitio donde no miraba, y se la contaba a cada prospecto que preguntaba.
const CHISPA = 'supabase/functions/chispa-landing/index.ts';

// --- leer la fuente de verdad ------------------------------------------------

// Saca los elementos de un array literal de TypeScript: ['a', 'b'] -> ['a','b'].
const literales = (bloque) => [...bloque.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

export function leerPlanes(texto) {
  const union = capturar(texto, /export type FuncionPlan =([\s\S]*?);/, {
    fichero: PLANES,
    ancla: 'type FuncionPlan',
  });
  // La union se escribe con | 'nombre' y comentarios de linea detras.
  const funciones = literales(union.valor);

  const esencial = literales(
    capturar(texto, /const ESENCIAL_FUNCIONES: FuncionPlan\[\] = \[([\s\S]*?)\];/, {
      fichero: PLANES,
      ancla: 'ESENCIAL_FUNCIONES',
    }).valor,
  );

  const estudioExtra = literales(
    capturar(texto, /const ESTUDIO_FUNCIONES: FuncionPlan\[\] = \[([\s\S]*?)\];/, {
      fichero: PLANES,
      ancla: 'ESTUDIO_FUNCIONES',
    }).valor,
  );

  const soloIa = literales(
    capturar(texto, /const IA_SOLO: ReadonlySet<FuncionPlan> = new Set\(\[([\s\S]*?)\]\)/, {
      fichero: PLANES,
      ancla: 'IA_SOLO',
    }).valor,
  );

  const etiquetas = literales(
    capturar(texto, /export const FUNCION_LABEL: Record<FuncionPlan, string> = \{([\s\S]*?)\n\};/, {
      fichero: PLANES,
      ancla: 'FUNCION_LABEL',
    }).valor.replace(/'[^']*'/g, (s) => (/^'[a-z_]+'$/.test(s) ? s : "''")),
  );

  // FUNCION_LABEL tiene las claves SIN comillas (agenda: '...'), asi que hay que
  // leerlas aparte; los literales de arriba solo pillan las que van entrecomilladas.
  const clavesEtiqueta = [
    ...capturar(texto, /export const FUNCION_LABEL: Record<FuncionPlan, string> = \{([\s\S]*?)\n\};/, {
      fichero: PLANES,
      ancla: 'FUNCION_LABEL',
    }).valor.matchAll(/^\s*([a-z_]+):/gm),
  ].map((m) => m[1]);

  return {
    funciones,
    esencial: new Set(esencial),
    // ESTUDIO_FUNCIONES es `[...ESENCIAL_FUNCIONES, extras]`.
    estudio: new Set([...esencial, ...estudioExtra]),
    soloIa: new Set(soloIa),
    etiquetas: new Set([...etiquetas, ...clavesEtiqueta]),
  };
}

// --- el vigilante ------------------------------------------------------------

async function ejecutar() {
  const texto = leer(PLANES);
  const p = leerPlanes(texto);
  const hallazgos = [];

  if (p.funciones.length === 0) {
    throw new AnclaPerdida(
      `No se ha podido leer ninguna FuncionPlan de ${PLANES}. El vigilante esta ciego.`,
      { fichero: PLANES, ancla: 'FuncionPlan' },
    );
  }

  // 1. Toda funcion tiene su etiqueta. Sin ella, el aviso de "esto no entra en
  //    tu plan" sale con un hueco en medio de la frase.
  for (const f of p.funciones) {
    if (p.etiquetas.has(f)) continue;
    hallazgos.push(
      hallazgo({
        clave: `planes/sin-etiqueta-${f}`,
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: `La funcion "${f}" no tiene texto en FUNCION_LABEL`,
        detalle:
          `${PLANES} declara "${f}" como FuncionPlan y no le da etiqueta. El aviso de "esto ` +
          'no entra en tu plan" la compone con ese texto, asi que a la clienta le sale la ' +
          'frase rota.',
        fichero: PLANES,
      }),
    );
  }

  // 2. Ninguna funcion queda huerfana: o entra en un plan, o es del addon de IA.
  //    Una que no este en ninguno no la puede usar nadie, nunca.
  for (const f of p.funciones) {
    if (p.estudio.has(f) || p.soloIa.has(f)) continue;
    hallazgos.push(
      hallazgo({
        clave: `planes/huerfana-${f}`,
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: `La funcion "${f}" no entra en ningun plan ni en el addon de IA`,
        detalle:
          'No esta en ESENCIAL_FUNCIONES, ni en ESTUDIO_FUNCIONES, ni en IA_SOLO. Es una ' +
          'funcion que nadie puede activar: o falta meterla en un plan, o sobra del tipo.',
        fichero: PLANES,
      }),
    );
  }

  // 3. La IA es ORTOGONAL al plan (reestructura del 7 ago 2026): va por
  //    profiles.ia_nivel. Volver a meterla en un plan es la regresion facil.
  for (const f of p.soloIa) {
    if (!p.esencial.has(f) && !p.estudio.has(f)) continue;
    hallazgos.push(
      hallazgo({
        clave: `planes/ia-acoplada-${f}`,
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: `La funcion de IA "${f}" ha vuelto a depender del plan`,
        detalle:
          'Desde el 7 ago 2026 la IA es un ADDON (profiles.ia_nivel), ortogonal a ' +
          'Esencial/Estudio: se cobra aparte (19 / 29 / 39). Si vuelve a un plan, o se regala ' +
          'a quien no la paga o se le niega a quien si.',
        fichero: PLANES,
      }),
    );
  }

  // 4. Estudio contiene a Esencial. La landing lo dice con estas palabras
  //    ("Todo lo del plan Esencial"), asi que si alguna vez dejara de ser cierto
  //    el plan caro perderia algo que tiene el barato.
  for (const f of p.esencial) {
    if (p.estudio.has(f)) continue;
    hallazgos.push(
      hallazgo({
        clave: `planes/estudio-pierde-${f}`,
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: `Estudio (59 EUR) no incluye "${f}" y Esencial (39 EUR) si`,
        detalle:
          'La landing promete "Todo lo del plan Esencial" en la tarjeta de Estudio. Un salon ' +
          'que sube de plan perderia esa funcion.',
        fichero: PLANES,
      }),
    );
  }

  // 5. LOS DATOS ESTRUCTURADOS NO PUEDEN CONTRADECIR AL CODIGO.
  //    El JSON-LD no se ve en pantalla: solo lo lee Google. Por eso es justo
  //    donde una frase se queda vieja durante meses sin que nadie la relea.
  const landing = leer(LANDING);
  const mismoSoftware = /"name":\s*"Estudio"[\s\S]{0,400}?"description":\s*"([^"]*)"/g;
  const sonIguales = p.esencial.size === p.estudio.size;
  for (const m of landing.matchAll(mismoSoftware)) {
    const dice = m[1];
    const afirmaIgualdad = /mismo software/i.test(dice);
    if (afirmaIgualdad === sonIguales) continue;

    hallazgos.push(
      hallazgo({
        clave: 'planes/jsonld-estudio-contradice',
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: sonIguales
          ? 'Los datos estructurados no dicen que Estudio traiga el mismo software, y lo trae'
          : 'Los datos estructurados dicen que Estudio es "el mismo software" y no lo es',
        detalle:
          `${LANDING} anuncia a Google, en el JSON-LD de la oferta "Estudio":\n\n  "${dice}"\n\n` +
          `Pero ${PLANES} da a Esencial ${p.esencial.size} funciones y a Estudio ` +
          `${p.estudio.size}` +
          (sonIguales
            ? '.'
            : `: Estudio anade ${[...p.estudio]
                .filter((f) => !p.esencial.has(f))
                .join(', ')}.`) +
          '\n\nLa tarjeta VISIBLE de la seccion #precios ya lo cuenta bien ("Todo lo del plan ' +
          'Esencial" y la lista de extras); es el dato estructurado el que se ha quedado ' +
          'atras. Como no se ve en pantalla, nadie lo relee: por eso lo mira esto.\n\n' +
          'Decision 5 del CLAUDE.md: sin claims falsos en structured data.',
        fichero: LANDING,
      }),
    );
  }

  // 6. EL PROMPT DE LA IA NO PUEDE VENDER LO QUE EL PLAN NO TRAE.
  //    Es la superficie mas peligrosa de las tres: no la relee nadie, contesta
  //    en primera persona y el prospecto se la cree. Se comprueba lo mismo que
  //    en el JSON-LD -- que no afirme igualdad si los planes no son iguales --
  //    y ademas que no le atribuya a Esencial, por su nombre, una funcion que
  //    solo trae Estudio.
  const chispa = leer(CHISPA);
  const soloEstudio = [...p.estudio].filter((f) => !p.esencial.has(f));

  if (soloEstudio.length > 0 && /mismo (contenido|software)/i.test(chispa)) {
    hallazgos.push(
      hallazgo({
        clave: 'planes/chispa-dice-mismo-contenido',
        nivel: 'bloqueante',
        ambito: 'precios',
        titulo: 'El prompt del asistente dice que los dos planes traen lo mismo, y no es cierto',
        detalle:
          `${PLANES} da ${p.esencial.size} funciones a Esencial y ${p.estudio.size} a Estudio ` +
          `(solo Estudio: ${soloEstudio.join(', ')}).\n\n` +
          'Un asistente que recita "mismo contenido en los dos" le esta prometiendo a quien ' +
          'paga 39 EUR funciones de las de 59. No es SEO: es una respuesta en primera persona ' +
          'a un prospecto concreto.',
        fichero: CHISPA,
      }),
    );
  }

  // La linea que describe Esencial en el prompt (la que empieza por "Esencial:").
  const lineaEsencial = chispa.match(/^\s*[·*-]?\s*Esencial:.*$/mi);
  if (lineaEsencial) {
    const PISTAS = {
      senales: /se[nñ]al(es)?\b|dep[óo]sito|fianza/i,
      campanas: /campa[nñ]as?\b/i,
      lista_espera: /lista de espera/i,
      inventario: /inventario\b/i,
      presupuestos: /presupuestos?\b/i,
      resenas: /rese[nñ]as?\b/i,
    };
    for (const f of soloEstudio) {
      const pista = PISTAS[f];
      if (!pista || !pista.test(lineaEsencial[0])) continue;
      hallazgos.push(
        hallazgo({
          clave: `planes/chispa-esencial-promete-${f}`,
          nivel: 'bloqueante',
          ambito: 'precios',
          titulo: `El prompt le atribuye "${f}" a Esencial, y es de Estudio`,
          detalle:
            `La linea del prompt que describe Esencial dice:\n\n  ${lineaEsencial[0].trim()}\n\n` +
            `Pero ${PLANES} solo da "${f}" a Estudio.`,
          fichero: CHISPA,
        }),
      );
    }
  }

  return hallazgos;
}

export default {
  nombre: 'planes',
  ambito: 'precios',
  descripcion: 'Lo que incluye cada plan cuadra entre el codigo, la landing y sus datos',
  ejecutar,
};
