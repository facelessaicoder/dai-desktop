// dai-desktop design tokens — single source of truth for all panels
// Every component imports from here. Nothing is hardcoded.

export const color = {
  // Base surfaces
  base:         '#08090E',                    // app background
  surface:      'rgba(255, 255, 255, 0.04)',  // glass panel fill
  surfaceHover: 'rgba(255, 255, 255, 0.07)',  // glass panel hover
  border:       'rgba(255, 255, 255, 0.07)',  // hairline border
  borderFocus:  'rgba(255, 255, 255, 0.14)',  // focused input

  // Text
  textPrimary:  '#F8F9FF',                    // main readable text
  textDim:      'rgba(248, 249, 255, 0.35)',  // labels, metadata, timestamps
  textMuted:    'rgba(248, 249, 255, 0.18)',  // placeholder, disabled

  // Accent — electric aqua — used sparingly, never decoratively
  accent:       '#00E5CC',
  accentDim:    'rgba(0, 229, 204, 0.15)',    // glow, active edge
  accentGlow:   'rgba(0, 229, 204, 0.08)',    // subtle background tint

  // Hardware badges
  cuda:         '#F59E0B',                    // amber — Windows NVIDIA
  metal:        '#00E5CC',                    // aqua — Mac Apple Silicon
  vulkan:       '#818CF8',                    // indigo — Windows AMD/Intel
  cpu:          'rgba(248, 249, 255, 0.35)',  // dim — CPU-only

  // Status
  danger:       '#FF4D6D',
  dangerDim:    'rgba(255, 77, 109, 0.15)',
  success:      '#00E5CC',                    // reuse accent
  warning:      '#F59E0B',
} as const;

export const font = {
  family:  '"Geist", "Inter", system-ui, -apple-system, sans-serif',
  mono:    '"Geist Mono", "JetBrains Mono", "Fira Code", monospace',

  // Scale
  display: '28px',   // panel titles, model name at boot
  heading: '16px',   // section labels, card headers
  body:    '14px',   // chat messages, content
  small:   '12px',   // metadata, timestamps, file paths
  micro:   '11px',   // badges, tags

  // Weights
  light:   '300',
  regular: '400',
  medium:  '500',
} as const;

export const space = {
  '1':  '4px',
  '2':  '8px',
  '3':  '12px',
  '4':  '16px',
  '5':  '20px',
  '6':  '24px',
  '8':  '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
} as const;

export const radius = {
  sm:   '6px',
  md:   '10px',
  lg:   '16px',
  full: '9999px',
} as const;

export const blur = {
  glass:  'blur(20px)',
  subtle: 'blur(8px)',
} as const;

// Framer Motion spring configs
export const spring = {
  // Micro-interactions: button press, toggle
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
  // Panel slide-in, card deploy
  panel:  { type: 'spring' as const, stiffness: 200, damping: 28 },
  // Ambient: status dot breathing, glow pulse
  float:  { type: 'spring' as const, stiffness: 120, damping: 20 },
} as const;

export const duration = {
  fast:   150,  // hover states, opacity
  base:   220,  // panel open/close, card deploy
  slow:   400,  // boot sequence, large transitions
} as const;

// CSS-in-JS shorthand helpers
export const glass = {
  background:   color.surface,
  backdropFilter: blur.glass,
  border:       `1px solid ${color.border}`,
  borderRadius: radius.md,
} as const;

export const glassHover = {
  background: color.surfaceHover,
  borderColor: color.borderFocus,
} as const;

// Active tool card — left edge glow
export const cardActive = {
  borderLeft: `2px solid ${color.accent}`,
  boxShadow:  `inset 2px 0 12px ${color.accentDim}`,
} as const;
