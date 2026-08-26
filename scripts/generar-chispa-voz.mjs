import { readFileSync, writeFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const key = /^OPENROUTER_API_KEY\s*=\s*(.+)$/m.exec(env)[1].trim().replace(/^['"]|['"]$/g, '');

function envolverEnWav(pcm, { hz, canales, bits }) {
  const bytesPorMuestra = bits / 8;
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + pcm.length, 4);
  cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(canales, 22);
  cabecera.writeUInt32LE(hz, 24);
  cabecera.writeUInt32LE(hz * canales * bytesPorMuestra, 28);
  cabecera.writeUInt16LE(canales * bytesPorMuestra, 32);
  cabecera.writeUInt16LE(bits, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cabecera, pcm]);
}

async function run() {
  const prompt = `Synthesize natural, warm, professional Spanish speech.
# AUDIO PROFILE: Chispa (Asistente telefónica de peluquería)
Style: Natural, amable, cercana pero muy profesional y ágil. Tono de recepcionista de salón de alto nivel en Madrid.
Accent: Castellano de España (Madrid), articulación clara y fluida.

#### TRANSCRIPT
[warm] Studio Norte, buenos días. [short pause] Sí, claro. Con Sofía nos queda hueco para mechas el sábado a las once y media, o por la tarde a las cinco. [friendly] Si te viene bien a las once y media, te bloqueo el sillón ahora mismo y te llega la confirmación por WhatsApp.`;

  console.log('Llamando a OpenRouter con google/gemini-3.1-flash-tts-preview...');
  const r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.mechaa.es',
      'X-Title': 'Mecha - Chispa llamada',
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-tts-preview',
      input: prompt,
      voice: 'Gacrux',
      response_format: 'pcm'
    })
  });

  if (!r.ok) {
    console.error('Error status:', r.status, await r.text());
    return;
  }

  const pcm = Buffer.from(await r.arrayBuffer());
  const wav = envolverEnWav(pcm, { hz: 24000, canales: 1, bits: 16 });
  writeFileSync('web/assets/chispa-voz-gemini.wav', wav);
  console.log(`Audio generado con éxito en web/assets/chispa-voz-gemini.wav (${wav.length} bytes)`);
}

run().catch(console.error);
