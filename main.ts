import { app, BrowserWindow, dialog, ipcMain, nativeImage, safeStorage, session, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { autoUpdater } from 'electron-updater';

// Suppress Electron's dev-mode CSP / insecure-resource warnings. They auto-
// disappear in packaged builds; in dev they're noisy and known. Set BEFORE
// any window is created.
if (process.env.NODE_ENV === 'development') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

// ── Branding ─────────────────────────────────────────────────────────────────
// Override Electron's default "Electron" name in the menu bar, About panel, and
// userData path. Must be called BEFORE app.whenReady() / any app.* path call.
app.setName('Dataspheres AI');

// ── Test isolation ───────────────────────────────────────────────────────────
// Allow e2e tests to redirect userData (settings.json, sqlite, etc.) to a
// temp dir per run, preventing test runs from clobbering the user's real
// Application Support data. Honored only when set — has no effect in normal
// app usage.
if (process.env.ELECTRON_USER_DATA) {
  try {
    app.setPath('userData', process.env.ELECTRON_USER_DATA);
  } catch (err) {
    console.warn('[main] Could not override userData path:', err);
  }
}

// ── Custom URL scheme ────────────────────────────────────────────────────────
// Registers `dataspheres://` so the OS hands clicks on those links to this
// app. Used by the future OAuth / magic-link auth flow:
//   1. App opens https://dataspheres.ai/auth/desktop?return=dataspheres://auth
//   2. User signs in via browser
//   3. Site redirects to dataspheres://auth?token=...
//   4. OS launches (or focuses) this app with the URL
//   5. We capture the token and pass it to the renderer
//
// On macOS the redirect arrives via `open-url`. On Windows/Linux it arrives
// as the last argv on relaunch — we use `second-instance` to forward it
// to the running window.
const PROTOCOL = 'dataspheres';
if (process.defaultApp) {
  // Dev: argv has node + script, the URL is process.argv[2]
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Forward incoming URLs to the renderer once a window exists.
let pendingDeepLink: string | null = null;
function deliverDeepLink(url: string): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('deep-link', url);
    if (win.isMinimized()) win.restore();
    win.focus();
  } else {
    // No window yet — stash until createWindow's ready-to-show fires
    pendingDeepLink = url;
  }
}

// macOS — `open-url` fires when the OS hands a dataspheres:// URL to us
app.on('open-url', (event, url) => {
  event.preventDefault();
  deliverDeepLink(url);
});

// Windows/Linux — the URL comes as argv on second-instance launch
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) deliverDeepLink(url);
  });
}



// Icon resolution — resolved relative to the compiled main.js in /dist.
// Prefer the squircle PNG (transparent corners, proper macOS shape); fall back
// to the source JPG so the app still has an icon on machines where the
// generated PNG isn't present.
const ICON_PNG = path.join(__dirname, '..', 'assets', 'icon.png');
const ICON_JPG = path.join(__dirname, '..', 'assets', 'icon.jpg');
const ICON_PATH = fs.existsSync(ICON_PNG) ? ICON_PNG : ICON_JPG;

// ── Auto-update ──────────────────────────────────────────────────────────────
// electron-updater checks GitHub Releases for a newer version, downloads it
// in the background, then prompts the user (via IPC → renderer toast) to
// restart and install. Configured in package.json under "build.publish".
//
// Behaviour summary:
//   1. Silent check on startup (skipped in dev)
//   2. If a newer version is available: notify renderer
//   3. Download in background, again notify when ready
//   4. User clicks "Restart to update" → autoUpdater.quitAndInstall()
//
// Set DAI_DISABLE_AUTO_UPDATE=1 to skip the check (useful for QA builds).
function configureAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (process.env.NODE_ENV === 'development' || process.env.DAI_DISABLE_AUTO_UPDATE === '1') {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const send = (channel: string, payload?: unknown) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  autoUpdater.on('checking-for-update', () => send('update:checking'));
  autoUpdater.on('update-available', (info) =>
    send('update:available', { version: info.version, releaseNotes: info.releaseNotes }),
  );
  autoUpdater.on('update-not-available', () => send('update:none'));
  autoUpdater.on('download-progress', (p) =>
    send('update:progress', { percent: p.percent, transferred: p.transferred, total: p.total }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    send('update:downloaded', { version: info.version, releaseNotes: info.releaseNotes }),
  );
  autoUpdater.on('error', (err) => {
    console.warn('[autoUpdater]', err.message);
    send('update:error', { message: err.message });
  });

  // Run shortly after launch so the renderer has time to attach listeners.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[autoUpdater] checkForUpdates failed:', err);
    });
  }, 3_000);
}

