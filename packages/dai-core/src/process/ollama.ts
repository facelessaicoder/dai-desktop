import { Ollama } from 'ollama';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: Date;
}

export class OllamaManager {
  private client: Ollama;

  constructor(host = 'http://localhost:11434') {
    this.client = new Ollama({ host });
  }

  static isInstalled(): boolean {
    try {
      execSync('ollama --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const { models } = await this.client.list();
    return models.map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: new Date(m.modified_at),
    }));
  }

  async pullModel(name: string, onProgress?: (pct: number) => void): Promise<void> {
    const stream = await this.client.pull({ model: name, stream: true });
    for await (const chunk of stream) {
      if (chunk.total && chunk.completed && onProgress) {
        onProgress(Math.round((chunk.completed / chunk.total) * 100));
      }
    }
  }

  async deleteModel(name: string): Promise<void> {
    await this.client.delete({ model: name });
  }

  async embed(model: string, texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const res = await this.client.embeddings({ model, prompt: text });
      results.push(res.embedding);
    }
    return results;
  }

  async chat(model: string, prompt: string): Promise<string> {
    const res = await this.client.generate({ model, prompt, stream: false });
    return (res as any).response ?? '';
  }
}
