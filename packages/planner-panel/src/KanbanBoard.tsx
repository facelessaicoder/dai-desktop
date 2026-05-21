import React from 'react';
import { motion } from 'framer-motion';
import { color, font, glass, cardActive, spring, space, radius } from '@dai-desktop/ui';
import type { BoardView, Task, SddColumn } from '@dai-desktop/core';
import { COLUMN_LABELS, COLUMN_ORDER } from '@dai-desktop/core';

interface KanbanBoardProps {
  board: BoardView;
  onMoveTask:   (taskId: string, col: SddColumn) => void;
  onStartTask:  (taskId: string) => void;
  onValidate:   (taskId: string, pass: boolean, evidence: string) => void;
  onNewTask:    (col: SddColumn) => void;
  onTaskClick:  (taskId: string) => void;
}

export function KanbanBoard({ board, onStartTask, onValidate, onNewTask, onTaskClick }: KanbanBoardProps) {
  return (
    <div style={boardLayout}>
      {board.columns.map((col) => (
        <Column
          key={col.id}
          column={col.id}
          label={col.label}
          tasks={col.tasks}
          count={col.count}
          onStartTask={onStartTask}
          onValidate={onValidate}
          onNewTask={onNewTask}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

interface ColumnProps {
  column: SddColumn;
  label: string;
  tasks: Task[];
  count: number;
  onStartTask:  (id: string) => void;
  onValidate:   (id: string, pass: boolean, evidence: string) => void;
  onNewTask:    (col: SddColumn) => void;
  onTaskClick:  (id: string) => void;
}

function Column({ column, label, tasks, count, onStartTask, onValidate, onNewTask, onTaskClick }: ColumnProps) {
  const isValidation = column === 'validation';
  const isDone       = column === 'done';

  return (
    <div style={colContainer}>
      {/* Column header */}
      <div style={colHeader}>
        <span style={{ fontSize: font.small, fontWeight: font.medium, color: color.textDim, letterSpacing: '0.08em' }}>
          {label.toUpperCase()}
        </span>
        <span style={{
          fontSize: font.micro,
          color: count > 0 ? color.accent : color.textMuted,
          fontWeight: font.medium,
        }}>
          {count}
        </span>
      </div>

      {/* Task list */}
      <div style={colBody}>
        {tasks.map((task, i) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.panel, delay: i * 0.04 }}
          >
            <TaskCard
              task={task}
              isValidation={isValidation}
              isDone={isDone}
              onStart={() => onStartTask(task.id)}
              onValidate={(pass, evidence) => onValidate(task.id, pass, evidence)}
              onClick={() => onTaskClick(task.id)}
            />
          </motion.div>
        ))}

        {/* Add task */}
        {!isDone && (
          <button style={addBtn} onClick={() => onNewTask(column)}>
            + add
          </button>
        )}
      </div>
    </div>
  );
}

// ── TaskCard ───────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  isValidation: boolean;
  isDone: boolean;
  onStart: () => void;
  onValidate: (pass: boolean, evidence: string) => void;
  onClick: () => void;
}

function TaskCard({ task, isValidation, isDone, onStart, onValidate, onClick }: TaskCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [evidence, setEvidence] = React.useState('');

  const isActive = task.column === 'execution' || task.column === 'validation';
  const gatePassed = task.validationResult === 'pass';
  const gateFailed = task.validationResult === 'fail';

  return (
    <motion.div
      style={{
        ...glass,
        ...(isActive && !isDone ? cardActive : {}),
        ...(isDone && gatePassed ? doneStyle : {}),
        padding: space[3],
        marginBottom: space[2],
        cursor: 'pointer',
        position: 'relative',
      }}
      whileHover={{ background: 'rgba(255,255,255,0.07)' }}
      transition={spring.snappy}
      onClick={() => { setExpanded((e) => !e); onClick(); }}
    >
      {/* Priority dot */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <PriorityDot priority={task.priority} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            margin: 0,
            fontSize: font.body,
            fontWeight: font.regular,
            color: isDone ? color.textDim : color.textPrimary,
            textDecoration: isDone ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {task.title}
          </p>

          {/* Tags */}
          {task.tags.length > 0 && (
            <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginTop: space[1] }}>
              {task.tags.slice(0, 3).map((tag) => (
                <span key={tag} style={tagStyle}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Gate status */}
        {gatePassed && <span style={{ color: color.accent, fontSize: font.small }}>✓</span>}
        {gateFailed && <span style={{ color: color.danger, fontSize: font.small }}>✗</span>}
      </div>

      {/* Validation controls — only shown in validation column */}
      <AnimatePresence>
        {isValidation && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.panel}
            style={{ overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginTop: space[3], borderTop: `1px solid ${color.border}`, paddingTop: space[3] }}>
              {task.validationCriteria && (
                <p style={{ margin: `0 0 ${space[2]}`, fontSize: font.small, color: color.textDim }}>
                  {task.validationCriteria}
                </p>
              )}
              <textarea
                placeholder="Evidence / notes..."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                style={evidenceInput}
                rows={2}
              />
              <div style={{ display: 'flex', gap: space[2], marginTop: space[2] }}>
                <button style={passBtn} onClick={() => onValidate(true, evidence)}>Pass ✓</button>
                <button style={failBtn} onClick={() => onValidate(false, evidence)}>Fail ✗</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start button — execution column */}
      {task.column === 'epics' && expanded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={(e) => { e.stopPropagation(); onStart(); }}
        >
          <button style={{ ...passBtn, marginTop: space[2] }}>Start →</button>
        </motion.div>
      )}
    </motion.div>
  );
}

function PriorityDot({ priority }: { priority: Task['priority'] }) {
  const palette: Record<string, string> = {
    critical: color.danger,
    high:     color.warning,
    medium:   color.accent,
    low:      color.textDim,
  };
  const c = palette[priority] ?? color.textDim;
  return (
    <div style={{
      width: 6, height: 6, borderRadius: '50%',
      background: c, marginTop: 5, flexShrink: 0,
    }} />
  );
}

function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const boardLayout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: space[3],
  padding: space[4],
  height: '100%',
  overflow: 'hidden',
};

const colContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
};

const colHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: space[3],
  borderBottom: `1px solid ${color.border}`,
  marginBottom: space[3],
  flexShrink: 0,
};

const colBody: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  paddingRight: space[1],
};

const addBtn: React.CSSProperties = {
  width: '100%',
  padding: `${space[2]} ${space[3]}`,
  background: 'transparent',
  border: `1px dashed ${color.border}`,
  borderRadius: radius.sm,
  color: color.textMuted,
  fontSize: font.small,
  cursor: 'pointer',
  marginTop: space[2],
};

const tagStyle: React.CSSProperties = {
  fontSize: font.micro,
  color: color.textDim,
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.full,
  padding: `1px ${space[2]}`,
  fontFamily: font.mono,
};

const doneStyle: React.CSSProperties = {
  opacity: 0.5,
};

const evidenceInput: React.CSSProperties = {
  width: '100%',
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  color: color.textPrimary,
  fontSize: font.small,
  padding: space[2],
  resize: 'none',
  fontFamily: font.family,
  boxSizing: 'border-box',
};

const passBtn: React.CSSProperties = {
  flex: 1,
  padding: `${space[1]} ${space[3]}`,
  background: color.accentDim,
  border: `1px solid ${color.accent}`,
  borderRadius: radius.sm,
  color: color.accent,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
};

const failBtn: React.CSSProperties = {
  flex: 1,
  padding: `${space[1]} ${space[3]}`,
  background: color.dangerDim,
  border: `1px solid ${color.danger}`,
  borderRadius: radius.sm,
  color: color.danger,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
};
