import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vigilante, { leerPlanes } from './planes.mjs';
import { AnclaPerdida } from './nucleo.mjs';

const real = () => leerPlanes(readFileSync('lib/planes.ts', 'utf8'));

test('lee la fuente de verdad de lib/planes.ts', () => {
  const p = real();
  assert.equal(p.funciones.length, 16, 'deberia haber 16 FuncionPlan');
  assert.deepEqual([...p.soloIa].sort(), ['ia_chispa', 'ia_voz']);
  // Toda funcion declarada tiene su etiqueta.
  for (const f of p.funciones) assert.ok(p.etiquetas.has(f), `falta etiqueta de ${f}`);
});

test('los planes son los que se venden hoy: Esencial 8, Estudio 14', () => {
  const p = real();
  assert.equal(p.esencial.size, 8);
  assert.equal(p.estudio.size, 14);
  // Y Estudio contiene a Esencial: la tarjeta promete "Todo lo del plan Esencial".
  for (const f of p.esencial) assert.ok(p.estudio.has(f), `Estudio deberia incluir ${f}`);
});

test('Estudio anade exactamente lo que anuncia la tarjeta', () => {
  const p = real();
  const extra = [...p.estudio].filter((f) => !p.esencial.has(f));
  assert.deepEqual(extra.sort(), [
    'campanas',
    'inventario',
    'lista_espera',
    'presupuestos',
    'resenas',
    'senales',
  ]);
});

test('la IA no depende del plan: no esta en ninguno de los dos', () => {
  const p = real();
  for (const f of p.soloIa) {
    assert.ok(!p.esencial.has(f), `${f} no deberia estar en Esencial`);
    assert.ok(!p.estudio.has(f), `${f} no deberia estar en Estudio`);
  }
});

test('si reescriben el tipo FuncionPlan, falla por ciego', () => {
  assert.throws(() => leerPlanes('export const otraCosa = 1;'), AnclaPerdida);
});

test('hoy el codigo, la landing y sus datos estructurados cuadran', async () => {
  const hallazgos = await vigilante.ejecutar();
  assert.deepEqual(hallazgos, [], 'hallazgos:\n' + JSON.stringify(hallazgos, null, 2));
});

test('regresion: el JSON-LD no puede volver a decir "el mismo software"', () => {
  // Lo dijo en dos sitios hasta el 29 ago 2026, mientras el codigo gateaba seis
  // funciones. Como no se ve en pantalla, nadie lo relee.
  const html = readFileSync('web/index.html', 'utf8');
  const ofertas = [...html.matchAll(/"name":\s*"Estudio"[\s\S]{0,400}?"description":\s*"([^"]*)"/g)];
  assert.ok(ofertas.length >= 2, 'deberia haber al menos dos ofertas Estudio en el JSON-LD');
  for (const [, desc] of ofertas) {
    assert.doesNotMatch(desc, /mismo software/i, `el JSON-LD vuelve a mentir: "${desc}"`);
  }
});

test('regresion: el resumen de Ajustes se compone, no se escribe a mano', () => {
  // Estaba a mano y le prometia a un Esencial senales, campanas y lista de espera.
  const src = readFileSync('components/config/SeccionSuscripcion.web.tsx', 'utf8');
  assert.match(src, /PLAN_FUNCIONES/, 'deberia componerse de PLAN_FUNCIONES');
  assert.doesNotMatch(src, /const RESUMEN_SOFTWARE\s*=/, 'no deberia volver el texto a mano');
});

test('el vigilante se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'planes');
  assert.equal(vigilante.ambito, 'precios');
});
