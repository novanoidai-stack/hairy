#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Banco de pruebas de voces para la narracion de la demo.
//
// Genera la MISMA frase del recorrido guiado con varios modelos de OpenRouter,
// guarda los MP3 en web/tts-muestras/ y monta un index.html para escucharlos
// uno detras de otro. Al final imprime lo que ha costado de verdad (leido de la
// API de generacion, no estimado) y lo que costaria narrar la demo entera.
//
//   1. Mete tu clave en .env:   OPENROUTER_API_KEY=sk-or-v1-...
//   2. node scripts/tts-muestras.mjs
//   3. node scripts/serve-web.mjs  ->  http://localhost:8080/tts-muestras/
//
// Opciones:
//   --solo=gemini,fish     genera solo esos (por el id corto de la tabla)
//   --texto="..."          usa otro texto en vez del guion de la demo
//   --sin-etiquetas        no manda la variante con etiquetas de emocion
//   --seco                 NO llama a la API ni gasta: solo la tabla de costes
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SECO = process.argv.includes('--seco');

// --- clave: del entorno o del .env, nunca escrita aqui ni impresa ----------
function leerClave() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  try {
    const env = readFileSync('.env', 'utf8');
    const m = /^OPENROUTER_API_KEY\s*=\s*(.+)$/m.exec(env);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* sin .env */ }
  return null;
}

const API_KEY = leerClave();
if (!API_KEY && !SECO) {
  console.error(`
Falta OPENROUTER_API_KEY.

  1. Sacala en https://openrouter.ai/settings/keys
  2. Añade esta linea al .env de la raiz del repo:

       OPENROUTER_API_KEY=sk-or-v1-...

  El .env ya esta en .gitignore. El script la lee de ahi y no la imprime nunca.
`);
  process.exit(1);
}

// --- los candidatos --------------------------------------------------------
// `precio` = dolares por caracter, sacado de /api/v1/models?output_modalities=speech
// el 23 ago 2026. `etiquetas` = admite marcas de emocion/pausa dentro del texto.
const MODELOS = [
  {
    id: 'gemini',
    modelo: 'google/gemini-3.1-flash-tts-preview',
    voz: 'Kore',
    etiquetas: true,
    // Se cobra por TOKENS DE AUDIO, no por caracter, asi que el coste real se
    // lee de la API tras generar. Esta cifra es solo el respaldo para el modo
    // --seco: sale de la generacion de ejemplo que OpenRouter publica en la
    // pagina del modelo ($0,006896 por unos 160 caracteres de narracion).
    precio: null,
    precioEstimado: 0.006896 / 160,
    // Rechaza mp3: "Gemini TTS only supports response_format=pcm". Devuelve PCM
    // crudo de 24 kHz, 16 bits, mono; hay que ponerle cabecera WAV o el
    // navegador no sabe que hacer con el.
    formato: 'pcm',
    pcm: { hz: 24000, canales: 1, bits: 16 },
    nota: '200+ etiquetas de emocion, pausa y respiracion. 70+ idiomas.',
  },
  {
    id: 'fish',
    modelo: 'fish-audio/s2.1-pro',
    voz: null, // usa la voz por defecto del proveedor
    etiquetas: false,
    precio: 0.000015,
    nota: 'Control de estilo en lenguaje natural. Open weights.',
  },
  {
    id: 'grok',
    modelo: 'x-ai/grok-voice-tts-1.0',
    voz: 'Eve',
    etiquetas: true,
    precio: 0.000015,
    nota: 'Etiquetas de pausa, enfasis, tono y velocidad. 20+ idiomas.',
  },
  {
    id: 'mai',
    modelo: 'microsoft/mai-voice-2',
    // OJO: no acepta el catalogo de voces de Azure (`es-ES-XimenaNeural` y
    // compañia dan 502). Probadas es-ES/es-MX con Harper, Ava, Emma, Ximena,
    // Elvira e Isidora: todas 502. La unica que responde es en-US-Harper, asi
    // que la muestra en español sale con una voz declarada en ingles y se nota.
    // Si alguien encuentra la lista real de voces de MAI-Voice-2, cambiar aqui.
    voz: 'en-US-Harper:MAI-Voice-2',
    etiquetas: false,
    precio: 0.000022,
    nota: 'Azure por debajo. Sin voz española conocida: suena a acento ingles.',
  },
  {
    id: 'minimax',
    modelo: 'minimax/speech-2.8-hd',
    voz: 'Spanish_SereneWoman',
    etiquetas: false,
    precio: 0.0001,
    nota: 'El mas caro. Calidad de audiolibro.',
  },
  {
    id: 'kokoro',
    modelo: 'hexgrad/kokoro-82m',
    voz: 'ef_dora',
    etiquetas: false,
    precio: 0.00000062,
    // Kokoro lo sirven DOS proveedores a precios muy distintos: DeepInfra a
    // $0,62/M caracteres y Together a $4,00/M. Sin fijarlo, el router puede
    // mandarte al caro (pasó en una de las pasadas: salio 6,5 veces mas).
    proveedor: { order: ['DeepInfra'], allow_fallbacks: false },
    nota: 'El que ya tienes autoalojado en el VPS. Baremo de "suficiente".',
  },
];

