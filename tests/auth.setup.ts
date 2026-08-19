import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

// Donde guarda supabase-js la sesion en acceso.html (misma clave que luego lee
// la app en /app, por eso el salto landing -> software conserva el login).
const CLAVE_SESION = 'sb-vtrggiogjrhqtwbhbgia-auth-token';

setup('authenticate', async ({ page }) => {
  setup.setTimeout(90000);

  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  console.log('Navigating to /acceso.html...');
  await page.goto('/acceso.html', { waitUntil: 'domcontentloaded', timeout: 20000 });

  // acceso.html no es interactivo hasta que ha corrido su JS, y ese JS espera
  // al UMD de supabase-js, que viene de un CDN EXTERNO (jsdelivr). Hasta que no
  // esta, #loginBtn es un boton sin listener dentro de <form onsubmit="return
  // false">: pulsarlo no hace absolutamente nada y el login se pierde en
  // silencio. Por eso aqui se espera a la senal real de "pagina lista":
  //   1) window.MechaAPI existe  -> el UMD y assets/auth.js ya cargaron;
  //   2) el panel de login es visible -> MechaInitForms ya ha corrido.
  // (Antes se navegaba con waitUntil:'commit', se esperaba solo a que el input
  // estuviese 'attached' -y esta en el HTML estatico, o sea, al instante- y si
  // no se veia se FORZABA el panel con classList.add('on'), justo la senal que
  // habia que respetar. Con el CDN lento se tecleaba y se pulsaba antes de que
  // hubiera con que atender el click.)
  await page.waitForFunction(() => !!(window as any).MechaAPI, null, { timeout: 30000 });

  const tabLogin = page.locator('#tabLogin');
  if (await tabLogin.isVisible().catch(() => false)) {
    await tabLogin.click({ force: true }).catch(() => {});
  }

  const emailInput = page.locator('input#loginEmail');
  const pwInput = page.locator('input#loginPw');
  const loginBtn = page.locator('button#loginBtn');

  await expect(emailInput).toBeVisible({ timeout: 30000 });
  await expect(loginBtn).toBeEnabled({ timeout: 10000 });

  await emailInput.fill('carlitosocanamartinez@gmail.com');
  await pwInput.fill('minicharlie2007');

  console.log('Submitting login credentials...');
  await loginBtn.click();

  // La sesion guardada es el unico indicador fiable de que el login ocurrio.
  // Si esto no llega, el resto del run no tiene sentido: mejor reventar aqui
  // que guardar un estado vacio y ver fallar specs sueltos al azar despues.
  await page
    .waitForFunction((k) => !!window.localStorage.getItem(k), CLAVE_SESION, { timeout: 25000 })
    .catch(() => {
      throw new Error(
        'El login no dejo sesion en localStorage. Revisa credenciales, el CDN de ' +
          'supabase-js en acceso.html o el mensaje de error del formulario.',
      );
    });

  // Cuenta de equipo: acceso.html ofrece el selector de destino.
  const chAppBtn = page.locator('button#chApp, button:has-text("Entrar al software")').first();
  try {
    await chAppBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Chooser button #chApp detected, clicking to enter software...');
    await chAppBtn.click();
  } catch {
    console.log('Chooser button skipped or already navigating to /app');
  }

  try {
    await page.waitForURL(/\/app/, { timeout: 20000 });
    console.log('Successfully navigated to /app');
  } catch {
    console.log('Final URL after auth phase:', page.url());
  }

  // El asistente de puesta en marcha (Chispa) se abre SOLO la primera vez por
  // navegador y su drawer tapa la pantalla entera: si le toca abrirse en mitad
  // de otro spec, se come el click que ese spec estaba dando. Aqui se le deja
  // salir y se cierra, de modo que la marca "ya ofrecido"
  // (mecha-chispa-onboarding-auto:<negocio>) viaja siempre en el storageState.
  // Que aparezca o no depende de la cuenta, no del reloj; si en 15 s no sale es
  // que a esta cuenta no se le ofrece, y tampoco saldra en los specs.
  const drawer = page.locator('.chispa-drawer');
  const salioChispa = await drawer
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (salioChispa) {
    console.log('Chispa onboarding drawer shown; closing it so specs start clean.');
    await page.getByRole('button', { name: 'Cerrar Chispa' }).click().catch(() => {});
    await drawer.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  await page.context().storageState({ path: authFile });

  // Red de seguridad: nunca dejar en disco un estado sin sesion. Un user.json
  // vacio hace que TODOS los specs autenticados corran como anonimos y fallen
  // de forma erratica (solo los que tienen asserts duros), que es justo el
  // sintoma que costo un dia entero de diagnostico.
  const guardado = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const tieneSesion = (guardado.origins || []).some((o: { localStorage?: { name: string }[] }) =>
    (o.localStorage || []).some((it) => it.name === CLAVE_SESION),
  );
  expect(tieneSesion, `El storageState guardado no contiene ${CLAVE_SESION}`).toBe(true);

  console.log('Saved storageState to user.json');
});
