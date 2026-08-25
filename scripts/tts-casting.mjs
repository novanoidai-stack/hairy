#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CASTING de voz para la narracion de la demo.
//
// Dice el MISMO paso con varias voces de Gemini y el MISMO prompt de direccion,
// para poder elegir con el oido y no por el adjetivo del catalogo.
//
// El paso elegido es el 15 del recorrido 1 —"mientras el tinte actua solo, tu
// no estas ocupada"— a proposito: es el climax emocional del recorrido y el que
// mas exige a la voz (susurro, pausa larga, y cerrar en serio). Si una voz
// aguanta ese paso, aguanta los otros 32.
//
//   node scripts/tts-casting.mjs
//   node scripts/tts-casting.mjs --voces=Sulafat,Gacrux
//   node scripts/tts-casting.mjs --paso=2
//
// Deja los WAV y una pagina de escucha en web/tts-muestras/casting/.
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

const MODELO = 'google/gemini-3.1-flash-tts-preview';

// Las cinco que encajan con "una companera de oficio", del catalogo de 30.
// Descartadas a proposito: Kore y Alnilam (Firm) suenan a locutora corporativa;
// Puck y Laomedeia (Upbeat) a teletienda; Enceladus (Breathy) a documental.
const VOCES = [
  { id: 'Sulafat',       desc: 'Warm — la apuesta: calida sin ser melosa' },
  { id: 'Achird',        desc: 'Friendly — mas cercana, quiza demasiado joven' },
  { id: 'Vindemiatrix',  desc: 'Gentle — suave; puede quedarse corta de energia' },
  { id: 'Callirrhoe',    desc: 'Easy-going — natural, informal' },
  { id: 'Gacrux',        desc: 'Mature — la voz de quien lleva quince anos en el oficio' },
];

// El prompt de direccion. Identico para las cinco: lo unico que cambia es la voz.
const DIRECCION = `Synthesize speech for the transcript at the end of this prompt.
Everything before the TRANSCRIPT heading is direction and must NOT be spoken.

# AUDIO PROFILE: Marta
## "La compañera de oficio"
Marta tiene 38 años y lleva quince detrás de un sillón. Montó su salón sin
software y se comió todos los errores. Ahora enseña la herramienta que le habría
salvado los primeros cinco años. No vende: cuenta lo que hace.

## THE SCENE: Un salón de barrio, martes por la mañana
Huele a tinte. Se oyen secadores de fondo, lejos. Marta está de pie junto a
recepción, señalando la pantalla con el dedo. Le habla a UNA persona: una
compañera que acaba de abrir su propio local y va agobiada. No hay cámara y no
hay público. Es una conversación entre dos que se dedican a lo mismo.

### DIRECTOR'S NOTES
Style: Cercana y segura, nunca comercial. La "sonrisa vocal" está ahí, pero
contenida: es una profesional explicando a otra, no una locutora leyendo un
anuncio. Cuando dice un dato concreto, baja medio tono y afirma. Cuando cuenta
un truco, baja el volumen como quien confía algo.
Pacing: Pausada. Deja respirar después de cada idea, y sobre todo ANTES del
dato. Nada de prisa: quien escucha está mirando la pantalla a la vez.
Accent: Castellano de España, de Madrid. Vocales limpias, "c" y "z" distinguidas
de la "s". Nada de seseo ni de entonación latinoamericana.
Breathing: Respiración audible pero suave antes de las frases largas.
Articulation: Los números y los nombres de pantalla, claros y separados.

### SAMPLE CONTEXT
Marta está en el minuto tres de una demostración de veinte. Ya ha roto el hielo;
ahora va soltándolo todo con la tranquilidad de quien se lo sabe de memoria.

#### TRANSCRIPT
`;

// Los pasos candidatos a prueba de casting.
const PASOS = {
  15: '[whispers] Y mientras el tinte actúa solo… [short pause] tú no estás ocupada. ' +
      '[long pause] [warm] Mecha libera ese hueco. Y te deja meter a otra clienta encima. ' +
      '[short pause] [serious] Eso son horas. Cada semana.',
  2:  'Tu día entero, [short pause] en una pantalla. Una columna por cada profesional, ' +
      'y cada cita en su hora. [calm] El color te dice el estado de un vistazo. ' +
      '[excited] Toca cualquier hueco libre y ya estás creando una cita.',
};

const args = process.argv.slice(2);
const arg = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const nPaso = arg('paso') || '15';
const soloVoces = (arg('voces') || '').split(',').filter(Boolean);
const TRANSCRIPCION = PASOS[nPaso];
if (!TRANSCRIPCION) { console.error(`No hay paso ${nPaso}. Hay: ${Object.keys(PASOS).join(', ')}`); process.exit(1); }

const elegidas = soloVoces.length ? VOCES.filter((v) => soloVoces.includes(v.id)) : VOCES;

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

// Lo unico que se puede juzgar sin oidos: que hay voz, que no satura y que las
// pausas que pedimos con las etiquetas estan ahi de verdad.
function medir(wav) {
  const hz = wav.readUInt32LE(24);
  const d = wav.subarray(44);
  const n = Math.floor(d.length / 2);
  let suma = 0, acc = 0, cuenta = 0, tope = 0, racha = 0, rachaMax = 0;
  const ventana = Math.floor(hz * 0.05);
  const ventanas = [];
  for (let i = 0; i < n; i++) {
    const raw = d.readInt16LE(i * 2);
    const v = raw / 32768;
    suma += v * v; acc += v * v; cuenta++;
    if (raw >= 32767 || raw <= -32768) { tope++; racha++; if (racha > rachaMax) rachaMax = racha; } else racha = 0;
    if (cuenta === ventana) { ventanas.push(Math.sqrt(acc / cuenta)); acc = 0; cuenta = 0; }
  }
  return {
    segundos: +(n / hz).toFixed(1),
    nivel_dB: +(20 * Math.log10(Math.sqrt(suma / n))).toFixed(1),
    silencio_pct: +((ventanas.filter((r) => r < 0.005).length / ventanas.length) * 100).toFixed(1),
    saturada: rachaMax >= 5,
    muestras_a_tope: tope,
  };
}

