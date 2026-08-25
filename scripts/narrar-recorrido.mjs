#!/usr/bin/env node
// ---------------------------------------------------------------------------
// NARRAR UN RECORRIDO DE LA DEMO
//
// Lee guion/<recorrido>.json, genera un MP3 por paso con Gemini TTS (via
// OpenRouter), lo normaliza y deja el manifiesto en web/narracion/<recorrido>/.
//
// De donde sale cada decision (todo medido en las dos rondas de casting, no
// sacado de la documentacion del proveedor):
//   - Voz Gacrux: la unica de las tres finalistas que ni satura ni arrastra.
//   - El prompt de direccion va DELANTE de cada paso, identico en los 33: asi
//     la voz no deriva de un paso a otro. Se interpreta, no se lee (medido:
//     1.412 caracteres de notas anaden 1,3 s de audio, no 90).
//   - PROHIBIDO [long pause]: dispara la pausa a 2,8 s y suena a reproductor
//     colgado. Las pausas largas se piden desde el bloque Pacing.
//   - Un fichero por paso: la calidad del modelo deriva pasados unos minutos,
//     y ademas hay que poder saltar de paso sin descargar 2,6 MB.
//
// Uso:
//   node scripts/narrar-recorrido.mjs                  # solo lo que ha cambiado
//   node scripts/narrar-recorrido.mjs --pasos=15,16    # solo esos pasos
//   node scripts/narrar-recorrido.mjs --forzar         # regenera todo
//   node scripts/narrar-recorrido.mjs --remezclar      # re-normaliza sin llamar a la API
//   node scripts/narrar-recorrido.mjs --seco           # valida el guion y sale
//
// Idempotencia: el manifiesto guarda el hash del texto + voz + modelo + prompt
// de cada paso. Cambiar una frase cuesta 0,007 $, no el recorrido entero.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