ipcMain.handle('update:install-now', () => {
  autoUpdater.quitAndInstall();
});

// Open an external URL in the user's default browser. Used by the welcome
// screen to start the OAuth flow. Restricted to https:// and http:// — never
// opens file://, custom schemes, or non-web URLs (defense against tricks
// from compromised renderer code).
ipcMain.handle('shell:open-external', async (_event, url: string) => {
  if (typeof url !== 'string') return { error: 'url must be a string' };
  if (!/^https?:\/\//i.test(url)) return { error: 'only http(s) URLs may be opened' };
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

// ── Auth: email + password ────────────────────────────────────────────────────
// POST to ${DATASPHERES_BASE_URL}/api/auth/login. Returns either {ok, token}
// on success or {error} on auth failure / network failure. The renderer
// passes the token to settings:set('cloudApiKey', token).
//
// Base URL resolves from DATASPHERES_BASE_URL env (set in dev via .env) or
// falls back to production. We never send the password anywhere else and
// the response body is parsed in-place — the renderer only sees the token
// string, not the raw HTTP body.
// Resolve order:
//   1. process.env.DATASPHERES_BASE_URL  (set in shell / .env / launchctl)
//   2. settings['dataspheres_base_url']  (set via Settings panel or
//      IPC settings:set)
//   3. dev default                        (so testing against staging is
//      friction-free; flip to prod default once the server side is stable)
function dataspheresBaseUrl(): string {
  if (process.env.DATASPHERES_BASE_URL) return process.env.DATASPHERES_BASE_URL;
  const s = readSettings();
  if (typeof s['dataspheres_base_url'] === 'string' && s['dataspheres_base_url']) {
    return s['dataspheres_base_url'] as string;
  }
  return 'https://dev.dataspheres.ai';
}

// Surface the URL to the renderer so the welcome screen can show
// "connecting to dev.dataspheres.ai" — users (and us) need to know
// which environment they're talking to.
ipcMain.handle('auth:get-base-url', () => dataspheresBaseUrl());

const AUTH_TIMEOUT_MS = 15_000;

function categorizeFetchError(err: unknown): { code: string; message: string } {
  const e = err instanceof Error ? err : new Error(String(err));
  const m = e.message || '';
  if (e.name === 'AbortError' || /aborted|timeout/i.test(m)) {
    return { code: 'timeout', message: `Sign-in took longer than ${AUTH_TIMEOUT_MS / 1000} seconds. The server may be slow or unreachable.` };
  }
  if (/ENOTFOUND|getaddrinfo/i.test(m)) {
    return { code: 'dns', message: 'Could not find the Dataspheres server. Check your internet connection or VPN.' };
  }
  if (/ECONNREFUSED/i.test(m)) {
    return { code: 'refused', message: 'The Dataspheres server refused the connection. It may be down.' };
  }
  if (/ECONNRESET/i.test(m)) {
    return { code: 'reset', message: 'The connection was closed before the server responded. Please try again.' };
  }
  if (/certificate|SELF_SIGNED|TLS|ssl/i.test(m)) {
    return { code: 'tls', message: 'A secure-connection error occurred. The server certificate may be invalid or expired.' };
  }
  // Clean fallback — never expose raw err.message to the UI; just code in the log.
  console.warn(`[auth] uncategorized fetch error: ${m}`);
  return { code: 'network', message: 'Could not reach Dataspheres AI. Check your internet connection and try again.' };
}

function categorizeHttpError(status: number, body: Record<string, unknown>): string {
  const serverMsg = (body.error as string) || (body.message as string);
  if (status === 400 || status === 422) return serverMsg || 'The server rejected the request. Check your email format.';
  if (status === 401 || status === 403) return serverMsg || 'Invalid credentials. Double-check your email and password.';
  if (status === 404) return 'The sign-in endpoint was not found at this URL. Check the base URL in Settings.';
  if (status === 429) return 'Too many sign-in attempts. Wait a minute and try again.';
  if (status >= 500) return serverMsg || `Server error (${status}). The Dataspheres team has been notified.`;
  return serverMsg || `Sign-in failed (HTTP ${status}).`;
}

ipcMain.handle('auth:login-email', async (_event, payload: { email?: string; password?: string }) => {
  const { email, password } = payload ?? {};
  if (typeof email !== 'string' || !email.trim()) return { error: 'Enter your email.' };
  if (typeof password !== 'string' || !password) return { error: 'Enter your password.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { error: "That doesn't look like a valid email." };

  const baseUrl = dataspheresBaseUrl();
  const loginUrl = `${baseUrl}/api/auth/login`;
  console.log(`[auth] POST ${loginUrl} (email=${email.trim()})`);
  const t0 = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log(`[auth] login response: HTTP ${res.status} in ${Date.now() - t0}ms`);

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
      console.log(`[auth] response keys: ${Object.keys(body).join(', ')}`);
    } catch {
      console.warn('[auth] response was not JSON');
    }

    if (!res.ok) {
      const errMsg = categorizeHttpError(res.status, body);
      console.warn(`[auth] login failed (${res.status}): ${errMsg}`);
      return { error: errMsg, status: res.status };
    }

    // The JWT returned by /api/auth/login is accepted as a Bearer token by
    // the Dataspheres public API. No exchange needed — store it as-is.
    const token =
      (body.token as string) ||
      (body.sessionToken as string) ||
      (body.accessToken as string) ||
      (body.jwt as string);

    if (!token) {
      console.error('[auth] no token field in response; available keys:', Object.keys(body));
      return {
        error: 'Signed in, but the server didn’t return a token. The Dataspheres API may have changed — file an issue.',
      };
    }

    console.log(`[auth] storing token (length=${token.length}); ready for cloud calls`);
    return { ok: true, token };
  } catch (err) {
    clearTimeout(timer);
    const { code, message } = categorizeFetchError(err);
    console.error(`[auth] login error (${code}): ${message}`);
    return { error: message, code };
  }
});

// Connection probe — used by the welcome screen's "Test connection" link
// on the error state. Hits a known-cheap endpoint to verify whether the
// configured base URL is reachable at all (separate from auth credentials).
ipcMain.handle('auth:test-connection', async () => {
  const baseUrl = dataspheresBaseUrl();
  const url = `${baseUrl}/api/auth/providers`;
  console.log(`[auth] test-connection GET ${url}`);
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    console.log(`[auth] test-connection: HTTP ${res.status} in ${ms}ms`);
    if (!res.ok) return { ok: false, status: res.status, ms, message: `Server returned HTTP ${res.status}` };
    return { ok: true, status: res.status, ms };
  } catch (err) {
    clearTimeout(timer);
    const { code, message } = categorizeFetchError(err);
    return { ok: false, code, message };
  }
});


// ── Auth: Google OAuth ────────────────────────────────────────────────────────
// Convenience helper — same as shell.openExternal but builds the URL with the
// correct callbackUrl so Dataspheres' NextAuth Google handler knows where to
// redirect back to (our `dataspheres://auth` deep-link scheme).
ipcMain.handle('auth:login-google', async () => {
  const callback = encodeURIComponent('dataspheres://auth');
  const url = `${dataspheresBaseUrl()}/api/auth/google?callbackUrl=${callback}`;
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

// ── Skills scanner (inline — no dai-core rebuild required) ───────────────────
// Scans skill directories for SKILL.md files and returns lightweight metadata.
// Bundled skills: sibling ari-dai-skills repo in dev, extraResources in prod.
// User skills:    ~/.dai-desktop/skills/ (one subdirectory per skill).

interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  argumentHint?: string;
  source: 'bundled' | 'user';
  filePath: string;
}

function parseSkillFrontmatter(raw: string): Record<string, string> {
  const cleaned = raw.replace(/^<!--[\s\S]*?-->\s*/m, '');
  const match   = /^---\r?\n([\s\S]*?)\r?\n---/.exec(cleaned);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '');
    if (val) out[key] = val;
  }
  return out;
}

