import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Credenciales de la cuenta de pruebas (E2E_EMAIL / E2E_PASSWORD) desde .env.
// Se usa loadEnvFile de Node (>=20.12), asi no hace falta añadir dotenv.
// En CI no hay .env: las variables llegan como secrets, ya en process.env.
const ficheroEnv = path.join(__dirname, '.env');
if (fs.existsSync(ficheroEnv)) process.loadEnvFile(ficheroEnv);

export const STORAGE_STATE = path.join(__dirname, 'playwright/.auth/user.json');

// Specs que corren SIN credenciales. Si añades uno que solo mira paginas
// publicas o la demo compartida, ponlo aqui: asi lo ejecuta la CI en cada PR
// sin depender de secrets.
const SPECS_PUBLICOS = [
  '**/landing.spec.ts',
  '**/marketplace.spec.ts',
  '**/portal-reserva.spec.ts',
  '**/agenda-demo.spec.ts',
];

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  webServer: {
    command: 'node scripts/serve-web.mjs',
    url: 'http://127.0.0.1:8080',
    reuseExistingServer: true,
    timeout: 30000,
  },
  use: {
    // Por defecto servidor local rapido y determinista. Para probar contra produccion:
    //   PLAYWRIGHT_BASE_URL=https://www.mechaa.es npx playwright test
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080',
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      // Specs que NO necesitan credenciales: paginas publicas y todo lo que se
      // verifica sobre la demo compartida (que entra sola con la cuenta publica
      // demo.publico, ver lib/supabase.ts). Va en un proyecto aparte, SIN
      // dependencia de 'setup', para que la CI pueda ejecutarlos aunque el
      // repositorio todavia no tenga los secrets E2E_EMAIL / E2E_PASSWORD.
      name: 'publico',
      testMatch: SPECS_PUBLICOS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testIgnore: SPECS_PUBLICOS,
      use: {
        ...devices['Desktop Chrome'],
        // NO se pone storageState aqui a proposito: la mayoria de specs son de
        // paginas publicas (landing, marketplace, portal) y con sesion viva el
        // nav cambia de CTA y fallan. Los specs que necesitan estar DENTRO del
        // software declaran su propia sesion con
        //   test.use({ storageState: STORAGE_STATE })
        // (ver tests/agenda-jornada.spec.ts, tests/staff-jornada.spec.ts).
      },
      dependencies: ['setup'],
    },
  ],
});
