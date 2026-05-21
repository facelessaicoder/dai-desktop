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
};

contextBridge.exposeInMainWorld('dai', daiAPI);

// Expose type for renderer TypeScript via global declaration (augmented in renderer's global.d.ts)
export {};
