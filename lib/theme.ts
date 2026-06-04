import { useThemeMode } from './themeContext';

export const colors = {
  // Fuego Mecha
  primary: '#f4501e',
  primaryLight: '#ff8a3d',
  primaryDark: '#c0260a',
  primarySoft: '#fdece6',

  success: '#0f9d6b',
  successSoft: '#dff5ec',
  warning: '#e08a00',
  warningSoft: '#fdeccd',
  danger: '#e23b34',
  dangerSoft: '#fbe2e0',

  light: {
    bg: '#f6f1ea',
    bgSecondary: '#fffdfb',
    bgTertiary: '#fbf6f0',
    surface: '#ffffff',
    surfaceHover: '#fbf6f0',
    border: 'rgba(40,30,24,0.08)',
    borderStrong: 'rgba(40,30,24,0.14)',
    text: '#1c1814',
    textSecondary: '#5c5249',
    textTertiary: '#8a7d70',
    tabBar: '#fffdfb',
    tabBarBorder: 'rgba(40,30,24,0.08)',
  },
  dark: {
    // Design tokens from Claude Design
    bg: '#0b1220',
    bgPanel: '#0f172a',
    bgCard: '#141f33',
    bgCardHi: '#1a2540',
    bgSecondary: '#0f172a',
    bgTertiary: '#141f33',
    surface: '#0f172a',
    surfaceHover: '#141f33',
    border: 'rgba(148,163,184,0.10)',
    borderStrong: 'rgba(148,163,184,0.18)',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    textTertiary: '#64748b',
    textMuted: '#475569',
    tabBar: '#0f172a',
    tabBarBorder: '#0f172a',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};

export function useTheme() {
  const { isDark } = useThemeMode();
  const c = isDark ? colors.dark : colors.light;
  return { isDark, c, colors, spacing, radius, fontSize, fontWeight, shadow };
}
