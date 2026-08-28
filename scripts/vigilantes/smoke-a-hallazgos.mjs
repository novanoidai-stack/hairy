#!/usr/bin/env node
// scripts/vigilantes/smoke-a-hallazgos.mjs
//
// Convierte el informe JSON de Playwright en un informe de vigilancia, para que
// el smoke de pantallas salga en la misma pestana Salud que el resto.
//
// Uso:
//   npx playwright test tests/smoke --project=publico --reporter=json > smoke.json
//   node scripts/vigilantes/smoke-a-hallazgos.mjs smoke.json vigilancia-smoke.json canario
//
// Clasifica en TRES estados, no dos: verde / flaky / rojo. Un test que pasa al
// reintento NO es una regresion (el spec de cambiar de vista falla 3 de 5 veces
// con el codigo sin tocar) pero si es informacion: sale como aviso con su tasa.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [entrada, salida, origen = 'ci'] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node scripts/vigilantes/smoke-a-hallazgos.mjs <playwright.json> <salida.json> [origen]');
  process.exit(2);
}

const informe = JSON.parse(readFileSync(entrada, 'utf8'));
const hallazgos = [];
const vigilantes = [];

function recorrer(suites) {
  for (const s of suites || []) {
    for (const spec of s.specs || []) {
      for (const t of spec.tests || []) {
        const intentos = t.results || [];
        const paso = intentos.some((r) => r.status === 'passed');
        const fallo = intentos.filter((r) => r.status === 'failed' || r.status === 'timedOut');
        const nombre = spec.title || 'sin nombre';
        const pantalla = nombre.replace(/^humo:\s*/, '');
        const ms = intentos.reduce((n, r) => n + (r.duration || 0), 0);

        vigilantes.push({ nombre: `humo/${pantalla}`, ambito: 'pantallas', ms, ok: paso && !fallo.length });

        if (!paso) {
          const err = fallo[fallo.length - 1]?.error?.message || 'sin mensaje';
          hallazgos.push({
            clave: `pantallas/rota-${pantalla}`,
            nivel: 'bloqueante',
            ambito: 'pantallas',
            titulo: `La pantalla ${pantalla} esta rota`,
            detalle: limpiar(err),
            fichero: 'tests/smoke/pantallas.spec.ts',
            linea: null,
          });
        } else if (fallo.length) {
          hallazgos.push({
            clave: `pantallas/flaky-${pantalla}`,
            nivel: 'aviso',
            ambito: 'pantallas',
            titulo: `La pantalla ${pantalla} falla ${fallo.length} de ${intentos.length} veces`,
            detalle:
              `Paso al reintento, asi que NO es una regresion; pero es inestable. ` +
              `Ultimo fallo: ${limpiar(fallo[fallo.length - 1]?.error?.message || '')}`,
            fichero: 'tests/smoke/pantallas.spec.ts',
            linea: null,
          });
        }
      }
    }
    recorrer(s.suites);
  }
}

// Los mensajes de Playwright traen colores ANSI y 40 lineas de contexto.
function limpiar(t) {
  return String(t).replace(/\x1B\[[0-9;]*m/g, '').split('\n').slice(0, 6).join(' · ').slice(0, 900);
}

recorrer(informe.suites);

writeFileSync(salida, JSON.stringify({
  version: 1,
  origen,
  commit: process.env.GITHUB_SHA || null,
  rama: process.env.GITHUB_REF_NAME || null,
  ejecutado_en: new Date().toISOString(),
  // Playwright reporta la duracion en ms con decimales; la tabla pide integer.
  duracion_ms: informe.stats?.duration != null ? Math.round(informe.stats.duration) : null,
  vigilantes,
  hallazgos,
}, null, 2), 'utf8');

const bloq = hallazgos.filter((h) => h.nivel === 'bloqueante').length;
console.log(`[smoke] ${vigilantes.length} pantallas, ${bloq} rotas, ${hallazgos.length - bloq} inestables.`);
