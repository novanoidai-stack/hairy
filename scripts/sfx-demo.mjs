#!/usr/bin/env node
// ---------------------------------------------------------------------------
// LOS CUATRO SONIDOS DE LA DEMO
//
// Cuatro sonidos y un silencio. Ni uno mas: una demostracion de software no es
// un videojuego. Lo que NO va aqui es ambiente de salon en bucle — suena bien
// diez segundos, cansa a los noventa y compite justo en la banda de la voz.
// Los secadores de fondo van en el PROMPT de la narracion, no en la mezcla.
//
//   1 tick    40 ms   pico -26 dBFS   al cambiar de paso
//   2 swell  600 ms   pico -22 dBFS   al entrar en un capitulo (6 en el recorrido 1)
//   3 toca   ~460 ms  pico -20 dBFS   dos notas ascendentes en los pasos TE TOCA
//   4 whoosh 340 ms   pico -18 dBFS   al salir la intro (la animacion ya existe)
//
// Se SINTETIZAN, no se descargan de un banco: cuatro sonidos de menos de un
// segundo son sesenta lineas de matematicas y cero licencias que arrastrar.
// El plan hablaba de OfflineAudioContext; en Node no existe, asi que las
// muestras se calculan a mano y solo se escribe la cabecera WAV. Mismo
// resultado y sin dependencias nuevas.
//
// Formato: WAV 44,1 kHz mono 16 bits. No MP3: el retardo de codificador de MP3
// mete silencio al principio y eso se carga un tick de 40 ms. Los cuatro juntos
// pesan ~115 KB, que al lado de los 2,6 MB de narracion no es nada.
//
//   node scripts/sfx-demo.mjs
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HZ = 44100;
const SALIDA = join('web', 'narracion', 'sfx');

// Ruido reproducible: con Math.random cada regeneracion daria un fichero
// distinto y el whoosh ensuciaria el diff sin cambiar de sonido.
function ruidoSemilla(semilla) {
  let s = semilla >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return (s / 4294967296) * 2 - 1;
  };
}

const nMuestras = (seg) => Math.round(seg * HZ);

// Rampas de entrada y salida: sin esto, empezar o cortar a media onda es un
// chasquido, y un chasquido es justo lo que no quieres al cambiar de paso.
function rampas(b, entradaSeg = 0.002, salidaSeg = 0.006) {
  const a = Math.max(1, nMuestras(entradaSeg));
  const z = Math.max(1, nMuestras(salidaSeg));
  for (let i = 0; i < a && i < b.length; i++) b[i] *= i / a;
  for (let i = 0; i < z && i < b.length; i++) b[b.length - 1 - i] *= i / z;
  return b;
}

// Deja el pico exactamente en el dBFS pedido. Es la unica forma de que los
// cuatro sonidos guarden entre si la distancia que dice la tabla.
function aPico(b, dbfs) {
  let pico = 0;
  for (let i = 0; i < b.length; i++) pico = Math.max(pico, Math.abs(b[i]));
  if (!pico) return b;
  const g = Math.pow(10, dbfs / 20) / pico;
  for (let i = 0; i < b.length; i++) b[i] *= g;
  return b;
}

function medidas(b) {
  let pico = 0, suma = 0;
  for (let i = 0; i < b.length; i++) { pico = Math.max(pico, Math.abs(b[i])); suma += b[i] * b[i]; }
  return {
    segundos: +(b.length / HZ).toFixed(3),
    pico_dbfs: +(20 * Math.log10(pico || 1e-9)).toFixed(1),
    rms_dbfs: +(20 * Math.log10(Math.sqrt(suma / b.length) || 1e-9)).toFixed(1),
  };
}

function escribirWav(ruta, b) {
  const pcm = Buffer.alloc(b.length * 2);
  for (let i = 0; i < b.length; i++) {
    const v = Math.max(-1, Math.min(1, b[i]));
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + pcm.length, 4); c.write('WAVE', 8);
  c.write('fmt ', 12); c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20);
  c.writeUInt16LE(1, 22); c.writeUInt32LE(HZ, 24);
  c.writeUInt32LE(HZ * 2, 28); c.writeUInt16LE(2, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(pcm.length, 40);
  writeFileSync(ruta, Buffer.concat([c, pcm]));
}

// --- 1 · TICK ---------------------------------------------------------------
// Marca el corte entre pasos sin robar atencion. Dos parciales agudos con una
// caida de 8 ms: se percibe como "algo ha cambiado", no como un aviso.
function tick() {
  const b = new Float32Array(nMuestras(0.04));
  for (let i = 0; i < b.length; i++) {
    const t = i / HZ;
    const env = Math.exp(-t / 0.008);
    b[i] = (Math.sin(2 * Math.PI * 2100 * t) * 0.78 + Math.sin(2 * Math.PI * 3150 * t) * 0.22) * env;
  }
  return aPico(rampas(b, 0.0015, 0.004), -26);
}

