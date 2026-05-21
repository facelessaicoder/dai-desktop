import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  Initiative, Task, TaskComment, ValidationGate,
  SddColumn, ValidationResult,
} from './types';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.dai-desktop', 'sdd.db');

export class SddStore {
  private db: Database.Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._migrate();
  }

  // ── Initiatives ─────────────────────────────────────────────────────────────

  createInitiative(fields: Omit<Initiative, 'id' | 'createdAt' | 'updatedAt'>): Initiative {
    const now = Date.now();
    const initiative: Initiative = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now };
    this.db.prepare(`
      INSERT INTO initiatives (id, name, description, north_star, project_type, created_at, updated_at)
      VALUES (:id, :name, :description, :northStar, :projectType, :createdAt, :updatedAt)
    `).run({ id: initiative.id, name: initiative.name, description: initiative.description,
      northStar: initiative.northStar, projectType: initiative.projectType,
      createdAt: initiative.createdAt, updatedAt: initiative.updatedAt });
    return initiative;
  }

  getInitiative(id: string): Initiative | null {
    const row = this.db.prepare('SELECT * FROM initiatives WHERE id = ?').get(id) as any;
    return row ? this._mapInitiative(row) : null;
  }

  listInitiatives(): Initiative[] {
    return (this.db.prepare('SELECT * FROM initiatives WHERE archived_at IS NULL ORDER BY created_at DESC').all() as any[])
      .map(r => this._mapInitiative(r));
  }

  updateInitiative(id: string, patch: Partial<Initiative>): void {
    this.db.prepare(`
      UPDATE initiatives SET name=COALESCE(:name,name), description=COALESCE(:description,description),
      north_star=COALESCE(:northStar,north_star), updated_at=:now WHERE id=:id
    `).run({ id, name: patch.name ?? null, description: patch.description ?? null,
      northStar: patch.northStar ?? null, now: Date.now() });
  }

  // ── Tasks ────────────────────────────────────────────────────────────────────

  createTask(fields: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const now = Date.now();
    const task: Task = { id: crypto.randomUUID(), ...fields, createdAt: now, updatedAt: now };
    this.db.prepare(`
      INSERT INTO tasks (id, initiative_id, column_id, title, description, priority, tags,
        assignee, due_at, validation_criteria, parent_id, created_at, updated_at)
      VALUES (:id, :initiativeId, :column, :title, :description, :priority, :tags,
        :assignee, :dueAt, :validationCriteria, :parentId, :createdAt, :updatedAt)
    `).run({
      id: task.id, initiativeId: task.initiativeId, column: task.column,
      title: task.title, description: task.description, priority: task.priority,
      tags: JSON.stringify(task.tags ?? []),
      assignee: task.assignee ?? null, dueAt: task.dueAt ?? null,
      validationCriteria: task.validationCriteria ?? null,
      parentId: task.parentId ?? null,
      createdAt: task.createdAt, updatedAt: task.updatedAt,
    });
    return task;
  }

  getTask(id: string): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
    return row ? this._mapTask(row) : null;
  }

  listTasks(initiativeId: string, column?: SddColumn): Task[] {
    const rows = column
      ? (this.db.prepare('SELECT * FROM tasks WHERE initiative_id = ? AND column_id = ? ORDER BY created_at ASC').all(initiativeId, column) as any[])
      : (this.db.prepare('SELECT * FROM tasks WHERE initiative_id = ? ORDER BY created_at ASC').all(initiativeId) as any[]);
    return rows.map(r => this._mapTask(r));
  }

  moveTask(id: string, column: SddColumn): void {
    const now = Date.now();
    this.db.prepare(`
      UPDATE tasks SET column_id=:column,
        started_at=COALESCE(:startedAt, started_at),
        completed_at=COALESCE(:completedAt, completed_at),
        updated_at=:now
      WHERE id=:id
    `).run({
      id, column, now,
      startedAt: column === 'execution' ? now : null,
      completedAt: column === 'done' ? now : null,
    });
  }

  updateTask(id: string, patch: Partial<Task>): void {
    this.db.prepare(`
      UPDATE tasks SET
        title=COALESCE(:title,title),
        description=COALESCE(:description,description),
        priority=COALESCE(:priority,priority),
        assignee=COALESCE(:assignee,assignee),
        due_at=COALESCE(:dueAt,due_at),
        validation_criteria=COALESCE(:validationCriteria,validation_criteria),
        validation_result=COALESCE(:validationResult,validation_result),
        validation_evidence=COALESCE(:validationEvidence,validation_evidence),
        validation_checked_at=COALESCE(:validationCheckedAt,validation_checked_at),
        updated_at=:now
      WHERE id=:id
    `).run({
      id, now: Date.now(),
      title: patch.title ?? null,
      description: patch.description ?? null,
      priority: patch.priority ?? null,
      assignee: patch.assignee ?? null,
      dueAt: patch.dueAt ?? null,
      validationCriteria: patch.validationCriteria ?? null,
      validationResult: patch.validationResult ?? null,
      validationEvidence: patch.validationEvidence ?? null,
      validationCheckedAt: patch.validationCheckedAt ?? null,
    });
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  addComment(taskId: string, body: string, author = 'ari'): TaskComment {
    const comment: TaskComment = {
      id: crypto.randomUUID(), taskId, body, author, createdAt: Date.now(),
    };
    this.db.prepare('INSERT INTO task_comments (id, task_id, body, author, created_at) VALUES (?,?,?,?,?)')
      .run(comment.id, comment.taskId, comment.body, comment.author, comment.createdAt);
    return comment;
  }

  listComments(taskId: string): TaskComment[] {
    return (this.db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(taskId) as any[])
      .map((r): TaskComment => ({ id: r.id, taskId: r.task_id, body: r.body, author: r.author, createdAt: r.created_at }));
  }

  // ── Validation Gates ─────────────────────────────────────────────────────────

  createGate(fields: Omit<ValidationGate, 'id' | 'createdAt'>): ValidationGate {
    const gate: ValidationGate = { id: crypto.randomUUID(), ...fields, createdAt: Date.now() };
    this.db.prepare(`
      INSERT INTO validation_gates (id, initiative_id, name, criteria, result, evidence, linked_task_id, created_at)
      VALUES (:id, :initiativeId, :name, :criteria, :result, :evidence, :linkedTaskId, :createdAt)
    `).run({ id: gate.id, initiativeId: gate.initiativeId, name: gate.name,
      criteria: gate.criteria, result: gate.result,
      evidence: gate.evidence ?? null, linkedTaskId: gate.linkedTaskId ?? null,
      createdAt: gate.createdAt });
    return gate;
  }

  updateGate(id: string, result: ValidationResult, evidence?: string): void {
    this.db.prepare(`
      UPDATE validation_gates SET result=?, evidence=COALESCE(?,evidence), checked_at=? WHERE id=?
    `).run(result, evidence ?? null, Date.now(), id);
  }

  listGates(initiativeId: string): ValidationGate[] {
    return (this.db.prepare('SELECT * FROM validation_gates WHERE initiative_id = ?').all(initiativeId) as any[])
      .map((r): ValidationGate => ({
        id: r.id, initiativeId: r.initiative_id, name: r.name, criteria: r.criteria,
        result: r.result, evidence: r.evidence ?? undefined,
        linkedTaskId: r.linked_task_id ?? undefined, checkedAt: r.checked_at ?? undefined,
        createdAt: r.created_at,
      }));
  }

  close(): void {
    this.db.close();
  }

  // ── Migrations ───────────────────────────────────────────────────────────────

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS initiatives (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        north_star TEXT NOT NULL DEFAULT '',
        project_type TEXT NOT NULL DEFAULT 'general',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        initiative_id TEXT NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
        column_id TEXT NOT NULL DEFAULT 'epics',
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium',
        tags TEXT NOT NULL DEFAULT '[]',
        assignee TEXT,
        due_at INTEGER,
        validation_criteria TEXT,
        validation_result TEXT,
        validation_evidence TEXT,
        validation_checked_at INTEGER,
        parent_id TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'ari',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS validation_gates (
        id TEXT PRIMARY KEY,
        initiative_id TEXT NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        criteria TEXT NOT NULL,
        result TEXT NOT NULL DEFAULT 'pending',
        evidence TEXT,
        linked_task_id TEXT,
        checked_at INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_initiative ON tasks(initiative_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_column ON tasks(initiative_id, column_id);
      CREATE INDEX IF NOT EXISTS idx_comments_task ON task_comments(task_id);
    `);
  }

  private _mapInitiative(r: any): Initiative {
    return {
      id: r.id, name: r.name, description: r.description,
      northStar: r.north_star, projectType: r.project_type,
      createdAt: r.created_at, updatedAt: r.updated_at,
      archivedAt: r.archived_at ?? undefined,
    };
  }

  private _mapTask(r: any): Task {
    return {
      id: r.id, initiativeId: r.initiative_id, column: r.column_id as SddColumn,
      title: r.title, description: r.description, priority: r.priority,
      tags: JSON.parse(r.tags ?? '[]'),
      assignee: r.assignee ?? undefined, dueAt: r.due_at ?? undefined,
      validationCriteria: r.validation_criteria ?? undefined,
      validationResult: r.validation_result ?? undefined,
      validationEvidence: r.validation_evidence ?? undefined,
      validationCheckedAt: r.validation_checked_at ?? undefined,
      parentId: r.parent_id ?? undefined,
      startedAt: r.started_at ?? undefined, completedAt: r.completed_at ?? undefined,
      blockedBy: [], createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }
}
