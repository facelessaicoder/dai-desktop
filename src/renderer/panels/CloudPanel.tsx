import React from 'react';
import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';
import { color, font, glass, space, radius, spring } from '@dai-desktop/ui';

export function CloudPanel() {
  return (
    <div style={panelShell}>
      <div style={header}>
        <span style={{ fontSize: font.small, color: color.textDim, fontWeight: font.medium, letterSpacing: '0.06em' }}>
          CLOUD SYNC
        </span>
      </div>

      <div style={centeredContent}>
        <motion.div
          style={iconRing}
          animate={{
            boxShadow: [`0 0 12px ${color.accentDim}`, `0 0 28px ${color.accentDim}`, `0 0 12px ${color.accentDim}`],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Cloud size={28} strokeWidth={1.5} style={{ color: color.accent }} />
        </motion.div>

        <h2 style={{ fontSize: font.display, color: color.textPrimary, fontWeight: font.light }}>
          Coming soon
        </h2>

        <p style={subText}>
          Sync your local workspace with Dataspheres AI — tasks, pages, and research, bridged to the cloud at your command.
        </p>

        <motion.div
          style={featureList}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.panel, delay: 0.15 }}
        >
          {UPCOMING_FEATURES.map((f) => (
            <div key={f} style={featureRow}>
              <span style={featureDot} />
              <span style={{ fontSize: font.small, color: color.textDim }}>{f}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

const UPCOMING_FEATURES = [
  'Bidirectional sync with Dataspheres AI workspaces',
  'Push local SDD tasks to cloud planner',
  'Pull remote pages into local vector search index',
  'One-click publish: share AI responses as pages',
];

// ── Styles ────────────────────────────────────────────────────────────────────

const panelShell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: color.base,
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${space[3]} ${space[5]}`,
  borderBottom: `1px solid ${color.border}`,
  flexShrink: 0,
};

const centeredContent: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[5],
  padding: space[8],
};

const iconRing: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  background: color.accentGlow,
  border: `1px solid ${color.accentDim}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const subText: React.CSSProperties = {
  fontSize: font.body,
  color: color.textDim,
  textAlign: 'center',
  maxWidth: 400,
  lineHeight: '1.65',
};

const featureList: React.CSSProperties = {
  ...glass,
  padding: `${space[4]} ${space[5]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  minWidth: 320,
};

const featureRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
};

const featureDot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: color.accentDim,
  border: `1px solid ${color.accent}`,
  flexShrink: 0,
};
