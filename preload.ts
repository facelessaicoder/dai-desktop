import { contextBridge, ipcRenderer } from 'electron';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface DaiAPI {
  chat: {
    send: (message: string, history: ChatMessage[]) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
    onToken:      (cb: (token: string) => void)  => () => void;
    onToolUse:    (cb: (data: unknown) => void)   => () => void;
    onToolResult: (cb: (data: unknown) => void)   => () => void;
    onDone:       (cb: (data: unknown) => void)   => () => void;
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
}

const daiAPI: DaiAPI = {
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
};

contextBridge.exposeInMainWorld('dai', daiAPI);

// Expose type for renderer TypeScript via global declaration (augmented in renderer's global.d.ts)
export {};
