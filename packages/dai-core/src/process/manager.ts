import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

export interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  args: string[];
  pid?: number;
  status: 'stopped' | 'starting' | 'running' | 'crashed';
  restartCount: number;
  startedAt?: Date;
  cpuPercent?: number;
  memoryMb?: number;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, { meta: ManagedProcess; proc?: ChildProcess }>();
  private readonly maxRestarts = 5;
  private readonly restartDelayMs = 2000;

  register(id: string, name: string, command: string, args: string[]): void {
    this.processes.set(id, {
      meta: { id, name, command, args, status: 'stopped', restartCount: 0 },
    });
  }

  async start(id: string): Promise<void> {
    const entry = this.processes.get(id);
    if (!entry) throw new Error(`Process ${id} not registered`);

    entry.meta.status = 'starting';
    this.emit('status', entry.meta);

    const proc = spawn(entry.meta.command, entry.meta.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    entry.proc = proc;
    entry.meta.pid = proc.pid;
    entry.meta.startedAt = new Date();
    entry.meta.status = 'running';
    this.emit('status', entry.meta);

    proc.on('exit', (code) => {
      entry.meta.status = 'crashed';
      entry.meta.pid = undefined;
      this.emit('status', entry.meta);
      this._scheduleRestart(id, code ?? -1);
    });
  }

  stop(id: string): void {
    const entry = this.processes.get(id);
    if (!entry?.proc) return;
    entry.proc.kill('SIGTERM');
    entry.meta.status = 'stopped';
    entry.meta.restartCount = 0;
    this.emit('status', entry.meta);
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values()).map((e) => e.meta);
  }

  private _scheduleRestart(id: string, exitCode: number): void {
    const entry = this.processes.get(id);
    if (!entry || entry.meta.status === 'stopped') return;
    if (entry.meta.restartCount >= this.maxRestarts) {
      this.emit('error', { id, message: `Process ${id} exceeded max restarts` });
      return;
    }
    entry.meta.restartCount++;
    setTimeout(() => this.start(id), this.restartDelayMs * entry.meta.restartCount);
  }
}
