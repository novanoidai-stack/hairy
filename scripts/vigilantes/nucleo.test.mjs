// Tests del nucleo de los vigilantes. Se corren con:
//   node --test scripts/vigilantes/nucleo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { capturar, AnclaPerdida, lineaDe, hallazgo, debenCuadrar, codigoEjecutable, NO_SON_VIGILANTES } from './nucleo.mjs';

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

// --- codigoEjecutable: distinguir una llamada de una mencion -----------------
//
// Nacio el 4 sep 2026. La comprobacion 1 de meta-contrato buscaba process.exit(
// sobre el fichero crudo, asi que se acusaba a si misma por la frase de su
// cabecera. No era solo ruido: con ese falso positivo el recorrido se salta la
// inspeccion del contrato de ese fichero, o sea que deja de mirar en silencio.

test('codigoEjecutable vacia comentarios de linea y de bloque', () => {
  assert.doesNotMatch(codigoEjecutable('// process.exit(0)\nconst a = 1;'), /process\.exit/);
  assert.doesNotMatch(codigoEjecutable('/* process.exit(0) */\nconst a = 1;'), /process\.exit/);
});

test('codigoEjecutable vacia textos literales, que es donde vivian los mensajes', () => {
  assert.doesNotMatch(codigoEjecutable("const d = 'no uses process.exit(0) aqui';"), /process\.exit/);
  assert.doesNotMatch(codigoEjecutable('const d = "process.exit(";'), /process\.exit/);
  assert.doesNotMatch(codigoEjecutable('const d = `usa process.exit(0)`;'), /process\.exit/);
});

test('codigoEjecutable NO se come una llamada de verdad', () => {
  assert.match(codigoEjecutable('if (malo) process.exit(1);'), /process\.exit/);
  assert.match(codigoEjecutable('// comentario\nprocess.exit(0);\n'), /process\.exit/);
});

test('codigoEjecutable sobrevive a un literal de expresion regular con comillas', () => {
  // Si tratara la comilla de dentro del regex como apertura de cadena, se
  // tragaria el resto del fichero y dejaria de ver la llamada: falso negativo.
  const fuente = "const re = /['\"]/;\nprocess.exit(2);\n";
  assert.match(codigoEjecutable(fuente), /process\.exit/);
});

test('codigoEjecutable no confunde una division con un regex', () => {
  assert.match(codigoEjecutable('const x = a / b;\nprocess.exit(1);'), /process\.exit/);
});

test('la lista NO_SON_VIGILANTES incluye los scripts que se matan solos', () => {
  // Son los cuatro que le faltaban a la copia de meta-contrato y que tumbaron
  // el runner del 1 al 4 sep 2026.
  for (const f of ['peso-bundle.mjs', 'rendimiento.mjs', 'silencios.mjs', 'dr-backups.mjs']) {
    assert.ok(NO_SON_VIGILANTES.has(f), `${f} tiene que estar en NO_SON_VIGILANTES`);
  }
});
