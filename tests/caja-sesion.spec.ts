import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware } from './helpers/software';

// Sesion de caja: apertura, arqueo ciego y cierre con Informe Z.
//
// Este spec toca datos de verdad (abre y cierra una caja), asi que hace las dos
// cosas siempre: si dejara una caja abierta, el salon se encontraria por la
// mañana con una sesion fantasma del dia anterior.
//
// Lo que vigila:
//   - el panel aparece en la pantalla de Caja;
//   - caja_sesion_abierta NO devuelve el teorico mientras esta abierta. Ese es
//     el arqueo ciego, y es lo unico que hace que contar sirva de algo;
//   - cerrar devuelve el descuadre correcto y un numero de Z.
//
// La aritmetica del conteo esta en lib/caja/sesionCaja.test.ts, sin navegador.

test.use({ storageState: STORAGE_STATE });

const URL_API = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
const ANON =
  'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';

test('la caja se abre, no canta el teorico, y al cerrar da el Z', async ({ page }) => {
  test.setTimeout(120000);

  await entrarAlSoftware(page, '/app/caja');
  await expect(page.locator('body')).toContainText(/caja/i, { timeout: 30000 });

  const res = await page.evaluate(async ({ url, anon }) => {
    const clave = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = clave ? JSON.parse(localStorage.getItem(clave) as string)?.access_token : null;
    if (!token) return { error: 'sin sesion' };

    const rpc = async (fn: string, body: Record<string, unknown> = {}) => {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return r.json();
    };

    // Si el salon tuviera una caja abierta de antes, este test no debe tocarla.
    const previa = await rpc('caja_sesion_abierta');
    if (previa?.abierta) return { yaHabiaCaja: true, previa };

    const apertura = await rpc('abrir_caja', { p_fondo_inicial_cents: 15000 });
    const abierta = await rpc('caja_sesion_abierta');
    // 150 de cambio, nada cobrado: al contar 150 tiene que cuadrar.
    const cierre = await rpc('cerrar_caja', {
      p_contado_efectivo_cents: 15000,
      p_contado_datafono_cents: null,
      p_notas: 'Prueba automatica',
    });
    const informe = cierre?.sesion_id ? await rpc('informe_z', { p_sesion_id: cierre.sesion_id }) : null;
    const despues = await rpc('caja_sesion_abierta');

    return { apertura, abierta, cierre, informe, despues };
  }, { url: URL_API, anon: ANON });

  expect(res.error).toBeUndefined();
  test.skip(!!res.yaHabiaCaja, 'El salon tenia una caja abierta: no se toca.');

  expect(res.apertura?.ok, 'No se pudo abrir la caja').toBe(true);

  // ── Lo importante: con la caja abierta no hay forma de saber cuanto deberia
  //    haber. Si algun dia se añade, el arqueo deja de ser ciego.
  expect(res.abierta?.abierta).toBe(true);
  const clavesMientrasAbierta = Object.keys(res.abierta ?? {});
  expect(clavesMientrasAbierta).not.toContain('teorico_efectivo_cents');
  expect(clavesMientrasAbierta).not.toContain('descuadre_cents');

  // ── El cierre sí lo dice, y cuadra.
  expect(res.cierre?.ok).toBe(true);
  expect(res.cierre?.descuadre_cents).toBe(0);
  expect(res.cierre?.teorico_efectivo_cents).toBe(15000);
  expect(typeof res.cierre?.numero_z).toBe('number');

  expect(res.informe?.ok).toBe(true);
  expect(res.informe?.estado).toBe('cerrada');

  // ── Y no queda ninguna caja abierta detras.
  expect(res.despues?.abierta).toBe(false);
});
