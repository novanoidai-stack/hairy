// Tests del nucleo de los vigilantes. Se corren con:
//   node --test scripts/vigilantes/nucleo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { capturar, AnclaPerdida, lineaDe, hallazgo, debenCuadrar } from './nucleo.mjs';

test('capturar devuelve el grupo 1 y su linea', () => {
  const texto = 'uno\ndos\n"lowPrice": "39"\ncuatro';
  const r = capturar(texto, /"lowPrice":\s*"(\d+)"/, { fichero: 'x.html', ancla: 'lowPrice' });
  assert.equal(r.valor, '39');
  assert.equal(r.linea, 3);
});

test('capturar lanza AnclaPerdida si el ancla ya no existe', () => {
  assert.throws(
    () => capturar('nada que ver', /"lowPrice":\s*"(\d+)"/, { fichero: 'x.html', ancla: 'lowPrice' }),
    AnclaPerdida,
  );
});

test('lineaDe cuenta desde 1', () => {
  assert.equal(lineaDe('a\nb\nc', 4), 3);
});

test('hallazgo exige nivel valido', () => {
  assert.throws(() => hallazgo({ clave: 'x', nivel: 'grave', ambito: 'a', titulo: 't', detalle: 'd' }));
  const h = hallazgo({ clave: 'x', nivel: 'aviso', ambito: 'a', titulo: 't', detalle: 'd' });
  assert.equal(h.nivel, 'aviso');
});

test('debenCuadrar calla si cuadran y grita si no', () => {
  assert.equal(
    debenCuadrar({ clave: 'c', ambito: 'a', que: 'q', esperado: 39, encontrado: '39' }),
    null,
    'compara como texto: 39 y "39" son lo mismo',
  );
  const h = debenCuadrar({ clave: 'c', ambito: 'a', que: 'el precio', esperado: 39, encontrado: '41' });
  assert.equal(h.nivel, 'bloqueante');
  assert.match(h.titulo, /se esperaba 39 y hay 41/);
});
