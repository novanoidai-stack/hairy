import test from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { medirProfundidadAnidamiento, revisarArchivo } from './peso-componentes.mjs';

test('el vigilante peso-componentes se declara con nombre y ambito', () => {
  assert.equal(vigilante.nombre, 'peso-componentes');
  assert.equal(vigilante.ambito, 'rendimiento');
});

test('detecta archivo monstruo que supera limite de lineas', () => {
  const contenido = Array(500).fill('const x = 1;').join('\n');
  const res = revisarArchivo('app/(tabs)/test.web.tsx', contenido, 450, 4);
  assert.equal(res.hallazgos.length, 1);
  assert.equal(res.hallazgos[0].nivel, 'aviso');
  assert.match(res.hallazgos[0].titulo, /supera el límite de tamaño/);
});

test('detecta anidamiento profundo', () => {
  const contenido = `
function test() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            if (f) {
              if (g) {
                console.log('anidado');
              }
            }
          }
        }
      }
    }
  }
}
  `;
  const res = revisarArchivo('app/test.web.tsx', contenido, 450, 4);
  assert.ok(res.hallazgos.some(h => h.clave.includes('anidamiento-profundo')));
});