function scanSkillsDir(dir: string, source: 'bundled' | 'user'): SkillMeta[] {
  const skills: SkillMeta[] = [];
  if (!fs.existsSync(dir)) return skills;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      try {
        const raw  = fs.readFileSync(skillFile, 'utf-8');
        const meta = parseSkillFrontmatter(raw);
        const name = meta['name'] || entry.name;
        skills.push({
          id: `${source}:${name}`,
          name,
          description:  meta['description']     ?? '',
          version:      meta['version']          ?? '1.0.0',
          argumentHint: meta['argument-hint'],
          source,
          filePath: skillFile,
        });
      } catch { /* skip bad files */ }
    }
  } catch { /* skip unreadable dir */ }
  return skills;
}

function listSkills(): SkillMeta[] {
  const isDev = process.env.NODE_ENV === 'development';
  // dev: sibling ari-dai-skills repo; prod: extraResources/skills
  const bundledDir = isDev
    ? path.join(__dirname, '..', '..', 'ari-dai-skills', 'skills')
    : path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '', 'skills');
  const userDir = path.join(require('os').homedir(), '.dai-desktop', 'skills');

  return [
    ...scanSkillsDir(bundledDir, 'bundled'),
    ...scanSkillsDir(userDir,    'user'),
  ];
}

