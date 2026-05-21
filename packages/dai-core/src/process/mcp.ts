import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;   // e.g. 'npx'
  args: string[];    // e.g. ['-y', '@dataspheres/dai-skills']
  env?: Record<string, string>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export class McpRegistry extends EventEmitter {
  private servers = new Map<string, { config: McpServerConfig; proc?: ChildProcess }>();
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;

  register(config: McpServerConfig): void {
    this.servers.set(config.id, { config });
  }

  async autoStart(): Promise<void> {
    for (const [id] of this.servers) {
      await this.start(id).catch((err) => {
        this.emit('error', { id, message: String(err) });
      });
    }
  }

  async start(id: string): Promise<void> {
    const entry = this.servers.get(id);
    if (!entry) throw new Error(`MCP server ${id} not registered`);

    const proc = spawn(entry.config.command, entry.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...entry.config.env },
    });

    entry.proc = proc;

    let buffer = '';
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (msg.error) p.reject(msg.error);
            else p.resolve(msg.result);
          } else {
            this.emit('notification', { id, message: msg });
          }
        } catch { /* malformed line */ }
      }
    });

    proc.on('exit', () => this.emit('exit', { id }));
    this.emit('started', { id });
  }

  async call(serverId: string, method: string, params?: unknown): Promise<unknown> {
    const entry = this.servers.get(serverId);
    if (!entry?.proc?.stdin) throw new Error(`MCP server ${serverId} not running`);

    const id = this.nextId++;
    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      entry.proc!.stdin!.write(message);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP call timed out: ${method}`));
        }
      }, 30000);
    });
  }

  stop(id: string): void {
    const entry = this.servers.get(id);
    entry?.proc?.kill('SIGTERM');
  }

  stopAll(): void {
    for (const [id] of this.servers) this.stop(id);
  }

  list(): McpServerConfig[] {
    return Array.from(this.servers.values()).map((e) => e.config);
  }
}
