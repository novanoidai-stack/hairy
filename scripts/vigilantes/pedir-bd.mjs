#!/usr/bin/env node
// Pide a la edge `ejecutar-vigilancia-bd` que dispare los vigilantes que viven
// dentro de Postgres, y traduce su respuesta a un veredicto.
//
//   node scripts/vigilantes/pedir-bd.mjs
//
// Codigo de salida: 1 si hay algun hallazgo BLOQUEANTE. Los avisos no paran nada.
//
// POR QUE ESTE SCRIPT NO LLEVA NINGUNA CLAVE DE SUPABASE
// Regla 4 del diseño: GitHub Actions jamas ve una clave de Supabase. Aqui solo
// viaja VIGILANCIA_TOKEN, cuyo peor uso posible es ensuciar la pestaña Salud; la
// clave de servicio se queda dentro de la edge function.
//
// SILENCIO != VERDE. Si falta configuracion o la funcion no responde, esto NO
// se calla ni sale en verde como si todo estuviera bien: lo dice y sale con 1.
// La unica excepcion es no tener configurado nada en absoluto (un checkout de
// alguien que no ha puesto los secrets), que avisa y sale con 0 -- pero en la CI
// eso significa que los secrets se han perdido, y el workflow lo comprueba.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const token = process.env.VIGILANCIA_TOKEN;
// Se deriva de la URL del recolector para no tener que configurar un secret mas:
// las dos funciones viven en el mismo proyecto.
const url =
  process.env.VIGILANCIA_BD_URL ||
  (process.env.VIGILANCIA_URL || '').replace(/\/registrar-vigilancia\/?$/, '/ejecutar-vigilancia-bd');

if (!token || !url) {
  console.log('[vigilancia-bd] sin VIGILANCIA_URL / VIGILANCIA_TOKEN: no se ha vigilado la base de datos.');
  process.exit(0);
}

// La guardia de migraciones: se manda la lista de ficheros del repo y la
// funcion la cruza con el historial remoto. La lista de exenciones va congelada
// en el repo (no en la base) para que su diff se vea en la revision, igual que
// el resto de lineas base.
function migracionesDelRepo() {
  const dir = path.join(RAIZ, 'supabase/migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.sql'));
}

function exenciones() {
  const f = path.join(RAIZ, 'scripts/vigilantes/migraciones-conocidas.json');
  if (!existsSync(f)) return [];
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    return (j.aplicadas_fuera_del_historial || []).map((m) => m.version);
  } catch (e) {
    console.error(`[vigilancia-bd] migraciones-conocidas.json no es JSON valido: ${e.message}`);
    return [];
  }
}

const r = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-vigilancia-token': token },
  body: JSON.stringify({
    commit: process.env.GITHUB_SHA || null,
    rama: process.env.GITHUB_REF_NAME || null,
    migraciones: migracionesDelRepo(),
    ignorar: exenciones(),
  }),
}).catch((e) => {
  console.error(`[vigilancia-bd] no se ha podido llamar a la funcion: ${e.message}`);
  return null;
});

if (!r) process.exit(1);

const texto = await r.text();

if (r.status === 404) {
  console.error(
    '[vigilancia-bd] la funcion ejecutar-vigilancia-bd devuelve 404: todavia no esta desplegada.\n' +
    '  Desplegarla con:  npx supabase functions deploy ejecutar-vigilancia-bd\n' +
    '  Hasta entonces, la capa 2 de los vigilantes (la que mira DENTRO de Postgres) no corre sola,\n' +
    '  que es justo el hueco que este workflow existe para tapar.',
  );
  process.exit(1);
}

if (!r.ok) {
  console.error(`[vigilancia-bd] la funcion ha devuelto ${r.status}: ${texto.slice(0, 500)}`);
  process.exit(1);
}

let resp;
try {
  resp = JSON.parse(texto);
} catch {
  console.error(`[vigilancia-bd] respuesta que no es JSON: ${texto.slice(0, 300)}`);
  process.exit(1);
}

for (const h of resp.hallazgos || []) {
  console.log(`[vigilancia-bd] ${String(h.nivel).toUpperCase()} ${h.titulo}`);
  if (h.detalle) console.log(`    ${String(h.detalle).slice(0, 400)}`);
}

if (resp.guardado === false) {
  console.error(`[vigilancia-bd] AVISO: la corrida no se ha guardado en el panel (${resp.porque || 'sin motivo'}).`);
}

console.log(
  `[vigilancia-bd] ${resp.bloqueantes ?? 0} bloqueante(s), ${resp.avisos ?? 0} aviso(s) ` +
  `en ${resp.duracion_ms ?? '?'} ms.`,
);

process.exit((resp.bloqueantes ?? 0) > 0 ? 1 : 0);
