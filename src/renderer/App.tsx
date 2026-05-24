import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, PanelId } from './Sidebar';
import { ChatPanel } from './panels/ChatPanel';
import { PlannerPanel } from './panels/PlannerPanel';
import { CloudPanel } from './panels/CloudPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { WelcomePanel } from './panels/WelcomePanel';
import { color, spring } from '@dai-desktop/ui';

const STORAGE_KEY = 'dai:active-panel';

function getInitialPanel(): PanelId {
  const stored = localStorage.getItem(STORAGE_KEY) as PanelId | null;
  const valid: PanelId[] = ['chat', 'planner', 'cloud', 'settings'];
  return stored && valid.includes(stored) ? stored : 'chat';
}

type AuthState = 'checking' | 'unauthed' | 'authed';

export function App() {
  const [activePanel, setActivePanel] = useState<PanelId>(getInitialPanel);
  const [authState, setAuthState] = useState<AuthState>('checking');

  // Check whether a Dataspheres API key is configured. Either:
  //   - cloudApiKey  — set by the OAuth flow (welcome screen)
  //   - dataspheres_api_key — legacy key from the manual settings flow
  // If neither, show the welcome screen.
  const checkAuth = React.useCallback(async () => {
    const cloud  = await window.dai.settings.get('cloudApiKey');
    const legacy = await window.dai.settings.get('dataspheres_api_key');
    setAuthState(cloud || legacy ? 'authed' : 'unauthed');
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const navigate = (id: PanelId) => {
    setActivePanel(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  // Welcome screen: gate the whole app on auth.
  if (authState === 'checking') {
    return <div style={{ ...appShell, alignItems: 'center', justifyContent: 'center' }} />;
  }

  if (authState === 'unauthed') {
    return (
      <div style={appShell}>
        <div style={topDragBar} aria-hidden />
        <WelcomePanel
          onSignedIn={() => {
            setAuthState('authed');
            // Land in the Cloud panel so the user immediately sees their workspaces
            navigate('cloud');
          }}
          onUseDeveloperKey={() => {
            // Settings is where the manual key flow lives. Once a key is
            // saved there, the Settings panel itself calls settings:set
            // which we'll re-check on focus (TODO: subscribe to setting
            // changes for live update).
            setAuthState('authed');
            navigate('settings');
          }}
        />
      </div>
    );
  }

  return (
    <div style={appShell}>
      <Sidebar active={activePanel} onNavigate={navigate} />
      <main style={mainArea}>
        {/*
          Top drag strip inside the main area — gives the user a place to grab
          the window without overlapping the sidebar (which has its own drag
          region but is only 56px wide). Kept inside <main> so it doesn't sit
          above the Sidebar's stacking context — that combination triggered a
          GPU-compositing repeat-paint bug in Electron dev mode.
        */}
        <div style={topDragBar} aria-hidden />

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

// Normal-flow drag handle at the top of the main panel. NOT position:fixed —
// fixed positioning combined with the Sidebar's app-region created a Chromium
// repaint loop that tiled the entire sidebar across the window in dev mode.
const topDragBar: React.CSSProperties = {
  height: 28,
  flexShrink: 0,
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
