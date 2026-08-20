#!/usr/bin/env node
// scripts/verificar-modelos.mjs
//
// Contrasta supabase/functions/shared/modelos.ts con el catalogo VIVO de
// OpenRouter. Detecta lo que rompio la arquitectura anterior sin que nadie
// lo notara: ids retirados, precios desfasados y capacidades imaginadas.
//
//   node scripts/verificar-modelos.mjs
//
// Sale con codigo 1 si hay algo mal, para poder colgarlo de CI.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fuente = readFileSync(join(raiz, 'supabase/functions/shared/modelos.ts'), 'utf8');

// Parseo ligero del literal CATALOGO (evita depender de un runtime de TS).
function parsearCatalogo(src) {
  const bloque = src.slice(src.indexOf('export const CATALOGO'), src.indexOf('const PORaID'));
  const entradas = [];
  for (const trozo of bloque.split(/\n\s*\{\s*\n/).slice(1)) {
    const id = trozo.match(/id:\s*'([^']+)'/)?.[1];
    if (!id) continue;
    entradas.push({
      id,
      contexto: Number(trozo.match(/contexto:\s*([\d_]+)/)?.[1].replace(/_/g, '') ?? 0),
      entrada: (trozo.match(/entrada:\s*\[([^\]]*)\]/)?.[1] ?? '')
        .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean),
      tools: /tools:\s*true/.test(trozo),
      json: /json:\s*true/.test(trozo),
      temperatura: /temperatura:\s*true/.test(trozo),
      precioIn: Number(trozo.match(/precioIn:\s*([\d.]+)/)?.[1] ?? 0),
      precioOut: Number(trozo.match(/precioOut:\s*([\d.]+)/)?.[1] ?? 0),
      activo: /activo:\s*true/.test(trozo),
    });
  }
  return entradas;
}

const MODALIDAD_A_OPENROUTER = {
  texto: 'text', imagen: 'image', archivo: 'file', audio: 'audio', video: 'video',
};

const catalogo = parsearCatalogo(fuente);
console.log(`Catalogo local: ${catalogo.length} modelos (${catalogo.filter((m) => m.activo).length} activos)\n`);

const res = await fetch('https://openrouter.ai/api/v1/models');
if (!res.ok) {
  console.error(`No se pudo consultar OpenRouter (HTTP ${res.status})`);
  process.exit(1);
}
const vivos = new Map((await res.json()).data.map((m) => [m.id, m]));

let errores = 0;
let avisos = 0;

for (const local of catalogo) {
  const vivo = vivos.get(local.id);
  if (!vivo) {
    console.error(`ERROR  ${local.id}: NO EXISTE en OpenRouter`);
    errores++;
    continue;
  }

  const params = vivo.supported_parameters ?? [];
  const modalidades = vivo.architecture?.input_modalities ?? [];
  const problemas = [];

  for (const mod of local.entrada) {
    const equivalente = MODALIDAD_A_OPENROUTER[mod];
    if (!modalidades.includes(equivalente)) problemas.push(`declara entrada '${mod}' pero el modelo no la acepta`);
  }
  if (local.tools && !params.includes('tools')) problemas.push('declara tools pero el modelo no las soporta');
  if (local.json && !params.includes('response_format')) problemas.push('declara json pero no soporta response_format');
  if (local.temperatura !== params.includes('temperature')) {
    problemas.push(`temperatura declarada ${local.temperatura} pero el modelo dice ${params.includes('temperature')}`);
  }
  if (local.contexto !== vivo.context_length) {
    problemas.push(`contexto ${local.contexto} != ${vivo.context_length} real`);
  }

  const inReal = Number(vivo.pricing.prompt) * 1e6;
  const outReal = Number(vivo.pricing.completion) * 1e6;
  const desvia = (a, b) => Math.abs(a - b) > Math.max(b * 0.02, 0.001);
  if (desvia(local.precioIn, inReal)) problemas.push(`precioIn ${local.precioIn} != ${inReal.toFixed(4)} real`);
  if (desvia(local.precioOut, outReal)) problemas.push(`precioOut ${local.precioOut} != ${outReal.toFixed(4)} real`);

  if (problemas.length === 0) {
    console.log(`OK     ${local.id}${local.activo ? '' : '  (solo tarifas)'}`);
  } else {
    for (const p of problemas) console.error(`ERROR  ${local.id}: ${p}`);
    errores += problemas.length;
  }
}

// Sugerencia: modelos vivos claramente mejores en precio con las mismas capacidades.
const activos = catalogo.filter((m) => m.activo);
const referencia = Math.min(...activos.map((m) => m.precioIn + m.precioOut));
const mejores = [...vivos.values()].filter((m) => {
  const p = m.supported_parameters ?? [];
  const mod = m.architecture?.input_modalities ?? [];
  const precio = (Number(m.pricing.prompt) + Number(m.pricing.completion)) * 1e6;
  return precio > 0 && precio < referencia * 0.6 && mod.includes('image') && p.includes('tools')
    && p.includes('response_format') && m.context_length >= 500_000 && !m.id.includes(':');
});
if (mejores.length > 0) {
  avisos += mejores.length;
  console.log('\nAVISO: hay modelos vivos mas baratos con las mismas capacidades minimas:');
  for (const m of mejores.slice(0, 8)) {
    console.log(`  ${m.id}  ${(m.pricing.prompt * 1e6).toFixed(3)}/${(m.pricing.completion * 1e6).toFixed(3)} USD por 1M, ctx ${m.context_length}`);
  }
}

console.log(`\n${errores} errores, ${avisos} avisos.`);
process.exit(errores > 0 ? 1 : 0);
