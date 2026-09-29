/**
 * Babin Rentals Design Tokens
 * Single source of truth for colors, spacing, typography, shadows, radii, z-index.
 * Used by both the ops app (CSS variables) and marketing page (Tailwind config).
 */

// ============================================================================
// COLOR PALETTE — DESIGN_DIRECTION_SPEC_v4.1
// ============================================================================

export const lightColors = {
  // Core elevations
  bg0: '#eae6de',
  bg: '#f5f7fb',
  bgGlow: '#edf2f9',
  surface: '#ffffff',
  surface2: '#edf3fa',
  inset: '#f5f3ee',
  inset2: '#eae6de',
  border: '#cbd5e1',
  border2: '#d8e2ee',
  divider: '#cbd5e1',

  // Translucent alpha scale (slate-based)
  w02: 'rgba(15, 23, 42, 0.02)',
  w04: 'rgba(15, 23, 42, 0.04)',
  w05: 'rgba(15, 23, 42, 0.05)',
  w08: 'rgba(15, 23, 42, 0.08)',
  w10: 'rgba(15, 23, 42, 0.10)',
  w12: 'rgba(15, 23, 42, 0.12)',
  w15: 'rgba(15, 23, 42, 0.15)',
  w20: 'rgba(15, 23, 42, 0.20)',
  w30: 'rgba(15, 23, 42, 0.30)',
  w40: 'rgba(15, 23, 42, 0.40)',

  // Gradients
  bgGradient1: '#f5f7fb',
  bgGradient2: '#edf2f9',
  bgRadialMesh: 'none',
  surfaceCard: '#ffffff',
  surfaceCardHover: '#edf3fa',
  glassTint: 0.88,
  specularRim: '0 0 0 transparent',
  bezelOuterRing: '0 0 0 1px rgba(16, 32, 59, 0.06)',
  bezelOuterBg: 'rgba(16, 32, 59, 0.025)',

  // Text
  text: '#1c1e22',
  text2: '#4b4e54',
  muted: '#6d7076',
  disabled: '#9b9ea4',

  // Brand & status
  primary: '#2456d6',
  onPrimary: '#ffffff',
  primaryText: '#1e49b8',

  success: '#1e864a',
  onSuccess: '#ffffff',
  successText: '#15683a',

  danger: '#c73a3a',
  onDanger: '#ffffff',
  dangerText: '#a82f2f',

  warn: '#c45d16',
  onWarn: '#231a05',
  warnText: '#a05818',

  ready: '#d4a315',
  onReady: '#231a05',
  readyText: '#8a6b0b',

  neutral: '#72757e',
  onNeutral: '#ffffff',

  dim: '#dddcd6',
  onDim: '#5a5d63',

  // Extended
  extFg: '#1e49b8',
  extLine: '#2456d6',
  extBg: 'rgba(36, 86, 214, 0.1)',
  gold: '#2456d6',
  brandMark: '#2456d6',

  // Surfaces
  app: '#f5f7fb',
  sidebar: '#ffffff',
  card: '#ffffff',
  card2: '#edf3fa',
  modal: '#ffffff',
  dropdown: '#ffffff',

  // Hover
  hoverCard: '#eef4fb',
  hoverSidebar: '#eef4fb',
  hoverButton: '#1e49b8',
  hoverRow: '#eef4fb',

  // Buttons
  btnPrimaryBg: '#2456d6',
  btnPrimaryFg: '#ffffff',
  btnSecondaryBg: 'transparent',
  btnSecondaryBorder: '#dbe5f0',
  btnDangerBg: '#c73a3a',
  btnDangerFg: '#ffffff',

  // Nav
  navActiveAccent: '#2456d6',
  navActiveBg: '#e7efff',
  navIcon: '#6d7076',

  // Inputs
  inputBg: '#ffffff',
  inputBorder: '#afc0d4',
  inputPlaceholder: '#6d7e95',
  inputFocus: '#2456d6',

  // Tables
  thBg: '#edf3fa',
  trBg: '#ffffff',
  trHover: '#eef4fb',
  trAlt: '#f5f7fb',

  // Shadows (tinted to slate)
  shadowXs: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
  shadowSm: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
  shadow: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -1px rgba(15, 23, 42, 0.03)',
  shadowCard: '0 0 0 transparent',
  shadowKpi: '0 0 0 transparent',
  shadowMd: '0 8px 20px -3px rgba(15, 23, 42, 0.08)',
  shadowLg: '0 10px 15px -3px rgba(15, 23, 42, 0.05), 0 4px 6px -2px rgba(15, 23, 42, 0.025)',
  shadowXl: '0 20px 25px -5px rgba(15, 23, 42, 0.10), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
  shadowModal: '0 20px 48px rgba(15, 23, 42, 0.16)',
  shadowPrimaryGlow: '0 8px 20px -4px rgba(36, 86, 214, 0.25)',

  // Status chips
  chipBlueBg: '#DBEAFE',
  chipBlueFg: '#1E40AF',
  chipGrayBg: '#F3F4F6',
  chipGrayFg: '#374151',
  chipAmberBg: '#FEF3C7',
  chipAmberFg: '#92400E',

  dangerSoft: '#fdf6f6',
  scrim: 'rgba(15, 23, 42, 0.45)',

  chartGrid: '#dbe5f0',
  cat1: '#0072b2',
  cat2: '#c87a00',
  cat3: '#009e73',
  cat4: '#d55e00',
  cat5: '#3d5a9e',
  cat6: '#b23a6b',
  cat7: '#6b7a00',
  cat8: '#8b3a0e',
};

