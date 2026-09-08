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
// `autorizarVigilancia` es la OTRA puerta legitima, y es de primera clase, no
// una excepcion: la usan las dos funciones que llama GitHub Actions
// (registrar-vigilancia y ejecutar-vigilancia-bd), que no pueden autorizar con
// la clave de servicio porque eso obligaria a guardarla en los secrets de
// Actions -- justo lo que prohibe la regla 4. Vive en shared/tokenVigilancia.ts
// y compara VIGILANCIA_TOKEN en tiempo constante.
const GUARDAS = ['peticionDeServicio', 'autorizarVigilancia'];

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

  // --- Anadidas el 8 sep 2026 -----------------------------------------------
  // No son nuevas: las ocho llevaban en produccion con verify_jwt = false desde
  // siempre. Lo que faltaba era su linea en config.toml, asi que este vigilante
  // NO LAS VEIA. Al declararlas salieron las ocho de golpe como "abiertas al
  // mundo" -- y ninguna lo esta, pero su puerta no es peticionDeServicio().
  //
  // Hay dos familias, y conviene no confundirlas:
  //  (a) las que verifican una FIRMA de un tercero (Stripe, Redsys): quien llama
  //      demuestra ser quien dice sin ningun JWT de por medio;
  //  (b) las PUBLICAS A PROPOSITO (alta, restablecer contrasena, asistentes de la
  //      landing): cualquiera puede llamarlas porque ese es el producto, y lo que
  //      las protege es un limite por IP, no una credencial.
  // En (b) la senal vigilada es el limite: si desaparece, la funcion pasa a estar
  // abierta de verdad y la exencion tiene que caducar.

  'stripe-webhook': {
    senal: /constructEventAsync/,
    porque:
      'Stripe firma cada evento con el signing secret del salon (Vault) o el de plataforma, ' +
      'y no manda ningun JWT. La autorizacion ES la verificacion de firma: sin ella se ' +
      'responde 400 antes de tocar la base de datos. Comprobado en vivo el 8 sep 2026: un ' +
      'POST con firma invalida devuelve 400, no 200.',
  },
  'redsys-notificacion': {
    senal: /Ds_Signature/,
    porque:
      'La notificacion la manda el banco, firmada con la clave del salon que vive en Vault. ' +
      'Mismo caso que Stripe: firma invalida -> 4xx antes de conciliar nada.',
  },

  'signup-free': {
    senal: /signup_ip/,
    porque:
      'Es el alta de cuenta: por definicion la llama alguien que todavia no tiene sesion. ' +
      'Como crea cuentas YA confirmadas, lo que la protege es el freno por IP ' +
      '(check_rate_limit con el cubo signup_ip, 4 altas/hora). Esa es la puerta.',
  },
  'send-reset': {
    senal: /rate_limit_reset/,
    porque:
      'Restablecer la contrasena lo pide justo quien no puede entrar, asi que no hay JWT ' +
      'posible. La protege el limite de 3 intentos por email y hora (tabla rate_limit_reset).',
  },
  'chispa-landing': {
    senal: /check_landing_rate_limit/,
    porque:
      'Asistente comercial de la landing: lo usa un visitante sin cuenta. Publico a ' +
      'proposito, con limite por IP (check_landing_rate_limit).',
  },
  'chispa-dudas-demo': {
    senal: /check_landing_rate_limit/,
    porque:
      'Asistente de la demo publica, mismo caso que chispa-landing: visitante anonimo ' +
      'y limite por IP.',
  },
  'chispa-recepcionista': {
    senal: /check_landing_rate_limit/,
    porque:
      'Recepcionista de la demo publica. Ademas del limite por IP lleva un tope duro de ' +
      'turnos por conversacion, porque cada turno gasta tokens de un LLM.',
  },

  'notificar-bandeja': {
    // La reclamacion atomica es la puerta ENTERA: sin ella la funcion pasa a ser
    // reenviable a voluntad. Por eso se vigila exactamente ese filtro.
    senal: /\.is\(\s*['"]notificado_at['"]\s*,\s*null\s*\)/,
    porque:
      'La llama el automatismo de n8n tras insertar un mensaje, sin JWT. No autoriza a ' +
      'quien llama, pero no le hace falta y merece explicarse: el unico parametro es un ' +
      'uuid de mensaje que hay que conocer, el destinatario NO lo elige quien llama (sale ' +
      'del owner del negocio en la BD), el cuerpo tampoco, y la reclamacion es ATOMICA ' +
      '(update ... is notificado_at null): cada mensaje notifica UNA vez y solo una. No es ' +
      'un relay de correo abierto. Lo peor que permite es adelantar un aviso que ya iba a ' +
      'salir. Si algun dia se le quita ese filtro, deja de ser cierto y esta exencion cae.',
  },
};

// Un 401 en el fichero no prueba que autorice, pero su ausencia sugiere que no
// rechaza a nadie. OJO: solo se le exige a quien autoriza por SESION, no a quien
// usa una de las puertas conocidas.
//
// Al extraer la puerta del token a shared/tokenVigilancia.ts, el 401 se fue con
// ella y `ejecutar-vigilancia-bd` --que autoriza perfectamente-- salio marcada
// como abierta al mundo. Exigirle el literal al que LLAMA a la puerta es pedirle
// que repita lo que la puerta ya hace: quien delega en un ayudante compartido no
// tiene por que nombrar el codigo de estado. Y `seConsumeElResultado` ya cubre
// el caso de verdad peligroso (llamar a la guarda y tirar el resultado).
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

    // Puerta conocida (clave de servicio o token de vigilancia): basta con que
    // su resultado se consuma. El rechazo lo hace la propia puerta.
    if (GUARDAS.some((g) => seConsumeElResultado(codigo, g))) continue;
    // Por sesion no hay ayudante compartido que garantice el rechazo, asi que
    // ahi si se exige ver el 401.
    if (GUARD_USUARIO.test(codigo) && RECHAZA.test(codigo)) continue;

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
