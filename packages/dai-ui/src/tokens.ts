// dai-desktop design tokens — single source of truth for all panels
// Every component imports from here. Nothing is hardcoded.

// Brand palette — primary accent is "aqua-neon ocean green" — bright + saturated
// enough to read as neon, with a slight blue lean for the ocean feel.
// The hero icon stays gold (warm) on the dock — that contrast is intentional.
//
//   neon-mint  #22E5A8      primary accent (SDD mode + default)
//   ocean      #0A1622      app base (deep blue-charcoal)
//   forest     #2F3F1E      icon's central sphere — used for depth/success
//   gold       #D4A24C      icon's hero color — kept for "vibe mode" + warnings
export const color = {
  // Base surfaces — deep ocean blue
  base:         '#0A1622',
  baseElevated: '#11202F',
  surface:      'rgba(34, 229, 168, 0.04)',   // neon-mint tinted glass
  surfaceHover: 'rgba(34, 229, 168, 0.08)',
  border:       'rgba(34, 229, 168, 0.10)',
  borderFocus:  'rgba(34, 229, 168, 0.32)',

  // Text — warm cream for legibility against the ocean base
  textPrimary:  '#F7F0E1',
  textDim:      'rgba(247, 240, 225, 0.40)',
  textMuted:    'rgba(247, 240, 225, 0.20)',

  // Accent — aqua-neon ocean green
  accent:       '#22E5A8',
  accentDim:    'rgba(34, 229, 168, 0.18)',
  accentGlow:   'rgba(34, 229, 168, 0.10)',

  // Mode accents — semantic pair, used by the mode indicator
  // SDD mode: structured / planned / iterative loops    → neon mint (= accent)
  // Vibe mode: one-off / freeform / no plan tracking    → warm gold
  modeSdd:      '#22E5A8',
  modeSddDim:   'rgba(34, 229, 168, 0.18)',
  modeVibe:     '#D4A24C',
  modeVibeDim:  'rgba(212, 162, 76, 0.18)',

  // Secondary — forest green (depth, success outcomes)
  secondary:    '#4A6E3C',
  secondaryDim: 'rgba(74, 110, 60, 0.18)',

  // Tertiary — ocean blue (info, callouts)
  tertiary:     '#3A6E8C',
  tertiaryDim:  'rgba(58, 110, 140, 0.18)',

  // Hardware badges
  cuda:         '#F59E0B',
  metal:        '#22E5A8',                    // matches accent on macOS
  vulkan:       '#818CF8',
  cpu:          'rgba(247, 240, 225, 0.35)',

  // Status
  danger:       '#E5634A',
  dangerDim:    'rgba(229, 99, 74, 0.15)',
  success:      '#22E5A8',
  warning:      '#D4A24C',
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
