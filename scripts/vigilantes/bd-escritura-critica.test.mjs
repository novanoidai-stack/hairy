// Tests de la pata de usuario del vigilante de escritura critica. Validan la
// logica pura (evaluarPataUsuario), sin tocar la red. El recorrido real se
// prueba en vivo cada vez que corre `npm run vigilar`.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluarPataUsuario } from './bd-escritura-critica.mjs';

const PERFIL = { negocio_id: 'salon_pruebas_mecha' };

describe('evaluarPataUsuario', () => {
  it('dice en voz alta que no puede mirar si faltan las credenciales E2E', () => {
    const v = evaluarPataUsuario({ login: { falta: true } });
    assert.equal(v.clave, 'escritura-critica/sin-usuario-e2e');
    assert.equal(v.nivel, 'aviso');
  });

  it('un login fallido es aviso (infra), no bloqueante', () => {
    const v = evaluarPataUsuario({ login: { ok: false, status: 500 } });
    assert.equal(v.clave, 'escritura-critica/login-e2e');
    assert.equal(v.nivel, 'aviso');
  });

  it('perfil sin negocio_id y negocio sin citas son avisos', () => {
    assert.equal(
      evaluarPataUsuario({ login: { ok: true }, perfil: null }).clave,
      'escritura-critica/perfil-e2e-sin-negocio',
    );
    assert.equal(
      evaluarPataUsuario({ login: { ok: true }, perfil: PERFIL, citas: { total: 0 } }).clave,
      'escritura-critica/sin-citas-prueba',
    );
  });

  it('el caso del 8 sep: 403/42501 de una funcion del sello es BLOQUEANTE', () => {
    const v = evaluarPataUsuario({
      login: { ok: true },
      perfil: PERFIL,
      citas: { total: 1 },
      update: {
        status: 403,
        mensaje:
          '{"code":"42501","message":"permission denied for function ventanas_activas_cita"}',
      },
    });
    assert.equal(v.clave, 'escritura-critica/escritura-usuario-citas');
    assert.equal(v.nivel, 'bloqueante');
    assert.match(v.titulo, /ventanas_activas_cita/);
  });

  it('cualquier otro fallo del PATCH tambien es bloqueante', () => {
    const v = evaluarPataUsuario({
      login: { ok: true },
      perfil: PERFIL,
      citas: { total: 1 },
      update: { status: 500, mensaje: '' },
    });
    assert.equal(v.nivel, 'bloqueante');
  });

  it('con piezas completas y sin veredicto que dar (todo bien) devuelve null', () => {
    const v = evaluarPataUsuario({
      login: { ok: true },
      perfil: PERFIL,
      citas: { total: 1 },
      update: { status: 204, mensaje: '' },
    });
    assert.equal(v, null);
  });
});
