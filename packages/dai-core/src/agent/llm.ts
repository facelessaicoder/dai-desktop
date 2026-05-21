import { HardwareInfo, HardwareDetect } from './hardware';

// node-llama-cpp is ESM-only — loaded lazily via dynamic import when a model is actually configured
type NodeLlamaCpp = typeof import('node-llama-cpp');

export interface LLMConfig {
  modelPath: string;
  embedModelPath?: string;
  temperature?: number;
  contextSize?: number;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export class LocalLLM {
  private config: LLMConfig;
  private hw: HardwareInfo;
  private _llama?: Awaited<ReturnType<NodeLlamaCpp['getLlama']>>;
  private _model?: Awaited<ReturnType<Awaited<ReturnType<NodeLlamaCpp['getLlama']>>['loadModel']>>;
  private _context?: Awaited<ReturnType<Awaited<ReturnType<Awaited<ReturnType<NodeLlamaCpp['getLlama']>>['loadModel']>>['createContext']>>;
  private _embedModel?: Awaited<ReturnType<Awaited<ReturnType<NodeLlamaCpp['getLlama']>>['loadModel']>>;
  private _embedCtx?: any;
  private _lib?: NodeLlamaCpp;

  constructor(config: LLMConfig, hw: HardwareInfo) {
    this.config = config;
    this.hw = hw;
  }

  private async lib(): Promise<NodeLlamaCpp> {
    if (!this._lib) {
      this._lib = await import('node-llama-cpp') as NodeLlamaCpp;
    }
    return this._lib;
  }

  async load(): Promise<void> {
    const { getLlama } = await this.lib();
    this._llama = await getLlama({ gpu: this._gpuBackend() });
    this._model = await this._llama.loadModel({ modelPath: this.config.modelPath });
    this._context = await this._model.createContext({
      contextSize: this.config.contextSize ?? HardwareDetect.contextSize(this.hw),
    });
    if (this.config.embedModelPath) {
      this._embedModel = await this._llama.loadModel({ modelPath: this.config.embedModelPath });
      this._embedCtx = await this._embedModel.createEmbeddingContext();
    }
  }

  async *chat(
    messages: ChatMessage[],
    options: { systemPrompt?: string; tools?: LLMTool[] } = {},
  ): AsyncGenerator<string> {
    const { LlamaChatSession } = await this.lib();
    if (!this._context) throw new Error('Model not loaded — call load() first');

    const session = new LlamaChatSession({
      contextSequence: this._context.getSequence(),
      systemPrompt: options.systemPrompt ?? 'You are Ari, the AI built into dai-desktop.',
    });

    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        const next = messages[i + 1];
        if (next?.role === 'assistant') {
          await session.prompt(m.content, { onTextChunk: () => {}, maxTokens: 1 });
          i++;
        }
      }
    }

    const last = messages.at(-1);
    if (!last || last.role !== 'user') return;

    const chunks: string[] = [];
    await session.prompt(last.content, {
      temperature: this.config.temperature ?? 0.7,
      onTextChunk: (chunk: string) => { chunks.push(chunk); },
    });
    for (const chunk of chunks) yield chunk;
  }

  async complete(prompt: string): Promise<string> {
    const { LlamaChatSession } = await this.lib();
    if (!this._context) throw new Error('Model not loaded — call load() first');
    const session = new LlamaChatSession({ contextSequence: this._context.getSequence() });
    let result = '';
    await session.prompt(prompt, {
      temperature: 0.1,
      onTextChunk: (c: string) => { result += c; },
    });
    return result;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const ctx = this._embedCtx ?? await this._lazyEmbedCtx();
    const results = await Promise.all(texts.map((t: string) => ctx.getEmbeddingFor(t)));
    return results.map((r: any) => Array.from(r.vector) as number[]);
  }

  get isLoaded(): boolean {
    return !!this._model && !!this._context;
  }

  unload(): void {
    this._context?.dispose();
    this._model?.dispose();
    this._embedCtx?.dispose();
    this._embedModel?.dispose();
    this._context = undefined;
    this._model = undefined;
    this._embedCtx = undefined;
    this._embedModel = undefined;
  }

  private _gpuBackend() {
    const a = this.hw.acceleration;
    if (a === 'cuda')   return 'cuda'   as const;
    if (a === 'metal')  return 'metal'  as const;
    if (a === 'vulkan') return 'vulkan' as const;
    return false;
  }

  private async _lazyEmbedCtx(): Promise<any> {
    if (!this._model) throw new Error('Model not loaded');
    this._embedCtx = await this._model.createEmbeddingContext();
    return this._embedCtx;
  }
}
