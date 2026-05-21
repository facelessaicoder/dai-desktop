import { SddStore } from './store';
import {
  Initiative, Task, BoardView, BoardColumn,
  SddColumn, ValidationResult, COLUMN_ORDER, COLUMN_LABELS,
} from './types';

// Gate enforcement — these columns require explicit validation before moving forward
const REQUIRES_VALIDATION_BEFORE_DONE = true;

export class SddEngine {
  constructor(readonly store: SddStore) {}

  // ── Initiative lifecycle ─────────────────────────────────────────────────────

  initProject(options: {
    name: string;
    description: string;
    northStar: string;
    projectType?: string;
  }): Initiative {
    return this.store.createInitiative({
      name: options.name,
      description: options.description,
      northStar: options.northStar,
      projectType: options.projectType ?? 'general',
    });
  }

  // ── Task transitions — enforces SDD gate rules ───────────────────────────────

  startTask(taskId: string): { ok: boolean; error?: string } {
    const task = this.store.getTask(taskId);
    if (!task) return { ok: false, error: `Task ${taskId} not found` };

    if (task.column === 'execution') return { ok: false, error: 'Already in execution' };
    if (task.column === 'done') return { ok: false, error: 'Already done' };
    if (task.column === 'validation') return { ok: false, error: 'In validation — complete the gate first' };

    this.store.moveTask(taskId, 'execution');
    this.store.addComment(taskId, `Started — moved to Execution.`);
    return { ok: true };
  }

  sendToValidation(taskId: string, criteria: string): { ok: boolean; error?: string } {
    const task = this.store.getTask(taskId);
    if (!task) return { ok: false, error: `Task ${taskId} not found` };
    if (task.column !== 'execution') return { ok: false, error: 'Task must be in Execution before validation' };

    this.store.updateTask(taskId, { validationCriteria: criteria, validationResult: 'pending' });
    this.store.moveTask(taskId, 'validation');
    this.store.addComment(taskId, `Sent to Validation.\nCriteria: ${criteria}`);
    return { ok: true };
  }

  passValidation(taskId: string, evidence: string): { ok: boolean; error?: string } {
    const task = this.store.getTask(taskId);
    if (!task) return { ok: false, error: `Task ${taskId} not found` };
    if (task.column !== 'validation') return { ok: false, error: 'Task is not in Validation column' };

    this.store.updateTask(taskId, {
      validationResult: 'pass',
      validationEvidence: evidence,
      validationCheckedAt: Date.now(),
    });
    this.store.moveTask(taskId, 'done');
    this.store.addComment(taskId, `✓ Validation PASSED.\nEvidence: ${evidence}`);
    return { ok: true };
  }

  failValidation(taskId: string, reason: string): { ok: boolean; error?: string } {
    const task = this.store.getTask(taskId);
    if (!task) return { ok: false, error: `Task ${taskId} not found` };
    if (task.column !== 'validation') return { ok: false, error: 'Task is not in Validation column' };

    // Failed validation sends back to Execution — never silently done
    this.store.updateTask(taskId, {
      validationResult: 'fail',
      validationEvidence: reason,
      validationCheckedAt: Date.now(),
    });
    this.store.moveTask(taskId, 'execution');
    this.store.addComment(taskId, `✗ Validation FAILED — sent back to Execution.\nReason: ${reason}`);
    return { ok: true };
  }

  // Direct move — no gate enforcement (for north-stars and epics)
  moveTask(taskId: string, column: SddColumn): { ok: boolean; error?: string } {
    const task = this.store.getTask(taskId);
    if (!task) return { ok: false, error: `Task ${taskId} not found` };

    // Enforce gate: can only go to done via passValidation
    if (column === 'done' && REQUIRES_VALIDATION_BEFORE_DONE) {
      if (task.validationResult !== 'pass') {
        return { ok: false, error: 'Cannot move to Done without passing Validation. Use passValidation().' };
      }
    }

    this.store.moveTask(taskId, column);
    return { ok: true };
  }

  // ── Board view ───────────────────────────────────────────────────────────────

  getBoardView(initiativeId: string): BoardView | null {
    const initiative = this.store.getInitiative(initiativeId);
    if (!initiative) return null;

    const allTasks = this.store.listTasks(initiativeId);
    const gates    = this.store.listGates(initiativeId);

    const columns: BoardColumn[] = COLUMN_ORDER.map((col) => ({
      id: col,
      label: COLUMN_LABELS[col],
      tasks: allTasks.filter((t) => t.column === col),
      count: allTasks.filter((t) => t.column === col).length,
    }));

    const done    = allTasks.filter((t) => t.column === 'done').length;
    const blocked = allTasks.filter((t) => (t.blockedBy?.length ?? 0) > 0).length;
    const inVal   = allTasks.filter((t) => t.column === 'validation').length;

    return {
      initiative,
      columns,
      validationGates: gates,
      stats: {
        total: allTasks.length,
        done,
        inValidation: inVal,
        blocked,
        percentComplete: allTasks.length ? Math.round((done / allTasks.length) * 100) : 0,
      },
    };
  }

  // ── Status summary — for Ari to report on ────────────────────────────────────

  statusReport(initiativeId: string): string {
    const board = this.getBoardView(initiativeId);
    if (!board) return `Initiative ${initiativeId} not found.`;

    const { initiative, columns, stats, validationGates } = board;
    const lines = [
      `## ${initiative.name}`,
      `> ${initiative.northStar}`,
      '',
      `**Progress:** ${stats.done}/${stats.total} done (${stats.percentComplete}%)`,
      stats.blocked  > 0 ? `**Blocked:** ${stats.blocked} tasks` : null,
      stats.inValidation > 0 ? `**In Validation:** ${stats.inValidation} tasks` : null,
      '',
    ].filter(Boolean);

    for (const col of columns) {
      if (col.count === 0) continue;
      lines.push(`### ${col.label} (${col.count})`);
      for (const t of col.tasks) {
        const gate = t.validationResult === 'pass' ? ' ✓' : t.validationResult === 'fail' ? ' ✗' : '';
        lines.push(`- [${t.priority.toUpperCase()}] ${t.title}${gate}`);
      }
      lines.push('');
    }

    const pendingGates = validationGates.filter((g) => g.result === 'pending');
    if (pendingGates.length > 0) {
      lines.push('### Pending Validation Gates');
      for (const g of pendingGates) lines.push(`- ${g.name}: ${g.criteria}`);
    }

    return lines.join('\n');
  }

  // ── Bulk task creation — for sdd_init ─────────────────────────────────────────

  bulkCreateTasks(
    initiativeId: string,
    tasks: Array<Omit<Task, 'id' | 'initiativeId' | 'createdAt' | 'updatedAt'>>,
  ): Task[] {
    return tasks.map((t) => this.store.createTask({ ...t, initiativeId }));
  }
}
