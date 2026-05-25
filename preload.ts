import { contextBridge, ipcRenderer } from 'electron';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaStatus {
  available: boolean;
  models: string[];
}

export type BackendType = 'local' | 'ollama' | 'claude' | 'none';

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  argumentHint?: string;
  source: 'bundled' | 'user';
  filePath: string;
}

export interface DaiAPI {
  chat: {
    send: (message: string, history: ChatMessage[]) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
    onToken:         (cb: (token: string) => void)       => () => void;
    onToolUse:       (cb: (data: unknown) => void)       => () => void;
    onToolResult:    (cb: (data: unknown) => void)       => () => void;
    onDone:          (cb: (data: unknown) => void)       => () => void;
    onBackendChange: (cb: (backend: BackendType) => void) => () => void;
  };
  skills: {
    list: () => Promise<{ ok?: boolean; data?: SkillMeta[]; error?: string }>;
    getContent: (filePath: string) => Promise<{ ok?: boolean; data?: string; error?: string }>;
  };
  model: {
    onOllamaStatus: (cb: (status: OllamaStatus) => void) => () => void;
  };
  sdd: {
    dispatch: (type: string, payload?: unknown) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
  };
  hardware: {
    info: () => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
  };
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<{ ok: boolean }>;
    pickModelFile: () => Promise<{ canceled?: boolean; filePath?: string }>;
    reloadModel: () => Promise<{ ok?: boolean; error?: string }>;
  };
  cloud: {
    listDataspheres: () => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    getActive: () => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    setActive: (uri: string) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    listPages: (uri: string, folder?: string) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    listTasks: (dsId: string, planModeId?: string) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    listPlanModes: (dsId: string) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
    quickCapture: (text: string, type: 'page' | 'task', opts?: Record<string, unknown>) => Promise<{ ok?: boolean; data?: unknown; error?: string }>;
  };
  updater: {
    /** Fires when an update is available. Returns an unsubscribe fn. */
    onAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void;
    /** Fires when the downloaded update is ready to install. */
    onDownloaded: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void;
    /** Fires with download progress (0-100). */
    onProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => () => void;
    /** Restart the app and install the downloaded update. */
    installNow: () => Promise<void>;
  };
  deepLink: {
    /** Fires when the OS hands the app a `dataspheres://` URL. */
    onUrl: (cb: (url: string) => void) => () => void;
  };
  shell: {
    /** Open an http(s) URL in the user's default browser. */
    openExternal: (url: string) => Promise<{ ok?: boolean; error?: string }>;
  };
  auth: {
    /** Sign in with email + password via /api/auth/login. Returns the session token. */
    loginEmail: (email: string, password: string) => Promise<{ ok?: boolean; token?: string; error?: string; isSessionToken?: boolean; status?: number; code?: string }>;
    /** Open Google OAuth in the user's default browser; token arrives via deepLink.onUrl. */
    loginGoogle: () => Promise<{ ok?: boolean; error?: string }>;
    /** Which Dataspheres environment URL the app is currently pointed at. */
    getBaseUrl: () => Promise<string>;
    /** Ping the configured host to see if it's reachable (no creds needed). */
    testConnection: () => Promise<{ ok: boolean; status?: number; ms?: number; code?: string; message?: string }>;
  };
}

const daiAPI: DaiAPI = {
  model: {
    onOllamaStatus: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, status: OllamaStatus) => cb(status);
      ipcRenderer.on('ollama:status', handler);
      return () => ipcRenderer.removeListener('ollama:status', handler);
    },
  },

  chat: {
    send: (message, history) =>
      ipcRenderer.invoke('agent:chat', { message, history }),

    onToken: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, token: string) => cb(token);
      ipcRenderer.on('agent:token', handler);
      return () => ipcRenderer.removeListener('agent:token', handler);
    },

    onToolUse: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
      ipcRenderer.on('agent:tool-use', handler);
      return () => ipcRenderer.removeListener('agent:tool-use', handler);
    },

    onToolResult: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
      ipcRenderer.on('agent:tool-result', handler);
      return () => ipcRenderer.removeListener('agent:tool-result', handler);
    },

    onDone: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
      ipcRenderer.on('agent:done', handler);
      return () => ipcRenderer.removeListener('agent:done', handler);
    },

    onBackendChange: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, backend: BackendType) => cb(backend);
      ipcRenderer.on('agent:backend', handler);
      return () => ipcRenderer.removeListener('agent:backend', handler);
    },
  },

  skills: {
    list:       ()         => ipcRenderer.invoke('skills:list'),
    getContent: (filePath) => ipcRenderer.invoke('skills:get-content', filePath),
  },

  sdd: {
    dispatch: (type, payload) =>
      ipcRenderer.invoke('sdd:dispatch', { type, payload }),
  },

  hardware: {
    info: () => ipcRenderer.invoke('hardware:info'),
  },

  settings: {
    get:  (key)         => ipcRenderer.invoke('settings:get', key),
    set:  (key, value)  => ipcRenderer.invoke('settings:set', { key, value }),
    pickModelFile: ()   => ipcRenderer.invoke('settings:pick-model-file'),
    reloadModel:   ()   => ipcRenderer.invoke('settings:reload-model'),
  },

  cloud: {
    listDataspheres: ()           => ipcRenderer.invoke('cloud:list-dataspheres'),
    getActive:       ()           => ipcRenderer.invoke('cloud:get-active'),
    setActive:       (uri)        => ipcRenderer.invoke('cloud:set-active', uri),
    listPages:       (uri, folder) => ipcRenderer.invoke('cloud:list-pages', { uri, folder }),
    listTasks:       (dsId, planModeId) => ipcRenderer.invoke('cloud:list-tasks', { dsId, planModeId }),
    listPlanModes:   (dsId)       => ipcRenderer.invoke('cloud:list-plan-modes', dsId),
    quickCapture:    (text, type, opts) => ipcRenderer.invoke('cloud:quick-capture', { text, type, opts }),
  },

  updater: {
    onAvailable: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, info: { version: string; releaseNotes?: string }) => cb(info);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    onDownloaded: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, info: { version: string; releaseNotes?: string }) => cb(info);
      ipcRenderer.on('update:downloaded', handler);
      return () => ipcRenderer.removeListener('update:downloaded', handler);
    },
    onProgress: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, p: { percent: number; transferred: number; total: number }) => cb(p);
      ipcRenderer.on('update:progress', handler);
      return () => ipcRenderer.removeListener('update:progress', handler);
    },
    installNow: () => ipcRenderer.invoke('update:install-now'),
  },

  deepLink: {
    onUrl: (cb) => {
      const handler = (_: Electron.IpcRendererEvent, url: string) => cb(url);
      ipcRenderer.on('deep-link', handler);
      return () => ipcRenderer.removeListener('deep-link', handler);
    },
  },

  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  },

  auth: {
    loginEmail:     (email, password) => ipcRenderer.invoke('auth:login-email', { email, password }),
    loginGoogle:    () => ipcRenderer.invoke('auth:login-google'),
    getBaseUrl:     () => ipcRenderer.invoke('auth:get-base-url'),
    testConnection: () => ipcRenderer.invoke('auth:test-connection'),
  },
};

contextBridge.exposeInMainWorld('dai', daiAPI);

// Expose type for renderer TypeScript via global declaration (augmented in renderer's global.d.ts)
export {};
