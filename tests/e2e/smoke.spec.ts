/**
 * Smoke tests — the app launches, identifies itself correctly, and renders.
 *
 * If any of these fail, every other test will fail too — fix smoke first.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { launchApp, teardown, type LaunchResult } from './fixtures/launch';

let r: LaunchResult;

test.beforeAll(async () => {
  r = await launchApp();
});

test.afterAll(async () => {
  await teardown(r);
});

test('app launches without crashing', async () => {
  expect(r.app).toBeTruthy();
  expect(r.window).toBeTruthy();
});

test('main process reports correct app name', async () => {
  const name = await r.app.evaluate(({ app }) => app.getName());
  expect(name).toBe('Dataspheres AI');
});

test('window title is set correctly', async () => {
  const title = await r.window.title();
  expect(title).toBe('Dataspheres AI');
});

test('renderer root is hydrated by React', async () => {
  // The React app should render a non-empty #root within a few seconds
  const rootHasChildren = await r.window.evaluate(() => {
    const el = document.getElementById('root');
    return !!el && el.children.length > 0;
  });
  expect(rootHasChildren).toBe(true);
});

test('hardware:info IPC handler responds (proves dai-core loaded)', async () => {
  // ipcMain.handle() doesn't show up in eventNames(); instead we invoke a
  // known handler from the renderer and check the round-trip works. If
  // dai-core failed to load (native ABI mismatch etc.) `hardware:info` would
  // not be registered and the invoke would reject.
  const result = await r.window.evaluate(async () => {
    // @ts-expect-error - window.dai is injected by preload.ts
    return await window.dai.hardware.info();
  });
  expect(result).toBeTruthy();
  expect(result.ok).toBe(true);
  expect(result.data).toBeTruthy();
});

test('captures a screenshot of the default panel', async () => {
  // Default panel is ChatPanel — useful as a visual baseline.
  const out = path.join(__dirname, 'screenshots', 'smoke-default-panel.png');
  await r.window.screenshot({ path: out, fullPage: false });
  // Just confirm the screenshot file is non-trivial in size (real render, not blank)
  const fs = await import('fs');
  expect(fs.statSync(out).size).toBeGreaterThan(5_000);
});