// --- el texto: el arranque real del recorrido, no un "hola que tal" --------
const GUION_LLANO = [
  'Esto es la agenda: tu dia entero en una pantalla.',
  'Una columna por profesional y las citas en su hora. El color es el estado de cada una.',
  'Toca cualquier hueco libre y empieza una cita, con la fecha, la hora y el profesional ya puestos.',
  'Y mientras el tinte reposa, el hueco no se pierde: Mecha te lo ofrece para colar un lavado.',
].join(' ');

// La misma frase con marcas de interpretacion. Solo se manda a los modelos que
// las entienden; al resto les llegaria el corchete leido en voz alta.
const GUION_ETIQUETAS =
  '[warm] Esto es la agenda: [short pause] tu dia entero en una pantalla. ' +
  'Una columna por profesional y las citas en su hora. [calm] El color es el estado de cada una. ' +
  '[excited] Toca cualquier hueco libre y empieza una cita, [short pause] con la fecha, la hora y el profesional ya puestos. ' +
  '[whispers] Y mientras el tinte reposa, el hueco no se pierde. [warm] Mecha te lo ofrece para colar un lavado.';

// El guion COMPLETO de los tres recorridos, para la estimacion final.
function medirGuionCompleto() {
  try {
    const html = readFileSync('web/demo.html', 'utf8');
    const trozo = (campo) => {
      const re = new RegExp('\\b' + campo + ":\\s*'((?:\\\\.|[^'\\\\])*)'", 'g');
      let m, total = 0, n = 0;
      while ((m = re.exec(html))) { total += m[1].length; n++; }
      return { total, n };
    };
    const t = trozo('t'), d = trozo('d');
    return { caracteres: t.total + d.total, pasos: d.n };
  } catch {
    return { caracteres: 14163, pasos: 90 };
  }
}

// --- argumentos ------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (nombre) => {
  const a = args.find((x) => x.startsWith(`--${nombre}=`));
  return a ? a.slice(nombre.length + 3) : null;
};
const soloIds = (arg('solo') || '').split(',').filter(Boolean);
const textoLlano = arg('texto') || GUION_LLANO;
const conEtiquetas = !args.includes('--sin-etiquetas');

const SALIDA = join('web', 'tts-muestras');
mkdirSync(SALIDA, { recursive: true });