// --- 2 · SWELL --------------------------------------------------------------
// Entrada de capitulo. Un glissando corto de sol a do con sus dos primeros
// armonicos: da estructura sin sonar a fanfarria.
function swell() {
  const dur = 0.6;
  const b = new Float32Array(nMuestras(dur));
  let fase = 0;
  for (let i = 0; i < b.length; i++) {
    const x = i / b.length;
    // Campana asimetrica: ataque lento (entra por debajo de la voz), caida suave.
    const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.72)), 1.6);
    const f = 196 + 66 * x;                       // sol3 -> do4
    fase += (2 * Math.PI * f) / HZ;
    b[i] = (Math.sin(fase) * 0.62 + Math.sin(2 * fase) * 0.26 + Math.sin(3 * fase) * 0.12) * env;
  }
  return aPico(rampas(b, 0.006, 0.03), -22);
}

// --- 3 · TE TOCA ------------------------------------------------------------
// Dos notas ascendentes (mi5, la5). Es el unico momento del recorrido en que se
// te pide algo, asi que es el unico sonido con intencion de pregunta.
function toca() {
  const notas = [{ f: 659.25, t0: 0 }, { f: 880.0, t0: 0.2 }];
  const b = new Float32Array(nMuestras(0.46));
  for (let i = 0; i < b.length; i++) {
    const t = i / HZ;
    let v = 0;
    for (const n of notas) {
      const dt = t - n.t0;
      if (dt < 0) continue;
      const ataque = Math.min(1, dt / 0.004);
      const env = ataque * Math.exp(-dt / 0.085);
      // Campanita: fundamental + una quinta floja + un parcial inarmonico muy bajo.
      v += (Math.sin(2 * Math.PI * n.f * dt) * 0.7
          + Math.sin(2 * Math.PI * n.f * 1.5 * dt) * 0.18
          + Math.sin(2 * Math.PI * n.f * 2.76 * dt) * 0.08) * env;
    }
    b[i] = v;
  }
  return aPico(rampas(b, 0.002, 0.02), -20);
}

// --- 4 · WHOOSH -------------------------------------------------------------
// La intro ya se va con dmIntroOut en 0,34 s; esto es el sonido que le falta.
// Ruido por un pasa-banda que sube y vuelve a bajar: filtro de estado variable
// (Chamberlin), cuatro lineas y suena a movimiento de camara.
function whoosh() {
  const dur = 0.34;
  const b = new Float32Array(nMuestras(dur));
  const rnd = ruidoSemilla(0x5eed1e);
  let low = 0, band = 0;
  for (let i = 0; i < b.length; i++) {
    const x = i / b.length;
    const fc = 260 + 4600 * Math.pow(Math.sin(Math.PI * x), 0.8);
    const f = 2 * Math.sin((Math.PI * Math.min(fc, HZ * 0.45)) / HZ);
    const q = 1 / 1.7;
    const alto = rnd() - low - q * band;
    band += f * alto;
    low += f * band;
    // Ataque de 25 ms y caida hasta cero: entra rapido y se va con la imagen.
    const env = Math.min(1, x / 0.075) * Math.pow(1 - x, 1.25);
    b[i] = band * env;
  }
  return aPico(rampas(b, 0.004, 0.02), -18);
}

// --- 5 · AIRE ---------------------------------------------------------------
// La flecha que entra. Ruido por un pasa-banda que BAJA de agudo a medio: suena
// a algo que pasa por delante, no a algo que aterriza. Mas corto y mas suave
// que el whoosh, que es de cambio de plano.
function aire() {
  const b = new Float32Array(nMuestras(0.18));
  const rnd = ruidoSemilla(0xa17e01);
  let low = 0, band = 0;
  for (let i = 0; i < b.length; i++) {
    const x = i / b.length;
    const fc = 5200 - 3400 * x;
    const f = 2 * Math.sin((Math.PI * Math.min(fc, HZ * 0.45)) / HZ);
    const q = 1 / 2.2;
    const alto = rnd() - low - q * band;
    band += f * alto;
    low += f * band;
    b[i] = band * Math.min(1, x / 0.06) * Math.pow(1 - x, 1.6);
  }
  return aPico(rampas(b, 0.003, 0.015), -24);
}

// --- 6 · CRISTAL ------------------------------------------------------------
// El ping, el subrayado y las chinchetas. Una campanita muy corta y muy arriba:
// tiene que caber DEBAJO de una frase sin taparla. El parcial de 2,41 —que no es
// un armonico— es lo que la hace sonar a cristal y no a timbre de telefono.
function cristal() {
  const b = new Float32Array(nMuestras(0.26));
  const f0 = 1760;
  for (let i = 0; i < b.length; i++) {
    const t = i / HZ;
    const env = Math.min(1, t / 0.003) * Math.exp(-t / 0.055);
    b[i] = (Math.sin(2 * Math.PI * f0 * t) * 0.62
          + Math.sin(2 * Math.PI * f0 * 2.41 * t) * 0.24
          + Math.sin(2 * Math.PI * f0 * 3.86 * t) * 0.14) * env;
  }
  return aPico(rampas(b, 0.002, 0.02), -23);
}

