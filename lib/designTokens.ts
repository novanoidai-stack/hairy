// Design tokens from Claude Design rediseño
//
// TYPOGRAPHY HIERARCHY (4 text color levels):
// - text: #f8fafc      → títulos, nombres destacados, valores seleccionados
// - textSecondary: #94a3b8 → texto del cuerpo, descripciones, valores en reposo
// - textTertiary: #64748b  → labels UPPERCASE, placeholders, meta info, "Sin teléfono"
// - textMuted: #475569     → estados deshabilitados
//
// FONT WEIGHTS (Inter):
// - 400 → texto corrido, descripciones
// - 500 → links, items de menú no seleccionados
// - 600 → labels UPPERCASE, items seleccionados, valores secundarios
// - 700 → títulos H1/H2/H3, nombres en cards, precios, totales
// - 800 → solo para display muy grandes
//
// FONT SMOOTHING:
// Applied globally in WebScrollbarStyles:
// - -webkit-font-smoothing: antialiased
// - -moz-osx-font-smoothing: grayscale
// - text-rendering: optimizeLegibility
// This is set on the root element automatically.

export const DESIGN_TOKENS = {
  // Backgrounds
  bg: '#0b1220',
  bgPanel: '#0f172a',
  bgCard: '#141f33',
  bgCardHi: '#1a2540',

  // Borders
  border: 'rgba(148,163,184,0.10)',
  borderHi: 'rgba(148,163,184,0.18)',

  // Text
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textMuted: '#475569',

  // Primary (Indigo)
  primary: '#6366f1',
  primaryHi: '#818cf8',
  primarySoft: 'rgba(99,102,241,0.14)',
  primaryGlow: 'rgba(99,102,241,0.45)',

  // Status colors
  success: '#10b981',
  successSoft: 'rgba(16,185,129,0.14)',
  warning: '#f59e0b',
  warningSoft: 'rgba(245,158,11,0.14)',
  danger: '#ef4444',
  dangerSoft: 'rgba(239,68,68,0.14)',

  // Additional
  violet: '#8b5cf6',
  violetSoft: 'rgba(139,92,246,0.14)',
  cyan: '#06b6d4',
  cyanSoft: 'rgba(6,182,212,0.14)',
  rose: '#ec4899',

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  // Border radius
  radius: {
    sm: 6,
    md: 10,
    lg: 12,
    full: 999,
  },

  // Font sizes
  fontSize: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 26,
    xxxl: 28,
  },

  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

// Status metadata
export const STATUS_META = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', soft: 'rgba(245,158,11,0.14)' },
  confirmada: { label: 'Confirmada', color: '#6366f1', soft: 'rgba(99,102,241,0.14)' },
  completada: { label: 'Completada', color: '#10b981', soft: 'rgba(16,185,129,0.14)' },
  no_show: { label: 'No-show', color: '#ef4444', soft: 'rgba(239,68,68,0.14)' },
  cancelada: { label: 'Cancelada', color: '#94a3b8', soft: 'rgba(148,163,184,0.14)' },
};
