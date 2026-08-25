#!/usr/bin/env node
// ---------------------------------------------------------------------------
// CASTING FINAL: 3 voces x 6 tratamientos de etiquetas.
//
// De la primera ronda salieron tres finalistas (Vindemiatrix, Gacrux, Sulafat)
// y una pega concreta: Sulafat arrastra demasiado los silencios. Asi que aqui
// no se prueba solo el timbre, se prueba COMO responde cada voz a cada familia
// de etiquetas, y se mide la pausa mas larga en segundos — que es exactamente
// lo que chirria.
//
// Los seis tratamientos, cada uno con una pregunta detras:
//   1 pausa-explicita  el original. ¿cuanto arrastra cada voz?
//   2 pausa-puntuacion mismo texto, pausas con "…" y puntos. ¿se arregla Sulafat?
//   3 pausa-dirigida   con [long pause] PERO con nota de "silencios breves".
//                      ¿se puede domar la pausa desde las notas del director?
//   4 ritmo-normal     modo explicativo. el 90% del recorrido suena asi
//   5 energia          subir sin sonar a teletienda
//   6 dato-duro        numeros y articulacion. ¿se entienden las cifras?
//
//   node scripts/tts-casting-final.mjs
//   node scripts/tts-casting-final.mjs --voces=Gacrux --trata=2,3
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
const VOCES = ['Vindemiatrix', 'Gacrux', 'Sulafat'];

// --- el prompt de direccion, en dos trozos para poder inyectar una nota extra
const DIR_A = `Synthesize speech for the transcript at the end of this prompt.
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
Accent: Castellano de España, de Madrid. Vocales limpias, "c" y "z" distinguidas
de la "s". Nada de seseo ni de entonación latinoamericana.
Breathing: Respiración audible pero suave antes de las frases largas.
Articulation: Los números y los nombres de pantalla, claros y separados.
`;

const PACING_BASE = `Pacing: Pausada. Deja respirar después de cada idea, y sobre todo ANTES del
dato. Nada de prisa: quien escucha está mirando la pantalla a la vez.
`;

const DIR_B = `
### SAMPLE CONTEXT
Marta está en el minuto tres de una demostración de veinte. Ya ha roto el hielo;
ahora va soltándolo todo con la tranquilidad de quien se lo sabe de memoria.

#### TRANSCRIPT
`;

