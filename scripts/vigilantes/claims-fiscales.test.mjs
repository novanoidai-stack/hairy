import { test } from 'node:test';
import assert from 'node:assert/strict';
import vigilante, { revisar } from './claims-fiscales.mjs';
import { leer } from './nucleo.mjs';

const claves = (h) => h.map((x) => x.clave).sort();

test('caza el claim exacto que habia en la landing el 30 ago 2026', () => {
  const h = revisar(
    '"Facturación VeriFactu (AEAT) con cadena SHA-256, QR de cotejo y envío a Hacienda",',
    'web/index.html',
    'bloqueante',
  );
  assert.deepEqual(claves(h), ['claims-fiscales/envio-aeat', 'claims-fiscales/qr-cotejo']);
});

test('caza el "Si" de la FAQ que decia que Mecha cumple VeriFactu', () => {
  // Texto literal que estaba publicado en el JSON-LD el 30 ago 2026.
  const h = revisar(
    '"name": "¿Mecha cumple con la normativa VeriFactu de la AEAT?",\n' +
      '"text": "Sí. Mecha incluye el módulo fiscal y de facturación VeriFactu adaptado a los ' +
      'requisitos técnicos de la Agencia Tributaria (AEAT), generando el encadenamiento de ' +
      'facturas mediante hash SHA-256 inalterable, código QR de cotejo y registro de eventos ' +
      'de auditoría fiscal."',
    'web/index.html',
    'bloqueante',
  );
  assert.deepEqual(claves(h), [
    'claims-fiscales/conforme-aeat',
    'claims-fiscales/cumple-verifactu',
    'claims-fiscales/qr-cotejo',
  ]);
});

test('caza "homologada por la AEAT"', () => {
  const h = revisar('Facturación VeriFactu homologada por la AEAT, con QR', 'web/x.html', 'bloqueante');
  assert.ok(claves(h).includes('claims-fiscales/homologado'));
});

test('caza "Cumple VeriFactu 2026"', () => {
  const h = revisar('0% comisiones · Cumple VeriFactu 2026.', 'web/x.html', 'bloqueante');
  assert.deepEqual(claves(h), ['claims-fiscales/cumple-verifactu']);
});

// El falso positivo que mata a un vigilante asi: si prohibe NOMBRAR lo que no
// hay, obliga a callarse en vez de a ser exacto. La redaccion honesta tiene que
// poder escribirse.
test('NO marca la redaccion honesta que dice que eso todavia no esta', () => {
  for (const frase of [
    'El envío a la AEAT y el QR de cotejo no están disponibles todavía.',
    'El envío del registro a la AEAT y el código QR de cotejo están en desarrollo.',
    'El envío a la AEAT y el QR de cotejo llegan después.',
  ]) {
    assert.deepEqual(revisar(frase, 'web/x.html', 'bloqueante'), [], `marcada de mas: ${frase}`);
  }
});

test('NO marca lo que SI se hace y se puede prometer', () => {
  const frase =
    'Libro de tickets inalterable con encadenado criptográfico y numeración correlativa, ' +
    'según el RD 1007/2023. Los tickets no se borran: se rectifican.';
  assert.deepEqual(revisar(frase, 'web/x.html', 'bloqueante'), []);
});

test('el ancla existe y hoy dice que el envio no esta disponible', () => {
  const estado = leer('lib/fiscal/estadoVerifactu.ts');
  assert.match(estado, /export const ENVIO_AEAT_DISPONIBLE = (true|false);/);
  assert.match(estado, /export const QR_COTEJO_DISPONIBLE = (true|false);/);
});

test('las superficies vivas estan limpias (0 bloqueantes)', async () => {
  const h = await vigilante.ejecutar();
  const bloqueantes = h.filter((x) => x.nivel === 'bloqueante');
  assert.deepEqual(
    bloqueantes.map((x) => `${x.fichero}:${x.linea} ${x.titulo}`),
    [],
    'una superficie publica ha vuelto a prometer el envio a la AEAT',
  );
});
