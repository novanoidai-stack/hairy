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
  use: {
    // Por defecto produccion. Para probar contra el build local:
    //   npm run build:web && node scripts/serve-web.mjs
    //   PLAYWRIGHT_BASE_URL=http://localhost:8080 npx playwright test
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.mechaa.es',
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
        // auth.setup.ts guardaba la sesion en STORAGE_STATE y nadie la cargaba:
        // los tests que necesitan estar dentro del software se ejecutaban como
        // anonimos y acababan rebotados al login.
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    },
  ],
});