// --- los seis tratamientos ---------------------------------------------------
const TRATAMIENTOS = [
  {
    n: 1, id: 'pausa-explicita',
    pregunta: '¿Cuánto arrastra cada voz con [long pause]?',
    pacing: PACING_BASE,
    texto: '[whispers] Y mientras el tinte actúa solo… [short pause] tú no estás ocupada. ' +
           '[long pause] [warm] Mecha libera ese hueco. Y te deja meter a otra clienta encima. ' +
           '[short pause] [serious] Eso son horas. Cada semana.',
  },
  {
    n: 2, id: 'pausa-puntuacion',
    pregunta: 'Mismo texto SIN etiquetas de pausa: ¿respira igual de bien?',
    pacing: PACING_BASE,
    texto: '[whispers] Y mientras el tinte actúa solo… tú no estás ocupada. ' +
           '[warm] Mecha libera ese hueco. Y te deja meter a otra clienta encima. ' +
           '[serious] Eso son horas. Cada semana.',
  },
  {
    n: 3, id: 'pausa-dirigida',
    pregunta: 'Con [long pause] pero mandándole silencios breves: ¿obedece?',
    pacing: `Pacing: Ágil dentro de la calma. Las pausas son BREVES: medio segundo, nunca
dos. Un silencio largo mata el ritmo de una demostración. Encadena las frases
sin dejar aire muerto entre ellas.
`,
    texto: '[whispers] Y mientras el tinte actúa solo… [short pause] tú no estás ocupada. ' +
           '[long pause] [warm] Mecha libera ese hueco. Y te deja meter a otra clienta encima. ' +
           '[short pause] [serious] Eso son horas. Cada semana.',
  },
  {
    n: 4, id: 'ritmo-normal',
    pregunta: 'Modo explicativo: así suena el 90 % del recorrido',
    pacing: PACING_BASE,
    texto: 'Tu día entero, [short pause] en una pantalla. Una columna por cada profesional, ' +
           'y cada cita en su hora. [calm] El color te dice el estado de un vistazo. ' +
           '[excited] Toca cualquier hueco libre y ya estás creando una cita.',
  },
  {
    n: 5, id: 'energia',
    pregunta: '¿Suben sin sonar a teletienda?',
    pacing: PACING_BASE,
    texto: '[excited] Y esto es lo que ve tu clienta: [short pause] tu propia página de reservas. ' +
           '[warm] Con tu nombre, tus fotos y tus precios. La compartes por WhatsApp, ' +
           'por Instagram, o con un código QR en el mostrador. ' +
           '[serious] Sin comisiones. Y sin intermediarios.',
  },
  {
    n: 6, id: 'dato-duro',
    pregunta: '¿Se entienden los números y las siglas?',
    pacing: PACING_BASE,
    texto: '[calm] Cobrado hoy: [short pause] mil doscientos cuarenta euros. ' +
           'Cuatrocientos en efectivo, ochocientos cuarenta con datáfono. ' +
           '[warm] Cierras el día en diez segundos, [short pause] y te llevas el ' +
           'CSV para la gestoría cuando quieras.',
  },
];

const args = process.argv.slice(2);
const arg = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const soloVoces = (arg('voces') || '').split(',').filter(Boolean);
const soloTrata = (arg('trata') || '').split(',').filter(Boolean).map(Number);

const voces = soloVoces.length ? VOCES.filter((v) => soloVoces.includes(v)) : VOCES;
const tratos = soloTrata.length ? TRATAMIENTOS.filter((t) => soloTrata.includes(t.n)) : TRATAMIENTOS;

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

// La medida que importa esta ronda: LA PAUSA MAS LARGA, en segundos. El
// porcentaje de silencio no distingue entre "respira bien" y "se queda parada".
function medir(wav) {
  const hz = wav.readUInt32LE(24);
  const d = wav.subarray(44);
  const n = Math.floor(d.length / 2);
  const ventana = Math.floor(hz * 0.02);      // 20 ms: resolucion fina
  const UMBRAL = 0.004;
  let suma = 0, acc = 0, cuenta = 0, tope = 0, racha = 0, rachaMax = 0;
  let silSeguidas = 0, silMax = 0, silTotal = 0, ventanas = 0;
  for (let i = 0; i < n; i++) {
    const raw = d.readInt16LE(i * 2);
    const v = raw / 32768;
    suma += v * v; acc += v * v; cuenta++;
    if (raw >= 32767 || raw <= -32768) { tope++; racha++; if (racha > rachaMax) rachaMax = racha; } else racha = 0;
    if (cuenta === ventana) {
      const rms = Math.sqrt(acc / cuenta);
      ventanas++;
      if (rms < UMBRAL) { silTotal++; silSeguidas++; if (silSeguidas > silMax) silMax = silSeguidas; }
      else silSeguidas = 0;
      acc = 0; cuenta = 0;
    }
  }
  return {
    segundos: +(n / hz).toFixed(1),
    nivel_dB: +(20 * Math.log10(Math.sqrt(suma / n))).toFixed(1),
    silencio_pct: +((silTotal / ventanas) * 100).toFixed(1),
    pausa_max_s: +((silMax * ventana) / hz).toFixed(2),
    satura: rachaMax >= 5,
    a_tope: tope,
  };
}

const SALIDA = join('web', 'tts-muestras', 'casting-final');
mkdirSync(SALIDA, { recursive: true });

