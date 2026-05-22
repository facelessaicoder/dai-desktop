import type { ChatMessage } from './llm';

interface OllamaTagsResponse {
  models: Array<{ name: string; size?: number }>;
}

interface OllamaChatChunk {
  message?: { role: string; content: string };
  done: boolean;
}

export class OllamaClient {
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as OllamaTagsResponse;
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  }

  async *chat(
    messages: ChatMessage[],
    options: { systemPrompt?: string; model?: string } = {},
  ): AsyncGenerator<string> {
    const model = options.model ?? 'llama3.2';
    const body: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      body.push({ role: 'system', content: options.systemPrompt });
    }
    for (const m of messages) {
      body.push({ role: m.role, content: m.content });
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: body, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as OllamaChatChunk;
          if (obj.message?.content) yield obj.message.content;
        } catch { /* skip malformed line */ }
      }
    }

    if (buf.trim()) {
      try {
        const obj = JSON.parse(buf) as OllamaChatChunk;
        if (obj.message?.content) yield obj.message.content;
      } catch { /* skip */ }
    }
  }
}
