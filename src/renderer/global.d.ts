// Type declarations for the contextBridge API exposed by preload.ts

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

// ── Dataspheres cloud types (mirrored from dai-core) ─────────────────────────

export interface CloudDatasphere {
  id: string;
  uri: string;
  name: string;
  description?: string;
  isPrivate: boolean;
}

export interface CloudPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  status: string;
  folderName?: string;
  url?: string;
  updatedAt?: string;
}

export interface CloudTask {
  id: string;
  title: string;
  status: string;
  statusGroupId: string;
  tags: string[];
  content?: string;
  priority?: string;
  planModeId?: string;
  planModeName?: string;
}

export interface CloudPlanMode {
  id: string;
  name: string;
  tagFilter: string[];
}

// ── DaiAPI ────────────────────────────────────────────────────────────────────

export interface OllamaStatus {
  available: boolean;
  models: string[];
}

export interface DaiAPI {
  model: {
    onOllamaStatus: (cb: (status: OllamaStatus) => void) => () => void;
  };
  chat: {
    send: (message: string, history: ChatMessage[]) => Promise<{ ok?: boolean; error?: boolean; message?: string }>;
    onToken:         (cb: (token: string) => void)        => () => void;
    onToolUse:       (cb: (data: unknown) => void)        => () => void;
    onToolResult:    (cb: (data: unknown) => void)        => () => void;
    onDone:          (cb: (data: unknown) => void)        => () => void;
    onBackendChange: (cb: (backend: BackendType) => void) => () => void;
  };
  skills: {
    list: () => Promise<{ ok?: boolean; data?: SkillMeta[]; error?: string }>;
    getContent: (filePath: string) => Promise<{ ok?: boolean; data?: string; error?: string }>;
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
    listDataspheres: () => Promise<{ ok?: boolean; data?: CloudDatasphere[]; error?: string }>;
    getActive: () => Promise<{ ok?: boolean; data?: CloudDatasphere | null; error?: string }>;
    setActive: (uri: string) => Promise<{ ok?: boolean; data?: CloudDatasphere; error?: string }>;
    listPages: (uri: string, folder?: string) => Promise<{ ok?: boolean; data?: CloudPage[]; error?: string }>;
    listTasks: (dsId: string, planModeId?: string) => Promise<{ ok?: boolean; data?: CloudTask[]; error?: string }>;
    listPlanModes: (dsId: string) => Promise<{ ok?: boolean; data?: CloudPlanMode[]; error?: string }>;
    quickCapture: (text: string, type: 'page' | 'task', opts?: Record<string, unknown>) => Promise<{ ok?: boolean; data?: CloudPage | CloudTask; error?: string }>;
  };
  updater: {
    onAvailable: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void;
    onDownloaded: (cb: (info: { version: string; releaseNotes?: string }) => void) => () => void;
    onProgress: (cb: (p: { percent: number; transferred: number; total: number }) => void) => () => void;
    installNow: () => Promise<void>;
  };
  deepLink: {
    onUrl: (cb: (url: string) => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok?: boolean; error?: string }>;
  };
  auth: {
    loginEmail: (email: string, password: string) => Promise<{ ok?: boolean; token?: string; error?: string; isSessionToken?: boolean; status?: number; code?: string }>;
    loginGoogle: () => Promise<{ ok?: boolean; error?: string }>;
    getBaseUrl: () => Promise<string>;
    testConnection: () => Promise<{ ok: boolean; status?: number; ms?: number; code?: string; message?: string }>;
  };
}

declare global {
  interface Window {
    dai: DaiAPI;
  }
}
