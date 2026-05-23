import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, PanelId } from './Sidebar';
import { ChatPanel } from './panels/ChatPanel';
import { PlannerPanel } from './panels/PlannerPanel';
import { CloudPanel } from './panels/CloudPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { color, spring } from '@dai-desktop/ui';

const STORAGE_KEY = 'dai:active-panel';

function getInitialPanel(): PanelId {
  const stored = localStorage.getItem(STORAGE_KEY) as PanelId | null;
  const valid: PanelId[] = ['chat', 'planner', 'cloud', 'settings'];
  return stored && valid.includes(stored) ? stored : 'chat';
}

export function App() {
  const [activePanel, setActivePanel] = useState<PanelId>(getInitialPanel);

  const navigate = (id: PanelId) => {
    setActivePanel(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <div style={appShell}>
      {/*
        Top drag strip — makes the window movable on macOS where `titleBarStyle:
        'hiddenInset'` is used in main.ts. Without this region, there's no
        title bar to grab. Buttons/inputs that overlap this strip should set
        `WebkitAppRegion: 'no-drag'` to remain clickable.
      */}
      <div style={dragStrip} />

      <Sidebar active={activePanel} onNavigate={navigate} />
      <main style={mainArea}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activePanel}
            style={panelWrapper}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={spring.panel}
          >
            {activePanel === 'chat'     && <ChatPanel />}
            {activePanel === 'planner'  && <PlannerPanel />}
            {activePanel === 'cloud'    && <CloudPanel />}
            {activePanel === 'settings' && <SettingsPanel />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

const dragStrip: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  // Skip past the 56px-wide Sidebar so its nav buttons stay clickable.
  // (Anything inside this strip that needs clicks should set
  // WebkitAppRegion: 'no-drag' on itself.)
  left: 56,
  right: 0,
  height: 28,
  zIndex: 9999,
  // @ts-expect-error — Electron-specific CSS property
  WebkitAppRegion: 'drag',
};

const appShell: React.CSSProperties = {
  display: 'flex',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  background: color.base,
};

const mainArea: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  position: 'relative',
};

const panelWrapper: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  width: '100%',
  height: '100%',
};
