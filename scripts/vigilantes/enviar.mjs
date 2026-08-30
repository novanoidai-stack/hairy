#!/usr/bin/env node
// Manda un informe de vigilancia (el que escribe `index.mjs --json`) al
// recolector, para que salga en la pestaña Salud del panel de staff.
//
//   node scripts/vigilantes/enviar.mjs vigilancia.json
//
// Si faltan VIGILANCIA_URL o VIGILANCIA_TOKEN, avisa y sale con 0. Que no se
// pueda PUBLICAR el informe no debe tumbar una CI que ya ha dado su veredicto:
// el veredicto lo da el runner, esto es solo el registro. Lo mismo si el
// recolector devuelve un error -- se avisa en el log y se sigue.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: node scripts/vigilantes/enviar.mjs <informe.json>');
  process.exit(2);
}

if (!existsSync(destino)) {
  console.log(`[vigilancia] no existe ${destino}: no hay nada que publicar.`);
  process.exit(0);
}

const url = process.env.VIGILANCIA_URL;
const token = process.env.VIGILANCIA_TOKEN;

if (!url || !token) {
  console.log('[vigilancia] sin VIGILANCIA_URL / VIGILANCIA_TOKEN: no se publica el informe.');
  process.exit(0);
}

let informe;
try {
  informe = JSON.parse(readFileSync(destino, 'utf8'));
} catch (e) {
  console.error(`[vigilancia] ${destino} no es JSON valido: ${e.message}`);
  process.exit(0);
}

// CONTRATO: todo hallazgo que se publica tiene que tener la forma que el panel
// y los canales de salida (telegram, issues) saben leer. Un productor fuera de
// contrato es un hallazgo que se pierde a medio camino: mejor no publicar
// hallazgos rotos y decirlo en el log. La validacion es a proposito simple y
// sin dependencias: clave/nivel/ambito/titulo, nivel en {bloqueante, aviso}.
{
  const invalidos = (informe.hallazgos ?? [])
    .filter((h) => !h || typeof h !== 'object')
    .map(() => 'un hallazgo no es objeto')
    .concat(
      (informe.hallazgos ?? [])
        .filter((h) => h && typeof h === 'object')
        .filter((h) => !h.clave || !h.titulo || !h.ambito || !['bloqueante', 'aviso'].includes(h.nivel))
        .map((h) => `clave=${h.clave ?? '(sin clave)'} nivel=${h.nivel ?? '(sin nivel)'}`),
    );
  if (invalidos.length > 0) {
    console.error(
      `[vigilancia] ${destino} trae ${invalidos.length} hallazgo(s) fuera de contrato ` +
      `(clave, nivel en {bloqueante,aviso}, ambito, titulo). No se publica un informe a medias: ` +
      invalidos.slice(0, 5).join(' | '),
    );
    process.exit(0);
  }
}

const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vigilancia-token': token },
  body: JSON.stringify(informe),
}).catch((e) => {
  console.error(`[vigilancia] no se ha podido llamar al recolector: ${e.message}`);
  return null;
});

if (!r) process.exit(0);

const cuerpo = await r.text();
if (!r.ok) {
  console.error(`[vigilancia] el recolector ha devuelto ${r.status}: ${cuerpo.slice(0, 400)}`);
  process.exit(0);
}
console.log(`[vigilancia] informe publicado: ${cuerpo.slice(0, 200)}`);
