import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { color, font, glass, spring, space, radius } from '@dai-desktop/ui';
import type { Initiative } from '@dai-desktop/core';

interface InitiativePickerProps {
  initiatives: Initiative[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function InitiativePicker({ initiatives, activeId, onSelect, onNew }: InitiativePickerProps) {
  const [open, setOpen] = useState(false);
  const active = initiatives.find((i) => i.id === activeId);

  return (
    <div style={{ position: 'relative' }}>
      <button
        style={triggerBtn}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: active ? color.textPrimary : color.textDim }}>
          {active ? active.name : 'Select initiative'}
        </span>
        <span style={{ color: color.textMuted, marginLeft: space[2] }}>▾</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            style={dropdown}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={spring.snappy}
          >
            {initiatives.map((initiative) => (
              <button
                key={initiative.id}
                style={{
                  ...dropdownItem,
                  color: initiative.id === activeId ? color.accent : color.textPrimary,
                }}
                onClick={() => { onSelect(initiative.id); setOpen(false); }}
              >
                <span>{initiative.name}</span>
                <span style={{ fontSize: font.micro, color: color.textDim }}>{initiative.projectType}</span>
              </button>
            ))}

            <div style={{ borderTop: `1px solid ${color.border}`, marginTop: space[1] }} />
            <button style={{ ...dropdownItem, color: color.accent }} onClick={() => { onNew(); setOpen(false); }}>
              + New initiative
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const triggerBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: `${space[1]} ${space[3]}`,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${color.border}`,
  borderRadius: radius.sm,
  color: color.textPrimary,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
};

const dropdown: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 4px)',
  minWidth: 240,
  zIndex: 100,
  ...glass,
  padding: space[2],
};

const dropdownItem: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: `${space[2]} ${space[2]}`,
  background: 'transparent',
  border: 'none',
  borderRadius: radius.sm,
  color: color.textPrimary,
  fontSize: font.small,
  cursor: 'pointer',
  fontFamily: font.family,
  textAlign: 'left',
};