async function generar(voz, trato) {
  const input = DIR_A + trato.pacing + DIR_B + trato.texto;
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELO, input, voice: voz, response_format: 'pcm' }),
    });
    if (r.ok) {
      const id = r.headers.get('x-generation-id');
      const wav = envolverEnWav(Buffer.from(await r.arrayBuffer()));
      let coste = null;
      for (const espera of [2500, 3500]) {
        await new Promise((s) => setTimeout(s, espera));
        const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
        if (g.ok) { coste = (await g.json())?.data?.total_cost ?? null; if (coste != null) break; }
      }
      return { ok: true, wav, coste, intentos: intento };
    }
    let m = ''; try { m = (await r.json())?.error?.message || ''; } catch { m = await r.text(); }
    if (intento === 3) return { ok: false, error: `HTTP ${r.status} ${String(m).slice(0, 120)}` };
    await new Promise((s) => setTimeout(s, 1500 * intento));
  }
}

const pelar = (t) => t.replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();

console.log(`\nCasting final · ${voces.length} voces x ${tratos.length} tratamientos = ${voces.length * tratos.length} generaciones\n`);

const res = [];
let reintentos = 0;
for (const t of tratos) {
  console.log(`  ${t.n}. ${t.id}  —  ${t.pregunta}`);
  for (const v of voces) {
    process.stdout.write(`       ${v.padEnd(14)} `);
    const r = await generar(v, t);
    if (!r.ok) { console.log(`FALLO ${r.error}`); res.push({ t, v, ok: false, error: r.error }); continue; }
    reintentos += r.intentos - 1;
    const f = `t${t.n}-${v}.wav`;
    writeFileSync(join(SALIDA, f), r.wav);
    const m = medir(r.wav);
    console.log(`${String(m.segundos).padStart(5)} s   pausa max ${String(m.pausa_max_s).padStart(4)} s   nivel ${String(m.nivel_dB).padStart(6)} dB   sil ${String(m.silencio_pct).padStart(4)} %${m.satura ? '   SATURA' : ''}`);
    res.push({ t, v, ok: true, fichero: f, ...m, coste: r.coste });
  }
  console.log('');
}

const gastado = res.reduce((s, r) => s + (r.coste || 0), 0);
console.log(`Gastado: $${gastado.toFixed(6)}   ·   reintentos por 500: ${reintentos}\n`);

// --- resumen por voz: lo que decide ------------------------------------------
console.log('Resumen por voz (media de los tratamientos que salieron):');
for (const v of voces) {
  const suyos = res.filter((r) => r.v === v && r.ok);
  if (!suyos.length) continue;
  const media = (k) => (suyos.reduce((s, r) => s + r[k], 0) / suyos.length).toFixed(2);
  const peor = Math.max(...suyos.map((r) => r.pausa_max_s));
  console.log(`  ${v.padEnd(14)} pausa max media ${media('pausa_max_s')} s  (la peor: ${peor} s)   nivel medio ${media('nivel_dB')} dB   satura en ${suyos.filter((r) => r.satura).length}/${suyos.length}`);
}
console.log('');

