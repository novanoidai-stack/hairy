import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware } from './helpers/software';

// Inventario en gramos y coste por unidad.
//
// Lo que vigila este spec es que la pantalla siga en pie despues de meterle a
// productos tres columnas nuevas y de recrear la vista productos_con_stock, y
// que el inventario que llega del servidor traiga ya la medida.
//
// La aritmetica del escandallo (coste por gramo, envases cerrados, margen) esta
// probada sin navegador en lib/inventario/escandallo.test.ts.

test.use({ storageState: STORAGE_STATE });

test('el inventario carga y trae la medida de cada producto', async ({ page }) => {
  test.setTimeout(90000);

  await entrarAlSoftware(page, '/app/inventario');
  // Que la pantalla monte sin reventar. Se mira el texto del documento y no un
  // elemento concreto: el menu lateral tiene otro "Inventario" escondido y el
  // primero que encuentra el localizador es ese, que nunca esta visible.
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  await expect(page.locator('body')).toContainText(/inventario/i, { timeout: 30000 });

  const res = await page.evaluate(async () => {
    const url = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
    const ANON =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0cmdnaW9nanJocXR3YmhiZ2lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTcyOTUsImV4cCI6MjA5MjMzMzI5NX0.bghNzAZ-urn9nnp8TVlqF4Ckw5MZD7Ut2bh7Z-4efW8';
    const clave = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = clave ? JSON.parse(localStorage.getItem(clave) as string)?.access_token : null;
    if (!token) return { error: 'sin sesion' };

    const r = await fetch(`${url}/rest/v1/rpc/obtener_inventario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_solo_activos: true }),
    });
    return { status: r.status, cuerpo: await r.json() };
  });

  expect(errores, 'La pantalla de inventario lanzo un error').toEqual([]);
  expect(res.error).toBeUndefined();
  expect(res.status).toBe(200);
  expect(res.cuerpo?.ok).toBe(true);

  const productos = res.cuerpo?.productos ?? [];
  expect(Array.isArray(productos)).toBe(true);

  if (productos.length > 0) {
    // Las claves nuevas tienen que venir aunque el salon no haya tarifado nada:
    // si faltan, la pantalla no puede distinguir gramos de unidades.
    const p = productos[0];
    expect(Object.keys(p)).toEqual(expect.arrayContaining([
      'unidad_medida', 'capacidad_envase', 'coste_envase_cents',
      'envases_cerrados', 'resto_abierto', 'coste_unidad_micros',
    ]));
    // Lo que no se ha tocado sigue midiendose en unidades.
    expect(['unidades', 'gramos', 'mililitros']).toContain(p.unidad_medida);
  }
});
