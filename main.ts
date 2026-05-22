import { app, BrowserWindow, dialog, ipcMain, safeStorage, session } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

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
  const client = new DatasphereClient({ apiKey });
  cloudService = new DatasphereService(client);
}

// ── Window factory ─────────────────────────────────────────────────────────────
function createWindow(): BrowserWindow {
  const isDev = process.env.NODE_ENV === 'development';

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    vibrancy: process.platform === 'darwin' ? 'under-window' : undefined,
    backgroundColor: '#08090E',
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
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());

  return win;
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
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

  createWindow();

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

ipcMain.handle('cloud:list-dataspheres', async () => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    const data = await cloudService.listDataspheres();
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:get-active', async () => {
  if (!cloudService) return { ok: true, data: null };
  try {
    const data = await cloudService.getActiveDatasphere();
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:set-active', async (_event, uri: string) => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    await cloudService.setActiveDatasphere(uri);
    const data = await cloudService.getActiveDatasphere();
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:list-pages', async (_event, { uri, folder }: { uri: string; folder?: string }) => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    const data = await cloudService.client.listPages(uri, { folder, limit: 50 });
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:list-tasks', async (_event, { dsId, planModeId }: { dsId: string; planModeId?: string }) => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    const data = await cloudService.client.listTasks(dsId, { planModeId, limit: 100 });
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:list-plan-modes', async (_event, dsId: string) => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    const data = await cloudService.client.listPlanModes(dsId);
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('cloud:quick-capture', async (
  _event,
  { text, type, opts }: { text: string; type: 'page' | 'task'; opts?: Record<string, unknown> },
) => {
  if (!cloudService) return { error: 'Cloud service not initialized — set API key in Settings' };
  try {
    const data = await cloudService.quickCapture(text, type, opts as Parameters<typeof cloudService.quickCapture>[2]);
    return { ok: true, data };
  } catch (err) {
    return { error: String(err) };
  }
});
