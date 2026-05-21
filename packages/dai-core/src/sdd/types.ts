// all-dai-sdd data model — works for any project type: coding, content, research, product, ops

export type SddColumn =
  | 'north-stars'  // WHY — goals, principles, success metrics
  | 'epics'        // WHAT — major initiatives broken from north stars
  | 'execution'    // HOW — concrete tasks being actively worked
  | 'validation'   // GATE — criteria must pass before Done
  | 'done';        // SHIPPED — validated and closed

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ValidationResult = 'pass' | 'fail' | 'pending' | 'skip';

export interface Initiative {
  id: string;
  name: string;
  description: string;
  northStar: string;           // the single sentence that defines success
  projectType: string;         // 'coding' | 'content' | 'research' | 'product' | 'ops' | custom
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}

export interface Task {
  id: string;
  initiativeId: string;
  column: SddColumn;
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
  assignee?: string;
  dueAt?: number;
  createdAt: number;
  updatedAt: number;
  // Validation gate fields (required before moving to 'done')
  validationCriteria?: string;   // what must be true to pass
  validationResult?: ValidationResult;
  validationEvidence?: string;   // proof: test output, screenshot path, URL, notes
  validationCheckedAt?: number;
  // Execution tracking
  startedAt?: number;
  completedAt?: number;
  // Links to other tasks
  blockedBy?: string[];          // task IDs this is waiting on
  parentId?: string;             // parent epic ID
}

export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  author: string;
  createdAt: number;
}

export interface ValidationGate {
  id: string;
  initiativeId: string;
  name: string;                  // e.g. "VA-001 — SNP F1 ≥ 0.95"
  criteria: string;
  result: ValidationResult;
  evidence?: string;
  linkedTaskId?: string;
  checkedAt?: number;
  createdAt: number;
}

// Board view — flattened column summary for the Kanban panel
export interface BoardColumn {
  id: SddColumn;
  label: string;
  tasks: Task[];
  count: number;
}

export interface BoardView {
  initiative: Initiative;
  columns: BoardColumn[];
  validationGates: ValidationGate[];
  stats: {
    total: number;
    done: number;
    inValidation: number;
    blocked: number;
    percentComplete: number;
  };
}

export const COLUMN_LABELS: Record<SddColumn, string> = {
  'north-stars': 'North Stars',
  'epics':       'Epics',
  'execution':   'Execution',
  'validation':  'Validation',
  'done':        'Done',
};

export const COLUMN_ORDER: SddColumn[] = [
  'north-stars', 'epics', 'execution', 'validation', 'done',
];
