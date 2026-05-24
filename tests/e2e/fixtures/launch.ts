/**
 * Shared Electron launch fixture.
 *
 * Each test that imports `launchApp` gets a fresh Electron instance with its
 * own userData directory (so settings.json / sqlite don't bleed across tests).
 * The fixture cleans up the userData dir after the app closes.
 */
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface LaunchResult {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export async function launchApp(envOverrides: Record<string, string> = {}): Promise<LaunchResult> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-e2e-'));

  // Pre-seed a fake API key so the welcome screen doesn't gate the app.
  // Most tests want to interact with the full UI (Sidebar, panels, etc.) —
  // welcome-screen-specific tests can opt out via envOverrides.DAI_SKIP_SEED_AUTH=1
  // and then exercise the welcome screen separately.
  if (envOverrides.DAI_SKIP_SEED_AUTH !== '1') {
    const settingsPath = path.join(userDataDir, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ cloudApiKey: 'e2e-test-token-not-real' }, null, 2),
      'utf-8',
    );
  }

  const app = await electron.launch({
    args: [path.join(REPO_ROOT, 'dist', 'main.js')],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      // Force production-mode renderer (loadFile, not Vite dev server)
      NODE_ENV: 'production',
      // Isolate this run's state from the user's real Application Support data
      ELECTRON_USER_DATA: userDataDir,
      // Disable auto-update during tests — we don't want network checks
      DAI_DISABLE_AUTO_UPDATE: '1',
      ...envOverrides,
    },
  });

  // Pipe renderer console output to the test runner so failures are debuggable
  app.on('window', (win) => {
    win.on('console', (msg) => {
      const t = msg.type();
      if (t === 'error' || t === 'warning') {
        // eslint-disable-next-line no-console
        console.log(`[renderer:${t}] ${msg.text()}`);
      }
    });
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { app, window, userDataDir };
}

export async function teardown(result: LaunchResult): Promise<void> {
  try {
    await result.app.close();
  } catch {
    /* already closed */
  }
  try {
    fs.rmSync(result.userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
