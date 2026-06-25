// Design tokens — Mecha (tema CLARO cálido / crema · acento fuego)
//
// TYPOGRAPHY HIERARCHY (4 niveles de color de texto sobre fondo claro):
// - text: #1c1814        → títulos, nombres destacados, valores seleccionados
// - textSecondary: #5c5249 → texto del cuerpo, descripciones, valores en reposo
// - textTertiary: #736658  → labels UPPERCASE, placeholders, meta info, "Sin teléfono"
// - textMuted: #b3a89d     → estados deshabilitados
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
//
// MARCA MECHA (de la landing Hairy/web/assets/mecha.css):
// acento fuego #f4501e (hi/deep #c0260a) · gradiente cálido #ff8a3d→#ff9d2e→#ffce4a

export const DESIGN_TOKENS = {
  // Backgrounds — crema cálido sobre el que destacan tarjetas blancas
  bg: '#f6f1ea',        // lienzo de la app (crema cálido)
  bgPanel: '#fffdfb',   // sidebar / topbars / paneles (casi blanco cálido)
  bgCard: '#ffffff',    // tarjetas limpias
  bgCardHi: '#fbf6f0',  // tarjeta elevada / hover (crema sutil)

  // Borders — tinte cálido oscuro para que se vean sobre blanco/crema
  border: 'rgba(40,30,24,0.08)',
  borderHi: 'rgba(40,30,24,0.14)',
  borderHiHi: 'rgba(40,30,24,0.25)', // más contraste para división clara

  // Text — carbón cálido, alto contraste
  text: '#1c1814',
  textSecondary: '#5c5249',
  textTertiary: '#736658',
  textMuted: '#b3a89d',
  textSec: '#5c5249',
  textTer: '#736658',

  // Primary (Fuego Mecha)
  primary: '#f4501e',
  primaryHi: '#c0260a',                 // acento profundo: legible como texto/icono activo sobre claro
  primarySoft: 'rgba(244,80,30,0.12)',
  primaryGlow: 'rgba(244,80,30,0.30)',

  // Status colors
  success: '#0f9d6b',
  successSoft: 'rgba(15,157,107,0.14)',
  warning: '#e08a00',
  warningSoft: 'rgba(224,138,0,0.16)',
  danger: '#e23b34',
  dangerSoft: 'rgba(226,59,52,0.14)',
  fireGradient: 'linear-gradient(135deg,#e0340e 0%,#ff7a2e 55%,#ffcf4a 100%)',

  // Additional
  violet: '#c0260a',
  violetSoft: 'rgba(192,38,10,0.14)',
  cyan: '#0891b2',
  cyanSoft: 'rgba(8,145,178,0.14)',
  rose: '#e11d6b',

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
  pendiente: { label: 'Pendiente', color: '#e08a00', soft: 'rgba(224,138,0,0.16)' },
  confirmada: { label: 'Confirmada', color: '#f4501e', soft: 'rgba(244,80,30,0.12)' },
  completada: { label: 'Completada', color: '#0f9d6b', soft: 'rgba(15,157,107,0.14)' },
  no_show: { label: 'No-show', color: '#e23b34', soft: 'rgba(226,59,52,0.14)' },
  cancelada: { label: 'Cancelada', color: '#736658', soft: 'rgba(138,125,112,0.14)' },
};
