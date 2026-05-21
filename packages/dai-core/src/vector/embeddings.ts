import { OllamaManager } from '../process/ollama';

export class EmbeddingPipeline {
  readonly modelName: string;
  private ollama?: OllamaManager;
  private apiKey?: string;
  private mode: 'ollama' | 'openai';

  constructor(options: { mode: 'ollama'; ollamaModel?: string } | { mode: 'openai'; apiKey: string }) {
    this.mode = options.mode;
    if (options.mode === 'ollama') {
      this.modelName = options.ollamaModel ?? 'nomic-embed-text';
      this.ollama = new OllamaManager();
    } else {
      this.modelName = 'text-embedding-3-small';
      this.apiKey = options.apiKey;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.mode === 'ollama' && this.ollama) {
      return this.ollama.embed(this.modelName, texts);
    }
    return this._openAIEmbed(texts);
  }

  private async _openAIEmbed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.modelName, input: texts }),
    });
    const data = await res.json() as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}
