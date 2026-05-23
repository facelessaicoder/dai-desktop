import { defineConfig } from '@playwright/test';

/**
 * Playwright config for end-to-end Electron tests.
 *
 * These tests launch the built Electron app (dist/main.js + dist/renderer/) in
 * production-mode (no Vite dev server) and exercise the renderer DOM + main
 * process. Runs headless by default; pass HEADED=1 to watch.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Electron tests can't run in parallel — multiple Electron instances clobber
  // each other's userData dirs and IPC ports.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/e2e-report.json' }],
    ['html', { outputFolder: 'test-results/html', open: 'never' }],
  ],
  use: {
    // Screenshot every failed test
    screenshot: 'only-on-failure',
    // Capture trace on first retry — gives a full DOM snapshot per step
    trace: 'on-first-retry',
  },
});
