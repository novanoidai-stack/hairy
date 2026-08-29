#!/usr/bin/env node
// scripts/vigilantes/silencios.mjs
//
// Convierte lo que miden los sensores de silencio del smoke (silencios.jsonl,
// una linea por pantalla, escrito por tests/smoke/silencios.ts) en hallazgos de
// la pestaña Salud. Familia 2a del plan de fase 2.
//
//   node scripts/vigilantes/silencios.mjs silencios.jsonl [salida.json] [origen]
//
// QUE DICE CADA COSA
//
//   rechazos    Una promesa rechazada que nadie capturo. Es la unica de las tres
//               que no puede ser un flujo legitimo: si nadie la captura, nadie la
//               enseño, y por tanto el usuario no se entero de nada. AVISO, y
//               sube a BLOQUEANTE en el canario: alli el que se lo come es un
//               salon de verdad, no la demo.
//
//   errores_ui  Un aviso de error que salio al pulsar un boton. Puede ser
//               legitimo (pulsar "Guardar" con el formulario vacio saca "Falta
//               rellenar el nombre" y eso esta bien), asi que siempre AVISO --
//               pero con la etiqueta del boton, que es lo que lo hace accionable.
//
//   dialogos    alert() con texto de error. Playwright los descarta solos y no
//               dejaban ni rastro; ahora al menos se ven.
//
// EL ANCLA
//
// El sensor busca FRASES, no selectores CSS (ver el comentario largo de
// tests/smoke/silencios.ts: en este design system no hay ni `.toast` ni
// `[role="alert"]`, y un selector inventado naceria ciego). Esas frases salen de
// lib/errores.ts. Si alguien reescribe los mensajes de error, el sensor deja de
// reconocerlos y se queda sordo dando verde para siempre. Por eso aqui se
// comprueba que cada frase del vocabulario SIGUE estando en lib/errores.ts, y si
// no, esto falla: un ancla perdida es un hallazgo bloqueante, no un silencio.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const argv = process.argv.slice(2);
const posicionales = argv.filter((a) => !a.startsWith('--'));
const entrada = posicionales[0];
const salida = posicionales[1];
const origen = posicionales[2] || 'ci';

const hallazgos = [];
const vigilantes = [];

// --- El ancla: el vocabulario sigue viviendo en lib/errores.ts -------------
//
// Se lee del propio fichero del sensor para no tener la lista en dos sitios (que
// es justo la fabrica de regresiones que estos vigilantes existen para evitar).
const FUENTE_SENSOR = 'tests/smoke/silencios.ts';
const FUENTE_MENSAJES = 'lib/errores.ts';