// --- pagina de escucha, agrupada por tratamiento para poder comparar ---------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
writeFileSync(join(SALIDA, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Mecha — casting final</title>
<style>
  :root{--fuego:#f4501e;--crema:#f6f1ea;--tinta:#1c1917;--sec:#78716c;--linea:#e7e5e4}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 72px;background:var(--crema);color:var(--tinta);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .in{max-width:900px;margin:0 auto}
  h1{font-size:27px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--sec);margin:0 0 30px}
  .t{background:#fffdfb;border:1px solid var(--linea);border-radius:14px;padding:18px 20px;margin:0 0 18px}
  .t h2{font-size:17px;margin:0 0 2px;letter-spacing:-.01em}
  .t .q{color:var(--fuego);font-size:13.5px;font-weight:600;margin:0 0 12px}
  .t .g{background:#faf8f5;border-left:3px solid var(--linea);border-radius:8px;
        padding:11px 13px;margin:0 0 16px;font-size:14px;line-height:1.75}
  .t .g code{background:#f1efec;border-radius:4px;padding:1px 5px;font-size:12px;color:var(--fuego)}
  .fila{display:grid;grid-template-columns:120px minmax(0,1fr);gap:12px;align-items:center;margin:0 0 8px}
  .fila b{font-size:13.5px}
  .fila audio{width:100%}
  .m{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11.5px;color:var(--sec);
     grid-column:2;margin:-4px 0 6px}
  .m .mal{color:#b91c1c;font-weight:600}
  .m .bien{color:#15803d;font-weight:600}
  table{width:100%;border-collapse:collapse;margin:10px 0 0;font-size:14px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--linea)}
  th{font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--sec)}
  td.n{text-align:right;font-family:ui-monospace,monospace}
  h2.sec{font-size:20px;margin:40px 0 6px}
  @media(max-width:640px){.fila{grid-template-columns:minmax(0,1fr)}.m{grid-column:1}}
</style></head><body><div class="in">
<h1>Casting final</h1>
<p class="sub">Tres voces, seis tratamientos de etiquetas. Generado el ${new Date().toLocaleString('es-ES')}.<br/>
<b>La columna que importa es "pausa máx"</b>: es lo que hace que una voz arrastre.</p>

${tratos.map((t) => `<div class="t">
  <h2>${t.n} · ${esc(t.id)}</h2>
  <p class="q">${esc(t.pregunta)}</p>
  <div class="g">${esc(t.texto).replace(/\[([^\]]+)\]/g, '<code>[$1]</code>')}</div>
  ${voces.map((v) => {
    const r = res.find((x) => x.t.n === t.n && x.v === v);
    if (!r || !r.ok) return `<div class="fila"><b>${esc(v)}</b><span class="m mal">${esc(r ? r.error : 'sin generar')}</span></div>`;
    const clasePausa = r.pausa_max_s >= 1.6 ? 'mal' : (r.pausa_max_s <= 1.0 ? 'bien' : '');
    return `<div class="fila"><b>${esc(v)}</b><audio controls preload="none" src="${r.fichero}"></audio></div>
    <p class="m">${r.segundos} s · pausa máx <span class="${clasePausa}">${r.pausa_max_s} s</span> · nivel ${r.nivel_dB} dB · silencio ${r.silencio_pct} %${r.satura ? ' · <span class="mal">SATURA</span>' : ''}</p>`;
  }).join('')}
</div>`).join('\n')}

<h2 class="sec">Resumen</h2>
<table>
<tr><th>Voz</th><th style="text-align:right">Pausa máx media</th><th style="text-align:right">La peor</th><th style="text-align:right">Nivel medio</th><th style="text-align:right">Satura</th></tr>
${voces.map((v) => {
  const s = res.filter((r) => r.v === v && r.ok);
  if (!s.length) return '';
  const media = (k) => (s.reduce((a, r) => a + r[k], 0) / s.length).toFixed(2);
  return `<tr><td><b>${esc(v)}</b></td>
    <td class="n">${media('pausa_max_s')} s</td>
    <td class="n">${Math.max(...s.map((r) => r.pausa_max_s))} s</td>
    <td class="n">${media('nivel_dB')} dB</td>
    <td class="n">${s.filter((r) => r.satura).length} / ${s.length}</td></tr>`;
}).join('')}
</table>
<p class="sub" style="margin-top:16px">Una pausa de más de 1,6 s en una demostración se siente como que
se ha colgado. Por debajo de 1 s respira sin arrastrar. <b>El timbre lo juzgas tú.</b></p>
</div></body></html>`);

console.log(`Pagina: http://localhost:8080/tts-muestras/casting-final/\n`);