// --- PCM crudo -> WAV ------------------------------------------------------
// Gemini devuelve las muestras a pelo, sin cabecera. Son 44 bytes de RIFF por
// delante y el navegador ya sabe reproducirlo.
function envolverEnWav(pcm, { hz, canales, bits }) {
  const bytesPorMuestra = bits / 8;
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12);
  cabecera.writeUInt32LE(16, 16);             // tamaño del bloque fmt
  cabecera.writeUInt16LE(1, 20);              // 1 = PCM sin comprimir
  cabecera.writeUInt16LE(canales, 22);
  cabecera.writeUInt32LE(hz, 24);
  cabecera.writeUInt32LE(hz * canales * bytesPorMuestra, 28); // bytes por segundo
  cabecera.writeUInt16LE(canales * bytesPorMuestra, 32);      // alineacion de bloque
  cabecera.writeUInt16LE(bits, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecera, pcm]);
}

// --- llamada ---------------------------------------------------------------
async function sintetizar(m, texto, sufijo) {
  if (SECO) {
    // Modo en seco: ni una llamada, ni un centimo. Si la muestra ya esta en
    // disco de una pasada anterior, se reutiliza — asi se puede rehacer la
    // pagina (por ejemplo al añadir una seccion) sin volver a pagarla.
    for (const ext of ['mp3', 'wav']) {
      const f = `${m.id}${sufijo}.${ext}`;
      if (existsSync(join(SALIDA, f))) {
        return { ok: true, fichero: f, bytes: 0, ms: 0, coste: null, caracteres: texto.length, reusado: true };
      }
    }
    return { ok: false, error: 'modo --seco y sin muestra previa en disco', ms: 0, caracteres: texto.length };
  }
  const formato = m.formato || 'mp3';
  const cuerpo = { model: m.modelo, input: texto, response_format: formato };
  if (m.voz) cuerpo.voice = m.voz;
  if (m.proveedor) cuerpo.provider = m.proveedor;

  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.mechaa.es',
      'X-Title': 'Mecha - banco de voces',
    },
    body: JSON.stringify(cuerpo),
  });
  const ms = Date.now() - t0;

  if (!r.ok) {
    let detalle = '';
    try { detalle = JSON.stringify(await r.json()); } catch { detalle = await r.text(); }
    return { ok: false, error: `HTTP ${r.status} ${detalle.slice(0, 300)}`, ms };
  }

  let bytes = Buffer.from(await r.arrayBuffer());
  let ext = formato === 'pcm' ? 'wav' : formato;
  if (formato === 'pcm') bytes = envolverEnWav(bytes, m.pcm || { hz: 24000, canales: 1, bits: 16 });

  const fichero = `${m.id}${sufijo}.${ext}`;
  writeFileSync(join(SALIDA, fichero), bytes);

  // El coste REAL de esta generacion: OpenRouter lo publica por id, pero la
  // contabilidad va un par de segundos por detras de la respuesta. Un intento
  // corto y otro mas largo antes de rendirse y caer en la tarifa por caracter.
  const genId = r.headers.get('x-generation-id');
  let coste = null;
  if (genId) {
    for (const espera of [2500, 5000]) {
      await new Promise((res) => setTimeout(res, espera));
      try {
        const g = await fetch(`https://openrouter.ai/api/v1/generation?id=${genId}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        if (g.ok) {
          coste = (await g.json())?.data?.total_cost ?? null;
          if (coste != null) break;
        }
      } catch { /* se reintenta */ }
    }
  }

  return { ok: true, fichero, bytes: bytes.length, ms, coste, caracteres: texto.length };
}

// --- main ------------------------------------------------------------------
const completo = medirGuionCompleto();
const elegidos = soloIds.length ? MODELOS.filter((m) => soloIds.includes(m.id)) : MODELOS;
const resultados = [];

console.log(`\nGuion de muestra: ${textoLlano.length} caracteres`);
console.log(`Guion completo de la demo: ${completo.caracteres} caracteres en ${completo.pasos} pasos\n`);

for (const m of elegidos) {
  process.stdout.write(`  ${m.modelo.padEnd(38)} `);
  const llano = await sintetizar(m, textoLlano, '');
  if (!llano.ok) {
    console.log(`FALLO  ${llano.error}`);
    resultados.push({ m, llano, etiquetado: null });
    continue;
  }
  console.log(`ok  ${(llano.bytes / 1024).toFixed(0)} KB  ${llano.ms} ms  ${llano.coste != null ? '$' + llano.coste.toFixed(6) : '(coste no leido)'}`);

  let etiquetado = null;
  if (conEtiquetas && m.etiquetas) {
    process.stdout.write(`  ${'  └─ con etiquetas'.padEnd(38)} `);
    etiquetado = await sintetizar(m, GUION_ETIQUETAS, '-etiquetas');
    console.log(etiquetado.ok ? `ok  ${(etiquetado.bytes / 1024).toFixed(0)} KB` : `FALLO  ${etiquetado.error}`);
  }
  resultados.push({ m, llano, etiquetado });
}

// --- extrapolacion al guion entero -----------------------------------------
// Para los modelos que cobran por caracter es una multiplicacion. Para Gemini,
// que cobra por tokens de audio, se escala el coste medido de esta muestra.
function costeDemoEntera(r) {
  // 1) lo medido de verdad manda sobre cualquier tarifa
  if (r.llano.ok && r.llano.coste != null && r.llano.caracteres > 0) {
    return { usd: (r.llano.coste / r.llano.caracteres) * completo.caracteres, medido: true };
  }
  if (r.m.precio != null) return { usd: r.m.precio * completo.caracteres, medido: false };
  if (r.m.precioEstimado != null) return { usd: r.m.precioEstimado * completo.caracteres, medido: false };
  return null;
}

const filas = resultados.map((r) => {
  const c = costeDemoEntera(r);
  return {
    modelo: r.m.modelo,
    id: r.m.id,
    nota: r.m.nota,
    ok: r.llano.ok,
    error: r.llano.ok ? null : r.llano.error,
    ficheros: [r.llano.ok ? r.llano.fichero : null, r.etiquetado?.ok ? r.etiquetado.fichero : null].filter(Boolean),
    ms: r.llano.ms,
    costeMuestra: r.llano.coste ?? null,
    costeDemo: c ? c.usd : null,
    medido: c ? c.medido : false,
  };
});

const gastado = filas.reduce((s, f) => s + (f.costeMuestra || 0), 0);

console.log('\n--- Narrar los tres recorridos enteros (%d caracteres) ---', completo.caracteres);
for (const f of filas.sort((a, b) => (a.costeDemo ?? 9e9) - (b.costeDemo ?? 9e9))) {
  const usd = f.costeDemo == null ? '   ?    ' : ('$' + f.costeDemo.toFixed(4)).padStart(8);
  const eur = f.costeDemo == null ? '' : `  (~${(f.costeDemo * 0.92).toFixed(2)} EUR)`;
  const fuente = f.costeDemo == null ? '' : (f.medido ? ' [medido]' : ' [tarifa]');
  console.log(`  ${usd}${eur.padEnd(16)}${fuente.padEnd(10)} ${f.modelo}${f.ok ? '' : '   [no generado]'}`);
}
console.log(`\nGastado en estas muestras: $${gastado.toFixed(6)}\n`);

// --- el banco que ya existia (voces neuronales de Edge/Azure sobre guion de
//     Mecha, del proyecto del video) -------------------------------------------
// Sirve de suelo: es lo que suena una voz neuronal normal en español. Lo que
// pagas de mas en los modelos de arriba es la INTERPRETACION (pausas, emocion,
// respiracion), no la dicción.
const LINEAS_BASE = {
  linea1: 'A ver… te lo pinto. Son las once y cuarenta de un martes. Tienes las manos llenas de tinte… el teléfono sonando… y tres guasaps sin leer.',
  linea2: 'Hola. Yo soy Chispa, la inteligencia artificial de Mecha. Y mi trabajo, básicamente… es que eso no te vuelva a pasar.',
  linea7: '¿Y Booksy o Fresha? Pues sirven igual para uñas, masajes o tatuajes. No tienen ficha de color, ni fases de tinte…',
};
const VOCES_BASE = {
  Ximena: 'es-ES-XimenaNeural · España, joven y conversacional',
  Abril: 'es-ES-AbrilNeural · España, expresiva y cálida',
  Elvira: 'es-ES-ElviraNeural · España, profesional y explicativa',
  Paloma: 'es-US-PalomaNeural · neutro, dinámica',
  Dalia: 'es-MX-DaliaNeural · México, cercana',
};
function leerBanco() {
  const dir = join(SALIDA, 'base');
  if (!existsSync(dir)) return { lineas: [], eleven: null };
  const ficheros = readdirSync(dir);
  const lineas = Object.keys(LINEAS_BASE).map((k) => ({
    id: k,
    texto: LINEAS_BASE[k],
    voces: Object.keys(VOCES_BASE)
      .map((v) => ({ voz: v, desc: VOCES_BASE[v], f: `base/${k}_${v}.wav` }))
      .filter((x) => ficheros.includes(`${k}_${x.voz}.wav`)),
  })).filter((l) => l.voces.length);
  const eleven = ficheros.includes('mecha-narration-elevenlabs.mp3')
    ? 'base/mecha-narration-elevenlabs.mp3' : null;
  return { lineas, eleven };
}
const banco = leerBanco();

// --- ¿quien habla español? (lo genera scripts/tts-soporte-espanol.mjs) -----
function leerEspanol() {
  try {
    const j = JSON.parse(readFileSync(join(SALIDA, 'espanol.json'), 'utf8'));
    return { frase: j.frase, filas: (j.filas || []).filter((f) => f.ok) , fallan: (j.filas || []).filter((f) => !f.ok) };
  } catch { return null; }
}
const esp = leerEspanol();

// --- pagina para escucharlas -----------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Mecha — banco de voces</title>
<style>
  :root{--fuego:#f4501e;--crema:#f6f1ea;--tinta:#1c1917;--sec:#78716c;--linea:#e7e5e4}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 64px;background:var(--crema);color:var(--tinta);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .in{max-width:820px;margin:0 auto}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--sec);margin:0 0 28px}
  .guion{background:#fffdfb;border:1px solid var(--linea);border-left:3px solid var(--fuego);
         border-radius:10px;padding:14px 16px;margin:0 0 28px;font-size:14px}
  .m{background:#fffdfb;border:1px solid var(--linea);border-radius:12px;padding:16px 18px;margin:0 0 14px}
  .m h2{font-size:15px;margin:0 0 2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .m .nota{color:var(--sec);font-size:13px;margin:0 0 12px}
  .m .coste{float:right;font-family:ui-monospace,monospace;font-size:13px;color:var(--fuego);font-weight:600}
  audio{width:100%;margin:6px 0 2px}
  .et{font-size:12px;color:var(--sec);margin:8px 0 0}
  .fallo{color:#b91c1c;font-size:13px;font-family:ui-monospace,monospace;word-break:break-all}
  table{width:100%;border-collapse:collapse;margin:8px 0 0;font-size:14px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--linea)}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--sec)}
  td.n{text-align:right;font-family:ui-monospace,monospace}
  h2.sec{font-size:19px;margin:40px 0 4px;letter-spacing:-.01em}
  .voz{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;margin:0 0 14px}
  .voz b{font-size:13px}
  .voz span{font-size:12px;color:var(--sec)}
  a{color:var(--fuego)}
</style></head><body><div class="in">
<h1>Banco de voces para la demo</h1>
<p class="sub">Generado el ${new Date().toLocaleString('es-ES')} · ${completo.caracteres} caracteres de guion en ${completo.pasos} pasos.</p>

<h2 class="sec">1 · Los candidatos hiperrealistas</h2>
<div class="guion"><b>Texto de la muestra:</b><br/>${esc(textoLlano)}</div>

${filas.map((f) => `<div class="m">
  <span class="coste">${f.costeDemo == null ? '—' : '$' + f.costeDemo.toFixed(4) + ' la demo entera'}</span>
  <h2>${esc(f.modelo)}</h2>
  <p class="nota">${esc(f.nota)}</p>
  ${f.ok
    ? f.ficheros.map((fi, i) => `<audio controls preload="none" src="${fi}"></audio>${i === 1 ? '<p class="et">↑ con etiquetas de emocion y pausa</p>' : ''}`).join('')
    : `<p class="fallo">No generado: ${esc(f.error)}</p>
       <p class="et">Playground para oirlo sin montar nada:
         <a href="https://openrouter.ai/${esc(f.modelo)}" target="_blank" rel="noopener">openrouter.ai/${esc(f.modelo)}</a></p>`}
</div>`).join('\n')}

${banco.lineas.length ? `
<h2 class="sec">2 · El suelo: voz neuronal normal</h2>
<p class="sub">Cinco voces de Edge/Azure sobre guion real de Mecha, ya grabadas para el video.
Sirven de referencia: la dicción de estas ya es buena. Lo que se paga de más arriba es la
<b>interpretación</b> (pausas, emoción, respiración), no el acento.</p>
${banco.lineas.map((l) => `<div class="m">
  <p class="nota" style="margin-bottom:14px">${esc(l.texto)}</p>
  ${l.voces.map((v) => `<div class="voz">
    <b>${esc(v.voz)}</b><span>${esc(v.desc)}</span>
    <audio controls preload="none" src="${v.f}"></audio>
  </div>`).join('')}
</div>`).join('\n')}` : ''}

${banco.eleven ? `<div class="m">
  <h2>ElevenLabs — narración larga de Mecha</h2>
  <p class="nota">La que ya se grabó para el vídeo. Es el listón de "voz de pago".</p>
  <audio controls preload="none" src="${banco.eleven}"></audio>
</div>` : ''}

${esp ? `
<h2 class="sec">3 · ¿Quién habla español?</h2>
<p class="sub">La misma frase con eñe, acentos y una cifra, mandada a los ${esp.filas.length + esp.fallan.length}
modelos de voz del catálogo. <b>Aceptar la petición no es hablar español</b>: un modelo de inglés
lee "señora Núñez" con fonética inglesa tan campante. Escúchalos y juzga tú el acento.</p>
<div class="guion">${esc(esp.frase)}</div>
${esp.filas.map((f) => `<div class="m">
  <h2>${esc(f.id)}</h2>
  <p class="nota">voz: ${esc(f.voz)}</p>
  <audio controls preload="none" src="${esc(f.fichero)}"></audio>
</div>`).join('\n')}
${esp.fallan.length ? `<div class="m">
  <h2>No devolvieron audio</h2>
  ${esp.fallan.map((f) => `<p class="et"><b>${esc(f.id)}</b> — ${esc(f.motivo)}</p>`).join('')}
  <p class="et">En varios casos es que no doy con el identificador de voz correcto,
  no que el modelo no sepa español.</p>
</div>` : ''}` : ''}

<h2 class="sec">4 · Coste de narrar los tres recorridos</h2>
<table><tr><th>Modelo</th><th style="text-align:right">USD</th><th style="text-align:right">EUR aprox.</th></tr>
${filas.slice().sort((a, b) => (a.costeDemo ?? 9e9) - (b.costeDemo ?? 9e9)).map((f) => `<tr>
  <td>${esc(f.modelo)}</td>
  <td class="n">${f.costeDemo == null ? '?' : '$' + f.costeDemo.toFixed(4)}</td>
  <td class="n">${f.costeDemo == null ? '?' : (f.costeDemo * 0.92).toFixed(2) + ' €'}</td>
</tr>`).join('')}
</table>
<p class="sub" style="margin-top:14px">Es un coste de UNA VEZ: el guion es fijo, se renderiza a MP3 y se sirve estatico.
Solo se vuelve a pagar si se reescribe el guion.</p>
</div></body></html>`;

writeFileSync(join(SALIDA, 'index.html'), html);
console.log(`Pagina de escucha: ${join(SALIDA, 'index.html')}`);
console.log('   node scripts/serve-web.mjs  ->  http://localhost:8080/tts-muestras/\n');
