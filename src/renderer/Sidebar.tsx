import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Layout, Cloud, Settings } from 'lucide-react';
import { color, font, space, spring } from '@dai-desktop/ui';

export type PanelId = 'chat' | 'planner' | 'cloud' | 'settings';

interface NavItem {
  id: PanelId;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat',     icon: MessageSquare, label: 'Chat'     },
  { id: 'planner',  icon: Layout,        label: 'Planner'  },
  { id: 'cloud',    icon: Cloud,         label: 'Cloud'    },
  { id: 'settings', icon: Settings,      label: 'Settings' },
];

interface SidebarProps {
  active: PanelId;
  onNavigate: (id: PanelId) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <nav style={sidebarStyle}>
      {/* Dataspheres AI logo mark */}
      <div style={logoSlot} title="Dataspheres AI">
        <motion.div
          animate={{ filter: [`drop-shadow(0 0 4px ${color.accent})`, `drop-shadow(0 0 10px ${color.accent})`, `drop-shadow(0 0 4px ${color.accent})`] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Outer orbit ring */}
            <ellipse cx="14" cy="14" rx="12" ry="5" stroke={color.accent} strokeWidth="1.2" strokeOpacity="0.5" transform="rotate(-30 14 14)" />
            {/* Inner sphere */}
            <circle cx="14" cy="14" r="5.5" fill={color.accent} fillOpacity="0.15" stroke={color.accent} strokeWidth="1.4" />
            {/* Core dot */}
            <circle cx="14" cy="14" r="2" fill={color.accent} />
          </svg>
        </motion.div>
      </div>

      {/* Nav items */}
      <div style={navList}>
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => {
          const isActive = id === active;
          return (
            <motion.button
              key={id}
              onClick={() => onNavigate(id)}
              title={label}
              style={{
                ...navBtn,
                ...(isActive ? navBtnActive : {}),
              }}
              whileHover={{ backgroundColor: color.surfaceHover }}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
            >
              {/* Active indicator: left aqua bar */}
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  style={activeBar}
                  transition={spring.panel}
                />
              )}
              <Icon
                size={20}
                strokeWidth={isActive ? 2 : 1.5}
              />
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sidebarStyle: React.CSSProperties = {
  width: 56,
  flexShrink: 0,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: color.base,
  borderRight: `1px solid ${color.border}`,
  paddingBottom: space[4],
  userSelect: 'none',
  // macOS drag region — only the sidebar acts as window drag handle
  WebkitAppRegion: 'drag' as React.CSSProperties['WebkitAppRegion'],
};

const logoSlot: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 52,
  flexShrink: 0,
  // macOS inset titlebar overlap
  paddingTop: process.platform === 'darwin' ? 16 : 0,
};


const navList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[1],
  flex: 1,
  width: '100%',
  paddingTop: space[2],
  // buttons should not be drag targets
  WebkitAppRegion: 'no-drag' as React.CSSProperties['WebkitAppRegion'],
};

const navBtn: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  border: 'none',
  background: 'transparent',
  borderRadius: 10,
  cursor: 'pointer',
  color: color.textDim,
  transition: 'color 150ms ease',
  outline: 'none',
};

const navBtnActive: React.CSSProperties = {
  color: color.accent,
  background: color.accentGlow,
};

const activeBar: React.CSSProperties = {
  position: 'absolute',
  left: -6,
  top: '50%',
  transform: 'translateY(-50%)',
  width: 3,
  height: 20,
  borderRadius: '0 3px 3px 0',
  background: color.accent,
  boxShadow: `0 0 8px ${color.accent}`,
};
