import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { color, font, glass, spring, space } from '@dai-desktop/ui';
import { KanbanBoard } from './KanbanBoard';
import { InitiativePicker } from './InitiativePicker';
import type { BoardView, Initiative } from '@dai-desktop/core';

// IPC bridge — messages to/from extension host
declare const acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

function ipc(type: string, payload?: unknown) {
  vscode?.postMessage({ type, payload });
}

export function PlannerApp() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for IPC messages from extension host
  useEffect(() => {
    window.addEventListener('message', (ev) => {
      const msg = ev.data as { type: string; payload: unknown };
      switch (msg.type) {
        case 'sdd:initiatives':
          setInitiatives(msg.payload as Initiative[]);
          setLoading(false);
          break;
        case 'sdd:board':
          setBoard(msg.payload as BoardView);
          break;
      }
    });
    // Request initial data
    ipc('sdd:list-initiatives');
  }, []);

  useEffect(() => {
    if (activeId) ipc('sdd:get-board', { initiativeId: activeId });
  }, [activeId]);

  return (
    <div style={{
      ...appShell,
      fontFamily: font.family,
      color: color.textPrimary,
      fontSize: font.body,
    }}>
      {/* Top bar */}
      <div style={topBar}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium }}>
          SDD PLANNER
        </span>
        <InitiativePicker
          initiatives={initiatives}
          activeId={activeId}
          onSelect={(id) => setActiveId(id)}
          onNew={() => ipc('sdd:new-initiative')}
        />
      </div>

      {/* Main board */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" style={centeredMsg} {...fadeProps}>
            <ThinkingBar />
          </motion.div>
        ) : !activeId || !board ? (
          <motion.div key="empty" style={centeredMsg} {...fadeProps}>
            <p style={{ color: color.textDim }}>
              {initiatives.length === 0
                ? 'No initiatives yet — create one to get started.'
                : 'Select an initiative above.'}
            </p>
          </motion.div>
        ) : (
          <motion.div key={activeId} style={{ flex: 1, overflow: 'hidden' }} {...fadeProps}>
            <KanbanBoard
              board={board}
              onMoveTask={(taskId, col) => ipc('sdd:move-task', { taskId, column: col })}
              onStartTask={(taskId) => ipc('sdd:start-task', { taskId })}
              onValidate={(taskId, pass, evidence) =>
                ipc(pass ? 'sdd:pass-validation' : 'sdd:fail-validation', { taskId, evidence })}
              onNewTask={(column) => ipc('sdd:new-task', { initiativeId: activeId, column })}
              onTaskClick={(taskId) => ipc('sdd:open-task', { taskId })}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats bar */}
      {board && (
        <motion.div style={statsBar} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Stat label="total"       value={board.stats.total} />
          <Stat label="done"        value={board.stats.done} accent />
          <Stat label="validating"  value={board.stats.inValidation} />
          <Stat label="complete"    value={`${board.stats.percentComplete}%`} accent />
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ThinkingBar() {
  return (
    <motion.div
      style={{ width: 120, height: 1, background: color.accent, borderRadius: 1 }}
      animate={{ scaleX: [0.3, 1, 0.3], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <span style={{ display: 'flex', gap: space[1], alignItems: 'baseline' }}>
      <span style={{ color: accent ? color.accent : color.textDim, fontSize: font.small }}>{label}</span>
      <span style={{
        color: accent ? color.accent : color.textPrimary,
        fontSize: font.small,
        fontWeight: font.medium,
      }}>{value}</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const appShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: color.base,
  overflow: 'hidden',
};

const topBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${space[3]} ${space[4]}`,
  borderBottom: `1px solid ${color.border}`,
  flexShrink: 0,
};

const statsBar: React.CSSProperties = {
  display: 'flex',
  gap: space[6],
  padding: `${space[2]} ${space[4]}`,
  borderTop: `1px solid ${color.border}`,
  flexShrink: 0,
};

const centeredMsg: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const fadeProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: spring.panel,
};
