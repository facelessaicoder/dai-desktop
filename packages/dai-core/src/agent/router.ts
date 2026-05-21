// Local-first. The GGUF model on-device is always the brain.
// Dataspheres API key is for platform sync (MCP) — not for AI inference.

export interface LocalModelConfig {
  modelPath: string;         // absolute path to .gguf chat model
  embedModelPath?: string;   // optional dedicated nomic-embed-text.gguf
  modelName: string;         // display name e.g. "Gemma 4 E4B"
  modelSizeGB?: number;      // for display in System panel
  dataspheres_api_key?: string;
}

export class ModelRouter {
  private config: LocalModelConfig;

  constructor(config: LocalModelConfig) {
    this.config = config;
  }

  get modelPath():          string           { return this.config.modelPath; }
  get embedModelPath():     string|undefined { return this.config.embedModelPath; }
  get modelName():          string           { return this.config.modelName; }
  get modelSizeGB():        number|undefined { return this.config.modelSizeGB; }
  get dataspheres_key():    string|undefined { return this.config.dataspheres_api_key; }

  isLocalReady(): boolean {
    return !!this.config.modelPath;
  }

  isDataspheresSynced(): boolean {
    return !!this.config.dataspheres_api_key;
  }

  update(patch: Partial<LocalModelConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  toJSON(): LocalModelConfig {
    return { ...this.config };
  }
}