const SALIDA = join('web', 'tts-muestras', 'casting');
mkdirSync(SALIDA, { recursive: true });

// Google avisa: el modelo devuelve 500 al azar en un porcentaje pequeño de
// peticiones. Con tres intentos deja de ser un problema.
async function generar(voz) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELO, input: DIRECCION + TRANSCRIPCION, voice: voz, response_format: 'pcm' }),
    });
    if (r.ok) {
      const id = r.headers.get('x-generation-id');
      const wav = envolverEnWav(Buffer.from(await r.arrayBuffer()));
      let coste = null;
      for (const espera of [2500, 4000]) {
        await new Promise((s) => setTimeout(s, espera));
        const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
        if (g.ok) { coste = (await g.json())?.data?.total_cost ?? null; if (coste != null) break; }
      }
      return { ok: true, wav, coste, intento };
    }
    let m = ''; try { m = (await r.json())?.error?.message || ''; } catch { m = await r.text(); }
    if (intento === 3) return { ok: false, error: `HTTP ${r.status} ${String(m).slice(0, 160)}` };
    await new Promise((s) => setTimeout(s, 1500 * intento));
  }
}

const hablado = TRANSCRIPCION.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
console.log(`\nCasting sobre el paso ${nPaso} · ${elegidas.length} voces`);
console.log(`Texto hablado (${hablado.length} car.): ${hablado}\n`);

const filas = [];
for (const v of elegidas) {
  process.stdout.write(`  ${v.id.padEnd(14)} `);
  const r = await generar(v.id);
  if (!r.ok) { console.log(`FALLO  ${r.error}`); filas.push({ ...v, ok: false, error: r.error }); continue; }
  const f = `paso${nPaso}-${v.id}.wav`;
  writeFileSync(join(SALIDA, f), r.wav);
  const m = medir(r.wav);
  console.log(`${String(m.segundos).padStart(5)} s  nivel ${String(m.nivel_dB).padStart(6)} dB  silencio ${String(m.silencio_pct).padStart(5)} %  ${m.saturada ? 'SATURA ' : '       '}${r.coste != null ? '$' + r.coste.toFixed(6) : ''}${r.intento > 1 ? '  (intento ' + r.intento + ')' : ''}`);
  filas.push({ ...v, ok: true, fichero: f, ...m, coste: r.coste });
}

const gastado = filas.reduce((s, f) => s + (f.coste || 0), 0);
console.log(`\nGastado: $${gastado.toFixed(6)}`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
writeFileSync(join(SALIDA, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Mecha — casting de voz</title>
<style>
  :root{--fuego:#f4501e;--crema:#f6f1ea;--tinta:#1c1917;--sec:#78716c;--linea:#e7e5e4}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 64px;background:var(--crema);color:var(--tinta);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .in{max-width:760px;margin:0 auto}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--sec);margin:0 0 26px}
  .guion{background:#fffdfb;border:1px solid var(--linea);border-left:3px solid var(--fuego);
         border-radius:10px;padding:14px 16px;margin:0 0 28px;font-size:15px;line-height:1.7}
  .guion code{background:#f1efec;border-radius:4px;padding:1px 5px;font-size:12.5px;color:var(--fuego)}
  .v{background:#fffdfb;border:1px solid var(--linea);border-radius:12px;padding:16px 18px;margin:0 0 14px}
  .v h2{font-size:16px;margin:0 0 2px}
  .v .d{color:var(--sec);font-size:13px;margin:0 0 12px}
  .v .m{font-family:ui-monospace,monospace;font-size:12px;color:var(--sec);margin:8px 0 0}
  audio{width:100%;margin:4px 0 0}
  .fallo{color:#b91c1c;font-size:13px;font-family:ui-monospace,monospace}
</style></head><body><div class="in">
<h1>Casting de voz · paso ${esc(nPaso)}</h1>
<p class="sub">Mismo texto, mismo prompt de dirección, cinco voces de Gemini.
Generado el ${new Date().toLocaleString('es-ES')}.</p>
<div class="guion">${esc(TRANSCRIPCION).replace(/\[([^\]]+)\]/g, '<code>[$1]</code>')}</div>
${filas.map((f) => `<div class="v">
  <h2>${esc(f.id)}</h2>
  <p class="d">${esc(f.desc)}</p>
  ${f.ok ? `<audio controls preload="none" src="${esc(f.fichero)}"></audio>
  <p class="m">${f.segundos} s · nivel ${f.nivel_dB} dB · silencio ${f.silencio_pct} %${f.saturada ? ' · SATURA' : ''}</p>`
         : `<p class="fallo">${esc(f.error)}</p>`}
</div>`).join('\n')}
<p class="sub" style="margin-top:28px">Lo que miden los números: que hay voz, que no satura
y que las pausas de las etiquetas están de verdad. <b>El acento y si suena a persona
solo lo juzgas tú.</b></p>
</div></body></html>`);

console.log(`Pagina: ${join(SALIDA, 'index.html')}`);
console.log('   http://localhost:8080/tts-muestras/casting/\n');
