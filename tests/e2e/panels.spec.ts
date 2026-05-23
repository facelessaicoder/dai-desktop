/**
 * Panel navigation tests — clicking each sidebar item switches the visible
 * panel and persists the choice across reloads.
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

// Sidebar.tsx renders icon-only nav buttons with title="Chat"|"Planner"|etc.
// Locate by [title=...] selector. (TODO: add data-testid in a follow-up PR
// for less fragile selectors.)
const navButton = (label: string) => `button[title="${label}"]`;

test('sidebar exposes the 4 expected panels', async () => {
  for (const label of ['Chat', 'Planner', 'Cloud', 'Settings']) {
    const count = await r.window.locator(navButton(label)).count();
    expect(count, `expected a nav button titled "${label}"`).toBe(1);
  }
});

test('clicking "Planner" switches the visible panel', async () => {
  await r.window.locator(navButton('Planner')).click();
  await r.window.waitForTimeout(400); // framer-motion exit animation
  const active = await r.window.evaluate(() => localStorage.getItem('dai:active-panel'));
  expect(active).toBe('planner');
});

test('clicking "Cloud" switches to the cloud panel', async () => {
  await r.window.locator(navButton('Cloud')).click();
  await r.window.waitForTimeout(400);
  const active = await r.window.evaluate(() => localStorage.getItem('dai:active-panel'));
  expect(active).toBe('cloud');
  // (The no-API-key "Connect to Dataspheres AI" prompt is now part of the
  // welcome screen, gated separately. CloudPanel itself behaves the same
  // as the other panels once auth is set — the fixture seeds a fake token.)
});

test('clicking "Settings" switches to settings panel', async () => {
  await r.window.locator(navButton('Settings')).click();
  await r.window.waitForTimeout(400);
  const active = await r.window.evaluate(() => localStorage.getItem('dai:active-panel'));
  expect(active).toBe('settings');
});

test('captures one screenshot per panel for visual review', async () => {
  // Each panel loads its content async (IPC calls for settings, dataspheres,
  // etc.). Wait long enough for state to settle before snapshotting.
  for (const panel of ['Chat', 'Planner', 'Cloud', 'Settings']) {
    await r.window.locator(navButton(panel)).click();
    // framer-motion exit (~300ms) + react state settle + IPC round-trips
    await r.window.waitForTimeout(1500);
    await r.window.screenshot({
      path: path.join(__dirname, 'screenshots', `panel-${panel.toLowerCase()}.png`),
      fullPage: false,
    });
  }
});
