#!/usr/bin/env node
// Canal de SALIDA de la vigilancia: avisa por Telegram cuando hay bloqueantes.
//
//   node scripts/vigilantes/notificar.mjs <informe.json>
//
// POR QUE EXISTE (30 ago 2026)
// Todo hallazgo aterrizaba en la pestaña Salud del panel: un panel que nadie
// mira a las 3 de la manana es un panel que no existe. La deteccion sin
// notificacion es la mitad de un sistema.
//
// Reglas:
// - Solo BLOQUEANTES. Los avisos viven en el panel; el movil es para lo que
//   duele.
// - Deduplicacion por clave: de cada clave repetida, un solo mensaje con su
//   cuenta (max 1 SMS... un mensaje, por informe).
// - Sin TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID configurados: avisa en el log y
//   sale 0 — igual que enviar.mjs, la publicacion nunca tumba el veredicto.
//   Pero si ESTAN configurados y Telegram rechaza, se sale con 1: un canal de
//   alerta configurado y mudo es peor que no tenerlo.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { RAIZ } from './nucleo.mjs';

const ficheroEnv = path.join(RAIZ, '.env');
if (existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

const destino = process.argv[2];
if (!destino || !existsSync(destino)) {
  console.log(`[notificar] no existe ${destino}: no hay nada que notificar.`);
  process.exit(0);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
if (!token || !chat) {
  console.log('[notificar] sin TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID: no se notifica por Telegram.');
  process.exit(0);
}

let informe;
try {
  informe = JSON.parse(readFileSync(destino, 'utf8'));
} catch (e) {
  console.error(`[notificar] ${destino} no es JSON valido: ${e.message}`);
  process.exit(0);
}

const bloqueantes = (informe.hallazgos ?? []).filter((h) => h.nivel === 'bloqueante');
if (bloqueantes.length === 0) {
  console.log('[notificar] sin bloqueantes: el movil se queda tranquilo.');
  process.exit(0);
}

// Deduplicar por clave y recortar: Telegram corta en 4096 caracteres.
const porClave = new Map();
for (const h of bloqueantes) {
  const previo = porClave.get(h.clave) ?? { titulo: h.titulo, n: 0 };
  previo.n += 1;
  porClave.set(h.clave, previo);
}

const cabecera =
  `🔴 VIGILANCIA: ${bloqueantes.length} bloqueante(s)` +
  (informe.origen ? ` (${informe.origen}${informe.rama ? ', ' + informe.rama : ''})` : '') +
  (informe.commit ? `\n${String(informe.commit).slice(0, 8)}` : '') + '\n\n';

const cuerpo = [...porClave.values()]
  .slice(0, 12)
  .map((h) => `• ${h.titulo}${h.n > 1 ? ` (x${h.n})` : ''}`)
  .join('\n');

const sobran = porClave.size - 12;
let texto = cabecera + cuerpo + (sobran > 0 ? `\n… y ${sobran} más (ver panel de Salud)` : '');
if (texto.length > 3800) texto = texto.slice(0, 3800) + '\n… (ver panel de Salud)';

const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
}).catch((e) => {
  console.error(`[notificar] no se ha podido llamar a Telegram: ${e.message}`);
  return null;
});

if (!r) process.exit(1);
const resp = await r.text();
if (!r.ok) {
  console.error(`[notificar] Telegram ha devuelto ${r.status}: ${resp.slice(0, 300)}`);
  process.exit(1);
}
console.log(`[notificar] Telegram avisado de ${bloqueantes.length} bloqueante(s).`);