// ── Lazy-import dai-core to avoid loading node-llama-cpp until needed ─────────
// These are resolved at runtime from the compiled package output.
let AgentLoop: typeof import('./packages/dai-core/dist/index').AgentLoop;
let LocalLLM: typeof import('./packages/dai-core/dist/index').LocalLLM;
let ToolRegistry: typeof import('./packages/dai-core/dist/index').ToolRegistry;
let ModelRouter: typeof import('./packages/dai-core/dist/index').ModelRouter;
let HardwareDetect: typeof import('./packages/dai-core/dist/index').HardwareDetect;
let SddEngine: typeof import('./packages/dai-core/dist/index').SddEngine;
let SddStore: typeof import('./packages/dai-core/dist/index').SddStore;
let VectorStore: typeof import('./packages/dai-core/dist/index').VectorStore;
let EmbeddingPipeline: typeof import('./packages/dai-core/dist/index').EmbeddingPipeline;
let DatasphereClient: typeof import('./packages/dai-core/dist/index').DatasphereClient;
let DatasphereService: typeof import('./packages/dai-core/dist/index').DatasphereService;

function loadCore() {
  const core = require('../packages/dai-core/dist/index');
  AgentLoop        = core.AgentLoop;
  LocalLLM         = core.LocalLLM;
  ToolRegistry     = core.ToolRegistry;
  ModelRouter      = core.ModelRouter;
  HardwareDetect   = core.HardwareDetect;
  SddEngine        = core.SddEngine;
  SddStore         = core.SddStore;
  VectorStore      = core.VectorStore;
  EmbeddingPipeline   = core.EmbeddingPipeline;
  DatasphereClient    = core.DatasphereClient;
  DatasphereService   = core.DatasphereService;
}

// ── Persistent settings ───────────────────────────────────────────────────────
function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(settings: Record<string, unknown>): void {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
}

function encryptApiKey(value: string): string {
  if (value && safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64');
  }
  return value;
}

function decryptApiKey(stored: unknown): string {
  if (typeof stored !== 'string' || !stored) return '';
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  return stored;
}

// ── Runtime singletons ────────────────────────────────────────────────────────
let agentLoop: InstanceType<typeof AgentLoop> | null = null;
let llm: InstanceType<typeof LocalLLM> | null = null;
let router: InstanceType<typeof ModelRouter> | null = null;
let sddEngine: InstanceType<typeof SddEngine> | null = null;
let sddStore: InstanceType<typeof SddStore> | null = null;
let cloudService: InstanceType<typeof DatasphereService> | null = null;

async function initAgent(modelPath: string): Promise<void> {
  if (llm?.isLoaded) return;

  const hw = HardwareDetect.detect();
  const settings = readSettings();
  llm = new LocalLLM({ modelPath, temperature: 0.7 }, hw);

  const dbPath = path.join(app.getPath('userData'), 'vector.db');
  const vectorStore = new VectorStore(dbPath);
  await vectorStore.init();
  const embedder = new EmbeddingPipeline(llm);
  const tools = ToolRegistry.createDefaultTools(vectorStore, embedder);

  router = new ModelRouter({
    modelPath,
    modelName: path.basename(modelPath),
    dataspheres_api_key: settings['dataspheres_api_key'] as string | undefined,
    anthropic_api_key:   settings['anthropic_api_key']   as string | undefined,
  });

  await llm.load();
  agentLoop = new AgentLoop(llm, tools, router);
}

