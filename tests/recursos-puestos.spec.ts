import { test, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';
import { entrarAlSoftware } from './helpers/software';

// Puestos fisicos del salon (lavacabezas, cabinas, sillones).
//
// Lo que se comprueba aqui es lo que no se puede probar sin base de datos:
//   - la pestaña existe y carga sin reventar contra la tabla nueva;
//   - las RPC de capacidad y hueco responden con la sesion del salon
//     (son SECURITY DEFINER y sacan el negocio del perfil, no de un parametro);
//   - sin puestos dados de alta, recurso_hay_hueco dice que SI cabe. Esa es la
//     regla que impide que esto deje a un salon sin poder reservar.
//
// La aritmetica de solapes esta en lib/recursos.test.ts, sin navegador.

test.use({ storageState: STORAGE_STATE });

test('la pestaña de Puestos carga y la tabla responde', async ({ page }) => {
  test.setTimeout(90000);

  await entrarAlSoftware(page, '/app/configuracion');
  await page.getByText('Puestos', { exact: true }).first().click();

  await expect(page.getByText('Puestos del salón')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Añadir un puesto')).toBeVisible();

  // Un salon sin puestos lo dice con todas las letras.
  await expect(
    page.getByText(/no has dado de alta ningún puesto/i),
  ).toBeVisible({ timeout: 15000 });
});

test('sin puestos configurados el servidor sigue diciendo que cabe', async ({ page }) => {
  test.setTimeout(90000);
  await entrarAlSoftware(page, '/app/configuracion');

  const res = await page.evaluate(async () => {
    // La app expone su cliente ya autenticado; si no, se compone a mano con la
    // sesion del localStorage.
    const url = 'https://vtrggiogjrhqtwbhbgia.supabase.co';
    // La clave publica (publishable) va en la cabecera apikey y el token del
    // usuario en Authorization. Con el token en las dos, PostgREST responde 401.
    const ANON =
      'sb_publishable_7cHF-908rCrGKTaFoYZ4Wg__Znc3kLR';
    const clave = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const token = clave ? JSON.parse(localStorage.getItem(clave) as string)?.access_token : null;
    if (!token) return { error: 'sin sesion' };

    const llamar = async (fn: string, body: Record<string, unknown>) => {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, valor: await r.json() };
    };

    const capacidad = await llamar('recursos_capacidad', { p_tipo: 'lavacabezas' });
    const hueco = await llamar('recurso_hay_hueco', {
      p_tipo: 'lavacabezas',
      p_desde: '2026-09-01T10:00:00Z',
      p_hasta: '2026-09-01T11:00:00Z',
    });
    return { capacidad, hueco };
  });

  expect(res.error, 'El test necesita sesion viva').toBeUndefined();
  expect(res.capacidad?.status, 'recursos_capacidad no respondio 200').toBe(200);
  expect(res.hueco?.status, 'recurso_hay_hueco no respondio 200').toBe(200);
  // Cero puestos configurados no puede significar "no cabe nadie".
  expect(res.capacidad?.valor).toBe(0);
  expect(res.hueco?.valor).toBe(true);
});
