import { LocalLLM, ChatMessage } from './llm';
import { ToolRegistry } from './tools';
import { ModelRouter } from './router';

export type AgentEventType = 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';

export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  systemPrompt?: string;
}

// Matches tool calls in model output — handles ```json blocks and bare JSON
const TOOL_CALL_RE = /```(?:json)?\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```|(\{[\s\S]*?"tool"[\s\S]*?\})/;

export class AgentLoop {
  private llm: LocalLLM;
  private tools: ToolRegistry;
  private router: ModelRouter;

  constructor(llm: LocalLLM, tools: ToolRegistry, router: ModelRouter) {
    this.llm = llm;
    this.tools = tools;
    this.router = router;
  }

  async *run(
    userMessage: string,
    history: ChatMessage[] = [],
    options: AgentLoopOptions = {},
  ): AsyncGenerator<AgentEvent> {
    if (!this.llm.isLoaded) {
      yield { type: 'error', data: 'Local model not loaded. Select a model in Settings.' };
      return;
    }

    const { maxIterations = 20, systemPrompt } = options;
    const sysPrompt = this._buildSystemPrompt(systemPrompt);

    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

      let fullResponse = '';
      for await (const chunk of this.llm.chat(messages, { systemPrompt: sysPrompt })) {
        fullResponse += chunk;
        yield { type: 'text', data: chunk };
      }

      // Check if the model wants to call a tool
      const toolCall = this._parseToolCall(fullResponse);
      if (!toolCall) {
        yield { type: 'done', data: null };
        return;
      }

      // Execute tool
      yield { type: 'tool_use', data: { name: toolCall.tool, input: toolCall.args } };
      try {
        const result = await this.tools.execute(toolCall.tool, toolCall.args ?? {});
        yield { type: 'tool_result', data: { name: toolCall.tool, result } };

        // Feed result back into conversation and continue loop
        messages.push({ role: 'assistant', content: fullResponse });
        messages.push({
          role: 'user',
          content: `Tool result for ${toolCall.tool}:\n${JSON.stringify(result, null, 2)}`,
        });
      } catch (err) {
        yield { type: 'tool_result', data: { name: toolCall.tool, error: String(err) } };
        messages.push({ role: 'assistant', content: fullResponse });
        messages.push({
          role: 'user',
          content: `Tool ${toolCall.tool} failed: ${String(err)}. Proceed without it.`,
        });
      }
    }

    yield { type: 'done', data: { reason: 'max_iterations_reached' } };
  }

  private _buildSystemPrompt(override?: string): string {
    if (override) return override;

    const toolList = this.tools.names()
      .map((n) => `- ${n}`)
      .join('\n');

    return [
      'You are Ari, the AI built into dai-desktop.',
      'You run entirely locally on this machine. You have access to the user\'s filesystem, terminal, and semantic search.',
      'When you need to call a tool, output ONLY a JSON block in this format:',
      '```json',
      '{"tool": "tool_name", "args": {"param": "value"}}',
      '```',
      'Then stop and wait for the result.',
      '',
      'Available tools:',
      toolList,
    ].join('\n');
  }

  private _parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
    const match = text.match(TOOL_CALL_RE);
    if (!match) return null;
    try {
      const raw = JSON.parse(match[1] ?? match[2] ?? '{}');
      if (typeof raw.tool === 'string') {
        return { tool: raw.tool, args: raw.args ?? {} };
      }
    } catch { /* not valid JSON */ }
    return null;
  }
}