function ensureRouter(): InstanceType<typeof ModelRouter> {
  if (!router) {
    const settings = readSettings();
    router = new ModelRouter({
      modelPath:          (settings['modelPath']          as string | undefined) ?? '',
      modelName:          'Unloaded',
      dataspheres_api_key: settings['dataspheres_api_key'] as string | undefined,
      anthropic_api_key:  settings['anthropic_api_key']   as string | undefined,
    });
  }
  return router;
}

// ── Ollama health poller ──────────────────────────────────────────────────────
let ollamaPollerTimer: ReturnType<typeof setInterval> | null = null;

function startOllamaPoller(): void {
  if (ollamaPollerTimer) return;

  async function poll(): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
      clearTimeout(timer);

      let available = false;
      let models: string[] = [];

      if (res.ok) {
        const data = await res.json() as { models: Array<{ name: string }> };
        models = (data.models ?? []).map((m) => m.name);
        available = true;
      }

      if (router) router.setOllamaStatus(available, models);
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('ollama:status', { available, models }),
      );
    } catch {
      if (router) router.setOllamaStatus(false, []);
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('ollama:status', { available: false, models: [] }),
      );
    }
  }

  void poll();
  ollamaPollerTimer = setInterval(poll, 5000);
}

function initSdd(): void {
  if (sddEngine) return;
  const dbPath = path.join(app.getPath('userData'), 'sdd.db');
  sddStore = new SddStore(dbPath);
  sddEngine = new SddEngine(sddStore);
}

function initCloud(apiKey: string): void {
  // Pass the resolved base URL so the client doesn't fall back to
  // its hard-coded production default. If the user signed in against
  // dev.dataspheres.ai, the JWT is only valid there.
  const baseUrl = dataspheresBaseUrl();
  console.log(`[cloud] initializing client against ${baseUrl}`);
  const client = new DatasphereClient({ apiKey, baseUrl });
  cloudService = new DatasphereService(client);
}

