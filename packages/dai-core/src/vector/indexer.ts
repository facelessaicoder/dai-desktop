import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import chokidar from 'chokidar';
import { VectorStore, Chunk } from './store';
import { EmbeddingPipeline } from './embeddings';

// Code and markup
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h',
  '.swift', '.kt', '.cs', '.rb', '.php', '.lua',
  '.html', '.css', '.scss', '.less', '.svelte', '.vue',
  '.sh', '.bash', '.zsh', '.fish', '.ps1',
]);

// Documents and structured text
const DOC_EXTS = new Set([
  '.md', '.mdx', '.txt', '.rst', '.org',
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.csv', '.tsv',
  '.xml', '.svg',
  '.tex', '.latex',
]);

// Binary / media — index metadata only (filename, extension, size)
const META_ONLY_EXTS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.mov', '.mp3', '.wav',
  '.zip', '.tar', '.gz',
]);

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.dai-desktop', '__pycache__', '.venv']);
const MAX_FILE_BYTES = 512 * 1024; // skip files > 512KB
const CHUNK_LINES    = 60;
const OVERLAP_LINES  = 8;

export class FileIndexer {
  private store: VectorStore;
  private embedder: EmbeddingPipeline;
  private watcher?: ReturnType<typeof chokidar.watch>;
  private pending = new Set<string>();
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(store: VectorStore, embedder: EmbeddingPipeline) {
    this.store = store;
    this.embedder = embedder;
  }

  async indexWorkspace(rootPath: string): Promise<{ indexed: number; skipped: number }> {
    const files = await this._walk(rootPath);
    let indexed = 0, skipped = 0;
    for (const f of files) {
      try { await this._indexFile(f); indexed++; }
      catch { skipped++; }
    }
    return { indexed, skipped };
  }

  watchWorkspace(rootPath: string): void {
    this.watcher = chokidar.watch(rootPath, {
      ignored: (p: string) => {
        const parts = p.split(path.sep);
        return parts.some((part) => IGNORE_DIRS.has(part));
      },
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher.on('change', (p) => this._schedule(p));
    this.watcher.on('add',    (p) => this._schedule(p));
    this.watcher.on('unlink', (p) => this.store.deleteByFilePath(p));
  }

  stopWatching(): void {
    this.watcher?.close();
  }

  private _schedule(filePath: string): void {
    this.pending.add(filePath);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const paths = [...this.pending];
      this.pending.clear();
      Promise.all(paths.map((p) => this._indexFile(p))).catch(console.error);
    }, 2000);
  }

  private async _indexFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();

    // Meta-only: index as a single chunk with filename + path info
    if (META_ONLY_EXTS.has(ext)) {
      await this._indexMeta(filePath, ext);
      return;
    }

    if (!CODE_EXTS.has(ext) && !DOC_EXTS.has(ext)) return;

    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.size > MAX_FILE_BYTES) return;

    const content = await fs.readFile(filePath, 'utf-8');
    const chunks  = this._chunkText(content, filePath);
    if (chunks.length === 0) return;

    const embeddings = await this.embedder.embed(chunks.map((c) => c.text));
    await this.store.deleteByFilePath(filePath);

    await this.store.upsertChunks(chunks.map((c, i) => ({
      id: crypto.randomUUID(),
      filePath,
      chunkText: c.text,
      embedding: embeddings[i],
      chunkType: CODE_EXTS.has(ext) ? 'block' : 'paragraph',
      startLine: c.startLine,
      endLine: c.endLine,
      lastModified: Date.now(),
      modelName: this.embedder.modelName,
    } satisfies Chunk)));
  }

  private async _indexMeta(filePath: string, ext: string): Promise<void> {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) return;
    const text = [
      `File: ${path.basename(filePath)}`,
      `Path: ${filePath}`,
      `Type: ${ext.replace('.', '').toUpperCase()}`,
      `Size: ${(stat.size / 1024).toFixed(1)} KB`,
    ].join('\n');
    const [embedding] = await this.embedder.embed([text]);
    await this.store.deleteByFilePath(filePath);
    await this.store.upsertChunks([{
      id: crypto.randomUUID(),
      filePath,
      chunkText: text,
      embedding,
      chunkType: 'paragraph',
      startLine: 1,
      endLine: 1,
      lastModified: Date.now(),
      modelName: this.embedder.modelName,
    }]);
  }

  private _chunkText(content: string, _filePath: string) {
    const lines  = content.split('\n');
    const chunks: { text: string; startLine: number; endLine: number }[] = [];
    let start = 0;
    while (start < lines.length) {
      const end   = Math.min(start + CHUNK_LINES, lines.length);
      const ovlap = Math.max(0, start - OVERLAP_LINES);
      chunks.push({ text: lines.slice(ovlap, end).join('\n'), startLine: ovlap + 1, endLine: end });
      start = end;
    }
    return chunks;
  }

  private async _walk(dir: string): Promise<string[]> {
    const results: string[] = [];
    let entries: import('fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }) as import('fs').Dirent[]; }
    catch { return results; }
    for (const entry of entries) {
      const name = String(entry.name);
      if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (entry.isDirectory()) results.push(...await this._walk(full));
      else results.push(full);
    }
    return results;
  }
}
