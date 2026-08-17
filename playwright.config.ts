import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, 'playwright/.auth/user.json');

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
      name: 'chromium',
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
