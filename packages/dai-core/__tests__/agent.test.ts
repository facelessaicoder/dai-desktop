import { ModelRouter } from '../src/agent/router';
import { ClaudeAPIClient } from '../src/agent/claude';
import { OllamaClient } from '../src/agent/ollama';

// ── ModelRouter.getBackend() ───────────────────────────────────────────────────

describe('ModelRouter.getBackend()', () => {
  const baseConfig = { modelPath: '/model.gguf', modelName: 'Test' };

  test('returns "local" when local model is loaded', () => {
    const router = new ModelRouter(baseConfig);
    expect(router.getBackend(true)).toBe('local');
  });

  test('returns "ollama" when local not loaded and Ollama is available', () => {
    const router = new ModelRouter(baseConfig);
    router.setOllamaStatus(true, ['llama3.2:latest']);
    expect(router.getBackend(false)).toBe('ollama');
  });

  test('returns "claude" when local not loaded, Ollama unavailable, and API key set', () => {
    const router = new ModelRouter({ ...baseConfig, anthropic_api_key: 'sk-test' });
    router.setOllamaStatus(false, []);
    expect(router.getBackend(false)).toBe('claude');
  });
});

// ── ClaudeAPIClient ────────────────────────────────────────────────────────────

describe('ClaudeAPIClient', () => {
  test('throws when API key is empty', async () => {
    const client = new ClaudeAPIClient(() => undefined);
    const gen = client.chat([{ role: 'user', content: 'hi' }]);
    await expect(gen.next()).rejects.toThrow('Claude API key not configured');
  });

  test('streams tokens when API key is set', async () => {
    const client = new ClaudeAPIClient(() => 'sk-test');
    const chunks: string[] = [];
    for await (const chunk of client.chat([{ role: 'user', content: 'hi' }])) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['hello ', 'world']);
  });
});

// ── OllamaClient.isAvailable() ────────────────────────────────────────────────

describe('OllamaClient', () => {
  test('isAvailable() returns false when Ollama is not running', async () => {
    // Port 19999 should not be listening — ensures 2s timeout path
    const client = new OllamaClient('http://127.0.0.1:19999');
    const result = await client.isAvailable();
    expect(result).toBe(false);
  }, 4000);
});