// ── Window factory ─────────────────────────────────────────────────────────────
function createWindow(): BrowserWindow | null {
  const isDev = process.env.NODE_ENV === 'development';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Dataspheres AI',
    icon: ICON_PATH,
    // Belt + suspenders for "window won't drag / won't resize" reports:
    movable: true,
    resizable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
    fullscreenable: true,
    // On macOS we want the standard `hiddenInset` look — system-drawn traffic
    // lights, no visible title bar — which requires frame: true. Setting
    // frame: false alongside hiddenInset puts the window in an "edge-only
    // resize, no native chrome" mode that some users hit as a "stuck window"
    // because the OS won't move it at all.
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    // Let macOS position traffic lights at their default location — overriding
    // them caused collisions with sidebar content.
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    // Deep ocean blue — keep in sync with color.base in packages/dai-ui/src/tokens.ts
    backgroundColor: '#0A1622',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.RENDERER_DEV_URL ?? 'http://localhost:5173');
    // DevTools is OFF by default in dev — was popping a second window on every
    // launch which is more annoying than useful. Press Cmd+Opt+I (Mac) /
    // Ctrl+Shift+I (Win/Linux) when you actually want it, or set
    // DAI_DEVTOOLS=1 to bring back auto-open behavior.
    if (process.env.DAI_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    // Forward renderer console messages to a tail-able log file so debugging
    // doesn't depend on CDP (which has been flaky for me locally).
    try {
      const logPath = path.join(app.getPath('userData'), 'renderer-console.log');
      fs.writeFileSync(logPath, ''); // truncate per launch
      win.webContents.on('console-message', (_event, level, message, line, source) => {
        const stamp = new Date().toISOString();
        fs.appendFileSync(
          logPath,
          `[${stamp}] [L${level}] ${message}  (${source}:${line})\n`,
        );
      });
      console.log(`[main] Renderer console → ${logPath}`);
    } catch (err) {
      console.warn('[main] Failed to set up renderer console log:', err);
    }
  } else {
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
    // Deliver any deep-link that arrived before the window was ready
    if (pendingDeepLink) {
      win.webContents.send('deep-link', pendingDeepLink);
      pendingDeepLink = null;
    }
  });

  return win;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // macOS dock icon — must be set after `app` is ready
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
    } catch (err) {
      console.warn('[main] Failed to set dock icon:', err);
    }
  }

  // Allow local file loads inside iframes/webviews for the planner panel
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' file: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'",
        ],
      },
    });
  });

  try {
    loadCore();
    initSdd();
    const settings = readSettings();
    const cloudApiKey = settings['cloudApiKey'] as string | undefined
      ?? settings['dataspheres_api_key'] as string | undefined;
    if (cloudApiKey) {
      initCloud(cloudApiKey);
    }
    ensureRouter();
    startOllamaPoller();
  } catch (err) {
    console.error('[main] Failed to load dai-core:', err);
  }

  const firstWindow = createWindow();

  // Wire auto-update — looks at GitHub Releases (see build.publish in package.json)
  configureAutoUpdater(() =>
    firstWindow && !firstWindow.isDestroyed()
      ? firstWindow
      : (BrowserWindow.getAllWindows()[0] ?? null),
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: agent:chat ────────────────────────────────────────────────────────────
// Streaming: tokens are pushed via agent:token events, then invoke resolves with done/error.
ipcMain.handle('agent:chat', async (event, { message, history }) => {
  const settings = readSettings();
  const modelPath = (settings['modelPath'] as string | undefined) ?? process.env.LOCAL_MODEL_PATH;
  const hasOllama = ensureRouter().ollamaAvailable;
  const hasClaudeKey = !!(settings['anthropic_api_key'] as string | undefined);

  if (modelPath && fs.existsSync(modelPath)) {
    try {
      await initAgent(modelPath);
    } catch (err) {
      return { error: true, message: `Failed to load model: ${String(err)}` };
    }
  } else if (!hasOllama && !hasClaudeKey) {
    return {
      error: true,
      message: 'No AI backend available. Load a local model, start Ollama, or add a Claude API key in Settings.',
    };
  } else {
    const r = ensureRouter();
    r.update({
      anthropic_api_key: settings['anthropic_api_key'] as string | undefined,
    });
    if (!agentLoop) {
      const tools = ToolRegistry.createDefaultTools(
        new VectorStore(path.join(app.getPath('userData'), 'vector.db')),
        null as unknown as InstanceType<typeof EmbeddingPipeline>,
      );
      llm = new LocalLLM({ modelPath: '', temperature: 0.7 }, HardwareDetect.detect());
      agentLoop = new AgentLoop(llm, tools, r);
    }
  }

  if (!agentLoop) {
    return { error: true, message: 'Agent loop failed to initialize.' };
  }

  // Tell the renderer which backend is actually being used for this turn.
  // Fires before any tokens so the UI can stamp the message immediately.
  const activeBackend: 'local' | 'ollama' | 'claude' | 'none' =
    (modelPath && fs.existsSync(modelPath)) ? 'local'
    : hasOllama                             ? 'ollama'
    : hasClaudeKey                          ? 'claude'
    : 'none';
  event.sender.send('agent:backend', activeBackend);

  try {
    for await (const event_ of agentLoop.run(message, history ?? [])) {
      if (event_.type === 'text') {
        event.sender.send('agent:token', event_.data as string);
      } else if (event_.type === 'tool_use') {
        event.sender.send('agent:tool-use', event_.data);
      } else if (event_.type === 'tool_result') {
        event.sender.send('agent:tool-result', event_.data);
      } else if (event_.type === 'done') {
        event.sender.send('agent:done', event_.data);
      } else if (event_.type === 'error') {
        return { error: true, message: String(event_.data) };
      }
    }
    return { ok: true };
  } catch (err) {
    return { error: true, message: String(err) };
  }
});

// ── IPC: sdd:dispatch ─────────────────────────────────────────────────────────
ipcMain.handle('sdd:dispatch', (event, { type, payload }) => {
  if (!sddEngine || !sddStore) {
    return { error: 'SDD engine not initialized' };
  }

  try {
    switch (type) {
      case 'sdd:list-initiatives':
        return { ok: true, data: sddStore.listInitiatives() };

      case 'sdd:get-board': {
        const { initiativeId } = payload as { initiativeId: string };
        return { ok: true, data: sddEngine.getBoardView(initiativeId) };
      }

      case 'sdd:new-initiative': {
        const { name, northStar, projectType, description } = payload as {
          name: string;
          northStar?: string;
          projectType: string;
          description?: string;
        };
        const initiative = sddStore.createInitiative({
          name,
          description: description ?? '',
          northStar: northStar ?? '',
          projectType: projectType as import('./packages/dai-core/dist/index').Initiative['projectType'],
        });
        return { ok: true, data: initiative };
      }

      case 'sdd:new-task': {
        const { initiativeId, column, title, description, priority, tags } = payload as {
          initiativeId: string;
          column: import('./packages/dai-core/dist/index').SddColumn;
          title: string;
          description?: string;
          priority?: import('./packages/dai-core/dist/index').Priority;
          tags?: string[];
        };
        const task = sddStore.createTask({
          initiativeId,
          column,
          title,
          description: description ?? '',
          priority: priority ?? 'medium',
          tags: tags ?? [],
        });
        return { ok: true, data: task };
      }

      case 'sdd:move-task': {
        const { taskId, column } = payload as {
          taskId: string;
          column: import('./packages/dai-core/dist/index').SddColumn;
        };
        sddEngine.moveTask(taskId, column);
        const task = sddStore.getTask(taskId);
        if (!task) return { error: 'Task not found' };
        return { ok: true, data: sddEngine.getBoardView(task.initiativeId) };
      }

      case 'sdd:start-task': {
        const { taskId } = payload as { taskId: string };
        sddEngine.startTask(taskId);
        const task = sddStore.getTask(taskId);
        if (!task) return { error: 'Task not found' };
        return { ok: true, data: sddEngine.getBoardView(task.initiativeId) };
      }

      case 'sdd:pass-validation': {
        const { taskId, evidence } = payload as { taskId: string; evidence: string };
        sddEngine.passValidation(taskId, evidence);
        const task = sddStore.getTask(taskId);
        if (!task) return { error: 'Task not found' };
        return { ok: true, data: sddEngine.getBoardView(task.initiativeId) };
      }

      case 'sdd:fail-validation': {
        const { taskId, evidence } = payload as { taskId: string; evidence: string };
        sddEngine.failValidation(taskId, evidence);
        const task = sddStore.getTask(taskId);
        if (!task) return { error: 'Task not found' };
        return { ok: true, data: sddEngine.getBoardView(task.initiativeId) };
      }

      case 'sdd:open-task': {
        const { taskId } = payload as { taskId: string };
        return { ok: true, data: sddStore.getTask(taskId) };
      }

      case 'sdd:update-task': {
        const { taskId, patch } = payload as { taskId: string; patch: Record<string, unknown> };
        sddStore.updateTask(taskId, patch);
        const task = sddStore.getTask(taskId);
        if (!task) return { error: 'Task not found' };
        return { ok: true, data: sddEngine.getBoardView(task.initiativeId) };
      }

      default:
        return { error: `Unknown SDD message type: ${type}` };
    }
  } catch (err) {
    return { error: String(err) };
  }
});

// ── IPC: hardware:info ─────────────────────────────────────────────────────────
ipcMain.handle('hardware:info', () => {
  try {
    return { ok: true, data: HardwareDetect.detect() };
  } catch (err) {
    return { error: String(err) };
  }
});

// ── IPC: settings ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', (_event, key: string) => {
  const settings = readSettings();
  if (key === 'anthropic_api_key') return decryptApiKey(settings[key]) || null;
  return settings[key] ?? null;
});

