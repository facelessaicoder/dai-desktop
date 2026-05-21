import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import chokidar from 'chokidar';
import { VectorStore, Chunk } from './store';
import { EmbeddingPipeline } from './embeddings';

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c']);
const DOC_EXTENSIONS  = new Set(['.md', '.mdx', '.txt', '.rst']);
const MAX_CHUNK_TOKENS = 512;
const CHUNK_OVERLAP   = 64;

export class FileIndexer {
  private store: VectorStore;
  private embedder: EmbeddingPipeline;
  private watcher?: ReturnType<typeof chokidar.watch>;
  private pendingPaths = new Set<string>();
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(store: VectorStore, embedder: EmbeddingPipeline) {
    this.store = store;
    this.embedder = embedder;
  }

  async indexWorkspace(rootPath: string): Promise<{ indexed: number; skipped: number }> {
    const files = await this._walkDir(rootPath);
    let indexed = 0, skipped = 0;
    for (const filePath of files) {
      try {
        await this._indexFile(filePath);
        indexed++;
      } catch {
        skipped++;
      }
    }
    return { indexed, skipped };
  }

  watchWorkspace(rootPath: string): void {
    this.watcher = chokidar.watch(rootPath, {
      ignored: /(node_modules|\.git|dist|\.dai-desktop)/,
      persistent: true,
    });
    this.watcher.on('change', (p) => this._scheduleReindex(p));
    this.watcher.on('add',    (p) => this._scheduleReindex(p));
    this.watcher.on('unlink', (p) => this.store.deleteByFilePath(p));
  }

  stopWatching(): void {
    this.watcher?.close();
  }

  private _scheduleReindex(filePath: string): void {
    this.pendingPaths.add(filePath);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const paths = [...this.pendingPaths];
      this.pendingPaths.clear();
      Promise.all(paths.map((p) => this._indexFile(p))).catch(console.error);
    }, 2000);
  }

  private async _indexFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    if (!CODE_EXTENSIONS.has(ext) && !DOC_EXTENSIONS.has(ext)) return;

    const content = await fs.readFile(filePath, 'utf-8');
    const chunks = this._chunkContent(content, ext, filePath);
    if (chunks.length === 0) return;

    const texts = chunks.map((c) => c.text);
    const embeddings = await this.embedder.embed(texts);

    await this.store.deleteByFilePath(filePath);

    const rows: Chunk[] = chunks.map((c, i) => ({
      id: crypto.randomUUID(),
      filePath,
      chunkText: c.text,
      embedding: embeddings[i],
      chunkType: CODE_EXTENSIONS.has(ext) ? 'block' : 'paragraph',
      startLine: c.startLine,
      endLine: c.endLine,
      lastModified: Date.now(),
      modelName: this.embedder.modelName,
    }));

    await this.store.upsertChunks(rows);
  }

  private _chunkContent(content: string, ext: string, filePath: string) {
    const lines = content.split('\n');
    const chunks: { text: string; startLine: number; endLine: number }[] = [];
    let start = 0;

    while (start < lines.length) {
      const end = Math.min(start + MAX_CHUNK_TOKENS, lines.length);
      const overlapStart = Math.max(0, start - CHUNK_OVERLAP);
      chunks.push({
        text: lines.slice(overlapStart, end).join('\n'),
        startLine: overlapStart + 1,
        endLine: end,
      });
      start = end;
    }
    return chunks;
  }

  private async _walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...await this._walkDir(full));
      else results.push(full);
    }
    return results;
  }
}
