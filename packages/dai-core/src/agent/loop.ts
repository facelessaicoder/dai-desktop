import Anthropic from '@anthropic-ai/sdk';
import { ToolRegistry } from './tools';
import { ModelRouter, ModelTarget } from './router';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentLoopOptions {
  maxIterations?: number;
  modelTarget?: ModelTarget;
  systemPrompt?: string;
}

export class AgentLoop {
  private client: Anthropic;
  private tools: ToolRegistry;
  private router: ModelRouter;

  constructor(tools: ToolRegistry, router: ModelRouter) {
    this.client = new Anthropic();
    this.tools = tools;
    this.router = router;
  }

  async run(
    userMessage: string,
    history: AgentMessage[] = [],
    options: AgentLoopOptions = {},
  ): AsyncGenerator<{ type: 'text' | 'tool_use' | 'tool_result' | 'done'; data: any }> {
    const { maxIterations = 20, modelTarget, systemPrompt } = options;
    const model = this.router.resolve(modelTarget);
    const messages: Anthropic.MessageParam[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      const response = await this.client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt ?? 'You are Ari, the AI built into dai-desktop.',
        tools: this.tools.toAnthropicSchema(),
        messages,
      });

      for (const block of response.content) {
        if (block.type === 'text') {
          yield { type: 'text', data: block.text };
        } else if (block.type === 'tool_use') {
          yield { type: 'tool_use', data: { name: block.name, input: block.input, id: block.id } };
          const result = await this.tools.execute(block.name, block.input);
          yield { type: 'tool_result', data: { toolUseId: block.id, result } };
          messages.push({ role: 'assistant', content: response.content });
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }],
          });
        }
      }

      if (response.stop_reason === 'end_turn') {
        yield { type: 'done', data: null };
        return;
      }
    }

    yield { type: 'done', data: { reason: 'max_iterations_reached' } };
  }
}
