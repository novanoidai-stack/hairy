// Tests para el vigilante de planta meta-trinquete

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import metaTrinquete, {
  evaluarTrinquete,
  leerAvisosDelSnapshot,
  leerLimiteDeLineaBase,
} from './meta-trinquete.mjs';
import { RAIZ, AnclaPerdida } from './nucleo.mjs';

// Un snapshot con la MISMA FORMA que el que escribe compilar-estado.mjs: las
// siete claves de primer nivel, y el recuento de avisos dentro de `resumen`.
// Si esta fixture se aplana (avisos arriba del todo) deja de probar nada, que
// es como el vigilante pudo leer `snapshot.avisos` durante toda su vida sin que
// ningún test se quejara.
function snapshotComoElDeVerdad(avisos = 39) {
  return {
    version: 1,
    timestamp: '2026-09-01T20:44:00.000Z',
    duracion_ms: 1234,
    git: { commit: 'abc123', branch: 'master', dirty: false },
    resumen: {
      total_hallazgos: avisos,
      bloqueantes: 0,
      avisos,
      vigilantes_ejecutados: 17,
      salud: 'degradada',
    },
    capas: {},
    hallazgos: [],
  };
}

describe('meta-trinquete', () => {
  it('se declara con nombre y ámbito meta', () => {
    assert.equal(metaTrinquete.nombre, 'meta-trinquete');
    assert.equal(metaTrinquete.ambito, 'meta');
    assert.equal(typeof metaTrinquete.ejecutar, 'function');
  });

  it('bloquea si el número de avisos supera el límite', () => {
    const hallazgos = evaluarTrinquete(50, 42);
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0].nivel, 'bloqueante');
    assert.ok(hallazgos[0].titulo.includes('Deuda técnica desbordada'));
  });

  it('pasa limpio si los avisos están dentro o por debajo de la línea base', () => {
    const hallazgos = evaluarTrinquete(35, 42);
    assert.equal(hallazgos.length, 0);
  });

  // EL TEST QUE FALTABA. El vigilante leía `snapshot.avisos`, que en el snapshot
  // real es `undefined`, y el `?? 0` lo dejaba en cero: el trinquete no disparó
  // NUNCA desde que se escribió. Esta comprobación va contra la forma real del
  // fichero, así que se pone roja en cuanto alguien vuelve a leer el campo
  // equivocado.
  describe('lee el recuento donde de verdad vive (resumen.avisos)', () => {
    it('saca el número del sitio correcto en un snapshot con la forma real', () => {
      const snapshot = snapshotComoElDeVerdad(39);

      // Esto es lo que leía antes: el campo de primer nivel no existe.
      assert.equal(snapshot.avisos, undefined, 'el snapshot real no tiene `avisos` arriba');

      assert.equal(leerAvisosDelSnapshot(snapshot), 39);
    });

    it('dispara con un snapshot con la forma real que desborda la línea base', () => {
      // Con la lectura vieja esto daba 0 y no encontraba nada: el caso completo,
      // de fichero a hallazgo, es el que prueba que el trinquete gira.
      const avisos = leerAvisosDelSnapshot(snapshotComoElDeVerdad(50));
      const limite = leerLimiteDeLineaBase({ maximo_avisos_permitidos: 42 });

      const hallazgos = evaluarTrinquete(avisos, limite);
      assert.equal(hallazgos.length, 1, 'un snapshot con 50 avisos sobre un techo de 42 tiene que bloquear');
      assert.equal(hallazgos[0].clave, 'meta-trinquete/desborde-deuda');
    });

    it('lee el mismo número que trae el snapshot versionado del repo', () => {
      const real = JSON.parse(
        readFileSync(path.join(RAIZ, '.sistema', 'estado-salud.json'), 'utf8'),
      );

      const leido = leerAvisosDelSnapshot(real);
      assert.equal(leido, real.resumen.avisos);
      assert.ok(
        leido > 0,
        'el snapshot del repo tiene avisos: si aquí sale 0 es que el vigilante está leyendo ' +
          'un campo que no existe, no que la deuda sea cero',
      );
    });
  });

  // Las tres formas de salir en verde por no haber mirado. Ninguna puede volver.
  describe('un campo ausente falla en voz alta, no se lee como cero', () => {
    it('sin objeto resumen', () => {
      assert.throws(() => leerAvisosDelSnapshot({ version: 1, hallazgos: [] }), AnclaPerdida);
    });

    it('con resumen pero sin avisos', () => {
      assert.throws(
        () => leerAvisosDelSnapshot({ resumen: { bloqueantes: 0, salud: 'optima' } }),
        AnclaPerdida,
      );
    });

    it('con avisos que no es un número', () => {
      assert.throws(() => leerAvisosDelSnapshot({ resumen: { avisos: '39' } }), AnclaPerdida);
      assert.throws(() => leerAvisosDelSnapshot({ resumen: { avisos: null } }), AnclaPerdida);
      assert.throws(() => leerAvisosDelSnapshot({ resumen: { avisos: NaN } }), AnclaPerdida);
    });

    it('con un snapshot que no es ni un objeto', () => {
      assert.throws(() => leerAvisosDelSnapshot(null), AnclaPerdida);
      assert.throws(() => leerAvisosDelSnapshot([]), AnclaPerdida);
    });

    it('la línea base sin techo no se afloja a 45 por defecto', () => {
      // El `?? 45` de antes era MÁS PERMISIVO que el techo real (42): un
      // baseline mal escrito relajaba el trinquete sin que se notara.
      assert.throws(() => leerLimiteDeLineaBase({}), AnclaPerdida);
      assert.throws(() => leerLimiteDeLineaBase({ maximo_avisos_permitidos: '42' }), AnclaPerdida);
    });

    it('evaluarTrinquete rechaza cifras que no son números', () => {
      assert.throws(() => evaluarTrinquete(undefined, 42), AnclaPerdida);
      assert.throws(() => evaluarTrinquete(39, undefined), AnclaPerdida);
    });
  });

  describe('ejecutar() contra los ficheros versionados del repo', () => {
    it('mide de verdad: compara el recuento real contra el techo real', async () => {
      const snapshot = JSON.parse(
        readFileSync(path.join(RAIZ, '.sistema', 'estado-salud.json'), 'utf8'),
      );
      const base = JSON.parse(
        readFileSync(
          path.join(RAIZ, 'scripts', 'vigilantes', 'meta-trinquete-baseline.json'),
          'utf8',
        ),
      );

      const hallazgos = await metaTrinquete.ejecutar();
      const esperados = snapshot.resumen.avisos > base.maximo_avisos_permitidos ? 1 : 0;

      assert.equal(
        hallazgos.length,
        esperados,
        `con ${snapshot.resumen.avisos} avisos y un techo de ${base.maximo_avisos_permitidos} ` +
          `se esperaban ${esperados} hallazgos`,
      );
    });
  });
});
