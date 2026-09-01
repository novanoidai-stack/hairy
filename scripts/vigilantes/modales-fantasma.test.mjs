// Tests para modales-fantasma

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import modalesFantasma, { analizarModales } from './modales-fantasma.mjs';

describe('modales-fantasma', () => {
  it('se declara con nombre y ámbito codigo', () => {
    assert.equal(modalesFantasma.nombre, 'modales-fantasma');
    assert.equal(modalesFantasma.ambito, 'codigo');
    assert.equal(typeof modalesFantasma.ejecutar, 'function');
  });

  it('detecta un <Modal> sin onRequestClose ni onDismiss', () => {
    const modalRoto = `
      <Modal visible={open} animationType="slide">
        <View><Text>Hola</Text></View>
      </Modal>
    `;
    const hallazgos = analizarModales(modalRoto, 'components/TestModal.tsx');
    assert.equal(hallazgos.length, 1);
    assert.ok(hallazgos[0].titulo.includes('onRequestClose'));
  });

  it('un <Modal> con onRequestClose pasa limpio', () => {
    const modalLimpio = `
      <Modal visible={open} onRequestClose={onClose} transparent>
        <View><Text>Hola</Text></View>
      </Modal>
    `;
    const hallazgos = analizarModales(modalLimpio, 'components/CleanModal.tsx');
    assert.equal(hallazgos.length, 0);
  });
});