// --- 7 · CIERRE -------------------------------------------------------------
// Cierra el capitulo que acaba, medio segundo antes de que el swell abra el
// siguiente. Un tono grave que ADEMAS cae de 132 a 72 hercios: la caida es lo
// que se lee como "esto se ha terminado".
function cierre() {
  const b = new Float32Array(nMuestras(0.5));
  let fase = 0;
  for (let i = 0; i < b.length; i++) {
    const t = i / HZ, x = i / b.length;
    const f = 132 - 60 * Math.pow(x, 0.55);
    fase += (2 * Math.PI * f) / HZ;
    const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.13);
    b[i] = (Math.sin(fase) * 0.82 + Math.sin(2 * fase) * 0.14) * env;
  }
  return aPico(rampas(b, 0.004, 0.04), -24);
}

// ---------------------------------------------------------------------------
const SONIDOS = [
  { id: 'tick', cuando: 'Al cambiar de paso', objetivo: -26, hacer: tick },
  { id: 'swell', cuando: 'Al entrar en un capítulo', objetivo: -22, hacer: swell },
  { id: 'toca', cuando: 'En los pasos "TE TOCA"', objetivo: -20, hacer: toca },
  { id: 'whoosh', cuando: 'Al salir la intro', objetivo: -18, hacer: whoosh },
  { id: 'aire', cuando: 'Cuando entra una flecha', objetivo: -24, hacer: aire },
  { id: 'cristal', cuando: 'Ping, subrayado y chinchetas', objetivo: -23, hacer: cristal },
  { id: 'cierre', cuando: 'Al cerrarse un capítulo', objetivo: -24, hacer: cierre },
];

mkdirSync(SALIDA, { recursive: true });
console.log('\nSonidos de la demo · WAV 44,1 kHz mono 16 bits\n');

const filas = [];
let bytes = 0;
for (const s of SONIDOS) {
  const b = s.hacer();
  const ruta = join(SALIDA, `${s.id}.wav`);
  escribirWav(ruta, b);
  const m = medidas(b);
  const kb = statSync(ruta).size;
  bytes += kb;
  const ok = Math.abs(m.pico_dbfs - s.objetivo) < 0.15;
  console.log(`  ${s.id.padEnd(7)} ${String(m.segundos).padStart(5)} s   pico ${String(m.pico_dbfs).padStart(6)} dBFS ` +
    `(objetivo ${s.objetivo})${ok ? '' : '  <-- FUERA'}   rms ${String(m.rms_dbfs).padStart(6)} dBFS   ${String(Math.round(kb / 1024)).padStart(3)} KB`);
  filas.push({ ...s, ...m, kb });
}
console.log(`\n  total ${(bytes / 1024).toFixed(0)} KB\n`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
writeFileSync(join(SALIDA, 'index.html'), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Mecha — sonidos de la demo</title>
<style>
  :root{--fuego:#f4501e;--crema:#f6f1ea;--tinta:#1c1917;--sec:#78716c;--linea:#e7e5e4}
  *{box-sizing:border-box}
  body{margin:0;padding:34px 20px 80px;background:var(--crema);color:var(--tinta);
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .in{max-width:720px;margin:0 auto}
  h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--sec);margin:0 0 26px}
  .s{background:#fffdfb;border:1px solid var(--linea);border-radius:13px;padding:15px 17px;margin:0 0 11px}
  .s h2{font-size:16px;margin:0 0 2px}
  .s .c{color:var(--fuego);font-size:13px;font-weight:600;margin:0 0 10px}
  .s audio{width:100%;height:34px}
  .s .m{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--sec);margin:8px 0 0}
</style></head><body><div class="in">
<h1>Los cuatro sonidos</h1>
<p class="sub">Contra una voz a −16 LUFS, cada uno queda entre 6 y 10 dB por debajo:
no hace falta <i>ducking</i>. Generados el ${new Date().toLocaleString('es-ES')}.</p>
${filas.map((f) => `<div class="s">
  <h2>${esc(f.id)}</h2>
  <p class="c">${esc(f.cuando)}</p>
  <audio controls preload="auto" src="${f.id}.wav"></audio>
  <p class="m">${f.segundos} s · pico ${f.pico_dbfs} dBFS · rms ${f.rms_dbfs} dBFS · ${Math.round(f.kb / 1024)} KB</p>
</div>`).join('\n')}
<p class="sub" style="margin-top:22px">El quinto recurso no está aquí porque no es un fichero:
es el <b>silencio</b> del paso 15, justo antes de "tú no estás ocupada".</p>
</div></body></html>`);

console.log(`Escucha: http://localhost:8080/narracion/sfx/\n`);
