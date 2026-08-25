#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ¿Cuantos modelos de voz de OpenRouter sirven para narrar en español?
//
// No se fia de la descripcion del catalogo: le manda a CADA UNO una frase corta
// en español y anota si la acepta, con que voz, cuanto cuesta y cuanto audio
// devuelve. Guarda los MP3 en web/tts-muestras/espanol/ para poder juzgar el
// acento con el oido, que es lo unico que decide de verdad.
//
//   node scripts/tts-soporte-espanol.mjs
//
// Cuesta unos pocos centimos: la frase son ~60 caracteres y el mas caro del
// catalogo esta a 100 $/M.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function leerClave() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  try {
    const m = /^OPENROUTER_API_KEY\s*=\s*(.+)$/m.exec(readFileSync('.env', 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* sin .env */ }
  return null;
}
const API_KEY = leerClave();
if (!API_KEY) { console.error('Falta OPENROUTER_API_KEY en el entorno o en .env'); process.exit(1); }

// Frase con las trampas del castellano: eñe, acentos, ll, rr y una cifra.
const FRASE = 'La señora Núñez llega a las once y cuarto para su mechas balayage.';

// Voces a probar por modelo, en orden. `null` = sin voz (que decida el
// proveedor). La primera que responda 200 gana.
const CANDIDATAS = {
  'google/gemini-3.1-flash-tts-preview': ['Kore', 'Zephyr'],
  'hexgrad/kokoro-82m':                  ['ef_dora', 'em_alex'],
  'x-ai/grok-voice-tts-1.0':             ['Eve', 'Ara'],
  'fish-audio/s1':                       [null],
  'fish-audio/s2-pro':                   [null],
  'fish-audio/s2.1-pro':                 [null],
  'fish-audio/s2.1-pro-free:free':       [null],
  'minimax/speech-2.8-hd':               ['Spanish_SereneWoman', 'Spanish_ThoughtfulLady', null],
  'minimax/speech-2.8-turbo':            ['Spanish_SereneWoman', 'Spanish_ThoughtfulLady', null],
  'microsoft/mai-voice-2':               ['es-ES-Ximena:MAI-Voice-2', 'es-ES-Elvira:MAI-Voice-2', 'en-US-Harper:MAI-Voice-2'],
  'microsoft/mai-voice-2-flash':         ['es-ES-Ximena:MAI-Voice-2', 'en-US-Harper:MAI-Voice-2', null],
  'mistralai/voxtral-mini-tts-2603':     [null, 'Amelia', 'Sofia'],
  'deepgram/aura-2':                     ['aura-2-celeste-es', 'aura-2-nestor-es', 'aura-2-thalia-en', null],
  'deepgram/flux-tts:free':              [null, 'flux-celeste-en'],
  'qwen/qwen-audio-3.0-tts-flash':       [null, 'Cherry', 'Chelsie'],
  'qwen/qwen-audio-3.0-tts-plus':        [null, 'Cherry', 'Chelsie'],
  'canopylabs/orpheus-3b-0.1-ft':        ['tara', null],
  'sesame/csm-1b':                       ['conversational_a', null],
};

// Gemini solo acepta pcm; el resto, mp3.
const FORMATO = { 'google/gemini-3.1-flash-tts-preview': 'pcm' };
// Kokoro lo sirven dos proveedores a precios muy distintos (0,62 vs 4,00 $/M).
const PROVEEDOR = { 'hexgrad/kokoro-82m': { order: ['DeepInfra'], allow_fallbacks: false } };

function envolverEnWav(pcm, hz = 24000, canales = 1, bits = 16) {
  const bps = bits / 8;
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + pcm.length, 4); c.write('WAVE', 8);
  c.write('fmt ', 12); c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20);
  c.writeUInt16LE(canales, 22); c.writeUInt32LE(hz, 24);
  c.writeUInt32LE(hz * canales * bps, 28); c.writeUInt16LE(canales * bps, 32);
  c.writeUInt16LE(bits, 34); c.write('data', 36); c.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([c, pcm]);
}

const SALIDA = join('web', 'tts-muestras', 'espanol');
mkdirSync(SALIDA, { recursive: true });

async function catalogo() {
  const r = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech');
  return (await r.json()).data;
}

async function intentar(modelo, voz) {
  const formato = FORMATO[modelo] || 'mp3';
  const cuerpo = { model: modelo, input: FRASE, response_format: formato };
  if (voz) cuerpo.voice = voz;
  if (PROVEEDOR[modelo]) cuerpo.provider = PROVEEDOR[modelo];

  const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) {
    let m = ''; try { m = (await r.json())?.error?.message || ''; } catch { m = await r.text(); }
    return { ok: false, status: r.status, mensaje: String(m).slice(0, 140) };
  }
  const id = r.headers.get('x-generation-id');
  let bytes = Buffer.from(await r.arrayBuffer());
  let ext = formato === 'pcm' ? 'wav' : formato;
  if (formato === 'pcm') bytes = envolverEnWav(bytes);

  let coste = null;
  for (const espera of [2500, 4000]) {
    await new Promise((s) => setTimeout(s, espera));
    try {
      const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (g.ok) { coste = (await g.json())?.data?.total_cost ?? null; if (coste != null) break; }
    } catch { /* reintento */ }
  }
  return { ok: true, bytes, ext, coste, voz };
}

const modelos = await catalogo();
console.log(`\n${modelos.length} modelos de voz en OpenRouter. Frase de prueba:`);
console.log(`  "${FRASE}"  (${FRASE.length} caracteres)\n`);

const filas = [];
for (const m of modelos) {
  const voces = CANDIDATAS[m.id] || [null];
  process.stdout.write(`  ${m.id.padEnd(38)} `);
  let res = null, errores = [];
  for (const v of voces) {
    res = await intentar(m.id, v);
    if (res.ok) break;
    errores.push(`${v || '(sin voz)'}: ${res.status}`);
  }
  if (res?.ok) {
    const f = `${m.id.replace(/[\/:.]/g, '_')}.${res.ext}`;
    writeFileSync(join(SALIDA, f), res.bytes);
    console.log(`OK  voz=${String(res.voz || 'por defecto').padEnd(26)} ${(res.bytes.length / 1024).toFixed(0).padStart(4)} KB  ${res.coste != null ? '$' + res.coste.toFixed(6) : ''}`);
    filas.push({ id: m.id, ok: true, voz: res.voz || 'por defecto', fichero: `espanol/${f}`, coste: res.coste, precio: +(m.pricing?.prompt || 0) });
  } else {
    console.log(`NO  ${errores.join(' · ')}`);
    filas.push({ id: m.id, ok: false, motivo: errores.join(' · '), precio: +(m.pricing?.prompt || 0) });
  }
}

const acepta = filas.filter((f) => f.ok).length;
const gastado = filas.reduce((s, f) => s + (f.coste || 0), 0);
console.log(`\n${acepta} de ${modelos.length} han devuelto audio en español.`);
console.log(`Gastado: $${gastado.toFixed(6)}\n`);
console.log('Los ficheros estan en web/tts-muestras/espanol/. Escuchalos: aceptar la');
console.log('peticion no es lo mismo que hablar español sin acento raro.\n');

writeFileSync(join('web', 'tts-muestras', 'espanol.json'), JSON.stringify({ frase: FRASE, filas }, null, 2));