export const darkColors = {
  // Core elevations (5-tier obsidian)
  bg0: '#02060b',
  bg: '#050b12',
  bgGlow: '#0a1826',
  surface: '#0b1622',
  surface2: '#0d1a29',
  inset: '#081522',
  inset2: '#0b1b2c',
  border: 'rgba(255, 255, 255, 0.08)',
  border2: 'rgba(255, 255, 255, 0.12)',
  divider: 'rgba(255, 255, 255, 0.08)',

  // Translucent alpha scale (white-based)
  w02: 'rgba(255, 255, 255, 0.02)',
  w04: 'rgba(255, 255, 255, 0.04)',
  w05: 'rgba(255, 255, 255, 0.05)',
  w08: 'rgba(255, 255, 255, 0.08)',
  w10: 'rgba(255, 255, 255, 0.10)',
  w12: 'rgba(255, 255, 255, 0.12)',
  w15: 'rgba(255, 255, 255, 0.15)',
  w20: 'rgba(255, 255, 255, 0.20)',
  w30: 'rgba(255, 255, 255, 0.30)',
  w40: 'rgba(255, 255, 255, 0.40)',

  // Gradients
  bgGradient1: '#050b12',
  bgGradient2: '#02060b',
  bgRadialMesh: 'radial-gradient(ellipse 80% 50% at 50% -20%, #0a1826 0%, #050b12 100%)',
  surfaceCard: 'linear-gradient(180deg, var(--card2) 0%, var(--card) 100%)',
  surfaceCardHover: '#0d1a29',
  glassTint: 0.88,
  specularRim: '0 1px 0 rgba(255, 255, 255, 0.08) inset',
  bezelOuterRing: '0 0 0 1px rgba(255, 255, 255, 0.08)',
  bezelOuterBg: 'rgba(255, 255, 255, 0.02)',

  // Text
  text: '#f1f5f9',
  text2: '#94a3b8',
  muted: '#8b8e96',
  disabled: '#475569',

  // Brand & status
  primary: '#386af7',
  onPrimary: '#ffffff',
  primaryText: '#7ea2ff',

  success: '#1e864a',
  onSuccess: '#ffffff',
  successText: '#4ade80',

  danger: '#c73a3a',
  onDanger: '#ffffff',
  dangerText: '#f08a8a',

  warn: '#d47026',
  onWarn: '#1c1005',
  warnText: '#e8a06e',

  ready: '#d4a824',
  onReady: '#1c1405',
  readyText: '#d4a824',

  neutral: '#3a3e47',
  onNeutral: '#c9cbd1',

  dim: '#24262c',
  onDim: '#8b8e96',

  // Extended
  extFg: '#85b2ff',
  extLine: '#386af7',
  extBg: 'rgba(56, 106, 247, 0.14)',
  gold: '#386af7',
  brandMark: '#85b2ff',

  // Surfaces
  app: '#050b12',
  sidebar: '#050b12',
  card: '#0b1622',
  card2: '#0d1a29',
  modal: '#0d1a29',
  dropdown: '#0d1a29',

  // Hover
  hoverCard: '#0f1e30',
  hoverSidebar: '#0d1a29',
  hoverButton: '#2f5ce0',
  hoverRow: 'rgba(255, 255, 255, 0.035)',

  // Buttons
  btnPrimaryBg: '#386af7',
  btnPrimaryFg: '#ffffff',
  btnSecondaryBg: 'transparent',
  btnSecondaryBorder: '#263849',
  btnDangerBg: '#c73a3a',
  btnDangerFg: '#ffffff',

  // Nav
  navActiveAccent: '#386af7',
  navActiveBg: '#102b48',
  navIcon: '#94a3b8',

  // Inputs
  inputBg: '#081522',
  inputBorder: 'rgba(255, 255, 255, 0.12)',
  inputPlaceholder: '#64748b',
  inputFocus: '#386af7',

  // Tables
  thBg: '#081522',
  trBg: '#0b1622',
  trHover: 'rgba(255, 255, 255, 0.035)',
  trAlt: '#081522',

  // Shadows (tinted to obsidian)
  shadowXs: '0 1px 2px 0 rgba(2, 6, 11, 0.35)',
  shadowSm: '0 1px 3px 0 rgba(2, 6, 11, 0.4), 0 1px 2px -1px rgba(2, 6, 11, 0.3)',
  shadow: '0 4px 14px -2px rgba(2, 6, 11, 0.5), 0 2px 6px -1px rgba(2, 6, 11, 0.3)',
  shadowCard: '0 0 0 transparent',
  shadowKpi: '0 0 0 transparent',
  shadowMd: '0 14px 28px -4px rgba(2, 6, 11, 0.6), 0 6px 12px -2px rgba(2, 6, 11, 0.4)',
  shadowLg: '0 20px 36px -6px rgba(2, 6, 11, 0.65), 0 8px 14px -3px rgba(2, 6, 11, 0.45)',
  shadowXl: '0 28px 56px -8px rgba(2, 6, 11, 0.75), 0 12px 18px -4px rgba(2, 6, 11, 0.5)',
  shadowModal: '0 28px 72px -12px rgba(2, 6, 11, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
  shadowPrimaryGlow: '0 8px 28px -4px rgba(56, 106, 247, 0.45)',

  // Status chips
  chipBlueBg: 'rgba(59, 130, 246, 0.18)',
  chipBlueFg: '#93C5FD',
  chipGrayBg: 'rgba(156, 163, 175, 0.18)',
  chipGrayFg: '#D1D5DB',
  chipAmberBg: 'rgba(245, 158, 11, 0.18)',
  chipAmberFg: '#FCD34D',

  dangerSoft: '#1a1315',
  scrim: 'rgba(0, 0, 0, 0.65)',

  chartGrid: '#263849',
  cat1: '#3b82d6',
  cat2: '#b87a1e',
  cat3: '#249e76',
  cat4: '#d9613c',
  cat5: '#5a76c2',
  cat6: '#c25588',
  cat7: '#7a8c3e',
  cat8: '#5d71b0',
};

