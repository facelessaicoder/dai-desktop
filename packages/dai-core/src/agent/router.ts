export interface LocalModelConfig {
  modelPath: string;
  embedModelPath?: string;
  modelName: string;
  modelSizeGB?: number;
  dataspheres_api_key?: string;
  anthropic_api_key?: string;
  ollamaBaseUrl?: string;
}

export type BackendType = 'local' | 'ollama' | 'claude';

export class ModelRouter {
  private config: LocalModelConfig;
  private _ollamaAvailable = false;
  private _ollamaModels: string[] = [];

  constructor(config: LocalModelConfig) {
    this.config = config;
  }

  get modelPath():        string           { return this.config.modelPath; }
  get embedModelPath():   string|undefined { return this.config.embedModelPath; }
  get modelName():        string           { return this.config.modelName; }
  get modelSizeGB():      number|undefined { return this.config.modelSizeGB; }
  get dataspheres_key():  string|undefined { return this.config.dataspheres_api_key; }
  get anthropic_key():    string|undefined { return this.config.anthropic_api_key; }
  get ollamaBaseUrl():    string           { return this.config.ollamaBaseUrl ?? 'http://localhost:11434'; }
  get ollamaAvailable():  boolean          { return this._ollamaAvailable; }
  get ollamaModels():     string[]         { return this._ollamaModels; }

  setOllamaStatus(available: boolean, models: string[]): void {
    this._ollamaAvailable = available;
    this._ollamaModels = models;
  }

  getBackend(localIsLoaded: boolean): BackendType {
    if (localIsLoaded) return 'local';
    if (this._ollamaAvailable) return 'ollama';
    if (this.config.anthropic_api_key) return 'claude';
    return 'local';
  }

  isLocalReady(): boolean      { return !!this.config.modelPath; }
  isDataspheresSynced(): boolean { return !!this.config.dataspheres_api_key; }

  update(patch: Partial<LocalModelConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  toJSON(): LocalModelConfig {
    return { ...this.config };
  }
}