// --- clave: del entorno o del .env, y NUNCA se imprime ----------------------
function leerClave() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY.trim();
  try {
    const m = /^OPENROUTER_API_KEY\s*=\s*(.+)$/m.exec(readFileSync('.env', 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* sin .env */ }
  return null;
}

const MODELO = 'google/gemini-3.1-flash-tts-preview';
// Tope de gasto propio. La clave tiene 2 $ de limite; el recorrido entero
// estimado son 0,22 $. Si algo se desboca, para antes de comerse la clave.
const TOPE_USD = 1.20;
const USD_POR_SEGUNDO = 0.0005;   // ~25 tokens de audio/s a 20 $/M (medido)

// --- el prompt de direccion (identico en los 33 pasos) ----------------------
// Si esto cambia, cambia el hash de TODOS los pasos y se regenera el recorrido
// entero. Es a proposito: la voz tiene que sonar igual de principio a fin.
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
Pacing: Ágil dentro de la calma. Deja respirar después de cada idea, y sobre
todo ANTES del dato. Las pausas son BREVES: medio segundo, nunca dos. Un
silencio largo mata el ritmo de una demostración. Encadena las frases sin dejar
aire muerto entre ellas.
Accent: Castellano de España, de Madrid. Vocales limpias, "c" y "z" distinguidas
de la "s". Nada de seseo ni de entonación latinoamericana.
Breathing: Respiración audible pero suave antes de las frases largas.
Articulation: Los números y los nombres de pantalla, claros y separados.

### SAMPLE CONTEXT
Marta está en el minuto tres de una demostración de veinte. Ya ha roto el hielo;
ahora va soltándolo todo con la tranquilidad de quien se lo sabe de memoria.

#### TRANSCRIPT
`;

// --- umbrales de la verificacion automatica (§11 del plan) ------------------
const LIMITES = {
  // La sonoridad se comprueba sobre el MP3 YA NORMALIZADO, no sobre el WAV
  // crudo: el RMS del crudo solo dice como venia de fabrica, y normalizar es
  // justo lo que arregla eso. Medirlo antes daba avisos de pasos que salian
  // perfectos (16 y 22: -22 dB crudos, -16,5 LUFS ya mezclados).
  lufs: [-17.5, -14.5],       // que la normalizacion haya aterrizado en -16
  silencio_pct: [26, 48],     // las pausas estan, pero no se ha quedado parada
  pausa_max_s: 1.6,           // por encima de esto se siente como colgado
  s_por_caracter: 0.12,       // por encima: se ha leido las notas de direccion
  pico_dbtp: -1.0,            // margen de pico en el MP3 ya codificado
  // Muestras a fondo de escala en el crudo. Gemini entrega pegado a 0 dBFS y
  // SIEMPRE hay unas pocas: 30 muestras de 384.000 son 0,008 % y duran 1 ms.
  // Lo que importa no es que las haya, es que sean bastantes como para oirse.
  tope_pct: 0.05,
};
// Techo de pico del limitador, ANTES de codificar. MEDIDO: pasar a MP3 mono
// 48 kbps levanta el pico real ~1,4 dB (el codificador reconstruye la onda con
// menos detalle y se pasa de largo). Con el techo en -1 dBFS los MP3 salian a
// +0,5 dBTP, o sea recortando al reproducir. Con -2,5 aterrizan sobre -2 y
// queda el margen de 1 dB que pide el plan.
const TECHO_DBFS = -3.5;
const TECHO_LIN = Math.pow(10, TECHO_DBFS / 20).toFixed(4);   // alimiter lo quiere lineal
// Donde queremos que acabe el pico real del MP3. Deja 1,5 dB de aire sobre 0.
const PICO_OBJETIVO = -1.5;

// --- argumentos -------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (n) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const flag = (n) => args.includes(`--${n}`);
const RECORRIDO = arg('recorrido') || 'pilares';
const SOLO = (arg('pasos') || '').split(',').filter(Boolean).map(Number);
const FORZAR = flag('forzar');
const REMEZCLAR = flag('remezclar');   // re-normaliza desde el WAV, sin gastar
const SECO = flag('seco');             // solo valida el guion

// --- rutas ------------------------------------------------------------------
const GUION = join('guion', `${RECORRIDO}.json`);
const SALIDA = join('web', 'narracion', RECORRIDO);
const CRUDO = join('web', 'narracion', '_wav', RECORRIDO);   // intermedios, no se versionan
const MANIFIESTO = join(SALIDA, 'manifiesto.json');

// --- señales visuales -------------------------------------------------------
// En el guion se marcan con {senal:tipo@ancla} DENTRO de la frase, en el punto
// exacto en que la voz dice aquello:
//
//   "[curious] Fíjate en el aviso de arriba. {senal:flecha@arriba} [short pause] …"
//
// La marca NO se manda al TTS (se quita antes) y NO entra en el hash: mover una
// señal no puede obligar a regenerar —y repagar— un audio que ya estaba bien.
const SENAL_TIPOS = ['flecha', 'ping', 'subrayado', 'chincheta'];
const SENAL_ANCLAS = ['arriba', 'abajo', 'izq', 'der', 'centro'];
// Quita las marcas sin tocar nada mas. Deliberadamente NO normaliza espacios:
// para un texto sin marcas tiene que devolver EXACTAMENTE el mismo string, o
// cambiaria el hash de los 90 pasos ya generados.
const sinMarcas = (t) => t.replace(/[ \t]*\{senal:[^}]*\}/g, '');

// --- utilidades -------------------------------------------------------------
const pelar = (t) => sinMarcas(t).replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
const dosDig = (n) => (n < 10 ? '0' : '') + n;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

// Misma medida que el casting: lo que importa es la PAUSA MAS LARGA en segundos,
// que es lo que hace que una voz arrastre. El porcentaje de silencio no
// distingue entre "respira bien" y "se ha quedado parada".
function medir(wav) {
  const hz = wav.readUInt32LE(24);
  const d = wav.subarray(44);
  const n = Math.floor(d.length / 2);
  const ventana = Math.floor(hz * 0.02);      // 20 ms
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
    segundos: +(n / hz).toFixed(2),
    nivel_dB: +(20 * Math.log10(Math.sqrt(suma / n))).toFixed(1),
    silencio_pct: +((silTotal / ventanas) * 100).toFixed(1),
    pausa_max_s: +((silMax * ventana) / hz).toFixed(2),
    satura: rachaMax >= 5,
    a_tope: tope,
  };
}

// Silencios REALES del audio: donde la voz calla al menos `minMs`. Es la lista
// contra la que se ajustan las señales, y sale del mismo barrido de ventanas de
// 20 ms que usa `medir`.
function silencios(wav, minMs = 180) {
  const hz = wav.readUInt32LE(24);
  const d = wav.subarray(44);
  const n = Math.floor(d.length / 2);
  const ventana = Math.floor(hz * 0.02);
  const UMBRAL = 0.004;
  const fuera = [];
  let acc = 0, cuenta = 0, desde = -1, k = 0;
  for (let i = 0; i < n; i++) {
    const v = d.readInt16LE(i * 2) / 32768;
    acc += v * v; cuenta++;
    if (cuenta === ventana) {
      const callado = Math.sqrt(acc / cuenta) < UMBRAL;
      if (callado && desde < 0) desde = k;
      if (!callado && desde >= 0) {
        const ms = (k - desde) * 20;
        if (ms >= minMs) fuera.push({ inicio: +(desde * 0.02).toFixed(3), ms });
        desde = -1;
      }
      acc = 0; cuenta = 0; k++;
    }
  }
  return fuera;
}

// Coloca cada marca del paso en su segundo.
//
// Base: proporcion de caracteres HABLADOS hasta la marca. El ritmo de Gacrux es
// muy estable (mediana medida 0,084 s por caracter), asi que la estimacion cae
// cerca. Pero cerca no basta: lo que delata a una señal es aparecer a mitad de
// una palabra. Por eso despues se ENGANCHA al silencio real mas proximo — las
// marcas se escriben al final de la frase que las nombra, o sea justo donde la
// voz respira. Si no hay ningun silencio a menos de 1,2 s, se queda la
// estimacion: mejor un poco desplazada que enganchada a un silencio ajeno.
function situarSenales(texto, wav, duracion) {
  const marcas = [];
  const re = /\{senal:([a-z]+)@([a-z0-9]+)\}/g;
  const problemas = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    const [entera, tipo, ancla] = m;
    if (!SENAL_TIPOS.includes(tipo)) { problemas.push(`tipo de señal desconocido: ${tipo}`); continue; }
    const anclaOk = SENAL_ANCLAS.includes(ancla) || (tipo === 'chincheta' && /^[1-9]$/.test(ancla));
    if (!anclaOk) { problemas.push(`ancla no válida para ${tipo}: ${ancla}`); continue; }
    // Caracteres hablados que hay ANTES de la marca.
    const antes = pelar(texto.slice(0, m.index)).length;
    marcas.push({ tipo, ancla, antes, entera });
  }
  if (!marcas.length) return { senales: [], problemas };

  const total = pelar(texto).length || 1;
  const huecos = wav ? silencios(wav) : [];
  const senales = marcas.map((mk) => {
    const estimado = (mk.antes / total) * duracion;
    let t = estimado, enganchada = false;
    let mejor = null, dist = 1.2;
    for (const h of huecos) {
      const d = Math.abs(h.inicio - estimado);
      if (d < dist) { dist = d; mejor = h; }
    }
    if (mejor) { t = mejor.inicio; enganchada = true; }
    // Nunca en el primer cuarto de segundo ni pisando el final.
    t = Math.max(0.25, Math.min(t, duracion - 0.4));
    return { t: +t.toFixed(2), tipo: mk.tipo, ancla: mk.ancla, estimado: +estimado.toFixed(2), enganchada };
  });
  return { senales, problemas };
}

// --- ffmpeg -----------------------------------------------------------------
// ffmpeg escribe TODO por stderr, incluido el JSON de loudnorm; salga con 0 o no.
function ffmpegStderr(argv) {
  try {
    execFileSync('ffmpeg', argv, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    return '';
  } catch (e) {
    return e.stderr || '';
  }
}
// La pasada de medida sale con codigo 0, asi que execFileSync no lanza y el
// stderr no aparece por ningun catch: hay que leerlo con spawnSync.
function medirLoudnorm(fichero) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', fichero,
    '-af', `loudnorm=I=-16:TP=${TECHO_DBFS}:LRA=11:print_format=json`, '-f', 'null', '-'],
    { encoding: 'utf8' });
  const s = (r.stderr || '') + (r.stdout || '');
  // El JSON no es lo ultimo que imprime ffmpeg: detras vienen las lineas de
  // "muxing overhead" y el resumen. Hay que cortar por la llave de cierre.
  const i = s.lastIndexOf('{');
  if (i < 0) return null;
  const j = s.indexOf('}', i);
  if (j < 0) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}
// Los WAV de Gemini salen pegados a 0 dBFS: sin margen de pico ninguno.
//
// El modo `linear` de loudnorm NO sirve aqui, y falla en silencio: si la
// ganancia que hace falta para llegar a -16 LUFS haria que el pico rebasara el
// techo, ffmpeg se cae a modo dinamico y aterriza donde le parece. Medido: el
// paso 23 salia a -18,3 LUFS y el 11 a -0,8 dBTP sin decir ni pio.
//
// Asi que la ganancia se aplica a mano (`volume`) y el techo lo sujeta un
// limitador de verdad (`alimiter`), que es la herramienta para esto. Como el
// limitador se come unas decimas de sonoridad en los pasos con mas pico, se
// mide la salida y se corrige la ganancia hasta caer dentro de +-0,4 LU.
// El bucle persigue DOS cosas y no tienen el mismo rango: el pico manda sobre
// la sonoridad. Un MP3 que recorta es un defecto que se oye; medio LU por
// debajo del objetivo no lo nota nadie. Y hay que ir con cuidado al subir
// ganancia contra el limitador: cuanto mas se le mete, mas mesetas planas deja,
// y las mesetas son justo lo que el MP3 a 48 kbps reconstruye por encima (asi
// es como los pasos 2, 4 y 19 acabaron a -0,2 dBTP con el techo en -2,5).
function normalizarAMp3(wavIn, mp3Out) {
  const medido = medirLoudnorm(wavIn);
  let ganancia = medido ? -16 - Number(medido.input_i) : 0;
  let techoDb = TECHO_DBFS;
  let fin = null;
  // DOS mandos independientes, y cada cosa con el suyo:
  //   ganancia -> sonoridad     techo del limitador -> pico
  // La version anterior corregia el pico BAJANDO la ganancia, y eso hace dos
  // cosas malas a la vez: el bucle oscila (el pico baja, la sonoridad sube, y a
  // las cinco vueltas aterriza donde le pilla) y el paso acaba varios dB por
  // debajo de sus vecinos. Un salto de volumen entre pasos se oye muchisimo mas
  // que un pico a -0,7. Asi salieron el 29 de advanced y el 17 de config.
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const lim = Math.pow(10, techoDb / 20).toFixed(4);
    ffmpegStderr(['-y', '-hide_banner', '-nostats', '-i', wavIn,
      '-af', `volume=${ganancia.toFixed(2)}dB,alimiter=limit=${lim}:level=disabled:attack=5:release=50`,
      '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', mp3Out]);
    fin = medirLoudnorm(mp3Out);
    if (!fin) break;
    const exceso = Number(fin.input_tp) - PICO_OBJETIVO;
    // Se aprieta el limitador, no se baja el volumen. El suelo de -9 dBFS existe
    // para que un fichero raro no acabe aplastado.
    if (exceso > 0 && techoDb > -9) { techoDb -= exceso + 0.3; continue; }
    const dif = -16 - Number(fin.input_i);
    if (Math.abs(dif) <= 0.4) break;
    const antes = ganancia;
    ganancia += Math.max(-1.5, Math.min(1.2, dif));
    if (Math.abs(ganancia - antes) < 0.05) break;
  }
  return {
    lufs: fin ? +Number(fin.input_i).toFixed(1) : null,
    pico_dbtp: fin ? +Number(fin.input_tp).toFixed(1) : null,
    ganancia_db: +ganancia.toFixed(2),
    techo_db: +techoDb.toFixed(1),
  };
}

// --- generacion -------------------------------------------------------------
// `caracteres` es el largo del texto HABLADO (sin etiquetas). Sirve para cazar
// en el sitio la toma en la que el modelo se repite: el ritmo normal son 0,085
// s por caracter y esas tomas salen a 0,25 — tres veces mas largas. Pasaba en
// 3 de 33 y no hay forma de saberlo sin escuchar, asi que se comprueba aqui y
// se vuelve a pedir. Una regeneracion cuesta 0,007 $.
// 0,125 s por caracter es ~50% por encima de la mediana medida (0,085) y queda
// holgadamente por encima del paso mas lento que ha salido bien nunca (0,104).
// Estaba en 0,16 y por ahi se colo el paso 35 de advanced: 19,4 s para lo que
// son 12, o sea una frase repetida que nadie oyo hasta escucharla.
const RITMO_MAX = 0.125;
async function generar(texto, voz, apiKey, caracteres) {
  const input = DIRECCION + texto;
  let ultimoLargo = null;
  for (let intento = 1; intento <= 3; intento++) {
    let r;
    try {
      r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO, input, voice: voz, response_format: 'pcm' }),
      });
    } catch (e) {
      if (intento === 3) return { ok: false, error: `red: ${e.message}` };
      await new Promise((s) => setTimeout(s, 1500 * intento));
      continue;
    }
    if (r.ok) {
      const id = r.headers.get('x-generation-id');
      const pcm = Buffer.from(await r.arrayBuffer());
      if (pcm.length < 4000) {   // menos de 0,08 s: no es audio, es un error mudo
        if (intento === 3) return { ok: false, error: `respuesta vacia (${pcm.length} bytes)` };
        await new Promise((s) => setTimeout(s, 1500 * intento));
        continue;
      }
      const seg = pcm.length / 2 / 24000;
      const ritmo = caracteres ? seg / caracteres : 0;
      if (ritmo > RITMO_MAX && intento < 3) {
        // Se ha ido de largo: casi seguro que ha repetido una frase. Otra toma.
        ultimoLargo = { seg: +seg.toFixed(1), ritmo: +ritmo.toFixed(3) };
        process.stdout.write(`[${seg.toFixed(0)}s: se repite, otra toma] `);
        await new Promise((s) => setTimeout(s, 800));
        continue;
      }
      return { ok: true, wav: envolverEnWav(pcm), id, intentos: intento, largo: ultimoLargo };
    }
    let m = '';
    try { m = (await r.json())?.error?.message || ''; } catch { try { m = await r.text(); } catch { m = ''; } }
    // 402 = sin credito. Reintentar no arregla nada y quema tiempo.
    if (r.status === 402) return { ok: false, error: `HTTP 402 sin credito: ${String(m).slice(0, 120)}`, fatal: true };
    if (intento === 3) return { ok: false, error: `HTTP ${r.status} ${String(m).slice(0, 120)}` };
    await new Promise((s) => setTimeout(s, 1500 * intento));
  }
}

// El coste real sale del contador de la clave, no de preguntar generacion a
// generacion: /api/v1/generation tarda en tener el dato (y son 33 esperas),
// mientras que la diferencia de `usage` antes/despues es exacta y es UNA
// peticion. De paso avisa de cuanto credito queda.
async function usoDeLaClave(apiKey) {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) return null;
    const d = (await r.json())?.data;
    return d ? { usado: d.usage, queda: d.limit_remaining } : null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// 1. Leer y VALIDAR el guion. Un guion malo no se paga: se para antes.
// ---------------------------------------------------------------------------
if (!existsSync(GUION)) { console.error(`No existe ${GUION}`); process.exit(1); }
const guion = JSON.parse(readFileSync(GUION, 'utf8'));
const VOZ = guion.voz || 'Gacrux';

const problemas = [];
let marcasTotales = 0;
for (const p of guion.pasos) {
  if (/\[long pause\]/i.test(p.texto)) problemas.push(`paso ${p.n}: lleva [long pause] (prohibido: dispara la pausa a 2,8 s)`);
  if (/\*\*|__/.test(p.texto)) problemas.push(`paso ${p.n}: lleva markdown (el modelo lo lee como "asterisco")`);
  if (!pelar(p.texto)) problemas.push(`paso ${p.n}: se queda sin texto al quitar las etiquetas`);
  // Señales: se validan ANTES de gastar un centimo. Una llave sin cerrar o un
  // tipo mal escrito se colaria al TTS y acabaria dicho en voz alta.
  const sueltas = p.texto.match(/\{(?!senal:)[^}]*\}/g);
  if (sueltas) problemas.push(`paso ${p.n}: llave que no es una señal: ${sueltas.join(' ')}`);
  if ((p.texto.match(/\{/g) || []).length !== (p.texto.match(/\}/g) || []).length) {
    problemas.push(`paso ${p.n}: llaves sin cerrar`);
  }
  const marcas = p.texto.match(/\{senal:[^}]*\}/g) || [];
  marcasTotales += marcas.length;
  if (marcas.length > 2) problemas.push(`paso ${p.n}: ${marcas.length} señales (el maximo son 2: mas de eso ensucia)`);
  for (const mk of marcas) {
    const m2 = /^\{senal:([a-z]+)@([a-z0-9]+)\}$/.exec(mk);
    if (!m2) { problemas.push(`paso ${p.n}: señal mal escrita ${mk} — formato {senal:tipo@ancla}`); continue; }
    if (!SENAL_TIPOS.includes(m2[1])) problemas.push(`paso ${p.n}: tipo desconocido "${m2[1]}" (validos: ${SENAL_TIPOS.join(', ')})`);
    else if (!(SENAL_ANCLAS.includes(m2[2]) || (m2[1] === 'chincheta' && /^[1-9]$/.test(m2[2])))) {
      problemas.push(`paso ${p.n}: ancla no valida "${m2[2]}" para ${m2[1]}`);
    }
  }
}
const ns = guion.pasos.map((p) => p.n);
if (new Set(ns).size !== ns.length) problemas.push('hay numeros de paso repetidos');

const hablados = guion.pasos.reduce((s, p) => s + pelar(p.texto).length, 0);
console.log(`\nNarrar "${guion.nombre || RECORRIDO}"  ·  ${guion.pasos.length} pasos  ·  voz ${VOZ}  ·  ${MODELO}`);
console.log(`Caracteres hablados: ${hablados}  ·  estimado ${(hablados * 0.088 / 60).toFixed(1)} min  ·  ~$${(hablados * 0.088 * USD_POR_SEGUNDO).toFixed(3)}\n`);

if (problemas.length) {
  console.error('El guion no pasa la validacion:');
  problemas.forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log(`Guion validado: 0 [long pause], 0 markdown, numeracion correcta` +
  `${marcasTotales ? `, ${marcasTotales} señales bien escritas` : ''}.\n`);
if (SECO) process.exit(0);

const API_KEY = REMEZCLAR ? 'no-hace-falta' : leerClave();
if (!API_KEY) { console.error('Falta OPENROUTER_API_KEY (entorno o .env)'); process.exit(1); }

mkdirSync(SALIDA, { recursive: true });
mkdirSync(CRUDO, { recursive: true });

// ---------------------------------------------------------------------------
// 2. Manifiesto anterior: lo que ya esta hecho y sigue valiendo
// ---------------------------------------------------------------------------
let previo = { pasos: [] };
if (existsSync(MANIFIESTO)) { try { previo = JSON.parse(readFileSync(MANIFIESTO, 'utf8')); } catch { /* se rehace */ } }
const previoDe = (n) => (previo.pasos || []).find((p) => p.n === n) || null;

// El hash va sobre el texto SIN marcas de señal: lo que cambia el audio son el
// modelo, la voz, la direccion y lo que se dice. Mover una flecha no.
const hashDe = (texto) => createHash('sha256')
  .update(`${MODELO}\n${VOZ}\n${DIRECCION}\n${sinMarcas(texto)}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// 3. Generar
// ---------------------------------------------------------------------------
const resultados = [];
let gastoEstimado = 0, reintentos = 0, generados = 0, reusados = 0;
let abortado = null;
const usoAntes = REMEZCLAR ? null : await usoDeLaClave(API_KEY);
if (usoAntes) console.log(`Credito de la clave: $${usoAntes.usado.toFixed(4)} usados, $${Number(usoAntes.queda).toFixed(4)} disponibles.\n`);

for (const paso of guion.pasos) {
  const n = paso.n;
  if (SOLO.length && !SOLO.includes(n)) {
    const p = previoDe(n);
    if (p) { resultados.push({ ...p, reusado: true }); reusados++; }
    continue;
  }
  const hash = hashDe(paso.texto);
  const nombreMp3 = `${dosDig(n)}.mp3`;
  const rutaMp3 = join(SALIDA, nombreMp3);
  const rutaWav = join(CRUDO, `${dosDig(n)}.wav`);
  const anterior = previoDe(n);

  // Reutilizar: mismo hash, MP3 en su sitio y no nos han pedido rehacerlo.
  if (!FORZAR && !REMEZCLAR && anterior && anterior.hash === hash && existsSync(rutaMp3)) {
    resultados.push({ ...anterior, reusado: true });
    reusados++;
    process.stdout.write(`  ${dosDig(n)}  =  sin cambios (${anterior.segundos}s)\n`);
    continue;
  }

  const hablado = pelar(paso.texto);
  process.stdout.write(`  ${dosDig(n)}  ${String(hablado.length).padStart(3)} car  `);

  let wav;
  if (REMEZCLAR) {
    if (!existsSync(rutaWav)) { console.log('SIN WAV: nada que remezclar'); continue; }
    wav = readFileSync(rutaWav);
  } else {
    // Al TTS va el texto SIN las marcas de señal: son notas de puesta en escena,
    // no algo que decir. Si se colaran, las leeria en voz alta.
    const r = await generar(sinMarcas(paso.texto), VOZ, API_KEY, hablado.length);
    if (!r.ok) {
      console.log(`FALLO ${r.error}`);
      resultados.push({ n, acto: paso.acto, error: r.error });
      if (r.fatal) { abortado = r.error; break; }
      continue;
    }
    reintentos += r.intentos - 1;
    wav = r.wav;
    writeFileSync(rutaWav, wav);
    generados++;
  }

  const m = medir(wav);
  gastoEstimado += m.segundos * USD_POR_SEGUNDO;

  const norm = normalizarAMp3(rutaWav, rutaMp3);
  const bytes = statSync(rutaMp3).size;
  const sPorCar = +(m.segundos / hablado.length).toFixed(4);

  // Los avisos NO paran la tanda: se apuntan y salen juntos al final, para
  // poder decidir con la foto completa si se regenera algo.
  const avisos = [];
  const topePct = +((m.a_tope / (m.segundos * 24000)) * 100).toFixed(4);
  if (norm.lufs == null || norm.lufs < LIMITES.lufs[0] || norm.lufs > LIMITES.lufs[1]) avisos.push(`sonoridad ${norm.lufs} LUFS`);
  if (topePct > LIMITES.tope_pct) avisos.push(`satura (${topePct}% a tope)`);
  if (m.silencio_pct < LIMITES.silencio_pct[0] || m.silencio_pct > LIMITES.silencio_pct[1]) avisos.push(`silencio ${m.silencio_pct}%`);
  if (m.pausa_max_s >= LIMITES.pausa_max_s) avisos.push(`pausa ${m.pausa_max_s}s`);
  if (sPorCar > LIMITES.s_por_caracter) avisos.push(`${sPorCar}s/car: puede haber leido las notas`);
  if (norm.pico_dbtp != null && norm.pico_dbtp > LIMITES.pico_dbtp) avisos.push(`pico ${norm.pico_dbtp} dBTP`);

  console.log(`${String(m.segundos).padStart(5)}s  pausa ${String(m.pausa_max_s).padStart(4)}s  ` +
    `${String(norm.lufs).padStart(5)} LUFS  pico ${String(norm.pico_dbtp).padStart(5)} dBTP  ` +
    `${String(Math.round(bytes / 1024)).padStart(3)} KB${avisos.length ? '   AVISO: ' + avisos.join(', ') : ''}`);

  // Las señales se situan contra el WAV de ESTE paso, asi que se calculan aqui.
  // Como no cuestan API, se recalculan tambien en cada --remezclar: mover una
  // marca de sitio en el guion sale gratis.
  const sen = situarSenales(paso.texto, wav, m.segundos);
  if (sen.problemas.length) avisos.push(...sen.problemas.map((p) => 'señal: ' + p));

  resultados.push({
    n, acto: paso.acto, tono: paso.tono, hash, fichero: nombreMp3, bytes,
    caracteres: hablado.length, s_por_caracter: sPorCar,
    ...m, tope_pct: topePct, lufs: norm.lufs, pico_dbtp: norm.pico_dbtp,
    senales: sen.senales, avisos,
  });

  if (gastoEstimado > TOPE_USD) {
    abortado = `tope de gasto propio alcanzado (~$${gastoEstimado.toFixed(3)} > $${TOPE_USD})`;
    console.log(`\n  PARADO: ${abortado}`);
    break;
  }
}

// ---------------------------------------------------------------------------
// 4. Coste real y manifiesto
// ---------------------------------------------------------------------------
let gastoReal = null, quedaCredito = null;
if (generados && usoAntes) {
  process.stdout.write('\nLeyendo el contador de la clave... ');
  await new Promise((s) => setTimeout(s, 4000));   // la contabilidad va detras
  const usoDespues = await usoDeLaClave(API_KEY);
  if (usoDespues) {
    gastoReal = +(usoDespues.usado - usoAntes.usado).toFixed(6);
    quedaCredito = Number(usoDespues.queda);
    console.log(`$${gastoReal} en esta tanda, quedan $${quedaCredito.toFixed(4)}`);
  } else console.log('no disponible');
}

resultados.sort((a, b) => a.n - b.n);
const buenos = resultados.filter((r) => !r.error);
const fallos = resultados.filter((r) => r.error);
const totalSeg = buenos.reduce((s, r) => s + (r.segundos || 0), 0);
const totalBytes = buenos.reduce((s, r) => s + (r.bytes || 0), 0);
const conAviso = buenos.filter((r) => (r.avisos || []).length);

writeFileSync(MANIFIESTO, JSON.stringify({
  recorrido: RECORRIDO,
  nombre: guion.nombre || RECORRIDO,
  voz: VOZ,
  modelo: MODELO,
  generado: new Date().toISOString(),
  pasos_total: guion.pasos.length,
  duracion_s: +totalSeg.toFixed(1),
  bytes_total: totalBytes,
  pasos: resultados.map(({ reusado, ...r }) => r),
}, null, 2) + '\n');

// --- senales.json: lo unico que la demo necesita en tiempo de ejecucion ------
// Aparte del manifiesto a proposito. El manifiesto es contabilidad de la
// generacion (hashes, LUFS, bytes) y no tiene por que viajar al navegador; esto
// son dos kilobytes con lo justo: por cada paso, en que segundo sale que cosa.
// Si un recorrido no tiene ninguna marca, el fichero se escribe igual con la
// lista vacia — asi la demo puede pedirlo siempre sin comprobar si existe.
const senalesPorPaso = {};
let totalSenales = 0, enganchadas = 0;
for (const r of resultados) {
  if (!r.senales || !r.senales.length) continue;
  senalesPorPaso[r.n] = r.senales.map(({ t, tipo, ancla }) => ({ t, tipo, ancla }));
  totalSenales += r.senales.length;
  enganchadas += r.senales.filter((s) => s.enganchada).length;
}
writeFileSync(join(SALIDA, 'senales.json'), JSON.stringify({
  recorrido: RECORRIDO,
  generado: new Date().toISOString(),
  pasos: senalesPorPaso,
}, null, 1) + '\n');

// ---------------------------------------------------------------------------
// 5. Resumen y pagina de escucha
// ---------------------------------------------------------------------------
console.log(`\n${'-'.repeat(78)}`);
console.log(`Pasos con audio: ${buenos.length}/${guion.pasos.length}   (nuevos ${generados} · reusados ${reusados}${fallos.length ? ` · fallidos ${fallos.length}` : ''})`);
console.log(`Duracion total:  ${Math.floor(totalSeg / 60)} min ${Math.round(totalSeg % 60)} s   ·   ${(totalBytes / 1048576).toFixed(2)} MB   ·   ${Math.round(totalBytes / Math.max(1, buenos.length) / 1024)} KB por paso`);
console.log(`Gasto:           ${gastoReal != null ? `$${gastoReal} real (quedan $${quedaCredito.toFixed(4)})` : `~$${gastoEstimado.toFixed(3)} estimado`}   ·   reintentos por 500: ${reintentos}`);
if (fallos.length) { console.log('\nFALLARON:'); fallos.forEach((f) => console.log(`  paso ${f.n}: ${f.error}`)); }
if (totalSenales) {
  console.log(`Señales:         ${totalSenales} en ${Object.keys(senalesPorPaso).length} pasos   ·   ${enganchadas} enganchadas a un silencio real, ${totalSenales - enganchadas} por estimación`);
}
if (conAviso.length) {
  console.log(`\nAVISOS (${conAviso.length}) — regenera con --pasos=${conAviso.map((r) => r.n).join(',')} si suenan mal:`);
  conAviso.forEach((r) => console.log(`  paso ${r.n}: ${r.avisos.join(', ')}`));
} else if (buenos.length) {
  console.log('\nTodas las medidas dentro de umbral: nivel, saturacion, silencio, pausa maxima y ritmo.');
}
if (abortado) console.log(`\nTANDA INCOMPLETA: ${abortado}`);

// Pagina de escucha: lo unico que puede juzgar si esto suena a persona es una
// persona. Los ficheros existiendo no es que la narracion sea buena.
const porActo = [];
for (const p of guion.pasos) {
  const r = resultados.find((x) => x.n === p.n);
  const ult = porActo[porActo.length - 1];
  if (!ult || ult.acto !== p.acto) porActo.push({ acto: p.acto, filas: [{ p, r }] });
  else ult.filas.push({ p, r });
}
writeFileSync(join(SALIDA, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Mecha — narracion "${esc(guion.nombre || RECORRIDO)}"</title>
<style>
  :root{--fuego:#f4501e;--crema:#f6f1ea;--tinta:#1c1917;--sec:#78716c;--linea:#e7e5e4}
  *{box-sizing:border-box}
  body{margin:0;padding:32px 20px 90px;background:var(--crema);color:var(--tinta);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .in{max-width:880px;margin:0 auto}
  h1{font-size:27px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--sec);margin:0 0 26px}
  .barra{position:sticky;top:0;z-index:5;background:var(--crema);padding:12px 0 14px;
         border-bottom:1px solid var(--linea);margin:0 0 22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .barra button{font:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--linea);
    background:#fffdfb;color:var(--tinta);border-radius:9px;padding:8px 14px;cursor:pointer}
  .barra button.on{background:var(--fuego);border-color:var(--fuego);color:#fff}
  .barra .est{font-family:ui-monospace,monospace;font-size:12px;color:var(--sec)}
  h2.acto{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--fuego);
    margin:30px 0 10px;font-weight:700}
  .paso{background:#fffdfb;border:1px solid var(--linea);border-radius:13px;padding:14px 16px;margin:0 0 10px}
  .paso.sonando{border-color:var(--fuego);box-shadow:0 0 0 3px rgba(244,80,30,.13)}
  .paso .n{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--sec);font-weight:700}
  .paso .tx{margin:5px 0 10px;font-size:14.5px;line-height:1.7}
  .paso .tx code{background:#f1efec;border-radius:4px;padding:1px 5px;font-size:11.5px;color:var(--fuego)}
  .paso audio{width:100%;height:34px}
  .paso .m{font-family:ui-monospace,monospace;font-size:11px;color:var(--sec);margin:7px 0 0}
  .paso .m .mal{color:#b91c1c;font-weight:700}
  .falta{color:#b91c1c;font-weight:600;font-size:13px}
</style></head><body><div class="in">
<h1>Narración · ${esc(guion.nombre || RECORRIDO)}</h1>
<p class="sub">${buenos.length} de ${guion.pasos.length} pasos · ${Math.floor(totalSeg / 60)} min ${Math.round(totalSeg % 60)} s ·
voz <b>${esc(VOZ)}</b> · generado el ${new Date().toLocaleString('es-ES')}.<br/>
Las medidas ya están pasadas. <b>Lo que hay que juzgar aquí es si suena a persona</b>: el acento,
si parece una compañera de oficio o una locutora, y si el paso 15 pone la piel de gallina.</p>

<div class="barra">
  <button id="todo" type="button">Escuchar los ${buenos.length} seguidos</button>
  <span class="est" id="est">parado</span>
</div>

${porActo.map((g) => `<h2 class="acto">${esc(g.acto)}</h2>
${g.filas.map(({ p, r }) => `<div class="paso" id="p${p.n}">
  <div class="n">${dosDig(p.n)}${r && r.segundos ? ` · ${r.segundos}s` : ''}</div>
  <div class="tx">${esc(p.texto).replace(/\[([^\]]+)\]/g, '<code>[$1]</code>')}</div>
  ${r && !r.error
    ? `<audio controls preload="none" data-n="${p.n}" src="${r.fichero}"></audio>
       <p class="m">pausa máx <span class="${r.pausa_max_s >= 1.6 ? 'mal' : ''}">${r.pausa_max_s}s</span> ·
       ${r.lufs} LUFS · pico ${r.pico_dbtp} dBTP · ${r.silencio_pct}% silencio ·
       ${Math.round(r.bytes / 1024)} KB${(r.avisos || []).length ? ` · <span class="mal">${esc(r.avisos.join(', '))}</span>` : ''}</p>`
    : `<p class="falta">sin audio${r && r.error ? ': ' + esc(r.error) : ''}</p>`}
</div>`).join('')}`).join('\n')}
</div>
<script>
  // Escucha encadenada: como se oye de verdad en el recorrido, un paso detras
  // de otro con la misma cola de 900 ms que usa la demo.
  var audios = [].slice.call(document.querySelectorAll('audio'));
  var est = document.getElementById('est');
  var i = -1, corriendo = false, t = null;
  function marcar(el){
    document.querySelectorAll('.paso.sonando').forEach(function(p){ p.classList.remove('sonando'); });
    if(el) el.closest('.paso').classList.add('sonando');
  }
  function siguiente(){
    i++;
    if(i >= audios.length){ parar(); return; }
    var a = audios[i];
    marcar(a);
    a.scrollIntoView({ behavior:'smooth', block:'center' });
    est.textContent = 'paso ' + a.dataset.n + ' de ' + audios.length;
    a.currentTime = 0;
    a.play();
  }
  function parar(){
    corriendo = false; i = -1;
    if(t) clearTimeout(t);
    audios.forEach(function(a){ a.pause(); });
    marcar(null);
    est.textContent = 'parado';
    document.getElementById('todo').classList.remove('on');
    document.getElementById('todo').textContent = 'Escuchar los ' + audios.length + ' seguidos';
  }
  audios.forEach(function(a){
    a.addEventListener('ended', function(){
      if(!corriendo) return;
      t = setTimeout(siguiente, 900);
    });
  });
  document.getElementById('todo').addEventListener('click', function(){
    if(corriendo){ parar(); return; }
    corriendo = true; i = -1;
    this.classList.add('on'); this.textContent = 'Parar';
    siguiente();
  });
</script>
</body></html>`);

console.log(`\nEscucha:  http://localhost:8080/narracion/${RECORRIDO}/`);
console.log(`Audio en: ${SALIDA}/\n`);

if (fallos.length || abortado) process.exit(2);
