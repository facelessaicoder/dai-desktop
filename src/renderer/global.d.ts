// Type declarations for the contextBridge API exposed by preload.ts

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

declare global {
  interface Window {
    dai: DaiAPI;
  }
}