ipcMain.handle('settings:set', (_event, { key, value }: { key: string; value: unknown }) => {
  const settings = readSettings();
  if (key === 'anthropic_api_key' && typeof value === 'string') {
    settings[key] = encryptApiKey(value);
  } else {
    settings[key] = value;
  }
  writeSettings(settings);

  if (key === 'modelPath' && llm) {
    llm.unload();
    llm = null;
    agentLoop = null;
  }

  if (key === 'anthropic_api_key') {
    ensureRouter().update({ anthropic_api_key: value as string | undefined });
  }

  if ((key === 'cloudApiKey' || key === 'dataspheres_api_key') && value) {
    try {
      initCloud(value as string);
    } catch (err) {
      console.error('[main] Failed to re-init cloud service:', err);
    }
  }

  return { ok: true };
});

// ── IPC: settings:pick-model-file ─────────────────────────────────────────────
ipcMain.handle('settings:pick-model-file', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
    title: 'Select GGUF Model File',
    filters: [{ name: 'GGUF Models', extensions: ['gguf'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { filePath: result.filePaths[0] };
});

// ── IPC: settings:reload-model ────────────────────────────────────────────────
ipcMain.handle('settings:reload-model', async () => {
  if (llm) {
    llm.unload();
    llm = null;
    agentLoop = null;
  }
  const settings = readSettings();
  const modelPath = settings['modelPath'] as string | undefined;
  if (!modelPath || !fs.existsSync(modelPath)) {
    return { error: `Model file not found: ${modelPath ?? '(no path set)'}` };
  }
  try {
    await initAgent(modelPath);
    return { ok: true };
  } catch (err) {
    return { error: String(err) };
  }
});

// ── IPC: cloud ────────────────────────────────────────────────────────────────

/**
 * Translate raw cloud-call errors into messages users can act on.
 *
 * The most common failure mode: user signed in with email+password, got a
 * NextAuth session JWT, but the public API expects a `dsk_...` key. The API
 * returns the HTML login page (302) instead of JSON, and our parser barfs
 * `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 * Detect that flavor and surface a friendly "API key needed" message.
 */
function friendlyCloudError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // HTML-instead-of-JSON → API rejected the token (likely expired/invalid)
  if (/<!DOCTYPE|Unexpected token '<'|is not valid JSON/i.test(msg)) {
    return 'Your sign-in has expired or your API key is invalid. Sign out and back in.';
  }
  if (/401|403|Unauthorized|Forbidden/i.test(msg)) {
    return 'The Dataspheres server rejected your sign-in. Sign out and back in, or paste a fresh API key in Settings.';
  }
  if (/ENOTFOUND|getaddrinfo|ECONNREFUSED|ECONNRESET/i.test(msg)) {
    return 'Could not reach Dataspheres AI. Check your internet connection.';
  }
  if (/timeout|aborted/i.test(msg)) {
    return 'The Dataspheres server did not respond in time. Try again.';
  }
  // Last-resort fallback — never the raw stack trace, just a generic message.
  console.warn('[cloud] uncategorized error:', msg);
  return 'Something went wrong loading your workspaces. Please try again.';
}

ipcMain.handle('cloud:list-dataspheres', async () => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    const data = await cloudService.listDataspheres();
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:get-active', async () => {
  if (!cloudService) return { ok: true, data: null };
  try {
    const data = await cloudService.getActiveDatasphere();
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:set-active', async (_event, uri: string) => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    await cloudService.setActiveDatasphere(uri);
    const data = await cloudService.getActiveDatasphere();
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:list-pages', async (_event, { uri, folder }: { uri: string; folder?: string }) => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    const data = await cloudService.client.listPages(uri, { folder, limit: 50 });
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:list-tasks', async (_event, { dsId, planModeId }: { dsId: string; planModeId?: string }) => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    const data = await cloudService.client.listTasks(dsId, { planModeId, limit: 100 });
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:list-plan-modes', async (_event, dsId: string) => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    const data = await cloudService.client.listPlanModes(dsId);
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

ipcMain.handle('cloud:quick-capture', async (
  _event,
  { text, type, opts }: { text: string; type: 'page' | 'task'; opts?: Record<string, unknown> },
) => {
  if (!cloudService) return { error: 'Cloud service not initialized. Open Settings and add a Dataspheres API key.' };
  try {
    const data = await cloudService.quickCapture(text, type, opts as Parameters<typeof cloudService.quickCapture>[2]);
    return { ok: true, data };
  } catch (err) {
    return { error: friendlyCloudError(err) };
  }
});

// ── IPC: skills ───────────────────────────────────────────────────────────────

ipcMain.handle('skills:list', () => {
  try {
    return { ok: true, data: listSkills() };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('skills:get-content', (_event, filePath: string) => {
  try {
    if (typeof filePath !== 'string' || !filePath.endsWith('SKILL.md')) {
      return { error: 'Invalid file path' };
    }
    return { ok: true, data: fs.readFileSync(filePath, 'utf-8') };
  } catch (err) {
    return { error: String(err) };
  }
});
