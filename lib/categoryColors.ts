// Color de categorías de servicio — mapa de token (guardado en categorias_servicio.color)
// a hex real. Única fuente: DESIGN_TOKENS. No declarar hex sueltos en las pantallas.
import { DESIGN_TOKENS } from './designTokens';

export const CATEGORY_COLOR_TOKENS = [
  'primary', 'success', 'warning', 'danger', 'cyan', 'rose',
  'indigo', 'purple', 'teal', 'slate',
] as const;

export type CategoryColorToken = typeof CATEGORY_COLOR_TOKENS[number];

const CATEGORY_COLOR_HEX: Record<CategoryColorToken, string> = {
  primary: DESIGN_TOKENS.primary,
  success: DESIGN_TOKENS.success,
  warning: DESIGN_TOKENS.warning,
  danger: DESIGN_TOKENS.danger,
  cyan: DESIGN_TOKENS.cyan,
  rose: DESIGN_TOKENS.rose,
  indigo: DESIGN_TOKENS.indigo,
  purple: DESIGN_TOKENS.purple,
  teal: DESIGN_TOKENS.teal,
  slate: DESIGN_TOKENS.slate,
};

// Color de un servicio sin categoría asignada ("Sin categoría").
export const SIN_CATEGORIA_COLOR = DESIGN_TOKENS.textMuted;

export function categoryColorHex(token: string | null | undefined): string {
  if (token && Object.prototype.hasOwnProperty.call(CATEGORY_COLOR_HEX, token)) {
    return CATEGORY_COLOR_HEX[token as CategoryColorToken];
  }
  return SIN_CATEGORIA_COLOR;
}
