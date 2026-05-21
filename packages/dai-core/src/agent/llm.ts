import {
  getLlama,
  LlamaChatSession,
  LlamaModel,
  LlamaContext,
  LlamaEmbeddingContext,
  LlamaGrammar,
  type Llama,
} from 'node-llama-cpp';
import { HardwareInfo, HardwareDetect } from './hardware';

export interface LLMConfig {
  modelPath: string;        // absolute path to .gguf chat model
  embedModelPath?: string;  // separate embedding model (nomic-embed-text.gguf)
  temperature?: number;
  contextSize?: number;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export class LocalLLM {
  private config: LLMConfig;
  private hw: HardwareInfo;
  private llama?: Llama;
  private model?: LlamaModel;
  private context?: LlamaContext;
  private embedModel?: LlamaModel;
  private embedContext?: LlamaEmbeddingContext;

  constructor(config: LLMConfig, hw: HardwareInfo) {
    this.config = config;
    this.hw = hw;
  }

  async load(): Promise<void> {
    this.llama = await getLlama({ gpu: this._gpuBackend() });

    this.model = await this.llama.loadModel({ modelPath: this.config.modelPath });
    this.context = await this.model.createContext({
      contextSize: this.config.contextSize ?? HardwareDetect.contextSize(this.hw),
    });

    if (this.config.embedModelPath) {
      this.embedModel = await this.llama.loadModel({ modelPath: this.config.embedModelPath });
      this.embedContext = await this.embedModel.createEmbeddingContext();
    }
  }

  // Stream chat tokens — yields text chunks as they arrive
  async *chat(
    messages: ChatMessage[],
    options: { systemPrompt?: string; tools?: LLMTool[] } = {},
  ): AsyncGenerator<string> {
    if (!this.context) throw new Error('Model not loaded — call load() first');

    const session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt: options.systemPrompt ?? 'You are Ari, the AI built into dai-desktop.',
    });

    // Replay history into the session (skip last user message — that's the prompt)
    for (let i = 0; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.role === 'user') {
        // Pair with next assistant if available
        const next = messages[i + 1];
        if (next?.role === 'assistant') {
          await session.prompt(m.content, {
            onTextChunk: () => {},
            maxTokens: 1,  // suppress — just replaying context
          });
          i++;
        }
      }
    }

    const last = messages.at(-1);
    if (!last || last.role !== 'user') return;

    const chunks: string[] = [];
    await session.prompt(last.content, {
      temperature: this.config.temperature ?? 0.7,
      onTextChunk: (chunk) => { chunks.push(chunk); },
    });

    for (const chunk of chunks) yield chunk;
  }

  // Single-shot JSON output for tool call parsing
  async complete(prompt: string, grammar?: string): Promise<string> {
    if (!this.context) throw new Error('Model not loaded — call load() first');

    const session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
    });

    let result = '';
    await session.prompt(prompt, {
      temperature: 0.1,
      grammar: grammar ? await LlamaGrammar.getFor(this.llama!, 'json') : undefined,
      onTextChunk: (c) => { result += c; },
    });
    return result;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const ctx = this.embedContext ?? await this._lazyEmbedContext();
    const results = await Promise.all(texts.map((t) => ctx.getEmbeddingFor(t)));
    return results.map((r) => Array.from(r.vector));
  }

  get isLoaded(): boolean {
    return !!this.model && !!this.context;
  }

  unload(): void {
    this.context?.dispose();
    this.model?.dispose();
    this.embedContext?.dispose();
    this.embedModel?.dispose();
    this.context = undefined;
    this.model = undefined;
    this.embedContext = undefined;
    this.embedModel = undefined;
  }

  private _gpuBackend() {
    const a = this.hw.acceleration;
    if (a === 'cuda')   return 'cuda'   as const;
    if (a === 'metal')  return 'metal'  as const;
    if (a === 'vulkan') return 'vulkan' as const;
    return false;
  }

  // Lazily create embedding context from the chat model if no dedicated embed model
  private async _lazyEmbedContext(): Promise<LlamaEmbeddingContext> {
    if (!this.model) throw new Error('Model not loaded');
    this.embedContext = await this.model.createEmbeddingContext();
    return this.embedContext;
  }
}