export const highContrastColors = {
  bg: '#0a0a0a',
  surface: '#0a0a0a',
  surface2: '#141414',
  border: '#facc15',
  border2: '#eab308',
  divider: '#facc15',
  text: '#ffffff',
  text2: '#f1f5f9',
  muted: '#e2e8f0',
  disabled: '#94a3b8',
  primary: '#facc15',
  onPrimary: '#000000',
  success: '#22c55e',
  onSuccess: '#000000',
  danger: '#ef4444',
  onDanger: '#000000',
  warn: '#f97316',
  onWarn: '#000000',
  ready: '#facc15',
  onReady: '#000000',
};

export const colors = {
  light: lightColors,
  dark: darkColors,
  highContrast: highContrastColors,
} as const;

// ============================================================================
// SPACING SCALE
// ============================================================================

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
} as const;

// Aliases for Tailwind
export const space = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const fontFamilies = {
  display: ['Outfit', 'system-ui', 'sans-serif'],
  body: ['Outfit', 'Source Sans 3', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
  id: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
  neDisplay: ['Asar', 'serif'],
  neBody: ['Hind', 'system-ui', 'sans-serif'],
} as const;

export const fontSizes = {
  // Fluid scale (rem-based, scales with viewport)
  display: 'clamp(2.6rem, 5.2vw, 5.5rem)',
  h1: 'clamp(2.4rem, 4.8vw, 4.5rem)',
  h2: 'clamp(2rem, 3.8vw, 3.6rem)',
  h3: 'clamp(1.6rem, 3.2vw, 3rem)',
  h4: 'clamp(1.4rem, 2.8vw, 2.5rem)',
  body: '1rem',
  bodyLg: '1.125rem',
  ui: '0.9375rem',
  meta: '0.875rem',
  caption: '0.75rem',
  th: '0.6875rem',
} as const;

// Fluid root font size (15px at 1280 → 17px at 1920)
export const rootFontSize = 'clamp(0.9375rem, 0.6875rem + 0.3125vw, 1.0625rem)';

export const lineHeights = {
  tight: 1.0,
  snug: 1.25,
  normal: 1.5,
  relaxed: 1.625,
  loose: 1.75,
} as const;

export const letterSpacings = {
  tighter: '-0.035em',
  tight: '-0.02em',
  normal: '0',
  wide: '0.02em',
  wider: '0.04em',
  widest: '0.1em',
  widestTitle: '0.18em',
} as const;

// ============================================================================
// BORDER RADII
// ============================================================================

export const radii = {
  none: '0',
  xs: '4px',
  sm: '6px',     // --r-chip / --r-xs
  md: '8px',     // --r-btn / --r-input / --r-sm
  lg: '10px',    // --r-card
  xl: '12px',    // --r-modal
  '2xl': '16px',
  full: '9999px', // --r-badge
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

export const shadows = {
  xs: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
  sm: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
  base: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -1px rgba(15, 23, 42, 0.03)',
  md: '0 8px 20px -3px rgba(15, 23, 42, 0.08)',
  lg: '0 10px 15px -3px rgba(15, 23, 42, 0.05), 0 4px 6px -2px rgba(15, 23, 42, 0.025)',
  xl: '0 20px 25px -5px rgba(15, 23, 42, 0.10), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
  modal: '0 20px 48px rgba(15, 23, 42, 0.16)',
  primaryGlow: '0 8px 20px -4px rgba(36, 86, 214, 0.25)',
  // Dark mode variants (tinted to obsidian)
  dark: {
    xs: '0 1px 2px 0 rgba(2, 6, 11, 0.35)',
    sm: '0 1px 3px 0 rgba(2, 6, 11, 0.4), 0 1px 2px -1px rgba(2, 6, 11, 0.3)',
    base: '0 4px 14px -2px rgba(2, 6, 11, 0.5), 0 2px 6px -1px rgba(2, 6, 11, 0.3)',
    md: '0 14px 28px -4px rgba(2, 6, 11, 0.6), 0 6px 12px -2px rgba(2, 6, 11, 0.4)',
    lg: '0 20px 36px -6px rgba(2, 6, 11, 0.65), 0 8px 14px -3px rgba(2, 6, 11, 0.45)',
    xl: '0 28px 56px -8px rgba(2, 6, 11, 0.75), 0 12px 18px -4px rgba(2, 6, 11, 0.5)',
    modal: '0 28px 72px -12px rgba(2, 6, 11, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
    primaryGlow: '0 8px 28px -4px rgba(56, 106, 247, 0.45)',
  },
} as const;

// ============================================================================
// Z-INDEX SCALE
// ============================================================================

export const zIndex = {
  dropdown: 1100,    // menus, popovers, comboboxes
  stickyNav: 1200,   // sticky headers / sub-navigation bars
  overlay: 1300,     // backdrops, full-screen scrims behind a modal/drawer
  drawer: 1350,      // slide-over filter and context drawers
  modal: 1400,       // modal dialogs, above their own overlay
  toast: 9000,       // toasts, notifications, alerts
  system: 10500,     // system-critical: screen lock, system restore
} as const;

// ============================================================================
// ICON STROKE
// ============================================================================

export const iconStroke = {
  regular: 1.5,
  fill: 2.0,
} as const;

// ============================================================================
// TRANSITIONS
// ============================================================================

export const transitions = {
  fast: '120ms',
  base: '180ms',
  slow: '200ms',
  drawer: '220ms',
  theme: '200ms',
  ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

// ============================================================================
// BREAKPOINTS
// ============================================================================

export const breakpoints = {
  phone: '767px',
  tablet: '768px',
  desktop: '1280px',
} as const;

// ============================================================================
// LAYOUT
// ============================================================================

export const layout = {
  sidebarWidth: '256px',
  sidebarCollapsedWidth: '64px',
  headerHeight: '60px',
  panelWidth: '320px',
  maxContentWidth: '1400px',
  pagePadding: 'clamp(14px, 1.35vw, 18px)',
  sectionGap: '16px',
  controlHeight: '44px',
  controlHeightLg: '48px',
  tapTarget: '44px',
  rowMinHeight: '56px',
} as const;

// ============================================================================
// STATUS TOKENS (mapped from lib/status.ts)
// ============================================================================

export const status = {
  neutral: { bg: 'var(--st-neutral-bg)', fg: 'var(--st-neutral-fg)' },
  primary: { bg: 'var(--st-primary-bg)', fg: 'var(--st-primary-fg)' },
  progress: { bg: 'var(--st-progress-bg)', fg: 'var(--st-progress-fg)' },
  out: { bg: 'var(--st-out-bg)', fg: 'var(--st-out-fg)' },
  in: { bg: 'var(--st-in-bg)', fg: 'var(--st-in-fg)' },
  danger: { bg: 'var(--st-danger-bg)', fg: 'var(--st-danger-fg)' },
  dim: { bg: 'var(--st-dim-bg)', fg: 'var(--st-dim-fg)' },
  ext: { bg: 'var(--ext-bg)', fg: 'var(--ext-fg)', border: 'var(--ext-line)' },
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export const tokens = {
  colors,
  spacing,
  space,
  fontFamilies,
  fontSizes,
  rootFontSize,
  lineHeights,
  letterSpacings,
  radii,
  shadows,
  zIndex,
  iconStroke,
  transitions,
  breakpoints,
  layout,
  status,
};

export default tokens;