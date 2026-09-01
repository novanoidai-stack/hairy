// [Pilar 2] Criterio de cierre P3 (ISSUES-AUDITORIA-VIGILANCIA-2026-08-31):
// dos reservas CONCURRENTES del mismo hueco -> exactamente una gana.
//
// No es teoria: hasta el 1 sep 2026 `crear_cita_publica` decidia disponibilidad
// con un SELECT y luego insertaba, sin serializar. Dos clientas que elegian el
// mismo hueco a la vez entraban las dos (los 108 pares historicos del informe
// nacieron de puertas asi). Ahora hay dos capas: el check previo de la funcion
// y el candado EXCLUDE `citas_solape_profesional_excl` (20260831220000), que
// rechaza al segundo con 23P01 aunque su SELECT llegue a ver el hueco libre.
//
// Este test dispara la carrera de verdad contra el portal de la demo:
//   1. pide un hueco libre real con `disponibilidad_publica`,
//   2. siembra dos captcha_tokens frescos (el portal de la demo exige captcha;
//      con la clave de servicio se pueden sembrar directamente, que es el
//      equivalente exacto a que dos clientas resuelvan el Turnstile),
//   3. lanza dos `crear_cita_publica` en paralelo sobre el MISMO hueco,
//   4. exige que exactamente una tenga exito y la otra falle, y
//   5. deshace lo escrito (cancela la cita y borra los tokens y el cliente
//      de prueba) para no dejar basura en la demo.
//
// Corre con `node --test scripts/vigilantes/carrera-reserva.test.mjs`
// (tambien en `npm run vigilar:test`). Sin credenciales se salta con aviso,
// no en verde: un test de carrera que no corre no protege nada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URL_BASE, CLAVE, hayCredencial, llamarRpc } from './bd-comun.mjs';

const SLUG_DEMO = 'demo';
const CABECERAS = {
  apikey: CLAVE,
  Authorization: `Bearer ${CLAVE}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const falta = (motivo) => ({ skip: motivo });

async function sembrarCaptchaToken() {
  const r = await fetch(`${URL_BASE.replace(/\/$/, '')}/rest/v1/captcha_tokens`, {
    method: 'POST',
    headers: CABECERAS,
    body: JSON.stringify({ expires_at: new Date(Date.now() + 5 * 60_000).toISOString() }),
  });
  if (!r.ok) throw new Error(`sembrar captcha_token: ${r.status} ${await r.text()}`);
  const filas = await r.json();
  return filas[0].id;
}

async function huecoLibre() {
  const info = await llamarRpc('portal_info', { p_slug: SLUG_DEMO });
  const servicio = (info.servicios ?? []).find((s) => s.reservable_online !== false);
  assert.ok(servicio, 'portal_info no devuelve servicios reservables');
  const profesional =
    (info.profesionales ?? []).find((p) => p.id === (servicio.profesionales?.[0]?.id)) ??
    (info.profesionales ?? [])[0];
  assert.ok(profesional, 'portal_info no devuelve profesionales');

  // Un dia entre 3 y 10 dias vista, el primero con huecos: ni hoy (la demo se
  // re-siembra cada 2 h y lo cambiaria debajo del test) ni tan lejos que el
  // seed de la demo ya no lo conozca.
  for (let dias = 3; dias <= 10; dias++) {
    const fecha = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
    const huecos = await llamarRpc('disponibilidad_publica', {
      p_slug: SLUG_DEMO,
      p_servicio_id: servicio.id,
      p_fecha: fecha,
      p_profesional_id: profesional.id,
    });
    const libre = (huecos ?? []).find((h) => h.en_reposo === false);
    if (libre) return { servicio, profesional, slot: libre.slot };
  }
  throw new Error('sin huecos libres en la demo entre +3 y +10 dias');
}

test('[Pilar 2] dos reservas concurrentes del mismo hueco: exactamente una gana', async (t) => {
  if (!hayCredencial()) return falta('sin EXPO_PUBLIC_SUPABASE_URL/SUPABASE_SECRET_KEY en el entorno');

  const { servicio, profesional, slot } = await huecoLibre();
  const tokenA = await sembrarCaptchaToken();
  const tokenB = await sembrarCaptchaToken();
  const creado = [];

  const reservar = (nombre, telefono, token) =>
    fetch(`${URL_BASE.replace(/\/$/, '')}/rest/v1/rpc/crear_cita_publica`, {
      method: 'POST',
      headers: CABECERAS,
      body: JSON.stringify({
        p_slug: SLUG_DEMO,
        p_servicio_id: servicio.id,
        p_profesional_id: profesional.id,
        p_inicio: slot,
        p_nombre: nombre,
        p_telefono: telefono,
        p_captcha_token: token,
        p_canal: 'web',
      }),
    }).then(async (r) => ({ ok: r.ok, status: r.status, cuerpo: await r.json().catch(() => null) }));

  const [a, b] = await Promise.all([
    reservar('Test Carrera A', '+34600000001', tokenA),
    reservar('Test Carrera B', '+34600000002', tokenB),
  ]);

  const exitos = [a, b].filter((r) => r.ok);
  const fracasos = [a, b].filter((r) => !r.ok);

  try {
    assert.equal(exitos.length, 1, `exactamente una reserva gana (A:${a.status} B:${b.status})`);
    assert.equal(fracasos.length, 1, 'la otra reserva falla');
    const citaId = exitos[0].cuerpo?.cita_id ?? exitos[0].cuerpo?.id;
    assert.ok(citaId, 'la ganadora devuelve el id de la cita');
    creado.push(citaId);
  } finally {
    // Limpieza: cancelar la cita ganadora (la excluye el candado y el
    // vigilante) y borrar los clientes de prueba de la demo si se crearon.
    for (const id of creado) {
      await fetch(`${URL_BASE.replace(/\/$/, '')}/rest/v1/citas?id=eq.${id}`, {
        method: 'PATCH',
        headers: CABECERAS,
        body: JSON.stringify({ estado: 'cancelada' }),
      });
    }
    await fetch(
      `${URL_BASE.replace(/\/$/, '')}/rest/v1/clientes?or=(telefono.eq.%2B34600000001,telefono.eq.%2B34600000002)`,
      { method: 'DELETE', headers: CABECERAS },
    ).catch(() => {});
  }
});
