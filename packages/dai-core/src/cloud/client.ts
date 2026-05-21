import type {
  Datasphere,
  Page,
  Task,
  PlanMode,
  Comment,
  CreatePageInput,
  CreateTaskInput,
} from './types';

const DEFAULT_BASE_URL = 'https://dataspheres.ai';
const RATE_LIMIT_RETRY_MS = 1000;

// ── Custom errors ──────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(message = 'Unauthorized — check your API key') {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface DatasphereClientOptions {
  apiKey: string;
  baseUrl?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class DatasphereClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: DatasphereClientOptions) {
    this.apiKey  = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ── Core fetch helper ────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T | null> {
    const url = `${this.baseUrl}/api${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 401) {
      throw new AuthError();
    }

    if (res.status === 404) {
      return null;
    }

    if (res.status === 429 && attempt === 0) {
      // Retry once after a short back-off
      await new Promise<void>((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
      return this.request<T>(method, path, body, 1);
    }

    if (!res.ok) {
      let errorBody: unknown;
      try { errorBody = await res.json(); } catch { /* ignore */ }
      throw new ApiError(
        `Dataspheres API error ${res.status} on ${method} ${path}`,
        res.status,
        errorBody,
      );
    }

    // 204 No Content
    if (res.status === 204) return null;

    return res.json() as Promise<T>;
  }

  private get<T>(path: string) { return this.request<T>('GET', path); }
  private post<T>(path: string, body: unknown) { return this.request<T>('POST', path, body); }
  private patch<T>(path: string, body: unknown) { return this.request<T>('PATCH', path, body); }
  private put<T>(path: string, body: unknown) { return this.request<T>('PUT', path, body); }

  // ── Dataspheres ───────────────────────────────────────────────────────────────

  async listDataspheres(): Promise<Datasphere[]> {
    const res = await this.get<{ dataspheres: Datasphere[] } | Datasphere[]>('/dataspheres');
    if (!res) return [];
    return Array.isArray(res) ? res : (res as { dataspheres: Datasphere[] }).dataspheres ?? [];
  }

  async getDatasphere(uri: string): Promise<Datasphere | null> {
    return this.get<Datasphere>(`/dataspheres/${uri}`);
  }

  // ── Pages ──────────────────────────────────────────────────────────────────────

  async listPages(
    uri: string,
    opts: { folder?: string; limit?: number } = {},
  ): Promise<Page[]> {
    const params = new URLSearchParams();
    if (opts.folder) params.set('folder', opts.folder);
    if (opts.limit)  params.set('limit',  String(opts.limit));
    const qs = params.toString() ? `?${params}` : '';
    const res = await this.get<{ pages: Page[] } | Page[]>(`/dataspheres/${uri}/pages${qs}`);
    if (!res) return [];
    return Array.isArray(res) ? res : (res as { pages: Page[] }).pages ?? [];
  }

  async getPage(uri: string, slug: string): Promise<Page | null> {
    return this.get<Page>(`/dataspheres/${uri}/pages/${slug}`);
  }

  async createPage(uri: string, data: CreatePageInput): Promise<Page> {
    const res = await this.post<Page>(`/dataspheres/${uri}/pages`, data);
    if (!res) throw new ApiError('createPage returned no data', 0);
    return res;
  }

  async updatePage(uri: string, slug: string, data: Partial<CreatePageInput>): Promise<Page> {
    const res = await this.patch<Page>(`/dataspheres/${uri}/pages/${slug}`, data);
    if (!res) throw new ApiError('updatePage returned no data', 0);
    return res;
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────────

  async listTasks(
    dsId: string,
    opts: { planModeId?: string; statusGroupId?: string; limit?: number } = {},
  ): Promise<Task[]> {
    const params = new URLSearchParams();
    if (opts.planModeId)    params.set('planModeId',    opts.planModeId);
    if (opts.statusGroupId) params.set('statusGroupId', opts.statusGroupId);
    if (opts.limit)         params.set('limit',         String(opts.limit));
    const qs = params.toString() ? `?${params}` : '';
    const res = await this.get<{ tasks: Task[] } | Task[]>(`/dataspheres/id/${dsId}/tasks${qs}`);
    if (!res) return [];
    return Array.isArray(res) ? res : (res as { tasks: Task[] }).tasks ?? [];
  }

  async getTask(dsId: string, taskId: string): Promise<Task | null> {
    return this.get<Task>(`/dataspheres/id/${dsId}/tasks/${taskId}`);
  }

  async createTask(dsId: string, data: CreateTaskInput): Promise<Task> {
    const res = await this.post<Task>(`/dataspheres/id/${dsId}/tasks`, data);
    if (!res) throw new ApiError('createTask returned no data', 0);
    return res;
  }

  async updateTask(dsId: string, taskId: string, data: Partial<CreateTaskInput>): Promise<Task> {
    const res = await this.patch<Task>(`/dataspheres/id/${dsId}/tasks/${taskId}`, data);
    if (!res) throw new ApiError('updateTask returned no data', 0);
    return res;
  }

  async bulkUpdateTasks(
    dsId: string,
    taskIds: string[],
    update: Partial<CreateTaskInput>,
  ): Promise<void> {
    await this.post<void>(`/dataspheres/id/${dsId}/tasks/bulk`, { taskIds, update });
  }

  // ── Plan modes ─────────────────────────────────────────────────────────────────

  async listPlanModes(dsId: string): Promise<PlanMode[]> {
    const res = await this.get<{ planModes: PlanMode[] } | PlanMode[]>(
      `/dataspheres/id/${dsId}/plan-modes`,
    );
    if (!res) return [];
    return Array.isArray(res) ? res : (res as { planModes: PlanMode[] }).planModes ?? [];
  }

  // ── Comments ───────────────────────────────────────────────────────────────────

  async createComment(dsId: string, taskId: string, content: string): Promise<Comment> {
    const res = await this.post<Comment>(
      `/dataspheres/id/${dsId}/tasks/${taskId}/comments`,
      { content },
    );
    if (!res) throw new ApiError('createComment returned no data', 0);
    return res;
  }
}
