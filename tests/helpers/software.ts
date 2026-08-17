import { expect, type Page } from '@playwright/test';

// Entrada al software para los specs autenticados.
//
// Va DIRECTO a la ruta pedida. La sesion que deja tests/auth.setup.ts vive en
// el localStorage del mismo origen, asi que /app la encuentra sin repetir el
// paseo por acceso.html en cada spec. Ese paseo metia en specs que no van de
// eso dos fuentes de inestabilidad: el CDN externo de supabase-js (del que
// depende el JS de la landing) y el selector "quien eres".
//
// Todas las esperas son por CONDICION, nunca waitForTimeout: con sleeps fijos
// el resultado dependia de si la app habia pintado ya, y por eso fallaban unos
// tests u otros en cada ejecucion.
export async function entrarAlSoftware(page: Page, ruta: string = '/app'): Promise<void> {
  await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Sin sesion la app rebota a la landing. Decirlo aqui ahorra 15 s de espera
  // y un fallo confuso ("no encuentro tal texto") mas adelante.
  await page.waitForURL(/\/app/, { timeout: 20000 }).catch(() => {});
  expect(
    page.url(),
    'La app salio de /app: no hay sesion valida. Revisa tests/auth.setup.ts y playwright/.auth/user.json.',
  ).toContain('/app');

  // El menu lateral es lo primero que monta el software: con el en el arbol, la
  // app ya esta montada y autenticada. Se comprueba 'attached' y no 'visible'
  // porque en movil el menu vive en un panel deslizante fuera de pantalla.
  await expect(page.locator('[data-coach="nav-agenda"]')).toBeAttached({ timeout: 30000 });
}
