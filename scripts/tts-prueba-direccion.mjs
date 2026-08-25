#!/usr/bin/env node
// ---------------------------------------------------------------------------
// LA PRUEBA QUE DECIDE LA ARQUITECTURA DE LA NARRACION.
//
// Gemini 3.1 Flash TTS no es un TTS normal: admite un prompt con perfil de voz,
// escena y notas de direccion, y ACTUA el texto en vez de leerlo. Pero eso esta
// documentado contra la API de Google. Nosotros vamos por OpenRouter, cuyo
// endpoint /audio/speech solo tiene un campo `input`.
//
// La duda: ¿OpenRouter pasa ese prompt como DIRECCION, o Gemini se pone a leer
// en voz alta las notas del director?
//
// Google avisa de las dos cosas en su guia:
//   "Vague prompts may fail to trigger the speech synthesis classifier,
//    resulting in a rejected request (PROHIBITED_CONTENT) or causing the model
//    to read your style instructions and director's notes aloud."
//
// Como se mide sin escuchar: por DURACION. El texto hablado son ~160
// caracteres (~11 s). Si el audio con notas dura parecido, las ha interpretado.
// Si se va a 60 s o mas, se las esta leyendo.
//
//   node scripts/tts-prueba-direccion.mjs
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
if (!API_KEY) { console.error('Falta OPENROUTER_API_KEY'); process.exit(1); }

const MODELO = 'google/gemini-3.1-flash-tts-preview';
const VOZ = 'Sulafat'; // "Warm" en el catalogo de Google

// El paso 2 del recorrido, tal cual esta en demo.html (sin los ** de markdown).
const TRANSCRIPCION =
  'Tu dia entero, en una pantalla. Una columna por profesional y las citas en su hora. ' +
  'El color es el estado de cada una. Toca cualquier hueco libre y empieza una cita.';

// --- A) pelado ---
const A = TRANSCRIPCION;

// --- B) con etiquetas, sin notas de direccion ---
const B =
  '[warm] Tu dia entero, [short pause] en una pantalla. Una columna por profesional y las citas en su hora. ' +
  '[calm] El color es el estado de cada una. [excited] Toca cualquier hueco libre y empieza una cita.';

// --- C) prompt completo de direccion, con el preambulo que pide Google ---
const C = `Synthesize speech for the transcript at the end of this prompt. Everything before the TRANSCRIPT heading is direction and must NOT be spoken aloud.

# AUDIO PROFILE: Marta
## "La compañera de oficio"
Marta tiene 38 años y lleva quince detras de un sillon. Ahora ensena el software
que le habria salvado los primeros cinco. No vende: cuenta lo que hace.

## THE SCENE: El salon a media mañana
Un salon de barrio en Espana, martes por la mañana. Huele a tinte. Se oyen
secadores de fondo. Marta esta de pie junto a la recepcion, senalando la
pantalla con el dedo, hablandole a una companera que acaba de abrir su propio
local y esta agobiada.

### DIRECTOR'S NOTES
Style: Cercana y segura, nunca comercial. La "sonrisa vocal" esta ahi pero
contenida: es una profesional explicando a otra, no una locutora de anuncio.
Baja el volumen en los incisos, como quien confia un truco.
Pacing: Pausada. Deja respirar despues de cada idea, sobre todo antes de un dato
concreto. Nada de prisa: quien escucha esta mirando la pantalla a la vez.
Accent: Castellano de Espana, de Madrid. Seseo no. Vocales limpias, "c" y "z"
distinguidas.
Breathing: Respiracion audible pero suave antes de las frases largas.

#### TRANSCRIPT
[warm] Tu dia entero, [short pause] en una pantalla. Una columna por profesional y las citas en su hora. [calm] El color es el estado de cada una. [excited] Toca cualquier hueco libre y empieza una cita.`;

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

// Silencio, nivel y duracion directamente del PCM: sirve para saber si actua.
function medir(wav) {
  const hz = wav.readUInt32LE(24);
  const d = wav.subarray(44);
  const n = Math.floor(d.length / 2);
  let suma = 0, acc = 0, cuenta = 0;
  const ventana = Math.floor(hz * 0.05);
  const ventanas = [];
  for (let i = 0; i < n; i++) {
    const v = d.readInt16LE(i * 2) / 32768;
    suma += v * v; acc += v * v; cuenta++;
    if (cuenta === ventana) { ventanas.push(Math.sqrt(acc / cuenta)); acc = 0; cuenta = 0; }
  }
  return {
    segundos: +(n / hz).toFixed(1),
    nivel_dB: +(20 * Math.log10(Math.sqrt(suma / n))).toFixed(1),
    silencio_pct: +((ventanas.filter((r) => r < 0.005).length / ventanas.length) * 100).toFixed(1),
  };
}

const SALIDA = join('web', 'tts-muestras', 'direccion');
mkdirSync(SALIDA, { recursive: true });

async function generar(nombre, input) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO, input, voice: VOZ, response_format: 'pcm' }),
  });
  if (!r.ok) {
    let m = ''; try { m = JSON.stringify(await r.json()); } catch { m = await r.text(); }
    console.log(`  ${nombre.padEnd(28)} FALLO ${r.status} ${m.slice(0, 200)}`);
    return null;
  }
  const id = r.headers.get('x-generation-id');
  const wav = envolverEnWav(Buffer.from(await r.arrayBuffer()));
  writeFileSync(join(SALIDA, `${nombre}.wav`), wav);

  let coste = null;
  for (const espera of [2500, 4000]) {
    await new Promise((s) => setTimeout(s, espera));
    const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (g.ok) { coste = (await g.json())?.data?.total_cost ?? null; if (coste != null) break; }
  }

  const m = medir(wav);
  console.log(`  ${nombre.padEnd(28)} ${String(m.segundos).padStart(5)} s  nivel ${String(m.nivel_dB).padStart(6)} dB  silencio ${String(m.silencio_pct).padStart(5)} %  ${coste != null ? '$' + coste.toFixed(6) : ''}  (${Date.now() - t0} ms)`);
  return { ...m, coste, input };
}

console.log(`\nVoz: ${VOZ} · texto hablado: ${TRANSCRIPCION.length} caracteres`);
console.log(`Prompt con direccion: ${C.length} caracteres (${(C.length / TRANSCRIPCION.length).toFixed(1)}x el texto)\n`);

const a = await generar('A-pelado', A);
const b = await generar('B-etiquetas', B);
const c = await generar('C-direccion-completa', C);

console.log('\n--- Veredicto ---');
if (a && c) {
  const ratio = c.segundos / a.segundos;
  if (ratio > 2.5) {
    console.log(`C dura ${ratio.toFixed(1)}x que A: Gemini SE ESTA LEYENDO las notas de direccion.`);
    console.log('=> Por OpenRouter hay que mandar SOLO transcripcion + etiquetas.');
  } else {
    console.log(`C dura ${ratio.toFixed(1)}x que A: las notas se han INTERPRETADO, no leido.`);
    console.log('=> Por OpenRouter se puede mandar el prompt de direccion completo.');
  }
}
if (a && c) {
  console.log(`\nCoste por caracter HABLADO:`);
  console.log(`  A (pelado)   $${(a.coste / TRANSCRIPCION.length).toFixed(9)}`);
  console.log(`  C (direccion) $${(c.coste / TRANSCRIPCION.length).toFixed(9)}   <- lo que importa: el prompt largo tambien se paga`);
}
console.log('');
