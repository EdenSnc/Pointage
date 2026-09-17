import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Pointage Surface
 * Tests critical warehouse user flows on Vite dev server
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 35000,
  expect: {
    timeout: 7000,
  },
  fullyParallel: false, // Run flows cleanly to avoid DB locks
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker prevents Dexie DB collision in tests
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
