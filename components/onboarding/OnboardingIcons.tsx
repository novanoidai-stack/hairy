import { Ionicons } from '@expo/vector-icons';
import { DESIGN_TOKENS } from '@/lib/designTokens';

const tokens = DESIGN_TOKENS;

// Iconos del onboarding para React Native (usa Ionicons de @expo/vector-icons).
// Nombres Ionicones: https://icons.expo.fyi/
// fallback a 'ellipse' si el icono no existe (no crashea).
export function OIcon({ name, size = 18, color = tokens.text }: { name: string; size?: number; color?: string }) {
  const ionicName: any = iconMap[name as keyof typeof iconMap] || 'ellipse';
  return <Ionicons name={ionicName} size={size} color={color} />;
}

const iconMap: Record<string, string> = {
  scissors: 'cut-outline',
  users: 'people-outline',
  clock: 'time-outline',
  calendar: 'calendar-outline',
  store: 'storefront-outline',
  globe: 'globe-outline',
  image: 'image-outline',
  message: 'chatbubble-outline',
  check: 'checkmark',
  x: 'close',
  arrowRight: 'arrow-forward',
  rocket: 'rocket-outline',
  sparkles: 'sparkles',
};