function vocabulario() {
  const texto = readFileSync(path.join(RAIZ, FUENTE_SENSOR), 'utf8');
  const bloque = /export const VOCABULARIO_DE_ERROR = \[([\s\S]*?)\] as const;/.exec(texto);
  if (!bloque) {
    throw new Error(
      `No se encuentra VOCABULARIO_DE_ERROR en ${FUENTE_SENSOR}. O se ha renombrado ` +
      '(y hay que actualizar este vigilante) o se ha borrado, y entonces el sensor de ' +
      'avisos de error del smoke no esta mirando nada.',
    );
  }
  return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const frases = vocabulario();
const mensajes = readFileSync(path.join(RAIZ, FUENTE_MENSAJES), 'utf8');
const huerfanas = frases.filter((f) => !mensajes.includes(f));

if (huerfanas.length) {
  hallazgos.push({
    clave: 'silencios/vocabulario-perdido',
    nivel: 'bloqueante',
    ambito: 'silencios',
    titulo: `El sensor de avisos de error busca ${huerfanas.length} frase(s) que ya no existen`,
    detalle:
      `Estas frases ya no aparecen en ${FUENTE_MENSAJES}: ${huerfanas.map((f) => `"${f}"`).join(', ')}. ` +
      'El sensor del smoke las busca en la pantalla para saber si un boton ha sacado un aviso de error; ' +
      'si los mensajes se han reescrito, el sensor se ha quedado SORDO y daria verde para siempre. ' +
      `Actualiza VOCABULARIO_DE_ERROR en ${FUENTE_SENSOR} con las frases nuevas.`,
    fichero: FUENTE_SENSOR,
    linea: null,
  });
}

// --- Las medidas de la corrida ---------------------------------------------

if (!entrada || !existsSync(entrada)) {
  // Sin medidas no hay nada que juzgar, pero el ancla de arriba SI se ha
  // comprobado y puede haber salido un bloqueante. No se calla por eso.
  console.log(`[silencios] no hay ${entrada || 'silencios.jsonl'}: solo se ha comprobado el ancla del vocabulario.`);
} else {
  for (const linea of readFileSync(entrada, 'utf8').split('\n')) {
    if (!linea.trim()) continue;
    const s = JSON.parse(linea);
    const vig = { nombre: `silencios/${s.pantalla}`, ambito: 'silencios', ms: null, ok: true };
    vigilantes.push(vig);

    for (const r of s.rechazos || []) {
      vig.ok = false;
      hallazgos.push({
        // La clave lleva la pantalla pero NO el texto del rechazo: si lo llevara,
        // un mensaje con un id dentro crearia un hallazgo nuevo en cada corrida y
        // el ciclo de vida (nuevo/en revision/resuelto) no serviria de nada.
        clave: `silencios/rechazo-${s.pantalla}`,
        nivel: origen === 'canario' ? 'bloqueante' : 'aviso',
        ambito: 'silencios',
        titulo: `La pantalla ${s.pantalla} deja una promesa rechazada sin capturar`,
        detalle:
          `${r}\n\nNadie la captura, asi que nadie la enseño: para quien esta delante, el boton no hizo nada. ` +
          'Esto no lo veia el smoke hasta ahora porque `pageerror` solo caza excepciones sincronas.' +
          (origen === 'canario' ? ' Va en produccion, con salones de verdad delante.' : ''),
        fichero: null,
        linea: null,
      });
    }

    for (const e of s.errores_ui || []) {
      vig.ok = false;
      hallazgos.push({
        clave: `silencios/boton-${s.pantalla}-${e.boton}`,
        nivel: 'aviso',
        ambito: 'silencios',
        titulo: `En ${s.pantalla}, el boton "${e.boton}" saca un aviso de error`,
        detalle:
          `El aviso dice: "${e.texto}". Puede ser correcto -- pulsar Guardar con el formulario vacio ` +
          'debe avisar -- pero si este boton no avisaba antes, algo ha dejado de funcionar.',
        fichero: null,
        linea: null,
      });
    }

    for (const d of s.dialogos || []) {
      if (!frases.some((f) => d.includes(f))) continue; // un alert normal no es un fallo
      vig.ok = false;
      hallazgos.push({
        clave: `silencios/dialogo-${s.pantalla}`,
        nivel: 'aviso',
        ambito: 'silencios',
        titulo: `La pantalla ${s.pantalla} abre un alert() con un error dentro`,
        detalle: d,
        fichero: null,
        linea: null,
      });
    }
  }
}

if (salida) {
  writeFileSync(salida, JSON.stringify({
    version: 1,
    origen,
    commit: process.env.GITHUB_SHA || null,
    rama: process.env.GITHUB_REF_NAME || null,
    ejecutado_en: new Date().toISOString(),
    duracion_ms: null,
    vigilantes,
    hallazgos,
  }, null, 2), 'utf8');
}

const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
for (const h of hallazgos) console.log(`[silencios] ${h.nivel.toUpperCase()} ${h.titulo}`);
console.log(`[silencios] ${vigilantes.length} pantallas, ${frases.length} frases de error vigiladas, ${bloq} bloqueantes, ${hallazgos.length - bloq} avisos.`);
process.exit(bloq > 0 ? 1 : 0);
