import { defineConfig, devices } from '@playwright/test';

const ci = !!process.env.CI;
// Local runs can use a free port (a worktree beside the owner's :5173 server) and the installed
// Chrome instead of downloaded browsers: E2E_PORT=5180 PW_CHANNEL=chrome npx playwright test.
const port = Number(process.env.E2E_PORT ?? 5173);
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Three browsers plus the dev server saturate a dev machine; more workers cause boot timeouts.
  workers: 2,
  // CI keeps an HTML report (uploaded as an artifact on failure) next to the console list.
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(port)}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${String(port)} --strictPort`,
    url: `http://localhost:${String(port)}`,
    reuseExistingServer: !ci,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
