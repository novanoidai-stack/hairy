// Las funciones que llama la propia base de datos (crons de pg_cron, triggers,
// n8n) llevan `verify_jwt = false` en supabase/config.toml, porque el
// verificador de la plataforma solo entiende JWT y las claves nuevas
// (`sb_secret_...`) no lo son: con el encendido, esas llamadas se rechazarian
// con 401 antes de llegar al codigo.
//
// El precio de apagarlo es que la plataforma deja de autorizar NADA. Si la
// funcion no comprueba por su cuenta quien llama, queda ABIERTA AL MUNDO: una
// URL publica que cualquiera puede invocar. Es la decision 9 del CLAUDE.md,
// escrita palabra por palabra: "Si anades una funcion a esa lista, anadele
// tambien su peticionDeServicio o la dejas abierta al mundo."
//
// Hoy esa frase la hace cumplir un humano acordandose. Esto la hace cumplir la
// CI. Es la comprobacion mas barata del repo contra el agujero mas caro.
//
// OJO con el precedente que este vigilante NO debe repetir: antes, tres de esas
// funciones "comprobaban" el rol decodificando el JWT sin verificar la firma.
// Eso no es autorizar, es preguntarle al atacante quien es. Por eso aqui no
// vale cualquier cosa que huela a control: o pasa por peticionDeServicio(), o
// esta declarada abajo con el porque de su puerta propia.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAIZ, leer, hallazgo, AnclaPerdida } from './nucleo.mjs';

const CONFIG = 'supabase/config.toml';

// La puerta de la casa: compara la clave entrante contra la real del proyecto
// en tiempo constante, aceptando la nueva y la heredada mientras convivan.
//
// No se busca una FORMA concreta de escribirla, se busca que su resultado se
// CONSUMA. Costo un falso positivo aprenderlo: agenda-optimizador la llama como
// `if (body?.ojo === true && peticionDeServicio(req))` -- perfectamente valido--
// y una lista de formas permitidas (`!x(`, `if (x(`, `= x(`) no lo cubria. Una
// lista asi solo acierta hasta que alguien escribe la cuarta forma.
const GUARDAS = ['peticionDeServicio'];

