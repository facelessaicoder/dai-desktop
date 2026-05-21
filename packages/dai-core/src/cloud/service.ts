import { DatasphereClient } from './client';
import type { Datasphere, Page, Task, CreatePageInput, CreateTaskInput } from './types';

// Re-export for convenience
export { DatasphereClient } from './client';
export { AuthError, NotFoundError, ApiError } from './client';

const DATASPHERES_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── Service ────────────────────────────────────────────────────────────────────

export class DatasphereService {
  /** Exposed for callers that need raw client access (e.g. IPC handlers). */
  readonly client: DatasphereClient;
  private cache = new Map<string, CacheEntry<unknown>>();
  private activeDatasphere: Datasphere | null = null;

  constructor(client: DatasphereClient) {
    this.client = client;
  }

  // ── Cache helpers ────────────────────────────────────────────────────────────

  private cacheSet<T>(key: string, value: T, ttlMs: number): T {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  private cacheGet<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value as T;
  }

  // ── Context management ────────────────────────────────────────────────────────

  async setActiveDatasphere(uri: string): Promise<void> {
    const cached = this.cacheGet<Datasphere>(`ds:${uri}`);
    if (cached) {
      this.activeDatasphere = cached;
      return;
    }
    const ds = await this.client.getDatasphere(uri);
    if (!ds) throw new Error(`Datasphere not found: ${uri}`);
    this.cacheSet(`ds:${uri}`, ds, DATASPHERES_TTL_MS);
    this.activeDatasphere = ds;
  }

  async getActiveDatasphere(): Promise<Datasphere | null> {
    return this.activeDatasphere;
  }

  // ── Cached datasphere list ────────────────────────────────────────────────────

  async listDataspheres(): Promise<Datasphere[]> {
    const cached = this.cacheGet<Datasphere[]>('all_dataspheres');
    if (cached) return cached;

    const list = await this.client.listDataspheres();

    // Warm per-uri cache too
    for (const ds of list) {
      this.cacheSet(`ds:${ds.uri}`, ds, DATASPHERES_TTL_MS);
    }

    return this.cacheSet('all_dataspheres', list, DATASPHERES_TTL_MS);
  }

  // ── Quick capture ─────────────────────────────────────────────────────────────
  // Creates a page or task with a plain-text body in one call.

  async quickCapture(
    text: string,
    type: 'page' | 'task',
    opts: {
      datasphereUri?: string;
      folder?: string;
      planModeId?: string;
      statusGroupId?: string;
    } = {},
  ): Promise<Page | Task> {
    // Resolve which datasphere to use
    const dsUri = opts.datasphereUri ?? this.activeDatasphere?.uri;
    if (!dsUri) throw new Error('No active datasphere — call setActiveDatasphere() first');

    const ds = await this._resolveDatasphere(dsUri);

    if (type === 'page') {
      const title = text.split('\n')[0].slice(0, 100) || 'Quick capture';
      const slug  = `capture-${Date.now()}`;
      const input: CreatePageInput = {
        slug,
        title,
        content: `<p>${text.replace(/\n/g, '</p><p>')}</p>`,
        status: 'published',
        ...(opts.folder ? { folderName: opts.folder } : {}),
      };
      return this.client.createPage(dsUri, input);
    }

    // task
    if (!opts.statusGroupId) {
      // Fall back: pick first plan mode's first status group if available
      const planModes = await this.client.listPlanModes(ds.id);
      if (planModes.length === 0) {
        throw new Error('No plan modes found — pass statusGroupId explicitly');
      }
      // statusGroupId is required; if caller didn't provide it we can't auto-pick here
      // (the platform requires it). Surface a clear error.
      throw new Error(
        'statusGroupId is required for task quick capture. ' +
        `Available plan modes: ${planModes.map((p) => `${p.name} (${p.id})`).join(', ')}`,
      );
    }

    const input: CreateTaskInput = {
      title: text.split('\n')[0].slice(0, 200) || 'Quick capture',
      statusGroupId: opts.statusGroupId,
      content: text,
      ...(opts.planModeId ? { planModeId: opts.planModeId } : {}),
    };
    return this.client.createTask(ds.id, input);
  }

  // ── Push SDD task to cloud planner ────────────────────────────────────────────

  async pushSddTask(
    initiativeId: string,
    taskId: string,
    dsUri: string,
    planModeId: string,
    statusGroupId: string,
    taskData: { title: string; description?: string; priority?: string; tags?: string[] },
  ): Promise<Task> {
    const ds = await this._resolveDatasphere(dsUri);
    const input: CreateTaskInput = {
      title: taskData.title,
      statusGroupId,
      planModeId,
      content: taskData.description,
      priority: taskData.priority,
      tags: taskData.tags ?? [],
    };
    const task = await this.client.createTask(ds.id, input);
    // Attach comment linking back to local SDD initiative/task IDs
    await this.client.createComment(
      ds.id,
      task.id,
      `Pushed from local SDD board — initiative: ${initiativeId}, task: ${taskId}`,
    ).catch(() => { /* comment is non-critical */ });
    return task;
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private async _resolveDatasphere(uri: string): Promise<Datasphere> {
    const cached = this.cacheGet<Datasphere>(`ds:${uri}`);
    if (cached) return cached;
    const ds = await this.client.getDatasphere(uri);
    if (!ds) throw new Error(`Datasphere not found: ${uri}`);
    return this.cacheSet(`ds:${uri}`, ds, DATASPHERES_TTL_MS);
  }
}
