#!/usr/bin/env node
// Pide a la edge `ejecutar-vigilancia-bd` que corra la capa 2 y falla si trae
// algun bloqueante.
//
// Lo llama .github/workflows/vigilancia-bd.yml cada 6 h. GitHub Actions NO ve
// ninguna clave de Supabase (regla 4): solo manda VIGILANCIA_TOKEN, y la clave
// de servicio se queda dentro de la funcion.
//
// FALLA TAMBIEN SI NO PUEDE MIRAR. Un vigilante que no corre y sale en verde es
// peor que uno en rojo: el panel se veria tranquilo por ausencia de datos. Por
// eso faltar un secreto, no poder llamar, o recibir algo que no se entiende son
// salidas distintas de cero, cada una con su mensaje.

import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { RAIZ } from './nucleo.mjs';

const TOKEN = process.env.VIGILANCIA_TOKEN;
const URL_REGISTRO = process.env.VIGILANCIA_URL;
const URL_DIRECTA = process.env.VIGILANCIA_BD_URL;

function morir(motivo, pista) {
  console.error(`\n[vigilancia-bd] ${motivo}`);
  if (pista) console.error(`               ${pista}`);
  process.exitCode = 1;
}

if (!TOKEN) {
  morir(
    'falta el secreto VIGILANCIA_TOKEN.',
    'Sin el no se puede disparar nada y esto NO se salta en silencio: un panel en verde ' +
      'porque nadie ha mirado es peor que uno en rojo.',
  );
  process.exit(1);
}

// La URL de la funcion hermana se deriva de la del recolector, que ya existe
// como secreto. Si VIGILANCIA_URL guardara otra cosa, la llamada acabaria en un
// 404 -- por eso se puede fijar aparte con VIGILANCIA_BD_URL.
const url =
  URL_DIRECTA ||
  (URL_REGISTRO ? URL_REGISTRO.replace(/registrar-vigilancia\/?$/, 'ejecutar-vigilancia-bd') : null);

if (!url) {
  morir(
    'falta VIGILANCIA_URL (o VIGILANCIA_BD_URL).',
    'Se espera la URL de .../functions/v1/registrar-vigilancia, de la que se deriva la de ' +
      'ejecutar-vigilancia-bd.',
  );
  process.exit(1);
}
if (!/ejecutar-vigilancia-bd\/?$/.test(url)) {
  morir(
    `la URL derivada no apunta a ejecutar-vigilancia-bd: ${url}`,
    'VIGILANCIA_URL deberia terminar en /registrar-vigilancia. Salida limpia: definir ' +
      'VIGILANCIA_BD_URL con la URL completa de la funcion.',
  );
  process.exit(1);
}

// Las migraciones del repo viajan en el cuerpo para que la guardia las cruce con
// el historial remoto. La lista de conocidas evita el falso positivo de las
// aplicadas desde el editor SQL del dashboard, que no registra la version.
const migraciones = readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) =>
  f.endsWith('.sql'),
);
const conocidas = JSON.parse(
  readFileSync(path.join(RAIZ, 'scripts/vigilantes/migraciones-conocidas.json'), 'utf8'),
);
const ignorar = (conocidas.conocidas ?? []).map((c) => c.version);

let r;
try {
  r = await fetch(url, {
    method: 'POST',
    headers: { 'x-vigilancia-token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commit: process.env.GITHUB_SHA || null,
      rama: process.env.GITHUB_REF_NAME || null,
      migraciones,
      ignorar,
    }),
  });
} catch (e) {
  morir(`no se ha podido llamar a la funcion: ${e?.message || e}`, `URL: ${url}`);
  process.exit(1);
}

const texto = await r.text();
if (!r.ok) {
  morir(
    `la funcion ha devuelto ${r.status}.`,
    r.status === 401
      ? 'El VIGILANCIA_TOKEN de Actions no coincide con el del entorno de las edge functions.'
      : r.status === 404
        ? 'La funcion no esta desplegada: supabase functions deploy ejecutar-vigilancia-bd'
        : texto.slice(0, 400),
  );
  process.exit(1);
}

let cuerpo;
try {
  cuerpo = JSON.parse(texto);
} catch {
  morir('la funcion ha contestado algo que no es JSON.', texto.slice(0, 300));
  process.exit(1);
}

if (cuerpo.guardado === false) {
  console.warn(`[vigilancia-bd] el veredicto vale, pero NO se ha guardado: ${cuerpo.porque}`);
}

const hallazgos = Array.isArray(cuerpo.hallazgos) ? cuerpo.hallazgos : [];
for (const h of hallazgos) console.log(`[vigilancia-bd] ${String(h.nivel).toUpperCase()} ${h.titulo}`);

console.log(
  `\n[vigilancia-bd] ${cuerpo.bloqueantes ?? 0} bloqueante(s), ${cuerpo.avisos ?? 0} aviso(s) ` +
    `en ${cuerpo.duracion_ms ?? '?'} ms.`,
);

if ((cuerpo.bloqueantes ?? 0) > 0) {
  morir(`${cuerpo.bloqueantes} hallazgo(s) bloqueante(s) en la base de datos.`);
  process.exit(1);
}
