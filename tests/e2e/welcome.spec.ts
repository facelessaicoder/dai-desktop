/**
 * Welcome-screen tests — exercises the first-launch flow that gates the
 * rest of the app when no Dataspheres API key is configured.
 *
 * Uses the DAI_SKIP_SEED_AUTH=1 fixture flag so the launch helper does
 * NOT pre-seed a fake key, leaving the welcome screen visible.
 */
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { launchApp, teardown, type LaunchResult } from './fixtures/launch';

let r: LaunchResult;

test.beforeAll(async () => {
  r = await launchApp({ DAI_SKIP_SEED_AUTH: '1' });
});

test.afterAll(async () => {
  await teardown(r);
});

test('welcome screen renders the brand hero', async () => {
  await expect(r.window.locator('text=Welcome to Dataspheres AI')).toBeVisible({ timeout: 5_000 });
  await expect(r.window.locator('img[alt="Dataspheres AI"]')).toBeVisible();
});

test('welcome form exposes email + password + sign-in', async () => {
  await expect(r.window.locator('input[type="email"]')).toBeVisible();
  await expect(r.window.locator('input[type="password"]')).toBeVisible();
  await expect(r.window.locator('button[type="submit"]:has-text("Sign in")')).toBeVisible();
});

test('Continue with Google is offered as an alternative', async () => {
  await expect(r.window.locator('text=Continue with Google')).toBeVisible();
});

test('sidebar is hidden until the user is signed in', async () => {
  expect(await r.window.locator('button[title="Chat"]').count()).toBe(0);
  expect(await r.window.locator('button[title="Settings"]').count()).toBe(0);
});

test('"developer key" link reveals the Settings panel', async () => {
  await r.window.locator('text=I have a developer API key').click();
  await r.window.waitForTimeout(800);
  await expect(r.window.locator('button[title="Settings"]')).toBeVisible({ timeout: 5_000 });
});

test('captures welcome screen for visual baseline', async () => {
  await teardown(r);
  r = await launchApp({ DAI_SKIP_SEED_AUTH: '1' });
  await r.window.waitForTimeout(1200);
  await r.window.screenshot({ path: path.join(__dirname, 'screenshots', 'welcome.png') });
});
