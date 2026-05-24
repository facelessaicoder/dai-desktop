import React, { useEffect, useRef, useState } from 'react';
import { color, font, space } from '@dai-desktop/ui';
import { motion } from 'framer-motion';

// The planner-panel is a standalone Vite app built to packages/planner-panel/dist.
// We load it in an <iframe> (file:// in production, dev server port in dev) and
// proxy all sdd:* messages between it and the main process via window.dai.sdd.dispatch.

function getPlannerUrl(): string {
  const isDev = process.env.NODE_ENV === 'development';

  // ── Dev mode ────────────────────────────────────────────────────────────
  // Only use the planner-panel dev server when PLANNER_DEV_URL is set. Falling
  // back to a relative file:// path doesn't work here — `window.location.href`
  // is `http://localhost:5174/`, and any path under that gets caught by Vite's
  // SPA fallback (which serves the renderer's own index.html). That caused an
  // infinite-recursive iframe of the entire dai-desktop UI: each level loaded
  // the renderer, which set Planner active from localStorage, which spawned
  // another iframe pointed at the same URL, etc. Symptom was ~16 sidebars
  // tiled across the window. Return '' so PlannerPanel shows BuildInstructions.
  if (isDev) {
    return process.env.PLANNER_DEV_URL ?? '';
  }

  // ── Production ──────────────────────────────────────────────────────────
  // Renderer is served from file://, so we can resolve the packaged planner
  // dist directly via a relative path.
  try {
    const base = window.location.href;
    const url = new URL('../../packages/planner-panel/dist/index.html', base);
    return url.href;
  } catch {
    return '';
  }
}

export function PlannerPanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [plannerUrl] = useState(getPlannerUrl);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);

  // Check if the planner build exists
  useEffect(() => {
    if (!plannerUrl) {
      setMissing(true);
      return;
    }
    // Try to fetch the HTML; if 404 / error show build instruction
    fetch(plannerUrl)
      .then((r) => {
        if (!r.ok) setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [plannerUrl]);

  // Bridge sdd:* messages from the planner iframe → main process
  useEffect(() => {
    const handler = async (ev: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || ev.source !== iframe.contentWindow) return;

      const msg = ev.data as { type: string; payload?: unknown };
      if (!msg?.type?.startsWith('sdd:')) return;

      try {
        const result = await window.dai.sdd.dispatch(msg.type, msg.payload);
        // Route the response back into the iframe
        iframe.contentWindow?.postMessage(sddResponseType(msg.type, result), '*');
      } catch (err) {
        console.error('[PlannerPanel] sdd dispatch error:', err);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (missing) {
    return <BuildInstructions />;
  }

  return (
    <div style={panelShell}>
      {!ready && (
        <div style={loaderOverlay}>
          <ThinkingBar />
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={plannerUrl}
        style={{
          ...iframeStyle,
          opacity: ready ? 1 : 0,
          transition: 'opacity 300ms ease',
        }}
        onLoad={() => setReady(true)}
        // Electron webContents security — allow scripts from the local file
        sandbox="allow-scripts allow-same-origin"
        title="SDD Planner"
      />
    </div>
  );
}

// ── sdd response type mapping ─────────────────────────────────────────────────

function sddResponseType(requestType: string, result: unknown): { type: string; payload: unknown } {
  const map: Record<string, string> = {
    'sdd:list-initiatives': 'sdd:initiatives',
    'sdd:get-board':        'sdd:board',
    'sdd:new-initiative':   'sdd:initiatives',
    'sdd:new-task':         'sdd:board',
    'sdd:move-task':        'sdd:board',
    'sdd:start-task':       'sdd:board',
    'sdd:pass-validation':  'sdd:board',
    'sdd:fail-validation':  'sdd:board',
    'sdd:open-task':        'sdd:task',
    'sdd:update-task':      'sdd:board',
  };

  const r = result as { ok?: boolean; data?: unknown; error?: string } | null;
  const responseType = map[requestType] ?? requestType.replace('sdd:', 'sdd:response:');
  return { type: responseType, payload: r?.data ?? r };
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

function BuildInstructions() {
  return (
    <div style={buildNotice}>
      <ThinkingBar />
      <p style={{ color: color.textDim, fontSize: font.body, textAlign: 'center', maxWidth: 400 }}>
        Planner panel not built yet.
      </p>
      <code style={{ color: color.accent, fontSize: font.small, fontFamily: font.mono, background: color.accentGlow, padding: `${space[1]} ${space[3]}`, borderRadius: 6 }}>
        npm run build:planner
      </code>
      <p style={{ color: color.textMuted, fontSize: font.small, textAlign: 'center' }}>
        Then restart dai-desktop.
      </p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelShell: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: color.base,
  overflow: 'hidden',
};

const iframeStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  width: '100%',
  height: '100%',
};

const loaderOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.base,
  zIndex: 10,
};

const buildNotice: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: space[4],
  padding: space[8],
};
