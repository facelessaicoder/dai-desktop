import * as fs from 'fs/promises';
import * as path from 'path';
import { VectorStore } from '../vector/store';
import { EmbeddingPipeline } from '../vector/embeddings';

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  execute(input: Record<string, any>): Promise<any>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async execute(name: string, input: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(input);
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  toAnthropicSchema() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  static createDefaultTools(store: VectorStore, embedder: EmbeddingPipeline): ToolRegistry {
    const reg = new ToolRegistry();

    reg.register({
      name: 'read_file',
      description: 'Read the contents of a file at a given path',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async execute({ path: filePath }) {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        return { content, lineCount: lines.length };
      },
    });

    reg.register({
      name: 'write_file',
      description: 'Write content to a file, creating it if it does not exist',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
      async execute({ path: filePath, content }) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true, path: filePath };
      },
    });

    reg.register({
      name: 'list_dir',
      description: 'List files and directories at a given path',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async execute({ path: dirPath }) {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
      },
    });

    reg.register({
      name: 'semantic_search',
      description: 'Search the workspace by semantic meaning. Returns relevant file chunks.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 5 },
          filter: { type: 'string', enum: ['all', 'code', 'docs'], default: 'all' },
        },
        required: ['query'],
      },
      async execute({ query, limit = 5, filter = 'all' }) {
        const [embedding] = await embedder.embed([query]);
        const results =
          filter === 'code' ? await store.searchCode(embedding, limit)
          : filter === 'docs' ? await store.searchDocs(embedding, limit)
          : await store.search(embedding, limit);
        return results.map((r) => ({
          filePath: r.chunk.filePath,
          lines: `${r.chunk.startLine}-${r.chunk.endLine}`,
          score: r.score,
          preview: r.chunk.chunkText.slice(0, 300),
        }));
      },
    });

    return reg;
  }
}
