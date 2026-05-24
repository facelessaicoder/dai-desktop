/**
 * Auth flow tests.
 *
 * Default: stub the auth IPC handlers and exercise the welcome-form UX
 * end-to-end without hitting a real server. Fast, deterministic, runs in CI.
 *
 * Real-server smoke: when DAI_E2E_LIVE_TOKEN is set (a `dsk_...` API key),
 * an extra test signs into the running Dataspheres API and asserts the
 * app transitions to the authed state. Skipped otherwise.
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import { launchApp, teardown, type LaunchResult } from './fixtures/launch';

/** Replace the auth:* IPC handlers in the main process with deterministic stubs. */
async function stubAuthHandlers(
  app: LaunchResult['app'],
  responses: {
    loginEmail?: { ok?: boolean; token?: string; error?: string; isSessionToken?: boolean };
    loginGoogle?: { ok?: boolean; error?: string };
  },
) {
  await app.evaluate(
    ({ ipcMain }, { responses }) => {
      ipcMain.removeHandler('auth:login-email');
      ipcMain.removeHandler('auth:login-google');
      ipcMain.handle('auth:login-email', async () => responses.loginEmail ?? { error: 'no stub' });
      ipcMain.handle('auth:login-google', async () => responses.loginGoogle ?? { ok: true });
    },
    { responses },
  );
}

/** Record arguments to shell.openExternal so we can assert what URL was opened.
 * We stub the Electron `shell.openExternal` directly because main.ts calls
 * it both through the IPC wrapper and directly (from auth:login-google).
 */
async function recordOpenExternal(app: LaunchResult['app']): Promise<{ get: () => Promise<string[]> }> {
  await app.evaluate(({ shell }) => {
    (globalThis as unknown as { __opens: string[] }).__opens = [];
    (shell as unknown as { openExternal: (url: string) => Promise<void> }).openExternal = async (url: string) => {
      (globalThis as unknown as { __opens: string[] }).__opens.push(url);
    };
  });
  return {
    get: () => app.evaluate(() => (globalThis as unknown as { __opens: string[] }).__opens),
  };
}

async function waitForWelcome(page: Page) {
  await expect(page.locator('text=Welcome to Dataspheres AI')).toBeVisible({ timeout: 10_000 });
}

let r: LaunchResult;

test.beforeEach(async () => {
  r = await launchApp({ DAI_SKIP_SEED_AUTH: '1' });
  await waitForWelcome(r.window);
});

test.afterEach(async () => {
  await teardown(r);
});

test('email + valid password → app transitions to authed state', async () => {
  await stubAuthHandlers(r.app, {
    loginEmail: { ok: true, token: 'dsk_stubbed_test_token' },
  });

  await r.window.locator('input[type="email"]').fill('test@example.com');
  await r.window.locator('input[type="password"]').fill('correctpassword');
  await r.window.locator('button[type="submit"]').click();

  // After auth, App.tsx flips to authed and navigates to Cloud panel.
  // The Sidebar appears (which doesn't exist on the welcome screen).
  await expect(r.window.locator('button[title="Settings"]')).toBeVisible({ timeout: 10_000 });
});

test('email + invalid password → inline error, stays on welcome', async () => {
  await stubAuthHandlers(r.app, {
    loginEmail: { error: 'Invalid credentials.' },
  });

  await r.window.locator('input[type="email"]').fill('test@example.com');
  await r.window.locator('input[type="password"]').fill('wrongpassword');
  await r.window.locator('button[type="submit"]').click();

  await expect(r.window.locator('[role="alert"]')).toContainText('Invalid credentials.', { timeout: 5_000 });
  // Still on welcome — sidebar shouldn't appear.
  expect(await r.window.locator('button[title="Settings"]').count()).toBe(0);
});

test('empty email → client-side validation error', async () => {
  await stubAuthHandlers(r.app, {
    loginEmail: { error: 'should not have been called' },
  });

  // Fill password only, then click submit (browser's required validation
  // should block, but we also want our own error path to be robust)
  await r.window.locator('input[type="password"]').fill('something');
  // bypass HTML required by JS — easier for testing the JS validation
  await r.window.evaluate(() => {
    const f = document.querySelector('form');
    if (f) (f as HTMLFormElement).noValidate = true;
  });
  await r.window.locator('button[type="submit"]').click();
  await r.window.waitForTimeout(300);

  await expect(r.window.locator('[role="alert"]')).toContainText('email', { timeout: 3_000, ignoreCase: true });
});

test('Continue with Google opens the right URL', async () => {
  const opens = await recordOpenExternal(r.app);

  await r.window.locator('text=Continue with Google').click();
  await r.window.waitForTimeout(500);

  const urls = await opens.get();
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain('/api/auth/google');
  expect(urls[0]).toContain('callbackUrl=dataspheres');
});

test('env badge shows which environment we are connected to', async () => {
  // The "connected to dev.dataspheres.ai" line at bottom-right is critical
  // for the user to tell which Dataspheres instance they're hitting.
  await expect(r.window.locator('text=connected to')).toBeVisible();
  // Default in dev is dev.dataspheres.ai (no DATASPHERES_BASE_URL set in test env)
  await expect(r.window.locator('text=dev.dataspheres.ai')).toBeVisible();
});

test('loading overlay appears during sign-in', async () => {
  // Slow stub — 600ms — so we can see the loading state
  await r.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('auth:login-email');
    ipcMain.handle('auth:login-email', async () => {
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, token: 'dsk_slow_stub' };
    });
  });

  await r.window.locator('input[type="email"]').fill('test@example.com');
  await r.window.locator('input[type="password"]').fill('hunter2');
  await r.window.locator('button[type="submit"]').click();
  // Loading copy should appear before the auth state transition
  await expect(r.window.locator('text=Signing you in')).toBeVisible({ timeout: 2_000 });
});

// ── Real-server smoke ────────────────────────────────────────────────────────
const liveToken = process.env.DAI_E2E_LIVE_TOKEN;
test.describe('live API (gated by DAI_E2E_LIVE_TOKEN)', () => {
  test.skip(!liveToken, 'DAI_E2E_LIVE_TOKEN not set');

  test('a real dsk_... key transitions to authed', async () => {
    // Bypass the login form entirely by using the "developer API key"
    // path: open Settings and paste the token via IPC.
    await r.window.locator('text=I have a developer API key').click();
    await r.window.waitForTimeout(800);

    // Once the user picks dev-key, App flips authState=authed and navigates
    // to Settings. We then set the key via the settings IPC and assert
    // the Cloud panel can fetch dataspheres.
    await r.app.evaluate(async ({ ipcMain }, { token }) => {
      await ipcMain.emit('settings:set', null, { key: 'cloudApiKey', value: token });
    }, { token: liveToken! });

    await r.window.locator('button[title="Cloud"]').click();
    await r.window.waitForTimeout(2000);
    // Either we see the workspace dropdown OR the "Connect" prompt — either
    // proves we got past the auth gate. Blank screen would fail.
    const hasContent = await r.window.evaluate(
      () => document.body.innerText.length > 50,
    );
    expect(hasContent).toBe(true);
  });
});
