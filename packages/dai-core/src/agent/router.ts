export type ModelTarget = 'fast' | 'smart' | 'local' | 'auto';

export interface ModelConfig {
  anthropic: { fast: string; smart: string };
  openai: { fast: string; smart: string };
  ollama: { default: string };
  preference: 'anthropic' | 'openai' | 'ollama';
}

const DEFAULT_CONFIG: ModelConfig = {
  anthropic: { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-6' },
  openai: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
  ollama: { default: 'llama3.2:3b' },
  preference: 'anthropic',
};

export class ModelRouter {
  private config: ModelConfig;

  constructor(config?: Partial<ModelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  resolve(target?: ModelTarget): string {
    const t = target ?? 'auto';

    if (t === 'local') return `ollama/${this.config.ollama.default}`;

    const pref = this.config.preference;
    if (pref === 'anthropic') {
      return t === 'fast' ? this.config.anthropic.fast : this.config.anthropic.smart;
    }
    if (pref === 'openai') {
      return t === 'fast' ? this.config.openai.fast : this.config.openai.smart;
    }
    return `ollama/${this.config.ollama.default}`;
  }

  setPreference(pref: ModelConfig['preference']): void {
    this.config.preference = pref;
  }

  setOllamaModel(model: string): void {
    this.config.ollama.default = model;
  }
}