// Autorizar en nombre de QUIEN llama tambien es autorizar: las funciones de dos
// modos (una rama para el trigger de la BD, otra para una persona con sesion)
// cierran la segunda con getUser() y un 401.
const GUARD_USUARIO = /auth\s*\.\s*getUser\s*\(/;

// Devuelve true si alguna llamada a `fn` se usa como expresion (su valor se
// mira) y no como sentencia suelta, que seria llamarla y tirar el resultado.
export function seConsumeElResultado(codigo, fn) {
  for (const linea of codigo.split('\n')) {
    const i = linea.indexOf(`${fn}(`);
    if (i < 0) continue;
    if (/^\s*(?:import|export)\b/.test(linea)) continue; // solo la trae, no la usa
    const antes = linea.slice(0, i).trim();
    // Sentencia suelta: `peticionDeServicio(req);` o al principio de la linea.
    if (antes === '' || antes === '}' || antes.endsWith(';')) continue;
    return true;
  }
  return false;
}

// Las que autorizan de otra forma, con su motivo. Cada una declara la senal que
// TIENE que seguir apareciendo en su codigo: si desaparece, deja de estar
// exenta y el vigilante la trata como abierta. No es una lista de perdonadas,
// es una lista de "esta puerta es otra, y es esta".
const AUTORIZAN_A_SU_MANERA = {
  'registrar-vigilancia': {
    senal: /VIGILANCIA_TOKEN/,
    porque:
      'Es el recolector de la pestana Salud y lo llama GitHub Actions, que por la regla 4 ' +
      'NUNCA puede ver una clave de Supabase. Autoriza con VIGILANCIA_TOKEN, un secreto ' +
      'propio que solo sirve para escribir en vigilancia_*.',
  },
};

// Un 401 en el fichero no prueba que autorice, pero su AUSENCIA si prueba que
// no rechaza a nadie.
const RECHAZA = /401/;

export function funcionesSinVerificacion(toml) {
  // [functions.<nombre>] ... verify_jwt = false
  const bloques = [...toml.matchAll(/\[functions\.([a-z0-9-]+)\]([^[]*)/g)];
  if (bloques.length === 0) {
    throw new AnclaPerdida(
      `No hay ni un bloque [functions.*] en ${CONFIG}. O se ha reestructurado el fichero ` +
        '(y hay que actualizar este vigilante) o se han borrado las excepciones de verify_jwt. ' +
        'En cualquiera de los dos casos esto no puede pasar en verde.',
      { fichero: CONFIG, ancla: '[functions.*]' },
    );
  }
  return bloques
    .filter(([, , cuerpo]) => /verify_jwt\s*=\s*false/.test(cuerpo))
    .map(([, nombre]) => nombre);
}

async function ejecutar() {
  const toml = leer(CONFIG);
  const abiertas = funcionesSinVerificacion(toml);
  const hallazgos = [];

  if (abiertas.length === 0) {
    // Hoy hay seis. Cero significa que alguien las quito del toml -- y entonces
    // los crons de la BD estan cayendo con 401 -- o que el regex se quedo ciego.
    throw new AnclaPerdida(
      `Ninguna funcion tiene verify_jwt = false en ${CONFIG}. Habia seis (los crons de ` +
        'pg_cron, el trigger de agenda y el recolector de vigilancia). Si es a proposito, ' +
        'esas llamadas de la BD estan devolviendo 401; si no, este vigilante se ha quedado ciego.',
      { fichero: CONFIG, ancla: 'verify_jwt = false' },
    );
  }

  for (const nombre of abiertas) {
    const rel = `supabase/functions/${nombre}/index.ts`;

    if (!existsSync(path.join(RAIZ, rel))) {
      hallazgos.push(
        hallazgo({
          clave: `edges-autorizadas/sin-codigo-${nombre}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `${CONFIG} apaga verify_jwt de "${nombre}" y esa funcion no existe`,
          detalle:
            `No hay ${rel}. O se ha borrado la funcion y sobra su bloque en el toml, o se ha ` +
            'renombrado y el bloque apunta al nombre viejo (con lo que la funcion de verdad ' +
            'esta corriendo CON verify_jwt y sus llamadas desde la BD fallan con 401).',
          fichero: CONFIG,
        }),
      );
      continue;
    }

    const codigo = leer(rel);
    const excepcion = AUTORIZAN_A_SU_MANERA[nombre];

    if (excepcion) {
      if (excepcion.senal.test(codigo)) continue;
      hallazgos.push(
        hallazgo({
          clave: `edges-autorizadas/puerta-propia-rota-${nombre}`,
          nivel: 'bloqueante',
          ambito: 'seguridad',
          titulo: `"${nombre}" tenia su propia autorizacion y ha desaparecido`,
          detalle:
            `Estaba exenta de peticionDeServicio() por esto: ${excepcion.porque}\n\n` +
            `Su senal (${excepcion.senal}) ya no aparece en ${rel}. Con verify_jwt = false y ` +
            'sin puerta, la funcion esta abierta al mundo. O se restaura su comprobacion, o ' +
            'pasa a peticionDeServicio(), o se le vuelve a encender verify_jwt.',
          fichero: rel,
        }),
      );
      continue;
    }

    const autorizaPorClave = GUARDAS.some((g) => seConsumeElResultado(codigo, g));
    const autorizaPorSesion = GUARD_USUARIO.test(codigo);
    if ((autorizaPorClave || autorizaPorSesion) && RECHAZA.test(codigo)) continue;

    const soloImporta = /peticionDeServicio/.test(codigo);
    hallazgos.push(
      hallazgo({
        clave: `edges-autorizadas/abierta-${nombre}`,
        nivel: 'bloqueante',
        ambito: 'seguridad',
        titulo: `La edge function "${nombre}" esta abierta al mundo`,
        detalle:
          `${CONFIG} le apaga verify_jwt, asi que la plataforma NO autoriza nada, y ${rel} ` +
          (soloImporta
            ? 'nombra peticionDeServicio pero no lo usa como guarda (no aparece como ' +
              '`if (!peticionDeServicio(req))` ni asignado a nada que se compruebe).'
            : 'no llama a peticionDeServicio(req).') +
          '\n\nCualquiera con la URL puede invocarla. Anadir al principio del handler:\n\n' +
          "  import { peticionDeServicio } from '../shared/claveServicio.ts';\n" +
          '  if (!peticionDeServicio(req)) {\n' +
          "    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });\n" +
          '  }\n\n' +
          'Si autoriza de otra forma legitima, declararla en AUTORIZAN_A_SU_MANERA de ' +
          'scripts/vigilantes/edges-autorizadas.mjs con su senal y su porque. Lo que NO vale ' +
          '(y ya se colo una vez) es decodificar el JWT y mirar el rol sin verificar la firma.',
        fichero: rel,
      }),
    );
  }

  return hallazgos;
}

export default {
  nombre: 'edges-autorizadas',
  ambito: 'seguridad',
  descripcion: 'Toda edge con verify_jwt = false autoriza por su cuenta',
  ejecutar,
};
