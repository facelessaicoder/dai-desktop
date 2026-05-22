import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from './llm';

export class ClaudeAPIClient {
  private readonly getKey: () => string | undefined;
  private readonly model: string;

  constructor(getKey: () => string | undefined, model = 'claude-sonnet-4-6') {
    this.getKey = getKey;
    this.model = model;
  }

  async *chat(
    messages: ChatMessage[],
    options: { systemPrompt?: string } = {},
  ): AsyncGenerator<string> {
    const apiKey = this.getKey();
    if (!apiKey) {
      throw new Error('Claude API key not configured. Add it in Settings → Claude API Key.');
    }

    const anthropic = new Anthropic({ apiKey });

    const anthropicMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = anthropic.messages.stream({
      model: this.model,
      max_tokens: 4096,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages: anthropicMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }
}
