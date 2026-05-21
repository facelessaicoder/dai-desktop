import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as os from 'os';

export interface Chunk {
  id: string;
  filePath: string;
  chunkText: string;
  embedding: number[];
  chunkType: 'function' | 'class' | 'paragraph' | 'block';
  startLine: number;
  endLine: number;
  lastModified: number;
  modelName: string;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private readonly dbPath: string;
  private readonly tableName = 'chunks';

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(os.homedir(), '.dai-desktop', 'vectordb');
  }

  async init(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    const tables = await this.db.tableNames();
    if (tables.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  async upsertChunks(chunks: Chunk[]): Promise<void> {
    if (!this.db) throw new Error('VectorStore not initialized');
    if (chunks.length === 0) return;

    if (!this.table) {
      this.table = await this.db.createTable(this.tableName, chunks);
    } else {
      await this.table.add(chunks);
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    if (!this.table) return;
    await this.table.delete(`filePath = '${filePath.replace(/'/g, "''")}'`);
  }

  async search(queryEmbedding: number[], limit = 10, filter?: string): Promise<SearchResult[]> {
    if (!this.table) return [];
    const query = this.table.vectorSearch(queryEmbedding).limit(limit);
    if (filter) query.filter(filter);
    const rows = await query.toArray();
    return rows.map((row: any) => ({
      chunk: row as Chunk,
      score: row._distance ?? 0,
    }));
  }

  async searchCode(queryEmbedding: number[], limit = 10): Promise<SearchResult[]> {
    return this.search(queryEmbedding, limit, `chunkType IN ('function', 'class', 'block')`);
  }

  async searchDocs(queryEmbedding: number[], limit = 10): Promise<SearchResult[]> {
    return this.search(queryEmbedding, limit, `chunkType = 'paragraph'`);
  }

  async countChunks(): Promise<number> {
    if (!this.table) return 0;
    return (await this.table.countRows());
  }
}
