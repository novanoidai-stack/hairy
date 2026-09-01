// Tests para fugas-listeners

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fugasListeners, { analizarFugasMemoria } from './fugas-listeners.mjs';

describe('fugas-listeners', () => {
  it('se declara con nombre y ámbito codigo', () => {
    assert.equal(fugasListeners.nombre, 'fugas-listeners');
    assert.equal(fugasListeners.ambito, 'codigo');
    assert.equal(typeof fugasListeners.ejecutar, 'function');
  });

  it('detecta un setInterval sin clearInterval en el cleanup', () => {
    const codigoRoto = `
      useEffect(() => {
        const id = setInterval(() => { console.log('tick'); }, 1000);
      }, []);
    `;
    const hallazgos = analizarFugasMemoria(codigoRoto, 'app/test.tsx');
    assert.equal(hallazgos.length, 1);
    assert.ok(hallazgos[0].titulo.includes('setInterval'));
  });

  it('detecta suscripción a supabase.channel sin cleanup', () => {
    const codigoRoto = `
      useEffect(() => {
        const channel = supabase.channel('citas_live').subscribe();
      }, [salonId]);
    `;
    const hallazgos = analizarFugasMemoria(codigoRoto, 'app/agenda.tsx');
    assert.equal(hallazgos.length, 1);
    assert.ok(hallazgos[0].titulo.includes('Realtime'));
  });

  it('un useEffect con cleanup adecuado pasa sin avisos', () => {
    const codigoLimpio = `
      useEffect(() => {
        const timer = setInterval(() => { console.log('tick'); }, 1000);
        return () => clearInterval(timer);
      }, []);
    `;
    const hallazgos = analizarFugasMemoria(codigoLimpio, 'app/limpio.tsx');
    assert.equal(hallazgos.length, 0);
  });
});
